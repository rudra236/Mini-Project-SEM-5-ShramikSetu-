/**
 * SHRAMIKSETU CONTRACT STATE MACHINE & STATUTORY MINIMUM WAGE TEST SUITE
 *
 * Verifies:
 *  1. Complete statutory lifecycle: DRAFT -> OFFERED -> ACCEPTED -> ACTIVE -> COMPLETED
 *  2. Rejection branch: OFFERED -> REJECTED
 *  3. Server-side minimum wage check from minimum_wages table (blocks underpayment with citation)
 *  4. Worker resolution by phone number
 *  5. Tamper-evident acceptance audit: timestamp, SHA-256 IP hash, device info, SHA-256 terms hash
 *  6. Bilingual contract PDF generation on accept
 *  7. Database-level trigger rejection of illegal transitions (code 23514)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createWorkContract,
  offerContract,
  respondToContract,
  activateContract,
  completeContract,
  terminateContract,
  validateContractStatusTransition,
  getApplicableMinimumWage,
} from '../../src/lib/services/employment-service';
import { generateBilingualContractPdf } from '../../src/lib/services/contract-pdf-service';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import type { SkillCategoryEnum } from '../../src/types/database.types';

// Mock database state
interface MockState {
  users: any[];
  workers: any[];
  contractors: any[];
  projects: any[];
  worksites: any[];
  contracts: any[];
  contractVersions: any[];
  contractAcceptances: any[];
  employmentRelationships: any[];
  minimumWages: any[];
  auditEvents: any[];
}

function createInitialMockState(): MockState {
  const contractorUserId = '11111111-2222-3333-4444-000000000001';
  const contractorId = '22222222-2222-2222-2222-000000000001';
  const workerUserId = '11111111-1111-1111-1111-000000000001';
  const workerId = '33333333-3333-3333-3333-000000000001';
  const projectId = '66666666-6666-6666-6666-000000000001';
  const worksiteId = '77777777-7777-7777-7777-000000000001';

  return {
    users: [
      { id: contractorUserId, phone: '+919820011001', role: 'CONTRACTOR' },
      { id: workerUserId, phone: '+919820033001', role: 'WORKER' },
    ],
    workers: [
      {
        id: workerId,
        user_id: workerUserId,
        full_name: 'Ramesh Kumar',
        internal_worker_id: 'WRK-MH-2026-0001',
        occupation: 'Mason',
        skill_category: 'SKILLED' as SkillCategoryEnum,
      },
    ],
    contractors: [
      {
        id: contractorId,
        user_id: contractorUserId,
        company_name: 'Suresh Builders & Infrastructure Pvt Ltd',
        full_name: 'Suresh Mehta',
        license_number: 'CLRA-MH-2024-0092',
      },
    ],
    projects: [
      {
        id: projectId,
        contractor_id: contractorId,
        name: 'Andheri Metro Pier 42',
      },
    ],
    worksites: [
      {
        id: worksiteId,
        project_id: projectId,
        name: 'Pier 42 Casting Yard',
        address: 'Western Express Highway, Andheri East',
        city: 'Mumbai',
        state: 'Maharashtra',
      },
    ],
    contracts: [],
    contractVersions: [],
    contractAcceptances: [],
    employmentRelationships: [],
    minimumWages: [
      {
        id: 'eeeeeeee-0002-0000-0000-000000000001',
        skill_tier: 'UNSKILLED',
        region: 'Mumbai Suburban',
        effective_date: '2026-01-01',
        minimum_wage_paise: 65000, // ₹650
        source_citation: 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04',
        is_active: true,
      },
      {
        id: 'eeeeeeee-0002-0000-0000-000000000002',
        skill_tier: 'SEMI_SKILLED',
        region: 'Mumbai Suburban',
        effective_date: '2026-01-01',
        minimum_wage_paise: 75000, // ₹750
        source_citation: 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04',
        is_active: true,
      },
      {
        id: 'eeeeeeee-0002-0000-0000-000000000003',
        skill_tier: 'SKILLED',
        region: 'Mumbai Suburban',
        effective_date: '2026-01-01',
        minimum_wage_paise: 85000, // ₹850
        source_citation: 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04',
        is_active: true,
      },
      {
        id: 'eeeeeeee-0002-0000-0000-000000000004',
        skill_tier: 'HIGHLY_SKILLED',
        region: 'Mumbai Suburban',
        effective_date: '2026-01-01',
        minimum_wage_paise: 100000, // ₹1,000
        source_citation: 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04',
        is_active: true,
      },
    ],
    auditEvents: [],
  };
}

describe('Statutory Contract State Machine & Minimum Wage Verification', () => {
  let state: MockState;

  beforeEach(() => {
    state = createInitialMockState();

    setMockAdminClientFactory(() => ({
      from: (table: string) => {
        let store: any[] = [];
        switch (table) {
          case 'users': store = state.users; break;
          case 'workers': store = state.workers; break;
          case 'contractors': store = state.contractors; break;
          case 'projects': store = state.projects; break;
          case 'worksites': store = state.worksites; break;
          case 'work_contracts': store = state.contracts; break;
          case 'contract_versions': store = state.contractVersions; break;
          case 'contract_acceptances': store = state.contractAcceptances; break;
          case 'employment_relationships': store = state.employmentRelationships; break;
          case 'minimum_wages': store = state.minimumWages; break;
          case 'audit_events': store = state.auditEvents; break;
          default: store = [];
        }

        let filtered = [...store];

        const chain: any = {
          select: () => chain,
          eq: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] === val);
            return chain;
          },
          lte: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] <= val);
            return chain;
          },
          or: (conditionStr: string) => {
            // Simple OR parser for mock phone matching
            filtered = filtered.filter((r) => {
              if (r.phone) {
                return conditionStr.includes(r.phone);
              }
              return true;
            });
            return chain;
          },
          order: (field: string, opts?: any) => {
            const asc = opts?.ascending !== false;
            filtered.sort((a, b) => {
              if (a[field] < b[field]) return asc ? -1 : 1;
              if (a[field] > b[field]) return asc ? 1 : -1;
              return 0;
            });
            return chain;
          },
          limit: (n: number) => {
            filtered = filtered.slice(0, n);
            return chain;
          },
          maybeSingle: async () => ({ data: filtered[0] || null, error: null }),
          single: async () => {
            if (filtered.length === 0) return { data: null, error: { message: 'Not found' } };
            return { data: filtered[0], error: null };
          },
          insert: (item: any) => {
            const row = { id: item.id || `gen-${Math.random()}`, ...item };
            store.push(row);
            return {
              select: () => ({
                single: async () => ({ data: row, error: null }),
              }),
              single: async () => ({ data: row, error: null }),
            };
          },
          update: (updates: any) => {
            // Emulate database trigger: check_contract_status_transition()
            return {
              eq: (field: string, val: any) => {
                const target = store.find((r) => r[field] === val);
                if (target) {
                  if (table === 'work_contracts' && updates.status && updates.status !== target.status) {
                    const validTransitions: Record<string, string[]> = {
                      DRAFT: ['OFFERED', 'PENDING_ACCEPTANCE', 'REJECTED', 'TERMINATED'],
                      OFFERED: ['ACCEPTED', 'REJECTED', 'TERMINATED'],
                      PENDING_ACCEPTANCE: ['ACCEPTED', 'REJECTED', 'TERMINATED', 'ACTIVE'],
                      ACCEPTED: ['ACTIVE', 'TERMINATED', 'DISPUTED'],
                      ACTIVE: ['COMPLETED', 'TERMINATED', 'DISPUTED'],
                      COMPLETED: [],
                      TERMINATED: [],
                      REJECTED: [],
                      DISPUTED: ['ACTIVE', 'COMPLETED', 'TERMINATED'],
                    };

                    const allowed = validTransitions[target.status] || [];
                    if (!allowed.includes(updates.status)) {
                      const dbError: any = new Error(
                        `error: ILLEGAL_CONTRACT_TRANSITION: Invalid status transition from ${target.status} to ${updates.status}`
                      );
                      dbError.code = '23514'; // PostgreSQL check_violation
                      throw dbError; // Database trigger aborts transaction!
                    }
                  }

                  Object.assign(target, updates);
                  return {
                    select: () => ({
                      single: async () => ({ data: target, error: null }),
                    }),
                    single: async () => ({ data: target, error: null }),
                  };
                }
                return {
                  select: () => ({ single: async () => ({ data: null, error: { message: 'Not found' } }) }),
                  single: async () => ({ data: null, error: { message: 'Not found' } }),
                };
              },
            };
          },
          then: (resolve: (val: any) => void) => resolve({ data: filtered, error: null }),
        };

        return chain;
      },
    }));
  });

  afterEach(() => {
    setMockAdminClientFactory(null);
  });

  // ==========================================================================
  // SECTION 1: STATUTORY MINIMUM WAGE SERVER-SIDE ENFORCEMENT
  // ==========================================================================

  it('1.1 Benchmark is read dynamically from minimum_wages table (not hardcoded)', async () => {
    const skilledWage = await getApplicableMinimumWage({
      skillTier: 'SKILLED',
      region: 'Mumbai Suburban',
    });

    expect(skilledWage).not.toBeNull();
    expect(skilledWage?.minimumWagePaise).toBe(85000); // ₹850/day
    expect(skilledWage?.sourceCitation).toContain('Gazette Notification CLRA/MW/2026/04');
  });

  it('1.2 Below-minimum contract offer is BLOCKED server-side with statutory citation', async () => {
    // Ramesh is SKILLED (statutory benchmark = ₹850 = 85,000 paise).
    // Attempting to offer ₹700 (70,000 paise) must be blocked!
    await expect(
      createWorkContract(state.users[0].id, {
        workerId: state.workers[0].id,
        contractorId: state.contractors[0].id,
        projectId: state.projects[0].id,
        worksiteId: state.worksites[0].id,
        workType: 'Masonry',
        dailyWage: 70000, // ₹700 < ₹850
        startDate: '2026-08-01',
        blockBelowMinimum: true,
      })
    ).rejects.toThrow(/Statutory minimum wage violation/);
  });

  it('1.3 Contractor can look up worker by phone and create contract at or above benchmark', async () => {
    // Look up Ramesh by phone '+919820033001' and offer compliant wage (₹900 = 90,000 paise >= ₹850)
    const result = await createWorkContract(state.users[0].id, {
      workerPhone: '+919820033001',
      contractorId: state.contractors[0].id,
      projectId: state.projects[0].id,
      worksiteId: state.worksites[0].id,
      workType: 'Master Mason',
      dailyWage: 90000, // Compliant: ₹900 >= ₹850
      startDate: '2026-08-01',
      initialStatus: 'DRAFT',
    });

    expect(result.contract).toBeDefined();
    expect(result.contract.worker_id).toBe(state.workers[0].id);
    expect(result.contract.status).toBe('DRAFT');
    expect(result.contract.daily_wage).toBe(90000);
    expect(result.termsHash).toBeDefined();
    expect(result.termsHash.length).toBe(64); // SHA-256 length
  });

  // ==========================================================================
  // SECTION 2: COMPLETE STATUTORY LIFECYCLE RUN (OFFER -> ACCEPT -> ACTIVE -> COMPLETE)
  // ==========================================================================

  it('2.1 Full run: DRAFT -> OFFERED -> ACCEPTED -> ACTIVE -> COMPLETED works seamlessly', async () => {
    // Step 1: Create Contract in DRAFT
    const { contract } = await createWorkContract(state.users[0].id, {
      workerId: state.workers[0].id,
      contractorId: state.contractors[0].id,
      projectId: state.projects[0].id,
      worksiteId: state.worksites[0].id,
      workType: 'Mason',
      dailyWage: 90000,
      startDate: '2026-08-01',
      initialStatus: 'DRAFT',
    });
    expect(contract.status).toBe('DRAFT');

    // Step 2: Contractor offers contract (DRAFT -> OFFERED)
    const offered = await offerContract(contract.id, state.users[0].id);
    expect(offered.status).toBe('OFFERED');

    // Step 3: Worker accepts contract (OFFERED -> ACCEPTED)
    const acceptRes = await respondToContract(contract.id, state.users[1].id, 'ACCEPTED', {
      ipAddress: '49.37.152.88',
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Mobile)',
    });
    expect(acceptRes.contract!.status).toBe('ACCEPTED');
    expect(acceptRes.acceptance.ip_hash).toBeDefined();
    expect(acceptRes.acceptance.terms_hash).toBeDefined();
    expect(acceptRes.acceptance.device_info).toContain('Android 14');

    // Verify bilingual contract PDF was generated and is accessible
    const pdfBuffer = await generateBilingualContractPdf(contract.id);
    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);

    // Step 4: Contract is activated (ACCEPTED -> ACTIVE)
    const activeRes = await activateContract(contract.id, state.users[0].id);
    expect(activeRes.contract!.status).toBe('ACTIVE');
    expect(activeRes.employmentRelationship).toBeDefined();
    expect((activeRes.employmentRelationship as any)?.status).toBe('ACTIVE');

    // Step 5: Contract is completed (ACTIVE -> COMPLETED)
    const completed = await completeContract(contract.id, state.users[0].id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.end_date).toBeDefined();
  });

  // ==========================================================================
  // SECTION 3: REJECTION LIFECYCLE BRANCH
  // ==========================================================================

  it('3.1 Worker rejection records reason and transitions OFFERED -> REJECTED', async () => {
    const { contract } = await createWorkContract(state.users[0].id, {
      workerId: state.workers[0].id,
      contractorId: state.contractors[0].id,
      projectId: state.projects[0].id,
      worksiteId: state.worksites[0].id,
      workType: 'Mason',
      dailyWage: 90000,
      startDate: '2026-08-01',
      initialStatus: 'OFFERED',
    });

    const rejectRes = await respondToContract(contract.id, state.users[1].id, 'REJECTED', {
      rejectionReason: 'Worksite is too far from current residence.',
    });

    expect(rejectRes.contract!.status).toBe('REJECTED');
    expect(rejectRes.acceptance.response).toBe('REJECTED');
    expect(rejectRes.acceptance.rejection_reason).toBe('Worksite is too far from current residence.');
  });

  // ==========================================================================
  // SECTION 4: DATABASE-LEVEL TRIGGER REJECTION OF ILLEGAL TRANSITIONS
  // ==========================================================================

  it('4.1 Illegal transition DRAFT -> ACTIVE is rejected at the database level (code 23514)', async () => {
    const { contract } = await createWorkContract(state.users[0].id, {
      workerId: state.workers[0].id,
      contractorId: state.contractors[0].id,
      projectId: state.projects[0].id,
      worksiteId: state.worksites[0].id,
      workType: 'Mason',
      dailyWage: 90000,
      startDate: '2026-08-01',
      initialStatus: 'DRAFT',
    });

    // Valid transitions from DRAFT are only OFFERED, PENDING_ACCEPTANCE, REJECTED, TERMINATED
    expect(() => validateContractStatusTransition('DRAFT', 'ACTIVE')).toThrow(
      /ILLEGAL_CONTRACT_TRANSITION/
    );

    // Attempting direct DB update without worker acceptance fails with DB trigger check violation
    try {
      await activateContract(contract.id, state.users[0].id);
      expect.fail('Should have failed DB trigger');
    } catch (err: any) {
      expect(err.message).toMatch(/ILLEGAL_CONTRACT_TRANSITION/);
    }
  });

  it('4.2 Illegal transition OFFERED -> COMPLETED is rejected at the database level', async () => {
    const { contract } = await createWorkContract(state.users[0].id, {
      workerId: state.workers[0].id,
      contractorId: state.contractors[0].id,
      projectId: state.projects[0].id,
      worksiteId: state.worksites[0].id,
      workType: 'Mason',
      dailyWage: 90000,
      startDate: '2026-08-01',
      initialStatus: 'OFFERED',
    });

    expect(() => validateContractStatusTransition('OFFERED', 'COMPLETED')).toThrow(
      /ILLEGAL_CONTRACT_TRANSITION/
    );

    try {
      await completeContract(contract.id, state.users[0].id);
      expect.fail('Should have failed DB trigger');
    } catch (err: any) {
      expect(err.message).toMatch(/ILLEGAL_CONTRACT_TRANSITION/);
    }
  });

  it('4.3 Re-opening a COMPLETED contract back to ACTIVE is rejected by DB trigger', async () => {
    const { contract } = await createWorkContract(state.users[0].id, {
      workerId: state.workers[0].id,
      contractorId: state.contractors[0].id,
      projectId: state.projects[0].id,
      worksiteId: state.worksites[0].id,
      workType: 'Mason',
      dailyWage: 90000,
      startDate: '2026-08-01',
      initialStatus: 'DRAFT',
    });

    await offerContract(contract.id, state.users[0].id);
    await respondToContract(contract.id, state.users[1].id, 'ACCEPTED');
    await activateContract(contract.id, state.users[0].id);
    await completeContract(contract.id, state.users[0].id);

    expect(contract.status).toBe('COMPLETED');

    // Attempting to move COMPLETED -> ACTIVE
    expect(() => validateContractStatusTransition('COMPLETED', 'ACTIVE')).toThrow(
      /ILLEGAL_CONTRACT_TRANSITION/
    );

    try {
      await activateContract(contract.id, state.users[0].id);
      expect.fail('Should have failed DB trigger');
    } catch (err: any) {
      expect(err.message).toMatch(/ILLEGAL_CONTRACT_TRANSITION/);
    }
  });

  it('4.4 Re-opening a TERMINATED or REJECTED contract is strictly rejected', () => {
    expect(() => validateContractStatusTransition('TERMINATED', 'ACTIVE')).toThrow(
      /ILLEGAL_CONTRACT_TRANSITION/
    );
    expect(() => validateContractStatusTransition('REJECTED', 'ACTIVE')).toThrow(
      /ILLEGAL_CONTRACT_TRANSITION/
    );
    expect(() => validateContractStatusTransition('REJECTED', 'OFFERED')).toThrow(
      /ILLEGAL_CONTRACT_TRANSITION/
    );
  });
});
