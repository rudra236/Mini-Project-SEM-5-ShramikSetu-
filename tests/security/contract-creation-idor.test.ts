import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/contracts/route';
import { setMockServerClientFactory } from '@/lib/supabase/server';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';

/**
 * SECURITY TEST SUITE FOR CONTRACT CREATION AUTHORIZATION & IDOR PREVENTION
 */

describe('Contract Creation Security & IDOR Authorization Tests', () => {
  // Test Fixture IDs
  const contractorA_UserId = '11111111-1111-4111-a111-111111111111';
  const contractorA_Id     = '33333333-3333-4333-b333-333333333333';

  const contractorB_UserId = '22222222-2222-4222-a222-222222222222';
  const contractorB_Id     = '44444444-4444-4444-b444-444444444444';

  const workerA_UserId     = '55555555-5555-4555-a555-555555555555';
  const workerA_Id         = '66666666-6666-4666-b666-666666666666';

  const projectA_Id        = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const projectB_Id        = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

  const worksiteA_Id       = '77777777-7777-4777-c777-777777777777';
  const worksiteB_Id       = '88888888-8888-4888-c888-888888888888';

  // In-Memory Database Stores
  let currentAuthUser: { id: string } | null = null;
  let contractStore: any[] = [];
  let versionStore: any[] = [];
  let auditStore: any[] = [];
  let relationshipStore: any[] = [];
  let contractCounter = 0;

  beforeEach(() => {
    currentAuthUser = null;
    contractStore = [];
    versionStore = [];
    auditStore = [];
    relationshipStore = [];
    contractCounter = 0;

    // 1. Mock createServerSupabaseClient for auth.getUser()
    setMockServerClientFactory(() => ({
      auth: {
        getUser: async () => ({
          data: { user: currentAuthUser },
          error: currentAuthUser ? null : new Error('No session'),
        }),
      },
    }));

    // 2. Mock createAdminClient for database queries
    setMockAdminClientFactory(() => {
      const createMockChain = (table: string) => {
        let filters: { col: string; val: any }[] = [];
        let insertedData: any = null;

        const chain = {
          select: (_cols?: string, _opts?: any) => chain,
          eq: (col: string, val: any) => {
            filters.push({ col, val });
            return chain;
          },
          in: (_col: string, _vals: any[]) => chain,
          or: (_query: string) => chain,
          limit: (_n: number) => chain,
          order: (_col: string, _opts?: any) => chain,
          maybeSingle: async () => {
            if (table === 'users') {
              const idFilter = filters.find((f: any) => f.col === 'id');
              if (idFilter?.val === contractorA_UserId) return { data: { id: contractorA_UserId, role: 'CONTRACTOR', is_active: true } };
              if (idFilter?.val === contractorB_UserId) return { data: { id: contractorB_UserId, role: 'CONTRACTOR', is_active: true } };
              if (idFilter?.val === workerA_UserId) return { data: { id: workerA_UserId, role: 'WORKER', is_active: true } };
              return { data: null };
            }

            if (table === 'contractors') {
              const userIdFilter = filters.find((f: any) => f.col === 'user_id');
              if (userIdFilter?.val === contractorA_UserId) return { data: { id: contractorA_Id, user_id: contractorA_UserId } };
              if (userIdFilter?.val === contractorB_UserId) return { data: { id: contractorB_Id, user_id: contractorB_UserId } };
              return { data: null };
            }

            if (table === 'workers') {
              const idFilter = filters.find((f: any) => f.col === 'id');
              if (idFilter?.val === workerA_Id) return { data: { id: workerA_Id, user_id: workerA_UserId, skill_category: 'SKILLED' } };
              return { data: null };
            }

            if (table === 'projects') {
              const idFilter = filters.find((f: any) => f.col === 'id');
              if (idFilter?.val === projectA_Id) return { data: { id: projectA_Id, contractor_id: contractorA_Id, name: 'Project A', status: 'ACTIVE' } };
              if (idFilter?.val === projectB_Id) return { data: { id: projectB_Id, contractor_id: contractorB_Id, name: 'Project B', status: 'ACTIVE' } };
              return { data: null };
            }

            if (table === 'worksites') {
              const idFilter = filters.find((f: any) => f.col === 'id');
              if (idFilter?.val === worksiteA_Id) return { data: { id: worksiteA_Id, project_id: projectA_Id, name: 'Worksite A', latitude: 0, longitude: 0, allowed_radius_meters: 100 } };
              if (idFilter?.val === worksiteB_Id) return { data: { id: worksiteB_Id, project_id: projectB_Id, name: 'Worksite B', latitude: 0, longitude: 0, allowed_radius_meters: 100 } };
              return { data: null };
            }

            if (table === 'minimum_wages') {
              // Return null so the default 60638 paise is used
              return { data: null };
            }

            if (table === 'work_contracts') {
              // No existing contract by default (allow creation)
              return { data: null };
            }

            return { data: null };
          },
          single: async () => {
            if (insertedData) {
              return { data: insertedData, error: null };
            }
            return chain.maybeSingle();
          },
          insert: (data: any) => {
            insertedData = { id: `inserted-${Date.now()}`, ...data };
            if (data.contract_code) {
              contractStore.push(data);
            } else if (data.version_number) {
              versionStore.push(data);
            } else if (data.action) {
              auditStore.push(data);
            } else if (data.employment_id) {
              relationshipStore.push(data);
            }
            return chain;
          },
          // Make the chain directly awaitable (for patterns like: const { data } = await adminClient.from(...).select(...).or(...))
          then: (resolve: any, reject?: any) => {
            const result = table === 'minimum_wages'
              ? { data: [], error: null }
              : table === 'work_contracts'
              ? { data: [], error: null }
              : { data: null, error: null };
            return Promise.resolve(result).then(resolve, reject);
          },
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
  });

  function createPostRequest(body: any) {
    return new NextRequest('http://localhost:3000/api/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // 1. Contractor A + Project A → PASS
  it('1. Contractor A + Project A -> PASS', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: projectA_Id,
      worksiteId: worksiteA_Id,
      workType: 'Steel Fixing',
      dailyWage: 800,
      expectedWorkingHours: 8,
      paymentFrequency: 'DAILY',
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(contractStore.length).toBe(1);
    expect(versionStore.length).toBe(1);
    expect(auditStore.length).toBe(1);
  });

  // 2. Contractor A + Project B owned by Contractor B → FAIL (403)
  it('2. Contractor A + Project B owned by Contractor B -> FAIL with 403', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: projectB_Id, // Owned by Contractor B
      worksiteId: worksiteB_Id,
      workType: 'Masonry',
      dailyWage: 750,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(json.error.message).toContain('Project does not belong to contractor');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });

  // 3. Worker + Project A → FAIL (403)
  it('3. Worker + Project A -> FAIL with 403', async () => {
    currentAuthUser = { id: workerA_UserId };

    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: projectA_Id,
      worksiteId: worksiteA_Id,
      workType: 'Carpentry',
      dailyWage: 700,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('UNAUTHORIZED');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.filter(a => a.action === 'CONTRACT_CREATED').length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });

  // 4. Unauthenticated + Project A → FAIL (401)
  it('4. Unauthenticated + Project A -> FAIL with 401', async () => {
    currentAuthUser = null;

    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: projectA_Id,
      worksiteId: worksiteA_Id,
      workType: 'Electrical',
      dailyWage: 900,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });

  // 5. Contractor A attempting to manipulate contractorId → FAIL (403)
  it('5. Contractor A attempting to manipulate contractorId -> FAIL with 403', async () => {
    currentAuthUser = { id: contractorA_UserId };

    // Payload passes Contractor B's ID and Project B's ID
    const req = createPostRequest({
      contractorId: contractorB_Id,
      workerId: workerA_Id,
      projectId: projectB_Id,
      worksiteId: worksiteB_Id,
      workType: 'Plumbing',
      dailyWage: 850,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('UNAUTHORIZED');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });

  // 6. Invalid projectId → FAIL (400)
  it('6. Invalid projectId -> FAIL with 400 validation error', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: 'not-a-valid-uuid',
      worksiteId: worksiteA_Id,
      workType: 'Painting',
      dailyWage: 600,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_FAILED');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });

  // 7. Project that does not exist → FAIL (404)
  it('7. Project that does not exist -> FAIL with 404', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const nonExistentProjectId = '99999999-9999-4999-9999-999999999999';
    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: nonExistentProjectId,
      worksiteId: worksiteA_Id,
      workType: 'Welding',
      dailyWage: 1000,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error.code).toBe('PROJECT_NOT_FOUND');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });

  // 8. Project owned by another contractor → FAIL (403)
  it('8. Project owned by another contractor -> FAIL with 403', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      workerId: workerA_Id,
      projectId: projectB_Id, // Owned by Contractor B
      worksiteId: worksiteB_Id,
      workType: 'Scaffolding',
      dailyWage: 800,
      startDate: '2026-09-15',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('UNAUTHORIZED');
    expect(json.error.message).toContain('Project does not belong to contractor');

    // VERIFY ZERO DATA MUTATION
    expect(contractStore.length).toBe(0);
    expect(versionStore.length).toBe(0);
    expect(auditStore.length).toBe(0);
    expect(relationshipStore.length).toBe(0);
  });
});
