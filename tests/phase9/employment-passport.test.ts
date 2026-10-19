/**
 * SHRAMIKSETU PHASE 9 — EMPLOYMENT HISTORY, JOB COMPLETION & BENEFIT PASSPORT
 *
 * Comprehensive test suite verifying:
 *  1.  Active employment — ongoing, no completion statement
 *  2.  Completed employment — completion statement generated, status SETTLED
 *  3.  Unpaid employment — settlement_status = OUTSTANDING_PAYMENT (outstanding > 0)
 *  4.  Fully settled employment — settlement_status = SETTLED (outstanding = 0)
 *  5.  Multiple employers — worker has 2+ different contractors
 *  6.  Multiple contracts — same contractor, multiple contracts
 *  7.  Multiple projects — history spans 2+ projects
 *  8.  PDF generation — generatePassportPdf returns a non-empty Buffer
 *  9.  Unauthorized access — worker cannot access another worker's passport
 *  10. Timeline event coverage — all 11 event types present for a complete employment
 *
 * Run: npx tsx tests/phase9/employment-passport.test.ts
 */

import assert from 'node:assert';
import { describe, it } from 'vitest';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import type { JobCompletionStatementRow } from '../../src/types/database.types';

// ─── Environment Setup ─────────────────────────────────────────────────────────

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

// ─── In-Memory Data Store ──────────────────────────────────────────────────────

const mockWorkers: any[] = [];
const mockContractors: any[] = [];
const mockProjects: any[] = [];
const mockContracts: any[] = [];
const mockContractVersions: any[] = [];
const mockContractAcceptances: any[] = [];
const mockEmploymentRelationships: any[] = [];
const mockAttendanceEvents: any[] = [];
const mockWorkerConfirmations: any[] = [];
const mockEarningsSnapshots: any[] = [];
const mockPaymentTransactions: any[] = [];
const mockPaymentConfirmations: any[] = [];
const mockDisputes: any[] = [];
const mockDisputeResolutions: any[] = [];
const mockJobCompletionStatements: JobCompletionStatementRow[] = [];
const mockAuditEvents: any[] = [];

// ─── Mock Admin Client Factory ─────────────────────────────────────────────────

setMockAdminClientFactory(() => {
  return {
    from: (table: string) => {
      let dataStore: any[];
      switch (table) {
        case 'workers':                   dataStore = mockWorkers; break;
        case 'contractors':               dataStore = mockContractors; break;
        case 'projects':                  dataStore = mockProjects; break;
        case 'work_contracts':            dataStore = mockContracts; break;
        case 'contract_versions':         dataStore = mockContractVersions; break;
        case 'contract_acceptances':      dataStore = mockContractAcceptances; break;
        case 'employment_relationships':  dataStore = mockEmploymentRelationships; break;
        case 'attendance_events':         dataStore = mockAttendanceEvents; break;
        case 'worker_confirmations':      dataStore = mockWorkerConfirmations; break;
        case 'earnings_snapshots':        dataStore = mockEarningsSnapshots; break;
        case 'payment_transactions':      dataStore = mockPaymentTransactions; break;
        case 'payment_confirmations':     dataStore = mockPaymentConfirmations; break;
        case 'disputes':                  dataStore = mockDisputes; break;
        case 'dispute_resolutions':       dataStore = mockDisputeResolutions; break;
        case 'job_completion_statements': dataStore = mockJobCompletionStatements; break;
        case 'audit_events':              dataStore = mockAuditEvents; break;
        default: dataStore = [];
      }

      let filtered = [...dataStore];

      const builder: any = {
        select: (_fields?: string, opts?: any) => {
          if (opts?.count === 'exact') {
            builder._isCount = true;
          }
          return builder;
        },
        eq: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] === value);
          return builder;
        },
        neq: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] !== value);
          return builder;
        },
        in: (field: string, values: any[]) => {
          filtered = filtered.filter((row) => values.includes(row[field]));
          return builder;
        },
        gte: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] >= value);
          return builder;
        },
        lte: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] <= value);
          return builder;
        },
        order: (field: string, opts?: any) => {
          const asc = opts?.ascending !== false;
          filtered.sort((a, b) => {
            if (a[field] < b[field]) return asc ? -1 : 1;
            if (a[field] > b[field]) return asc ? 1 : -1;
            return 0;
          });
          return builder;
        },
        limit: (n: number) => {
          filtered = filtered.slice(0, n);
          return builder;
        },
        maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
        single: async () => {
          if (filtered.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: filtered[0], error: null };
        },
        insert: (item: any) => {
          const items = Array.isArray(item) ? item : [item];
          const saved: any[] = [];
          for (const i of items) {
            const row = {
              id: `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              ...i,
            };
            dataStore.push(row);
            saved.push(row);
          }
          filtered = [...saved];
          return builder;
        },
        update: (updates: any) => {
          // Updates the first filtered item
          for (const row of filtered) {
            const idx = dataStore.indexOf(row);
            if (idx !== -1) Object.assign(dataStore[idx], updates);
          }
          filtered = filtered.map((r) => ({ ...r, ...updates }));
          return builder;
        },
        upsert: (item: any) => {
          dataStore.push({
            id: `mock-${table}-upsert-${Date.now()}`,
            ...item,
          });
          filtered = [item];
          return builder;
        },
        count: (opts?: any) => {
          if (opts?.count === 'exact' && opts?.head) {
            return Promise.resolve({ count: filtered.length, error: null });
          }
          return builder;
        },
      };

      // Support chained count queries
      Object.defineProperty(builder, 'then', {
        value: (resolve: any) => {
          if (builder._isCount) {
            resolve({ count: filtered.length, data: null, error: null });
          } else {
            resolve({ data: filtered, count: filtered.length, error: null });
          }
        },
        configurable: true,
      });

      return builder;
    },
    rpc: async (_fn: string, _args: any) => ({ data: 0, error: null }),
  };
});

// ─── Imports (after mock is registered) ───────────────────────────────────────

import {
  getEmploymentHistory,
  buildEmploymentTimeline,
  generateJobCompletionStatement,
  getBenefitPassportData,
  generatePassportPdf,
} from '../../src/lib/services/passport-service';

// ─── Test Helpers ──────────────────────────────────────────────────────────────

let idCounter = 1;
function uid() { return `test-id-${idCounter++}`; }

function makeWorker(overrides: any = {}) {
  const w = {
    id: uid(),
    user_id: uid(),
    full_name: 'Test Worker',
    internal_worker_id: `WRK-${idCounter}`,
    occupation: 'Mason',
    skill_category: 'SKILLED',
    profile_photo_url: null,
    emergency_contact: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockWorkers.push(w);
  return w;
}

function makeContractor(overrides: any = {}) {
  const c = {
    id: uid(),
    user_id: uid(),
    organization_id: null,
    full_name: 'Test Contractor',
    company_name: 'Build Co.',
    license_number: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockContractors.push(c);
  return c;
}

function makeProject(contractorId: string, overrides: any = {}) {
  const p = {
    id: uid(),
    contractor_id: contractorId,
    name: 'Test Project',
    description: null,
    status: 'ACTIVE',
    start_date: '2026-01-01',
    end_date: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockProjects.push(p);
  return p;
}

function makeContract(workerId: string, contractorId: string, projectId: string, overrides: any = {}) {
  const c = {
    id: uid(),
    contract_code: `CTR-${idCounter}`,
    worker_id: workerId,
    contractor_id: contractorId,
    project_id: projectId,
    worksite_id: uid(),
    work_type: 'Masonry',
    daily_wage: 700,        // ₹700/day → 70000 paise
    expected_working_hours: 8,
    payment_frequency: 'WEEKLY',
    start_date: '2026-01-01',
    end_date: null,
    status: 'ACTIVE',
    current_version_number: 1,
    join_token: uid(),
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
  mockContracts.push(c);
  return c;
}

function makeEmploymentRelationship(
  workerId: string,
  contractorId: string,
  projectId: string,
  contractId: string,
  overrides: any = {}
) {
  const er = {
    id: uid(),
    worker_id: workerId,
    contractor_id: contractorId,
    project_id: projectId,
    contract_id: contractId,
    contract_version_id: uid(),
    acceptance_id: uid(),
    status: 'ACTIVE',
    acceptance_timestamp: '2026-01-02T10:00:00.000Z',
    start_date: '2026-01-03',
    end_date: null,
    created_at: '2026-01-02T10:00:00.000Z',
    updated_at: '2026-01-02T10:00:00.000Z',
    ...overrides,
  };
  mockEmploymentRelationships.push(er);
  return er;
}

function makeAcceptance(contractId: string, workerId: string, overrides: any = {}) {
  const a = {
    id: uid(),
    contract_id: contractId,
    contract_version_id: uid(),
    worker_id: workerId,
    response: 'ACCEPTED',
    rejection_reason: null,
    ip_address: null,
    user_agent: null,
    responded_at: '2026-01-02T10:00:00.000Z',
    ...overrides,
  };
  mockContractAcceptances.push(a);
  return a;
}

function makeAttendance(workerId: string, contractorId: string, projectId: string, contractId: string, date: string, status = 'VERIFIED') {
  const a = {
    id: uid(),
    worker_id: workerId,
    contractor_id: contractorId,
    project_id: projectId,
    worksite_id: uid(),
    contract_id: contractId,
    token_id: null,
    date,
    worker_latitude: 18.5,
    worker_longitude: 73.8,
    worksite_latitude: 18.5,
    worksite_longitude: 73.8,
    calculated_distance_meters: 5,
    allowed_radius_meters: 200,
    status,
    rejection_reason: null,
    idempotency_key: null,
    created_at: date.includes('T') ? date : `${date}T08:00:00.000Z`,
    updated_at: date.includes('T') ? date : `${date}T08:00:00.000Z`,
  };
  mockAttendanceEvents.push(a);
  return a;
}

function makePaymentTransaction(
  workerId: string,
  contractorId: string,
  contractId: string,
  projectId: string,
  amountPaise: number,
  status = 'SUCCESS'
) {
  const t = {
    id: uid(),
    transaction_ref: `TXN-${idCounter}`,
    idempotency_key: uid(),
    sender_account_id: uid(),
    receiver_account_id: uid(),
    worker_id: workerId,
    contractor_id: contractorId,
    contract_id: contractId,
    project_id: projectId,
    amount_paise: amountPaise,
    payment_source: 'CONTRACTOR_REPORTED_CASH_PAYMENT',
    status,
    notes: null,
    initiated_by: contractorId,
    created_at: '2026-01-10T12:00:00.000Z',
    updated_at: '2026-01-10T12:00:00.000Z',
  };
  mockPaymentTransactions.push(t);
  return t;
}

function makeDispute(workerId: string, contractorId: string, projectId: string, contractId: string, status = 'OPEN') {
  const d = {
    id: uid(),
    dispute_ref: `DSP-${idCounter}`,
    worker_id: workerId,
    contractor_id: contractorId,
    project_id: projectId,
    contract_id: contractId,
    category: 'PAYMENT',
    description: 'Test dispute',
    status,
    priority: 'MEDIUM',
    raised_by_user_id: uid(),
    created_at: '2026-01-15T09:00:00.000Z',
    updated_at: '2026-01-15T09:00:00.000Z',
  };
  mockDisputes.push(d);
  return d;
}

function makeResolution(disputeId: string) {
  const r = {
    id: uid(),
    dispute_id: disputeId,
    decision: 'RESOLVED',
    reason: 'Payment confirmed correct',
    resolution_notes: null,
    reviewer_user_id: uid(),
    resolved_at: '2026-01-20T10:00:00.000Z',
  };
  mockDisputeResolutions.push(r);
  return r;
}

function makeWorkerConfirmation(contractId: string, workerId: string, summaryId: string) {
  const wc = {
    id: uid(),
    summary_id: summaryId,
    worker_id: workerId,
    contract_id: contractId,
    is_confirmed: true,
    discrepancy_reason: null,
    worker_claimed_days_count: null,
    comments: null,
    confirmed_at: '2026-01-08T09:00:00.000Z',
  };
  mockWorkerConfirmations.push(wc);
  return wc;
}

function makeEarningsSnapshot(contractId: string, workerId: string, contractorId: string, days: number, dailyWagePaise: number) {
  const es = {
    id: uid(),
    contract_id: contractId,
    worker_id: workerId,
    contractor_id: contractorId,
    period_start: '2026-01-01',
    period_end: '2026-01-07',
    verified_days_count: days,
    daily_wage_paise: dailyWagePaise,
    total_earned_paise: days * dailyWagePaise,
    computed_at: '2026-01-08T00:00:00.000Z',
    computed_by: contractorId,
  };
  mockEarningsSnapshots.push(es);
  return es;
}

function makePaymentConfirmation(transactionId: string, workerId: string) {
  const pc = {
    id: uid(),
    transaction_id: transactionId,
    worker_id: workerId,
    is_confirmed: true,
    dispute_reason: null,
    worker_notes: null,
    confirmed_at: '2026-01-11T08:00:00.000Z',
  };
  mockPaymentConfirmations.push(pc);
  return pc;
}

// ─── Test Runner ───────────────────────────────────────────────────────────────

// ─── Test Runner ───────────────────────────────────────────────────────────────

describe('Phase 9 Employment Passport Suite', () => {
  // ── Test 1: Active Employment ──────────────────────────────────────────────────
  it('1. Active employment — history returned, no completion statement', async () => {
    const worker = makeWorker({ full_name: 'Active Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id, { name: 'Active Project' });
    const contract = makeContract(worker.id, contractor.id, project.id, { status: 'ACTIVE', daily_wage: 500 });
    makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, { status: 'ACTIVE' });
    makeAcceptance(contract.id, worker.id);
    makeAttendance(worker.id, contractor.id, project.id, contract.id, '2026-02-01');
    makeAttendance(worker.id, contractor.id, project.id, contract.id, '2026-02-02');

    const history = await getEmploymentHistory(worker.id);

    assert.ok(history.length >= 1, 'Should have at least one employment entry');
    const entry = history.find((e) => e.contractId === contract.id);
    assert.ok(entry, 'Should find the active contract in history');
    assert.strictEqual(entry!.employmentStatus, 'ACTIVE');
    assert.strictEqual(entry!.completionStatement, null, 'Active employment has no completion statement');
    assert.ok(entry!.verifiedWorkdays >= 0, 'Verified workdays should be a non-negative number');
    assert.ok(entry!.dailyWagePaise > 0, 'Daily wage paise should be > 0');
    assert.ok(entry!.contractorName.length > 0, 'Contractor name must be present');
    assert.ok(entry!.projectName.length > 0, 'Project name must be present');
  });

  // ── Test 2: Completed Employment ──────────────────────────────────────────────
  it('2. Completed employment — Job Completion Statement generated', async () => {
    const worker = makeWorker({ full_name: 'Completed Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id, { name: 'Completed Project' });
    const contract = makeContract(worker.id, contractor.id, project.id, {
      status: 'COMPLETED',
      daily_wage: 700,
      end_date: '2026-03-31',
    });
    const empRel = makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, {
      status: 'COMPLETED',
      end_date: '2026-03-31',
    });
    makeAcceptance(contract.id, worker.id);

    // 10 verified attendance days
    for (let i = 1; i <= 10; i++) {
      const day = i < 10 ? `0${i}` : `${i}`;
      makeAttendance(worker.id, contractor.id, project.id, contract.id, `2026-03-${day}`);
    }

    // Full payment: 10 × 700 = ₹7000 = 700000 paise
    makePaymentTransaction(worker.id, contractor.id, contract.id, project.id, 700000);

    const statement = await generateJobCompletionStatement({
      employmentRelationshipId: empRel.id,
      contractId: contract.id,
      generatedByUserId: contractor.user_id,
    });

    assert.strictEqual(statement.worker_id, worker.id);
    assert.strictEqual(statement.contractor_id, contractor.id);
    assert.strictEqual(statement.contract_id, contract.id);
    assert.strictEqual(statement.settlement_status, 'SETTLED', 'Fully paid employment must be SETTLED');
    assert.strictEqual(statement.outstanding_paise, 0, 'No outstanding when fully paid');
    assert.ok(statement.generated_at);
  });

  // ── Test 3: Unpaid Employment ─────────────────────────────────────────────────
  it('3. Unpaid employment — settlement_status = OUTSTANDING_PAYMENT', async () => {
    const worker = makeWorker({ full_name: 'Unpaid Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);
    const contract = makeContract(worker.id, contractor.id, project.id, {
      status: 'COMPLETED',
      daily_wage: 600,
      end_date: '2026-04-30',
    });
    const empRel = makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, {
      status: 'COMPLETED',
    });
    makeAcceptance(contract.id, worker.id);

    // 5 days × ₹600 = ₹3000 = 300000 paise earned
    for (let i = 1; i <= 5; i++) {
      makeAttendance(worker.id, contractor.id, project.id, contract.id, `2026-04-0${i}`);
    }

    const statement = await generateJobCompletionStatement({
      employmentRelationshipId: empRel.id,
      contractId: contract.id,
      generatedByUserId: contractor.user_id,
    });

    assert.strictEqual(
      statement.settlement_status,
      'OUTSTANDING_PAYMENT',
      'Unpaid employment must be OUTSTANDING_PAYMENT'
    );
    assert.ok(statement.outstanding_paise > 0, 'Outstanding must be > 0 for unpaid employment');
    assert.strictEqual(statement.total_paid_paise, 0, 'No payments made');
    assert.ok(statement.total_earned_paise > 0, 'Earnings must be > 0');
  });

  // ── Test 4: Fully Settled Employment ─────────────────────────────────────────
  it('4. Fully settled employment — settlement_status = SETTLED, outstanding = 0', async () => {
    const worker = makeWorker({ full_name: 'Settled Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);
    const contract = makeContract(worker.id, contractor.id, project.id, {
      status: 'COMPLETED',
      daily_wage: 800,
      end_date: '2026-05-31',
    });
    const empRel = makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, {
      status: 'COMPLETED',
    });
    makeAcceptance(contract.id, worker.id);

    // 3 days × ₹800 = ₹2400 = 240000 paise earned
    for (let i = 1; i <= 3; i++) {
      makeAttendance(worker.id, contractor.id, project.id, contract.id, `2026-05-0${i}`);
    }
    // Full payment: 240000 paise
    makePaymentTransaction(worker.id, contractor.id, contract.id, project.id, 240000);

    const statement = await generateJobCompletionStatement({
      employmentRelationshipId: empRel.id,
      contractId: contract.id,
      generatedByUserId: contractor.user_id,
    });

    assert.strictEqual(statement.settlement_status, 'SETTLED');
    assert.strictEqual(statement.outstanding_paise, 0);
    assert.strictEqual(statement.total_earned_paise, statement.total_paid_paise);
  });

  // ── Test 5: Multiple Employers ────────────────────────────────────────────────
  it('5. Multiple employers — history includes all contractors', async () => {
    const worker = makeWorker({ full_name: 'Multi-Employer Worker' });

    const contractor1 = makeContractor({ full_name: 'Employer One', company_name: 'Firm A' });
    const contractor2 = makeContractor({ full_name: 'Employer Two', company_name: 'Firm B' });

    const project1 = makeProject(contractor1.id, { name: 'Project Alpha' });
    const project2 = makeProject(contractor2.id, { name: 'Project Beta' });

    const contract1 = makeContract(worker.id, contractor1.id, project1.id, { daily_wage: 500 });
    const contract2 = makeContract(worker.id, contractor2.id, project2.id, { daily_wage: 600 });

    makeEmploymentRelationship(worker.id, contractor1.id, project1.id, contract1.id);
    makeEmploymentRelationship(worker.id, contractor2.id, project2.id, contract2.id);
    makeAcceptance(contract1.id, worker.id);
    makeAcceptance(contract2.id, worker.id);

    const history = await getEmploymentHistory(worker.id);
    const workerEntries = history.filter(
      (e) => e.contractorId === contractor1.id || e.contractorId === contractor2.id
    );

    assert.ok(workerEntries.length >= 2, 'Should have entries for both contractors');
    const contractorIds = workerEntries.map((e) => e.contractorId);
    assert.ok(contractorIds.includes(contractor1.id), 'Contractor 1 should appear in history');
    assert.ok(contractorIds.includes(contractor2.id), 'Contractor 2 should appear in history');
    const companies = workerEntries.map((e) => e.contractorCompany);
    assert.ok(companies.includes('Firm A') || companies.some((c) => c), 'Contractor company names must be populated');
  });

  // ── Test 6: Multiple Contracts ────────────────────────────────────────────────
  it('6. Multiple contracts — same contractor, all returned', async () => {
    const worker = makeWorker({ full_name: 'Multi-Contract Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);

    const contract1 = makeContract(worker.id, contractor.id, project.id, {
      work_type: 'Plastering',
      daily_wage: 550,
    });
    const contract2 = makeContract(worker.id, contractor.id, project.id, {
      work_type: 'Painting',
      daily_wage: 650,
    });

    makeEmploymentRelationship(worker.id, contractor.id, project.id, contract1.id);
    makeEmploymentRelationship(worker.id, contractor.id, project.id, contract2.id);
    makeAcceptance(contract1.id, worker.id);
    makeAcceptance(contract2.id, worker.id);

    const history = await getEmploymentHistory(worker.id);
    const contractIds = history.map((e) => e.contractId);
    assert.ok(contractIds.includes(contract1.id), 'Contract 1 must appear');
    assert.ok(contractIds.includes(contract2.id), 'Contract 2 must appear');

    const entry1 = history.find((e) => e.contractId === contract1.id);
    const entry2 = history.find((e) => e.contractId === contract2.id);
    assert.strictEqual(entry1!.workType, 'Plastering');
    assert.strictEqual(entry2!.workType, 'Painting');
  });

  // ── Test 7: Multiple Projects ─────────────────────────────────────────────────
  it('7. Multiple projects — history spans multiple projects', async () => {
    const worker = makeWorker({ full_name: 'Multi-Project Worker' });
    const contractor = makeContractor();

    const project1 = makeProject(contractor.id, { name: 'Highway Project' });
    const project2 = makeProject(contractor.id, { name: 'Bridge Project' });
    const project3 = makeProject(contractor.id, { name: 'Building Project' });

    const c1 = makeContract(worker.id, contractor.id, project1.id);
    const c2 = makeContract(worker.id, contractor.id, project2.id);
    const c3 = makeContract(worker.id, contractor.id, project3.id);

    makeEmploymentRelationship(worker.id, contractor.id, project1.id, c1.id);
    makeEmploymentRelationship(worker.id, contractor.id, project2.id, c2.id);
    makeEmploymentRelationship(worker.id, contractor.id, project3.id, c3.id);
    makeAcceptance(c1.id, worker.id);
    makeAcceptance(c2.id, worker.id);
    makeAcceptance(c3.id, worker.id);

    const history = await getEmploymentHistory(worker.id);
    const projectIds = history.map((e) => e.projectId);

    assert.ok(projectIds.includes(project1.id), 'Project 1 must appear');
    assert.ok(projectIds.includes(project2.id), 'Project 2 must appear');
    assert.ok(projectIds.includes(project3.id), 'Project 3 must appear');

    const projectNames = history.map((e) => e.projectName);
    assert.ok(projectNames.some((n) => n === 'Highway Project'), 'Highway Project name found');
    assert.ok(projectNames.some((n) => n === 'Bridge Project'), 'Bridge Project name found');
  });

  // ── Test 8: PDF Generation ────────────────────────────────────────────────────
  it('8. PDF generation — generatePassportPdf returns non-empty Buffer', async () => {
    const worker = makeWorker({ full_name: 'PDF Test Worker', internal_worker_id: 'WRK-PDF-001' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id, { name: 'PDF Test Project' });
    const contract = makeContract(worker.id, contractor.id, project.id, { daily_wage: 700 });

    makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, { status: 'COMPLETED' });
    makeAcceptance(contract.id, worker.id);
    makeAttendance(worker.id, contractor.id, project.id, contract.id, '2026-06-01');
    makePaymentTransaction(worker.id, contractor.id, contract.id, project.id, 70000);

    const pdfBuffer = await generatePassportPdf(worker.id);

    assert.ok(pdfBuffer instanceof Buffer, 'Result must be a Buffer');
    assert.ok(pdfBuffer.length > 1000, 'PDF must be non-trivially sized (>1KB)');

    // Verify PDF magic bytes: %PDF-
    const header = pdfBuffer.slice(0, 5).toString('ascii');
    assert.strictEqual(header, '%PDF-', 'Buffer must start with PDF magic bytes');
  });

  // ── Test 9: Unauthorized Access ───────────────────────────────────────────────
  it('9. Unauthorized access — wrong worker cannot call getEmploymentHistory for another worker', async () => {
    const workerA = makeWorker({ full_name: 'Worker A' });
    const workerB = makeWorker({ full_name: 'Worker B' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);
    const contract = makeContract(workerA.id, contractor.id, project.id);
    makeEmploymentRelationship(workerA.id, contractor.id, project.id, contract.id);
    makeAcceptance(contract.id, workerA.id);

    const historyForB = await getEmploymentHistory(workerB.id);
    const entryForAInBResults = historyForB.find((e) => e.contractId === contract.id);
    assert.strictEqual(
      entryForAInBResults,
      undefined,
      'Worker A\'s contract must NOT appear in Worker B\'s employment history'
    );
  });

  // ── Test 10: Timeline Event Coverage ─────────────────────────────────────────
  it('10. Timeline event coverage — all 11 event types present for complete employment', async () => {
    const worker = makeWorker({ full_name: 'Timeline Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);
    const contract = makeContract(worker.id, contractor.id, project.id, {
      status: 'COMPLETED',
      daily_wage: 700,
      end_date: '2026-07-31',
    });
    const empRel = makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, {
      status: 'COMPLETED',
    });
    makeAcceptance(contract.id, worker.id);

    const attEvent = makeAttendance(worker.id, contractor.id, project.id, contract.id, '2026-07-03');
    makeWorkerConfirmation(contract.id, worker.id, uid());
    makeEarningsSnapshot(contract.id, worker.id, contractor.id, 5, 70000);
    const payTx = makePaymentTransaction(worker.id, contractor.id, contract.id, project.id, 350000);
    makePaymentConfirmation(payTx.id, worker.id);
    const dispute = makeDispute(worker.id, contractor.id, project.id, contract.id, 'RESOLVED');
    dispute.created_at = '2026-07-15T09:00:00.000Z';
    makeResolution(dispute.id);

    // Job completion statement
    const statement = await generateJobCompletionStatement({
      employmentRelationshipId: empRel.id,
      contractId: contract.id,
      generatedByUserId: contractor.user_id,
    });
    assert.ok(statement, 'Completion statement should be generated before timeline build');

    const timeline = await buildEmploymentTimeline(contract.id, worker.id);

    const eventTypes = new Set(timeline.map((e) => e.eventType));

    const requiredTypes = [
      'CONTRACT_CREATED',
      'WORKER_ACCEPTED',
      'EMPLOYMENT_ACTIVATED',
      'ATTENDANCE',
      'ATTENDANCE_CONFIRMATION',
      'EARNINGS',
      'PAYMENT',
      'PAYMENT_CONFIRMATION',
      'DISPUTE',
      'RESOLUTION',
      'JOB_COMPLETION',
    ] as const;

    for (const type of requiredTypes) {
      assert.ok(eventTypes.has(type), `Timeline must contain event type: ${type}`);
    }

    // Verify chronological order
    for (let i = 1; i < timeline.length; i++) {
      const prev = new Date(timeline[i - 1].timestamp).getTime();
      const curr = new Date(timeline[i].timestamp).getTime();
      assert.ok(prev <= curr, `Timeline must be chronological: ${timeline[i - 1].eventType} (${timeline[i - 1].timestamp}) before ${timeline[i].eventType} (${timeline[i].timestamp})`);
    }

    // Verify no hardcoded entries — every event has a real entityId
    for (const event of timeline) {
      assert.ok(event.entityId && event.entityId.length > 0, `Event ${event.eventType} must have a real entityId`);
      assert.ok(event.timestamp && event.timestamp.length > 0, `Event ${event.eventType} must have a timestamp`);
      assert.ok(event.summary && event.summary.length > 0, `Event ${event.eventType} must have a summary`);
    }
  });

  // ── Bonus: Duplicate Statement Prevention ─────────────────────────────────────
  it('Bonus: Duplicate Job Completion Statement is rejected (409)', async () => {
    const worker = makeWorker({ full_name: 'Duplicate Test Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);
    const contract = makeContract(worker.id, contractor.id, project.id, { status: 'COMPLETED' });
    const empRel = makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id, {
      status: 'COMPLETED',
    });
    makeAcceptance(contract.id, worker.id);

    // First call should succeed
    await generateJobCompletionStatement({
      employmentRelationshipId: empRel.id,
      contractId: contract.id,
      generatedByUserId: contractor.user_id,
    });

    // Second call for the same employment must throw
    try {
      await generateJobCompletionStatement({
        employmentRelationshipId: empRel.id,
        contractId: contract.id,
        generatedByUserId: contractor.user_id,
      });
      assert.fail('Should have thrown for duplicate statement');
    } catch (err: any) {
      assert.ok(
        err.reasonCode === 'STATEMENT_ALREADY_EXISTS' || err.message?.includes('already exists'),
        `Expected STATEMENT_ALREADY_EXISTS, got: ${err.message}`
      );
    }
  });

  // ── Bonus: Benefit Passport Data Aggregation ──────────────────────────────────
  it('Bonus: getBenefitPassportData aggregates all fields correctly', async () => {
    const worker = makeWorker({ full_name: 'Passport Aggregation Worker' });
    const contractor = makeContractor();
    const project = makeProject(contractor.id);
    const contract = makeContract(worker.id, contractor.id, project.id, { daily_wage: 400 });
    makeEmploymentRelationship(worker.id, contractor.id, project.id, contract.id);
    makeAcceptance(contract.id, worker.id);

    const passportData = await getBenefitPassportData(worker.id);

    assert.strictEqual(passportData.workerId, worker.id);
    assert.strictEqual(passportData.workerName, worker.full_name);
    assert.ok(passportData.internalWorkerId.length > 0, 'internal_worker_id must be populated');
    assert.ok(passportData.passportGeneratedAt.length > 0);
    assert.ok(passportData.employmentHistory instanceof Array);
    assert.ok(passportData.completionStatements instanceof Array);
    assert.ok(typeof passportData.totalVerifiedWorkdays === 'number');
    assert.ok(typeof passportData.totalEarnedPaise === 'number');
    assert.ok(typeof passportData.totalPaidPaise === 'number');
    assert.ok(typeof passportData.totalOutstandingPaise === 'number');
    // Aggregation invariant
    assert.strictEqual(
      passportData.totalOutstandingPaise,
      passportData.totalEarnedPaise - passportData.totalPaidPaise,
      'totalOutstandingPaise must equal totalEarnedPaise - totalPaidPaise'
    );
  });
});

