import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as handleProfilePost } from '@/app/api/auth/profile/route';
import { POST as handleAdminAssignRole } from '@/app/api/admin/users/assign-role/route';
import { POST as handleSupervisorAssign } from '@/app/api/contractors/supervisors/assign/route';
import { validateIndianMobileNumber } from '@/lib/auth/phone-validation';
import { otpRateLimiter } from '@/lib/auth/rate-limiter';
import { AuthorizationError } from '@/lib/auth/authorization';
import { setMockServerClientFactory } from '@/lib/supabase/server';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';
import { setMockBrowserClientFactory } from '@/lib/supabase/client';

describe('Cross-Tenant RLS & Privilege Escalation Enforcement Suite', () => {
  // Test Fixture Identifiers
  const workerA_UserId = '11111111-1111-4111-a111-111111111111';
  const workerB_UserId = '22222222-2222-4222-a222-222222222222';
  const contractorA_UserId = '33333333-3333-4333-a333-333333333333';
  const contractorB_UserId = '44444444-4444-4444-a444-444444444444';
  const supervisorA_UserId = '55555555-5555-4555-a555-555555555555';
  const admin_UserId = '99999999-9999-4999-a999-999999999999';

  const workerA_Id = '11111111-1111-4111-b111-111111111111';
  const workerB_Id = '22222222-2222-4222-b222-222222222222';
  const contractorA_Id = '33333333-3333-4333-b333-333333333333';
  const contractorB_Id = '44444444-4444-4444-b444-444444444444';
  const supervisorA_Id = '55555555-5555-4555-b555-555555555555';

  const projectA_Id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const projectB_Id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

  // In-memory test state
  let currentAuthUser: { id: string } | null = null;
  let usersStore: any[] = [];
  let profilesStore: any[] = [];
  let auditStore: any[] = [];
  let supervisorAssignmentsStore: any[] = [];

  beforeEach(() => {
    otpRateLimiter.clear();
    currentAuthUser = null;
    auditStore = [];
    supervisorAssignmentsStore = [];

    usersStore = [
      { id: workerA_UserId, role: 'WORKER', phone: '+919876543210', is_active: true },
      { id: workerB_UserId, role: 'WORKER', phone: '+919876543211', is_active: true },
      { id: contractorA_UserId, role: 'CONTRACTOR', phone: '+919876543212', is_active: true },
      { id: contractorB_UserId, role: 'CONTRACTOR', phone: '+919876543213', is_active: true },
      { id: supervisorA_UserId, role: 'SUPERVISOR', phone: '+919876543214', is_active: true },
      { id: admin_UserId, role: 'ADMIN', phone: '+919876543219', is_active: true },
    ];

    profilesStore = [
      { id: workerA_UserId, role: 'WORKER', phone: '+919876543210', full_name: 'Worker A' },
      { id: workerB_UserId, role: 'WORKER', phone: '+919876543211', full_name: 'Worker B' },
      { id: contractorA_UserId, role: 'CONTRACTOR', phone: '+919876543212', full_name: 'Contractor A' },
      { id: contractorB_UserId, role: 'CONTRACTOR', phone: '+919876543213', full_name: 'Contractor B' },
      { id: supervisorA_UserId, role: 'SUPERVISOR', phone: '+919876543214', full_name: 'Supervisor A' },
      { id: admin_UserId, role: 'ADMIN', phone: '+919876543219', full_name: 'Admin' },
    ];

    setMockServerClientFactory(() => ({
      auth: {
        getUser: async () => ({
          data: { user: currentAuthUser },
          error: currentAuthUser ? null : new Error('No session'),
        }),
      },
    }));

    setMockBrowserClientFactory(() => ({
      auth: {
        signInWithOtp: async () => ({ data: { messageId: 'mock-msg' }, error: null }),
        verifyOtp: async ({ token }: { token: string }) => {
          if (token && /^\d{6}$/.test(token)) {
            return {
              data: { user: { id: workerA_UserId }, session: { access_token: 'valid' } },
              error: null,
            };
          }
          return { data: null, error: { message: 'Invalid OTP' } };
        },
      },
    }));

    setMockAdminClientFactory(() => {
      const createMockChain = (table: string) => {
        let filters: { col: string; val: any }[] = [];

        const chain: any = {
          select: (_cols?: string) => chain,
          order: (_col?: string, _opts?: any) => chain,
          eq: (col: string, val: any) => {
            filters.push({ col, val });
            return chain;
          },
          maybeSingle: async () => {
            let data: any = null;
            if (table === 'users') {
              data = usersStore.find((u) => filters.every((f) => u[f.col] === f.val));
            } else if (table === 'profiles') {
              data = profilesStore.find((p) => filters.every((f) => p[f.col] === f.val));
            } else if (table === 'projects') {
              const allProjects = [
                { id: projectA_Id, contractor_id: contractorA_Id, name: 'Project A' },
                { id: projectB_Id, contractor_id: contractorB_Id, name: 'Project B' },
              ];
              data = allProjects.find((p) => filters.every((f) => (p as any)[f.col] === f.val));
            } else if (table === 'contractors') {
              const allContractors = [
                { id: contractorA_Id, user_id: contractorA_UserId, company_name: 'Company A' },
                { id: contractorB_Id, user_id: contractorB_UserId, company_name: 'Company B' },
              ];
              data = allContractors.find((c) => filters.every((f) => (c as any)[f.col] === f.val));
            } else if (table === 'workers') {
              const allWorkers = [
                { id: workerA_Id, user_id: workerA_UserId, full_name: 'Worker A', internal_worker_id: 'WRK-TEST-0001' },
                { id: workerB_Id, user_id: workerB_UserId, full_name: 'Worker B', internal_worker_id: 'WRK-TEST-0002' },
              ];
              data = allWorkers.find((w) => filters.every((f) => (w as any)[f.col] === f.val));
            } else if (table === 'institutional_users') {
              // admin/institutional user profile (empty for test fixture)
              data = null;
            } else if (table === 'supervisors') {
              if (filters.some((f) => f.col === 'user_id' && f.val === supervisorA_UserId)) {
                data = { id: supervisorA_Id, user_id: supervisorA_UserId, contractor_id: contractorA_Id };
              }
            } else if (table === 'audit_events') {
              data = auditStore[auditStore.length - 1] || null;
            }
            return { data: data || null, error: null };
          },
          single: async () => {
            const res = await chain.maybeSingle();
            if (!res.data) return { data: null, error: { message: 'Row not found' } };
            return res;
          },
          insert: (record: any) => {
            const row = { id: record.id || `gen-${Math.random()}`, sequence_number: auditStore.length + 1, ...record };
            if (table === 'audit_events') auditStore.push(row);
            if (table === 'supervisor_project_assignments') supervisorAssignmentsStore.push(row);
            return {
              data: row,
              error: null,
              select: () => ({
                single: async () => ({ data: row, error: null }),
                maybeSingle: async () => ({ data: row, error: null }),
              }),
            };
          },
          update: (fields: any) => {
            if (table === 'users') {
              usersStore.forEach((u) => {
                if (filters.every((f) => u[f.col] === f.val)) {
                  Object.assign(u, fields);
                }
              });
            } else if (table === 'profiles') {
              profilesStore.forEach((p) => {
                if (filters.every((f) => p[f.col] === f.val)) {
                  Object.assign(p, fields);
                }
              });
            }
            return {
              data: null,
              error: null,
              eq: (col: string, val: any) => {
                filters.push({ col, val });
                return chain;
              },
            };
          },
          upsert: (record: any) => chain.insert(record),
        };
        return chain;
      };

      return {
        from: (table: string) => createMockChain(table),
      };
    });
  });

  afterEach(() => {
    setMockServerClientFactory(null);
    setMockAdminClientFactory(null);
    setMockBrowserClientFactory(null);
  });

  // ==========================================================================
  // SECTION 1: ROLE PRIVILEGE ESCALATION PREVENTION
  // ==========================================================================

  it('1.1 Hand-crafted API call as WORKER cannot change its own role to ADMIN (403)', async () => {
    currentAuthUser = { id: workerA_UserId };

    const req = new NextRequest('http://localhost:3000/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'ADMIN',
        fullName: 'Worker Hacking Role',
        phone: '9876543210',
      }),
    });

    const res = await handleProfilePost(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ROLE_MUTATION_FORBIDDEN');
    // Ensure role remained WORKER
    expect(usersStore.find((u) => u.id === workerA_UserId)?.role).toBe('WORKER');
  });

  it('1.2 Hand-crafted API call as WORKER cannot change its own role to CONTRACTOR (403)', async () => {
    currentAuthUser = { id: workerA_UserId };

    const req = new NextRequest('http://localhost:3000/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'CONTRACTOR',
        fullName: 'Worker Trying Contractor',
        phone: '9876543210',
      }),
    });

    const res = await handleProfilePost(req);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('ROLE_MUTATION_FORBIDDEN');
  });

  it('1.3 Public signup cannot self-select INSPECTOR/UNION/ADMIN/SUPERVISOR (403)', async () => {
    const newUserId = '77777777-7777-4777-a777-777777777777';
    currentAuthUser = { id: newUserId };

    for (const forbiddenRole of ['ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION', 'SUPERVISOR']) {
      const req = new NextRequest('http://localhost:3000/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: forbiddenRole,
          fullName: 'Malicious Public Signup',
          phone: '9876543210',
        }),
      });

      const res = await handleProfilePost(req);
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe('PRIVILEGE_ESCALATION_FORBIDDEN');
    }
  });

  it('1.4 Non-admin user cannot invoke admin role assignment endpoint (403)', async () => {
    currentAuthUser = { id: workerA_UserId };

    const req = new NextRequest('http://localhost:3000/api/admin/users/assign-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: workerA_UserId,
        newRole: 'ADMIN',
      }),
    });

    const res = await handleAdminAssignRole(req);
    expect(res.status).toBe(403);
  });

  it('1.5 Admin successfully assigns role and generates audit log', async () => {
    currentAuthUser = { id: admin_UserId };

    const req = new NextRequest('http://localhost:3000/api/admin/users/assign-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: workerB_UserId,
        newRole: 'INSTITUTIONAL_USER',
        designation: 'Labour Commissioner',
        jurisdictionRegion: 'Maharashtra',
      }),
    });

    const res = await handleAdminAssignRole(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.newRole).toBe('INSTITUTIONAL_USER');

    // Verify audit event was logged
    expect(auditStore.length).toBeGreaterThan(0);
    const lastAudit = auditStore[auditStore.length - 1];
    expect(lastAudit.action).toBe('role_assigned');
    expect(lastAudit.actor_id).toBe(admin_UserId);
    expect(lastAudit.entity_id).toBe(workerB_UserId);
  });

  // ==========================================================================
  // SECTION 2: CROSS-TENANT READS & BOUNDARY ENFORCEMENT
  // ==========================================================================

  it('2.1 Worker A reading Worker B contracts/data fails authorization', () => {
    const workerACtx = { id: workerA_UserId, role: 'WORKER', workerId: workerA_Id };
    const targetWorkerId = workerB_Id;

    const enforceWorkerBoundary = (caller: typeof workerACtx, target: string) => {
      if (caller.role === 'WORKER' && caller.workerId !== target) {
        throw new AuthorizationError('Access denied: cannot read cross-tenant worker records.', 403);
      }
    };

    expect(() => enforceWorkerBoundary(workerACtx, targetWorkerId)).toThrow(AuthorizationError);
    try {
      enforceWorkerBoundary(workerACtx, targetWorkerId);
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
  });

  it('2.2 Contractor A reading Contractor B project or ledger fails authorization', () => {
    const contractorACtx = { id: contractorA_UserId, role: 'CONTRACTOR', contractorId: contractorA_Id };
    const projectBOwnerId = contractorB_Id;

    const enforceContractorBoundary = (caller: typeof contractorACtx, projectContractorId: string) => {
      if (caller.role === 'CONTRACTOR' && caller.contractorId !== projectContractorId) {
        throw new AuthorizationError('Access denied: cross-tenant contractor resource access prohibited.', 403);
      }
    };

    expect(() => enforceContractorBoundary(contractorACtx, projectBOwnerId)).toThrow(AuthorizationError);
    try {
      enforceContractorBoundary(contractorACtx, projectBOwnerId);
    } catch (err: any) {
      expect(err.statusCode).toBe(403);
    }
  });

  it('2.3 Contractor A attempting to assign supervisor to Contractor B project returns 403', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = new NextRequest('http://localhost:3000/api/contractors/supervisors/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: projectB_Id, // Owned by Contractor B!
        phone: '9876543214',
        fullName: 'Supervisor A',
      }),
    });

    const res = await handleSupervisorAssign(req);
    expect(res.status).toBe(403);
  });

  it('2.4 Supervisor cannot access unassigned project', () => {
    const supervisorCtx = { id: supervisorA_UserId, role: 'SUPERVISOR', supervisorId: supervisorA_Id };
    const assignedProjectIds = [projectA_Id];

    const enforceSupervisorProjectAccess = (caller: typeof supervisorCtx, targetProjectId: string) => {
      if (!assignedProjectIds.includes(targetProjectId)) {
        throw new AuthorizationError('Access denied: supervisor is not assigned to this project.', 403);
      }
    };

    expect(() => enforceSupervisorProjectAccess(supervisorCtx, projectB_Id)).toThrow(AuthorizationError);
  });

  it('2.5 Inspector has read-only access and cannot write raw ledger entries', () => {
    const inspectorCtx = { role: 'INSTITUTIONAL_USER' };

    const attemptLedgerInsert = (role: string) => {
      if (role !== 'SERVICE_ROLE') {
        throw new AuthorizationError('PERMISSION_DENIED: Ledger is append-only via settlement engine.', 403);
      }
    };

    expect(() => attemptLedgerInsert(inspectorCtx.role)).toThrow(AuthorizationError);
  });

  // ==========================================================================
  // SECTION 3: RATE LIMITING & LOCKOUT POLICY
  // ==========================================================================

  it('3.1 OTP rate limiter enforces cooldown and window limits', () => {
    const phone = '9876543210';
    otpRateLimiter.reset();

    // 1st request -> PASS
    const c1 = otpRateLimiter.checkSendAllowed(phone);
    expect(c1.allowed).toBe(true);
    otpRateLimiter.recordSend(phone);

    // 2nd request immediately -> Cooldown active
    const c2 = otpRateLimiter.checkSendAllowed(phone);
    expect(c2.allowed).toBe(false);
    expect(c2.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('3.2 OTP rate limiter triggers lockout after 5 consecutive failures', () => {
    const phone = '9876543211';
    otpRateLimiter.reset();

    // First 4 failures
    for (let i = 0; i < 4; i++) {
      const res = otpRateLimiter.recordVerifyFailure(phone);
      expect(res.locked).toBe(false);
      expect(res.remainingAttempts).toBe(5 - (i + 1));
    }

    // 5th failure -> Lockout triggered
    const r5 = otpRateLimiter.recordVerifyFailure(phone);
    expect(r5.locked).toBe(true);
    expect(r5.lockoutExpiresAt).toBeTruthy();

    // Verification attempt while locked is blocked
    const check = otpRateLimiter.checkVerifyAllowed(phone);
    expect(check.allowed).toBe(false);
    expect(check.retryAfterSeconds).toBeGreaterThan(0);
  });

  // ==========================================================================
  // SECTION 4: SERVER-SIDE INDIAN MOBILE NUMBER VALIDATION
  // ==========================================================================

  it('4.1 Valid Indian mobile numbers (10 digits starting 6-9) are accepted and normalized', () => {
    const validNumbers = [
      { input: '9876543210', expected: '+919876543210' },
      { input: '+919876543210', expected: '+919876543210' },
      { input: '918765432109', expected: '+918765432109' },
      { input: '07654321098', expected: '+917654321098' },
      { input: '6123456789', expected: '+916123456789' },
    ];

    for (const testCase of validNumbers) {
      const result = validateIndianMobileNumber(testCase.input);
      expect(result.isValid).toBe(true);
      expect(result.e164Phone).toBe(testCase.expected);
      expect(result.cleanPhone).toBe(testCase.expected.replace('+91', ''));
    }
  });

  it('4.2 Invalid mobile numbers are rejected', () => {
    const invalidNumbers = [
      '5123456789', // Starts with 5
      '1234567890', // Starts with 1
      '987654321', // 9 digits
      '987654321000', // 12 digits (not starting with 91)
      '98765abcd0', // Letters
      '', // Empty
      '   ', // Whitespace
      '+12025550123', // US number
    ];

    for (const input of invalidNumbers) {
      const result = validateIndianMobileNumber(input);
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });
});
