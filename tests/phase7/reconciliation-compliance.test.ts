/**
 * SHRAMIKSETU PHASE 7 — RECONCILIATION, COMPLIANCE ENGINE & CONTRACTOR INDICATORS
 */

import assert from 'node:assert';
import { describe, it, beforeEach, expect } from 'vitest';
import { rupeesToPaise, paiseToRupees } from '../../src/types/payment.types';
import type { MinimumWageRuleRow } from '../../src/types/database.types';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import { getContractReconciliation, getWorkerReconciliation } from '../../src/lib/services/reconciliation-service';
import { checkContractCompliance } from '../../src/lib/services/compliance-engine';
import { evaluateContractorComplianceIndicator } from '../../src/lib/services/contractor-indicator-service';

// Set mock Supabase env vars
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

// ─── In-Memory Data Store for Testing ────────────────────────────────────────

const mockContracts: any[] = [];
const mockWageRules: MinimumWageRuleRow[] = [];
const mockAttendanceEvents: any[] = [];
const mockPaymentTransactions: any[] = [];
const mockComplianceLogs: any[] = [];
const mockContractorSnapshots: any[] = [];
const mockPaymentConfirmations: any[] = [];
const mockAttendanceDiscrepancies: any[] = [];

// Register in-memory factory for DB queries
setMockAdminClientFactory(() => {
  return {
    from: (table: string) => {
      let data: any[] = [];
      if (table === 'work_contracts') data = mockContracts;
      else if (table === 'minimum_wage_rules') data = mockWageRules;
      else if (table === 'attendance_events') data = mockAttendanceEvents;
      else if (table === 'payment_transactions') data = mockPaymentTransactions;
      else if (table === 'compliance_check_logs') data = mockComplianceLogs;
      else if (table === 'contractor_compliance_snapshots') data = mockContractorSnapshots;
      else if (table === 'payment_confirmations') data = mockPaymentConfirmations;
      else if (table === 'attendance_discrepancies') data = mockAttendanceDiscrepancies;

      let filtered = [...data];

      const builder: any = {
        select: (fields?: string, opts?: any) => {
          if (opts?.count === 'exact') {
            builder._isCount = true;
          }
          return builder;
        },
        eq: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] === value);
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
        maybeSingle: async () => {
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          if (filtered.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: filtered[0], error: null };
        },
        insert: async (item: any) => {
          const inserted = { id: item.id || `id-${Math.random()}`, ...item };
          data.push(inserted);
          return {
            data: inserted,
            error: null,
            select: () => ({
              single: async () => ({ data: inserted, error: null })
            })
          };
        },
        then: (resolve: Function) => {
          if (builder._isCount) {
            resolve({ count: filtered.length, data: null, error: null });
          } else {
            resolve({ data: filtered, count: filtered.length, error: null });
          }
        }
      };

      return builder;
    }
  };
});

function clearMockStore() {
  mockContracts.length = 0;
  mockWageRules.length = 0;
  mockAttendanceEvents.length = 0;
  mockPaymentTransactions.length = 0;
  mockComplianceLogs.length = 0;
  mockContractorSnapshots.length = 0;
  mockPaymentConfirmations.length = 0;
  mockAttendanceDiscrepancies.length = 0;
}

describe('Phase 7: Reconciliation & Compliance Suite', () => {
  beforeEach(() => {
    clearMockStore();
  });

  it('TEST 1: Correct wage (contract wage >= minimum wage rule -> COMPLIANT)', async () => {
    mockWageRules.push({
      id: 'rule-mh-skilled-1',
      version: 1,
      state: 'Maharashtra',
      district: null,
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 70000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-LABOUR-MIN-WAGE-2026',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContracts.push({
      id: 'contract-1',
      worker_id: 'worker-1',
      contractor_id: 'contractor-1',
      project_id: 'project-1',
      daily_wage: 750,
      status: 'ACTIVE',
      projects: { name: 'Metro Line', worksites: { state: 'Maharashtra', district: 'Mumbai' } },
      workers: { skill_category: 'SKILLED', occupation: 'Masion' }
    });

    const result = await checkContractCompliance({ contractId: 'contract-1', checkDate: '2026-08-22' });
    expect(result.result).toBe('COMPLIANT');
    expect(result.calculation.contractWagePaise).toBe(75000);
    expect(result.calculation.minimumWagePaise).toBe(70000);
    expect(result.calculation.isAboveMinimum).toBe(true);
    expect(result.explanation).toContain('meets or exceeds legal minimum wage');
  });

  it('TEST 2: Underpayment (contract wage < minimum wage rule -> POTENTIAL_NON_COMPLIANCE)', async () => {
    mockWageRules.push({
      id: 'rule-mh-skilled-1',
      version: 1,
      state: 'Maharashtra',
      district: null,
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 70000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-LABOUR-MIN-WAGE-2026',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContracts.push({
      id: 'contract-underpaid',
      worker_id: 'worker-2',
      contractor_id: 'contractor-1',
      project_id: 'project-1',
      daily_wage: 600,
      status: 'ACTIVE',
      projects: { name: 'Metro Line', worksites: { state: 'Maharashtra', district: 'Mumbai' } },
      workers: { skill_category: 'SKILLED', occupation: 'Electrician' }
    });

    const result = await checkContractCompliance({ contractId: 'contract-underpaid', checkDate: '2026-08-22' });
    expect(result.result).toBe('POTENTIAL_NON_COMPLIANCE');
    expect(result.calculation.contractWagePaise).toBe(60000);
    expect(result.calculation.minimumWagePaise).toBe(70000);
    expect(result.calculation.differencePaise).toBe(-10000);
    expect(result.calculation.isAboveMinimum).toBe(false);
    expect(result.explanation).toContain('POTENTIAL UNDERPAYMENT DISCREPANCY');
  });

  it('TEST 3: Missing wage rule (no rule registered -> INSUFFICIENT_DATA)', async () => {
    mockContracts.push({
      id: 'contract-no-rule',
      worker_id: 'worker-3',
      contractor_id: 'contractor-2',
      project_id: 'project-2',
      daily_wage: 800,
      status: 'ACTIVE',
      projects: { name: 'Resort Build', worksites: { state: 'Goa', district: 'Panaji' } },
      workers: { skill_category: 'HIGHLY_SKILLED', occupation: 'Plumber' }
    });

    const result = await checkContractCompliance({ contractId: 'contract-no-rule', checkDate: '2026-08-22' });
    expect(result.result).toBe('INSUFFICIENT_DATA');
    expect(result.ruleUsed).toBeNull();
    expect(result.explanation).toContain('MISSING minimum wage rule');
  });

  it('TEST 4: Expired wage rule (effective_to < checkDate -> INSUFFICIENT_DATA)', async () => {
    mockWageRules.push({
      id: 'rule-expired-1',
      version: 1,
      state: 'Karnataka',
      district: null,
      worker_category: null,
      skill_level: 'UNSKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 50000,
      effective_from: '2025-01-01',
      effective_to: '2025-12-31',
      source_reference: 'KA-LABOUR-OLD-2025',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContracts.push({
      id: 'contract-ka',
      worker_id: 'worker-4',
      contractor_id: 'contractor-2',
      project_id: 'project-3',
      daily_wage: 550,
      status: 'ACTIVE',
      projects: { name: 'Tech Park', worksites: { state: 'Karnataka', district: 'Bengaluru' } },
      workers: { skill_category: 'UNSKILLED', occupation: 'Helper' }
    });

    const result = await checkContractCompliance({ contractId: 'contract-ka', checkDate: '2026-08-22' });
    expect(result.result).toBe('INSUFFICIENT_DATA');
    expect(result.explanation).toContain('EXPIRED');
  });

  it('TEST 5: Multiple wage rules (selects exact district & highest version precedence)', async () => {
    mockWageRules.push({
      id: 'rule-mh-state-v1',
      version: 1,
      state: 'Maharashtra',
      district: null,
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 60000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-STATE-V1',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockWageRules.push({
      id: 'rule-mh-thane-v2',
      version: 2,
      state: 'Maharashtra',
      district: 'Thane',
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 75000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-THANE-ZONE-1',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContracts.push({
      id: 'contract-thane',
      worker_id: 'worker-5',
      contractor_id: 'contractor-1',
      project_id: 'project-4',
      daily_wage: 700,
      status: 'ACTIVE',
      projects: { name: 'Thane Expressway', worksites: { state: 'Maharashtra', district: 'Thane' } },
      workers: { skill_category: 'SKILLED', occupation: 'Carpenter' }
    });

    const result = await checkContractCompliance({ contractId: 'contract-thane', checkDate: '2026-08-22' });
    expect(result.result).toBe('POTENTIAL_NON_COMPLIANCE');
    expect(result.ruleUsed?.id).toBe('rule-mh-thane-v2');
    expect(result.ruleVersion).toBe(2);
    expect(result.calculation.minimumWagePaise).toBe(75000);
  });

  it('TEST 6: Disputed contract status flags REVIEW_REQUIRED', async () => {
    mockWageRules.push({
      id: 'rule-mh-skilled-1',
      version: 1,
      state: 'Maharashtra',
      district: null,
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 70000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-LABOUR-2026',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContracts.push({
      id: 'contract-disputed',
      worker_id: 'worker-6',
      contractor_id: 'contractor-1',
      project_id: 'project-1',
      daily_wage: 720,
      status: 'DISPUTED',
      projects: { name: 'Metro Line', worksites: { state: 'Maharashtra', district: 'Mumbai' } },
      workers: { skill_category: 'SKILLED', occupation: 'Welder' }
    });

    const result = await checkContractCompliance({ contractId: 'contract-disputed', checkDate: '2026-08-22' });
    expect(result.result).toBe('REVIEW_REQUIRED');
    expect(result.explanation).toContain('Contract is currently DISPUTED');
  });

  it('TEST 7: Partial payment reconciliation', async () => {
    mockContracts.push({
      id: 'contract-recon-1',
      worker_id: 'worker-7',
      contractor_id: 'contractor-1',
      project_id: 'project-1',
      daily_wage: 700,
      status: 'ACTIVE',
    });

    for (let i = 1; i <= 10; i++) {
      mockAttendanceEvents.push({
        id: `att-${i}`,
        contract_id: 'contract-recon-1',
        status: 'VERIFIED',
        date: `2026-08-${i.toString().padStart(2, '0')}`,
      });
    }

    mockPaymentTransactions.push(
      { id: 'pay-1', contract_id: 'contract-recon-1', amount_paise: 200000, status: 'SUCCESS' },
      { id: 'pay-2', contract_id: 'contract-recon-1', amount_paise: 150000, status: 'SUCCESS' },
      { id: 'pay-3', contract_id: 'contract-recon-1', amount_paise: 210000, status: 'SUCCESS' }
    );

    const recon = await getContractReconciliation({ contractId: 'contract-recon-1' });

    expect(recon.verifiedDaysCount).toBe(10);
    expect(recon.dailyWagePaise).toBe(70000);
    expect(recon.totalEarnedPaise).toBe(700000);
    expect(recon.totalPaidPaise).toBe(560000);
    expect(recon.outstandingPaise).toBe(140000);

    expect(recon.totalEarnedRupees).toBe(7000);
    expect(recon.totalPaidRupees).toBe(5600);
    expect(recon.outstandingRupees).toBe(1400);
  });

  it('TEST 8: Worker-level reconciliation aggregates multiple contracts accurately', async () => {
    mockContracts.push(
      { id: 'c-1', worker_id: 'worker-8', contractor_id: 'contractor-1', daily_wage: 500 },
      { id: 'c-2', worker_id: 'worker-8', contractor_id: 'contractor-2', daily_wage: 600 }
    );

    for (let i = 1; i <= 5; i++) {
      mockAttendanceEvents.push({ id: `att-c1-${i}`, contract_id: 'c-1', status: 'VERIFIED' });
    }
    mockPaymentTransactions.push({ id: 'p-c1-1', contract_id: 'c-1', amount_paise: 100000, status: 'SUCCESS' });

    for (let i = 1; i <= 4; i++) {
      mockAttendanceEvents.push({ id: `att-c2-${i}`, contract_id: 'c-2', status: 'VERIFIED' });
    }
    mockPaymentTransactions.push({ id: 'p-c2-1', contract_id: 'c-2', amount_paise: 240000, status: 'SUCCESS' });

    const workerRecon = await getWorkerReconciliation('worker-8');

    expect(workerRecon.totalContractsCount).toBe(2);
    expect(workerRecon.totalEarnedPaise).toBe(490000);
    expect(workerRecon.totalPaidPaise).toBe(340000);
    expect(workerRecon.totalOutstandingPaise).toBe(150000);
  });

  it('TEST 9: Fully paid contract leaves zero outstanding', async () => {
    mockContracts.push({
      id: 'c-fully-paid',
      worker_id: 'worker-9',
      contractor_id: 'contractor-1',
      daily_wage: 1000,
    });

    mockAttendanceEvents.push({ id: 'att-fp-1', contract_id: 'c-fully-paid', status: 'VERIFIED' });
    mockPaymentTransactions.push({ id: 'p-fp-1', contract_id: 'c-fully-paid', amount_paise: 100000, status: 'SUCCESS' });

    const recon = await getContractReconciliation({ contractId: 'c-fully-paid' });
    expect(recon.totalEarnedPaise).toBe(100000);
    expect(recon.totalPaidPaise).toBe(100000);
    expect(recon.outstandingPaise).toBe(0);
  });

  it('TEST 10: Explainable rule-based contractor compliance indicator evaluates factors correctly', async () => {
    mockContracts.push({
      id: 'c-indicator-1',
      worker_id: 'worker-10',
      contractor_id: 'contractor-risk-test',
      project_id: 'p-1',
      daily_wage: 600,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      projects: { name: 'Highway', worksites: { state: 'Maharashtra', district: 'Pune' } },
      workers: { skill_category: 'SKILLED', occupation: 'Mason' }
    });

    mockWageRules.push({
      id: 'rule-mh-1',
      version: 1,
      state: 'Maharashtra',
      district: null,
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 70000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-2026',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    for (let i = 0; i < 100; i++) {
      mockAttendanceEvents.push({ id: `att-ind-${i}`, contract_id: 'c-indicator-1', status: 'VERIFIED' });
    }

    const indicator = await evaluateContractorComplianceIndicator('contractor-risk-test');

    expect(indicator.contractorId).toBe('contractor-risk-test');
    expect(indicator.breakdown.paymentDiscrepanciesCount).toBe(1);
    expect(indicator.breakdown.outstandingWagesPaise).toBe(6000000);
    expect(indicator.score).toBe(60);
    expect(indicator.riskLevel).toBe('MEDIUM_RISK');
    expect(indicator.explanations.length).toBeGreaterThanOrEqual(2);
    expect(indicator.explanations[0]).toContain('minimum wage underpayment');
  });

  it('TEST 11: End-to-End Lifecycle Reconciliation', async () => {
    mockWageRules.push({
      id: 'rule-e2e-mh',
      version: 1,
      state: 'Maharashtra',
      district: 'Mumbai',
      worker_category: null,
      skill_level: 'SKILLED',
      wage_type: 'DAILY',
      minimum_amount_paise: 80000,
      effective_from: '2026-01-01',
      effective_to: null,
      source_reference: 'MH-MUMBAI-MIN-WAGE-2026',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockContracts.push({
      id: 'contract-e2e',
      worker_id: 'worker-e2e',
      contractor_id: 'contractor-e2e',
      project_id: 'project-e2e',
      daily_wage: 850,
      status: 'ACTIVE',
      projects: { name: 'Coastal Road', worksites: { state: 'Maharashtra', district: 'Mumbai' } },
      workers: { skill_category: 'SKILLED', occupation: 'Pipelayer' }
    });

    for (let day = 1; day <= 20; day++) {
      mockAttendanceEvents.push({
        id: `att-e2e-${day}`,
        contract_id: 'contract-e2e',
        status: 'VERIFIED',
        date: `2026-08-${day.toString().padStart(2, '0')}`
      });
    }

    mockPaymentTransactions.push(
      { id: 'tx-e2e-1', contract_id: 'contract-e2e', amount_paise: 500000, status: 'SUCCESS' },
      { id: 'tx-e2e-2', contract_id: 'contract-e2e', amount_paise: 600000, status: 'SUCCESS' }
    );

    const recon = await getContractReconciliation({ contractId: 'contract-e2e' });

    expect(recon.verifiedDaysCount).toBe(20);
    expect(recon.dailyWagePaise).toBe(85000);
    expect(recon.totalEarnedPaise).toBe(1700000);
    expect(recon.totalPaidPaise).toBe(1100000);
    expect(recon.outstandingPaise).toBe(600000);

    const compliance = await checkContractCompliance({ contractId: 'contract-e2e' });
    expect(compliance.result).toBe('COMPLIANT');
    expect(compliance.calculation.minimumWagePaise).toBe(80000);
    expect(compliance.calculation.contractWagePaise).toBe(85000);

    expect(recon.totalEarnedPaise - recon.totalPaidPaise).toBe(recon.outstandingPaise);
  });
});
