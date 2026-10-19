import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';
import { logSensitiveOperation } from '@/lib/auth/audit';

export type UserRole = Database['public']['Enums']['user_role'];

export interface AuthenticatedContext {
  authUserId: string;
  user: Database['public']['Tables']['users']['Row'];
  workerProfile?: Database['public']['Tables']['workers']['Row'] | null;
  contractorProfile?: Database['public']['Tables']['contractors']['Row'] | null;
  supervisorProfile?: Database['public']['Tables']['supervisors']['Row'] | null;
  institutionalProfile?: Database['public']['Tables']['institutional_users']['Row'] | null;
}

export class AuthorizationError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode: number = 403) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = statusCode;
  }
}

import { cookies } from 'next/headers';
import { verifySession } from '@/lib/auth/unified-auth';

/**
 * Validates session authentication from Supabase Auth or Unified Session cookie and fetches the trusted database user record.
 * Never relies on client-submitted role metadata.
 */
export async function requireAuthenticatedUser(): Promise<AuthenticatedContext> {
  const supabase = createServerSupabaseClient();
  let authUser: any = null;
  let workerSessionPayload: any = null;
  let unifiedPayload: any = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user) {
      authUser = data.user;
    }
  } catch {
    // Continue to cookie check
  }

  // Fallback: Check for signed unified session cookie or worker session cookie
  if (!authUser) {
    try {
      const cookieStore = cookies();
      const unifiedToken = cookieStore.get('shramiksetu_session')?.value;
      if (unifiedToken) {
        unifiedPayload = verifySession(unifiedToken);
        if (unifiedPayload) {
          authUser = {
            id: unifiedPayload.userId,
            role: unifiedPayload.role,
            loginId: unifiedPayload.loginId,
          };
        }
      }

      if (!authUser) {
        const workerToken = cookieStore.get('shramiksetu_worker_session')?.value;
        if (workerToken) {
          const wPayload = verifySession(workerToken);
          if (wPayload) {
            authUser = {
              id: wPayload.userId,
              role: 'WORKER',
              loginId: wPayload.loginId,
            };
          }
        }
      }
    } catch {
      // In non-request or testing environments without cookies()
    }
  }

  if (!authUser) {
    throw new AuthorizationError('Authentication required. Missing or invalid session.', 401);
  }

  let dbUser: any = null;
  let workerProfile: any = null;
  let contractorProfile: any = null;
  let supervisorProfile: any = null;
  let institutionalProfile: any = null;

  // 1. Fetch trusted user record from PostgreSQL
  const adminClient = createAdminClient();

  if (authUser.id) {
    const { data } = await adminClient
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .eq('is_active', true)
      .maybeSingle();
    dbUser = data;
  }

  if (!dbUser && authUser.loginId) {
    const { data } = await adminClient
      .from('users')
      .select('*')
      .ilike('login_id', authUser.loginId)
      .eq('is_active', true)
      .maybeSingle();
    dbUser = data;
  }

  if (!dbUser) {
    throw new AuthorizationError('User account is inactive or not found.', 401);
  }

  // 2. Resolve Role Profile strictly from PostgreSQL
  switch (dbUser.role) {
    case 'WORKER': {
      const { data: w } = await adminClient
        .from('workers')
        .select('*')
        .eq('user_id', dbUser.id)
        .maybeSingle();
      workerProfile = w;
      if (!workerProfile) {
        throw new AuthorizationError('Worker profile not found in database.', 403);
      }
      break;
    }
    case 'CONTRACTOR': {
      const { data: c } = await adminClient
        .from('contractors')
        .select('*')
        .eq('user_id', dbUser.id)
        .maybeSingle();
      contractorProfile = c;
      if (!contractorProfile) {
        throw new AuthorizationError('Contractor profile not found in database.', 403);
      }
      break;
    }
    case 'SUPERVISOR': {
      const { data } = await adminClient
        .from('supervisors')
        .select('*')
        .eq('user_id', dbUser.id)
        .maybeSingle();
      supervisorProfile = data;
      break;
    }
    case 'INSTITUTIONAL_USER':
    case 'ADMIN': {
      const { data } = await adminClient
        .from('institutional_users')
        .select('*')
        .eq('user_id', dbUser.id)
        .maybeSingle();
      institutionalProfile = data;
    }
  }

  return {
    authUserId: authUser.id,
    user: dbUser,
    workerProfile,
    contractorProfile,
    supervisorProfile,
    institutionalProfile,
  };
}

/**
 * Enforces that the authenticated user has one of the allowed roles.
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<AuthenticatedContext> {
  const ctx = await requireAuthenticatedUser();

  if (!allowedRoles.includes(ctx.user.role)) {
    await logSensitiveOperation({
      actorId: ctx.user.id,
      action: 'AUTHORIZATION_DENIED_ROLE_MISMATCH',
      entityType: 'users',
      entityId: ctx.user.id,
      beforeState: { userRole: ctx.user.role, requiredRoles: allowedRoles },
    });

    throw new AuthorizationError(
      `Access denied. Role '${ctx.user.role}' is not authorized for this resource.`,
      403
    );
  }

  return ctx;
}

/**
 * Validates access to worker-specific data.
 * Access granted to:
 * 1. The worker themselves (matching worker.id or user_id)
 * 2. Contractors who have active/historical contracts with the worker
 * 3. Supervisors assigned to projects where the worker has contracts
 * 4. ADMIN, INSTITUTIONAL_USER, or LABOUR_ORGANIZATION roles
 */
export async function requireWorkerAccess(workerId: string): Promise<AuthenticatedContext> {
  const ctx = await requireAuthenticatedUser();

  // Admin, Institutional User, and Labour Organization have global authorized access
  if (['ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION'].includes(ctx.user.role)) {
    return ctx;
  }

  // Worker self-access check
  if (ctx.user.role === 'WORKER' && ctx.workerProfile?.id === workerId) {
    return ctx;
  }

  const adminClient = createAdminClient();

  // Contractor access check: Contractor must have a work_contract with workerId
  if (ctx.user.role === 'CONTRACTOR' && ctx.contractorProfile) {
    const { data: contract } = await adminClient
      .from('work_contracts')
      .select('id')
      .eq('contractor_id', ctx.contractorProfile.id)
      .eq('worker_id', workerId)
      .limit(1)
      .maybeSingle();

    if (contract) {
      return ctx;
    }
  }

  // Supervisor access check: Supervisor must be assigned to a project linked to the worker's contract
  if (ctx.user.role === 'SUPERVISOR' && ctx.supervisorProfile) {
    const { data: contracts } = await adminClient
      .from('work_contracts')
      .select('project_id')
      .eq('worker_id', workerId);

    if (contracts && contracts.length > 0) {
      const projectIds = contracts.map((c: { project_id: string }) => c.project_id);
      const { data: assignment } = await adminClient
        .from('supervisor_project_assignments')
        .select('id')
        .eq('supervisor_id', ctx.supervisorProfile.id)
        .in('project_id', projectIds)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (assignment) {
        return ctx;
      }
    }
  }

  await logSensitiveOperation({
    actorId: ctx.user.id,
    action: 'AUTHORIZATION_DENIED_WORKER_ACCESS',
    entityType: 'workers',
    entityId: workerId,
  });

  throw new AuthorizationError('Access denied to worker record.', 403);
}

/**
 * Validates access to contractor profile/resources.
 */
export async function requireContractorAccess(contractorId: string): Promise<AuthenticatedContext> {
  const ctx = await requireAuthenticatedUser();

  if (['ADMIN', 'INSTITUTIONAL_USER'].includes(ctx.user.role)) {
    return ctx;
  }

  if (ctx.user.role === 'CONTRACTOR' && ctx.contractorProfile?.id === contractorId) {
    return ctx;
  }

  throw new AuthorizationError('Access denied to contractor resource.', 403);
}

/**
 * Validates access to a project.
 * Access granted to:
 * 1. Contractor who owns the project
 * 2. Supervisors assigned to the project
 * 3. Workers with a contract on the project
 * 4. ADMIN, INSTITUTIONAL_USER, or LABOUR_ORGANIZATION roles
 */
export async function requireProjectAccess(projectId: string): Promise<AuthenticatedContext> {
  const ctx = await requireAuthenticatedUser();

  if (['ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION'].includes(ctx.user.role)) {
    return ctx;
  }

  const adminClient = createAdminClient();

  // Contractor check
  if (ctx.user.role === 'CONTRACTOR' && ctx.contractorProfile) {
    const { data: project } = await adminClient
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('contractor_id', ctx.contractorProfile.id)
      .maybeSingle();

    if (project) return ctx;
  }

  // Supervisor check
  if (ctx.user.role === 'SUPERVISOR' && ctx.supervisorProfile) {
    const { data: assignment } = await adminClient
      .from('supervisor_project_assignments')
      .select('id')
      .eq('supervisor_id', ctx.supervisorProfile.id)
      .eq('project_id', projectId)
      .eq('is_active', true)
      .maybeSingle();

    if (assignment) return ctx;
  }

  // Worker check
  if (ctx.user.role === 'WORKER' && ctx.workerProfile) {
    const { data: contract } = await adminClient
      .from('work_contracts')
      .select('id')
      .eq('worker_id', ctx.workerProfile.id)
      .eq('project_id', projectId)
      .maybeSingle();

    if (contract) return ctx;
  }

  await logSensitiveOperation({
    actorId: ctx.user.id,
    action: 'AUTHORIZATION_DENIED_PROJECT_ACCESS',
    entityType: 'projects',
    entityId: projectId,
  });

  throw new AuthorizationError('Access denied to project resource.', 403);
}

/**
 * Validates access to institutional records.
 */
export async function requireInstitutionalAccess(organizationId?: string): Promise<AuthenticatedContext> {
  const ctx = await requireAuthenticatedUser();

  if (ctx.user.role === 'ADMIN') {
    return ctx;
  }

  if (ctx.user.role === 'INSTITUTIONAL_USER' && ctx.institutionalProfile) {
    if (!organizationId || ctx.institutionalProfile.organization_id === organizationId) {
      return ctx;
    }
  }

  throw new AuthorizationError('Access denied to institutional record.', 403);
}

/**
 * Higher-order Route Handler wrapper for enforcing authentication and role validation.
 */
export function withAuth(
  allowedRoles: UserRole[],
  handler: (req: Request, ctx: AuthenticatedContext, params?: any) => Promise<Response>
) {
  return async (req: Request, routeParams?: any) => {
    try {
      const authCtx = await requireRole(allowedRoles);
      return await handler(req, authCtx, routeParams);
    } catch (err: any) {
      if (err instanceof AuthorizationError) {
        return Response.json(
          { error: { code: 'UNAUTHORIZED', message: err.message } },
          { status: err.statusCode }
        );
      }
      return Response.json(
        { error: { code: 'INTERNAL_SERVER_ERROR', message: err.message || 'Server error' } },
        { status: 500 }
      );
    }
  };
}
