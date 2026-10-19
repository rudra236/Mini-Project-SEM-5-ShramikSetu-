import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole, requireProjectAccess, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProjectCounts, getContractorCounts } from '@/lib/services/counts-service';
import { z } from 'zod';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  worksiteName: z.string().min(1, 'Worksite name is required').optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofenceRadiusMeters: z.number().min(10).max(5000).default(100),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('id');

    const adminClient = createAdminClient();

    if (projectId) {
      await requireProjectAccess(projectId);
      const { data: project, error } = await adminClient
        .from('projects')
        .select('*, worksites(*)')
        .eq('id', projectId)
        .single();

      if (error || !project) {
        return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, { status: 404 });
      }
      const counts = await getProjectCounts(projectId);
      return NextResponse.json({ success: true, project, counts });
    }

    let projectsQuery = adminClient.from('projects').select('*, worksites(*)');

    if (authCtx.user.role === 'CONTRACTOR' && authCtx.contractorProfile) {
      projectsQuery = projectsQuery.eq('contractor_id', authCtx.contractorProfile.id);
    } else if (authCtx.user.role === 'SUPERVISOR' && authCtx.supervisorProfile) {
      const { data: assignments } = await adminClient
        .from('supervisor_project_assignments')
        .select('project_id')
        .eq('supervisor_id', authCtx.supervisorProfile.id)
        .eq('is_active', true);

      const assignedProjectIds = (assignments || []).map((a: { project_id: string }) => a.project_id);
      projectsQuery = projectsQuery.in('id', assignedProjectIds.length > 0 ? assignedProjectIds : ['00000000-0000-0000-0000-000000000000']);
    } else if (authCtx.user.role === 'WORKER' && authCtx.workerProfile) {
      const { data: contracts } = await adminClient
        .from('work_contracts')
        .select('project_id')
        .eq('worker_id', authCtx.workerProfile.id);

      const workerProjectIds = (contracts || []).map((c: { project_id: string }) => c.project_id);
      projectsQuery = projectsQuery.in('id', workerProjectIds.length > 0 ? workerProjectIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data: projects, error } = await projectsQuery;
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 400 });
    }

    let projectCounts: Record<string, any> | undefined;
    if (authCtx.user.role === 'CONTRACTOR' && authCtx.contractorProfile) {
      const cCounts = await getContractorCounts(authCtx.contractorProfile.id);
      projectCounts = cCounts.projectCounts;
    }

    return NextResponse.json({ success: true, projects, projectCounts });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    const body = await req.json();
    const parsed = createProjectSchema.parse(body);

    if (authCtx.user.role === 'CONTRACTOR' && !authCtx.contractorProfile) {
      return NextResponse.json(
        { error: { code: 'PROFILE_MISSING', message: 'Contractor profile required to create projects' } },
        { status: 400 }
      );
    }

    const contractorId = authCtx.contractorProfile?.id || authCtx.authUserId;
    const adminClient = createAdminClient();

    const { data: project, error } = await adminClient
      .from('projects')
      .insert({
        contractor_id: contractorId,
        name: parsed.name,
        description: parsed.description || null,
        start_date: parsed.startDate,
        end_date: parsed.endDate || null,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: { code: 'PROJECT_CREATION_FAILED', message: error.message } }, { status: 400 });
    }

    let worksite = null;
    if (parsed.latitude !== undefined && parsed.longitude !== undefined) {
      const { data: ws, error: wsErr } = await adminClient
        .from('worksites')
        .insert({
          project_id: project.id,
          name: parsed.worksiteName || `${parsed.name} - Primary Site`,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          allowed_radius_meters: parsed.geofenceRadiusMeters,
          address: parsed.address || 'Address pending',
          city: parsed.city || 'City pending',
          state: parsed.state || 'State pending',
          pincode: parsed.pincode || null,
          is_active: true,
        })
        .select()
        .single();

      if (!wsErr && ws) {
        worksite = ws;
      }
    }

    return NextResponse.json({
      success: true,
      project: { ...project, worksites: worksite ? [worksite] : [] },
      worksite,
    }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: error.errors[0]?.message || 'Invalid input' } },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}
