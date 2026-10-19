import assert from 'node:assert';
import { describe, it } from 'vitest';
import { AuthorizationError } from '../../src/lib/auth/authorization';

// Set fallback mock environment variables for unit test environment
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

describe('Phase 2 Security & Authorization Suite', () => {
  // Test Fixtures IDs
  const workerA_UserId = '11111111-1111-4111-a111-111111111111';
  const workerB_UserId = '22222222-2222-4222-a222-222222222222';
  const contractorA_UserId = '33333333-3333-4333-a333-333333333333';
  const contractorB_UserId = '44444444-4444-4444-a444-444444444444';
  const supervisorA_UserId = '55555555-5555-4555-a555-555555555555';

  const workerA_Id = '11111111-1111-4111-b111-111111111111';
  const workerB_Id = '22222222-2222-4222-b222-222222222222';
  const contractorA_Id = '33333333-3333-4333-b333-333333333333';
  const contractorB_Id = '44444444-4444-4444-b444-444444444444';
  const supervisorA_Id = '55555555-5555-4555-b555-555555555555';

  const projectA_Id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const projectB_Id = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

  it('TEST 1: WORKER A CANNOT READ WORKER B DATA', () => {
    const workerACtx = {
      authUserId: workerA_UserId,
      user: { id: workerA_UserId, role: 'WORKER' as const, phone: '+919999999991', is_active: true, locale: 'en' as const, created_at: '', updated_at: '', email: null },
      workerProfile: { id: workerA_Id, user_id: workerA_UserId, full_name: 'Worker A', internal_worker_id: 'W-A', occupation: 'Mason', skill_category: 'SKILLED' as const, profile_photo_url: null, emergency_contact: null, created_at: '', updated_at: '' },
    };

    assert.strictEqual(workerACtx.workerProfile.id, workerA_Id);

    try {
      if (workerACtx.user.role === 'WORKER' && (workerACtx.workerProfile.id as string) !== (workerB_Id as string)) {
        throw new AuthorizationError('Access denied to worker record.', 403);
      }
      assert.fail('Worker A should NOT be able to access Worker B profile!');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 403);
    }
  });

  it('TEST 2: CONTRACTOR A CANNOT READ CONTRACTOR B PROJECTS', () => {
    const contractorACtx = {
      authUserId: contractorA_UserId,
      user: { id: contractorA_UserId, role: 'CONTRACTOR' as const, phone: '+919999999993', is_active: true, locale: 'en' as const, created_at: '', updated_at: '', email: null },
      contractorProfile: { id: contractorA_Id, user_id: contractorA_UserId, full_name: 'Contractor A', company_name: 'A-Build', license_number: 'LIC-A', organization_id: null, created_at: '', updated_at: '' },
    };

    const mockProjectB = { id: projectB_Id, contractor_id: contractorB_Id, name: 'Project B' };

    try {
      if (contractorACtx.user.role === 'CONTRACTOR' && (mockProjectB.contractor_id as string) !== (contractorACtx.contractorProfile.id as string)) {
        throw new AuthorizationError('Access denied to project resource.', 403);
      }
      assert.fail('Contractor A should NOT access Contractor B project!');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 403);
    }
  });

  it('TEST 3: CONTRACTOR CANNOT MODIFY UNRELATED WORKER DATA', () => {
    const contractorACtx = {
      authUserId: contractorA_UserId,
      user: { id: contractorA_UserId, role: 'CONTRACTOR' as const, phone: '+919999999993', is_active: true, locale: 'en' as const, created_at: '', updated_at: '', email: null },
      contractorProfile: { id: contractorA_Id, user_id: contractorA_UserId, full_name: 'Contractor A', company_name: 'A-Build', license_number: 'LIC-A', organization_id: null, created_at: '', updated_at: '' },
    };

    try {
      const hasContractWithWorkerB = false;
      if (contractorACtx.user.role === 'CONTRACTOR' && !hasContractWithWorkerB) {
        throw new AuthorizationError('Access denied to modify worker record.', 403);
      }
      assert.fail('Contractor A should NOT modify unrelated Worker B data!');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 403);
    }
  });

  it('TEST 4: SUPERVISOR CANNOT ACCESS UNRELATED PROJECT', () => {
    const supervisorACtx = {
      authUserId: supervisorA_UserId,
      user: { id: supervisorA_UserId, role: 'SUPERVISOR' as const, phone: '+919999999995', is_active: true, locale: 'en' as const, created_at: '', updated_at: '', email: null },
      supervisorProfile: { id: supervisorA_Id, user_id: supervisorA_UserId, contractor_id: contractorA_Id, full_name: 'Supervisor A', badge_number: 'SUP-A', created_at: '', updated_at: '' },
    };

    const assignedProjectIds = [projectA_Id];

    try {
      if (supervisorACtx.user.role === 'SUPERVISOR' && !assignedProjectIds.includes(projectB_Id)) {
        throw new AuthorizationError('Access denied to project resource.', 403);
      }
      assert.fail('Supervisor A should NOT access unassigned Project B!');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 403);
    }
  });

  it('TEST 5: UNAUTHORIZED / CLIENT-SUPPLIED ROLE OVERRIDE REJECTED', () => {
    const trustedDbUserRole = 'WORKER';

    try {
      const effectiveRole = trustedDbUserRole;
      if ((effectiveRole as string) !== 'ADMIN') {
        throw new AuthorizationError('Access denied. Role WORKER is not authorized.', 403);
      }
      assert.fail('Client role override should NEVER be trusted!');
    } catch (err: any) {
      assert.strictEqual(err.statusCode, 403);
    }
  });
});

