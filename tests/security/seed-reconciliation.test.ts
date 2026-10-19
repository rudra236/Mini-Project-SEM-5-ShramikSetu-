/**
 * SHRAMIKSETU SYSTEM-WIDE SEED RECONCILIATION TEST SUITE
 *
 * Verifies that the deterministic seed dataset correctly populates a living system
 * where all numbers across dashboard, passport, wallet, and inspector stats
 * reconcile exactly without discrepancies.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildCompleteSeedData, CompleteSeedData } from '../../supabase/seed/generator';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import { getContractReconciliation } from '../../src/lib/services/reconciliation-service';
import { getWorkerFinancialSummary } from '../../src/lib/services/financial-summary-service';
import { getBenefitPassportData } from '../../src/lib/services/passport-service';
import { InstitutionalAnalyticsService } from '../../src/lib/services/institutional-analytics-service';

describe('Living System Seed Reconciliation Test Suite', () => {
  let dataset: CompleteSeedData;

  beforeEach(() => {
    dataset = buildCompleteSeedData();

    // Synthesize financial summary views matching migrations 017
    const contractFinancialSummary = dataset.contracts.map((wc) => {
      const verifiedAttendance = dataset.attendanceEvents.filter(
        (ae) => ae.contract_id === wc.id && ae.status === 'VERIFIED'
      );
      const distinctDates = new Set(verifiedAttendance.map((ae) => ae.date));
      const verifiedDaysCount = distinctDates.size;
      const totalEarnedPaise = verifiedAttendance.reduce((sum) => sum + wc.daily_wage, 0);
      const totalPaidPaise = dataset.paymentTransactions
        .filter((pt) => pt.contract_id === wc.id && pt.status === 'SUCCESS')
        .reduce((sum, pt) => sum + pt.amount_paise, 0);
      return {
        contract_id: wc.id,
        contract_code: wc.contract_code,
        worker_id: wc.worker_id,
        contractor_id: wc.contractor_id,
        project_id: wc.project_id,
        worksite_id: wc.worksite_id,
        contract_status: wc.status,
        daily_wage_paise: wc.daily_wage,
        verified_days_count: verifiedDaysCount,
        total_earned_paise: totalEarnedPaise,
        total_paid_paise: totalPaidPaise,
        outstanding_paise: totalEarnedPaise - totalPaidPaise,
      };
    });

    const workerFinancialSummary = dataset.workers.map((w) => {
      const verifiedAttendance = dataset.attendanceEvents.filter(
        (ae) => ae.worker_id === w.id && ae.status === 'VERIFIED'
      );
      const distinctDates = new Set(verifiedAttendance.map((ae) => ae.date));
      const verifiedDaysCount = distinctDates.size;
      const totalEarnedPaise = verifiedAttendance.reduce((sum, ae) => {
        const contract = dataset.contracts.find((c) => c.id === ae.contract_id);
        return sum + (contract ? contract.daily_wage : 0);
      }, 0);
      const totalPaidPaise = dataset.paymentTransactions
        .filter((pt) => pt.worker_id === w.id && pt.status === 'SUCCESS')
        .reduce((sum, pt) => sum + pt.amount_paise, 0);
      const wContracts = dataset.contracts.filter((c) => c.worker_id === w.id);
      const totalContractsCount = wContracts.length;
      const activeContractsCount = wContracts.filter((c) => c.status === 'ACTIVE').length;

      return {
        worker_id: w.id,
        user_id: w.user_id,
        full_name: w.full_name,
        internal_worker_id: w.internal_worker_id,
        occupation: w.occupation,
        skill_category: w.skill_category,
        verified_days_count: verifiedDaysCount,
        total_earned_paise: totalEarnedPaise,
        total_paid_paise: totalPaidPaise,
        outstanding_paise: totalEarnedPaise - totalPaidPaise,
        total_contracts_count: totalContractsCount,
        active_contracts_count: activeContractsCount,
      };
    });

    const decoratedAttendanceEvents = dataset.attendanceEvents.map((ae) => {
      const contract = dataset.contracts.find((c) => c.id === ae.contract_id);
      return {
        ...ae,
        work_contracts: {
          daily_wage: contract ? contract.daily_wage : 0,
        },
      };
    });

    // Wire up in-memory mock client using the deterministic seed dataset
    setMockAdminClientFactory(() => ({
      from: (table: string) => {
        let store: any[] = [];
        switch (table) {
          case 'workers': store = dataset.workers; break;
          case 'contractors': store = dataset.contractors; break;
          case 'projects': store = dataset.projects; break;
          case 'worksites': store = dataset.worksites; break;
          case 'work_contracts': store = dataset.contracts; break;
          case 'contract_versions': store = dataset.contractVersions; break;
          case 'contract_acceptances': store = dataset.contractAcceptances; break;
          case 'employment_relationships': store = dataset.employmentRelationships; break;
          case 'attendance_tokens': store = dataset.attendanceTokens; break;
          case 'attendance_events': store = decoratedAttendanceEvents; break;
          case 'wallet_accounts': store = dataset.walletAccounts; break;
          case 'payment_transactions': store = dataset.paymentTransactions; break;
          case 'ledger_entries': store = dataset.ledgerEntries; break;
          case 'disputes': store = dataset.disputes; break;
          case 'dispute_evidence_snapshots': store = dataset.disputeEvidenceSnapshots; break;
          case 'dispute_resolutions': store = dataset.disputeResolutions; break;
          case 'compliance_check_logs': store = dataset.complianceCheckLogs; break;
          case 'job_completion_statements': store = dataset.jobCompletionStatements; break;
          case 'audit_events': store = dataset.auditEvents; break;
          case 'minimum_wage_rules': store = dataset.minimumWageRules; break;
          case 'contract_financial_summary': store = contractFinancialSummary; break;
          case 'worker_financial_summary': store = workerFinancialSummary; break;
          case 'payment_records': store = []; break;
          case 'earnings_records': store = []; break;
          case 'compliance_checks': store = []; break;
          default: store = [];
        }

        let filtered = [...store];
        let isCount = false;
        let isHead = false;

        const chain: any = {
          select: (_fields?: string, opts?: any) => {
            if (opts?.count === 'exact') isCount = true;
            if (opts?.head === true) isHead = true;
            return chain;
          },
          eq: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] === val);
            return chain;
          },
          neq: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] !== val);
            return chain;
          },
          in: (field: string, vals: any[]) => {
            filtered = filtered.filter((r) => vals.includes(r[field]));
            return chain;
          },
          gte: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] >= val);
            return chain;
          },
          lte: (field: string, val: any) => {
            filtered = filtered.filter((r) => r[field] <= val);
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
          then: (resolve: (val: any) => void) => {
            if (isHead) {
              resolve({ count: filtered.length, data: null, error: null });
            } else if (isCount) {
              resolve({ count: filtered.length, data: filtered, error: null });
            } else {
              resolve({ data: filtered, count: filtered.length, error: null });
            }
          },
        };
        return chain;
      },
    }));
  });

  afterEach(() => {
    setMockAdminClientFactory(null);
  });

  // ==========================================================================
  // SECTION 1: RAMESH KUMAR LIVE DEMO NARRATIVE THREAD
  // ==========================================================================

  it('1.1 Ramesh Kumar worked exactly 10 verified masonry shifts for Suresh Builders', () => {
    const ramesh = dataset.workers[0];
    const suresh = dataset.contractors[0];

    expect(ramesh.full_name).toBe('Ramesh Kumar');
    expect(ramesh.occupation).toBe('Mason');
    expect(suresh.company_name).toContain('Suresh Builders');

    const rameshShifts = dataset.attendanceEvents.filter(
      (a) => a.worker_id === ramesh.id && a.contractor_id === suresh.id && a.status === 'VERIFIED'
    );
    expect(rameshShifts.length).toBe(10);

    const rameshContract = dataset.contracts.find((c) => c.worker_id === ramesh.id)!;
    expect(rameshContract.daily_wage).toBe(90000); // ₹900 / day
    expect(rameshContract.status).toBe('COMPLETED');

    const totalStatutoryEarned = rameshShifts.length * rameshContract.daily_wage;
    expect(totalStatutoryEarned).toBe(900000); // ₹9,000
  });

  it('1.2 Initial disbursement underpaid Ramesh by exactly ₹1,800 (180,000 paise)', () => {
    const ramesh = dataset.workers[0];
    const initialTxn = dataset.paymentTransactions.find(
      (pt) => pt.worker_id === ramesh.id && pt.transaction_ref === 'TXN-20260813-0001'
    )!;

    expect(initialTxn).toBeDefined();
    expect(initialTxn.amount_paise).toBe(720000); // ₹7,200

    const totalEarnedPaise = 900000;
    const underpaymentPaise = totalEarnedPaise - initialTxn.amount_paise;
    expect(underpaymentPaise).toBe(180000); // ₹1,800 underpayment
  });

  it('1.3 Dispute was raised and Inspector ruled in Ramesh favor', () => {
    const ramesh = dataset.workers[0];
    const dispute = dataset.disputes.find((d) => d.worker_id === ramesh.id)!;

    expect(dispute).toBeDefined();
    expect(dispute.dispute_ref).toBe('DISP-2026-08-001');
    expect(dispute.category).toBe('WAGE');
    expect(dispute.status).toBe('RESOLVED');
    expect(dispute.description).toContain('Underpaid by ₹1,800');

    // Evidence snapshot verified
    const snapshot = dataset.disputeEvidenceSnapshots.find((s) => s.dispute_id === dispute.id)!;
    expect(snapshot).toBeDefined();
    expect(snapshot.automated_analysis.shortfall_arrears_paise).toBe(180000);

    // Inspector resolution verified
    const resolution = dataset.disputeResolutions.find((r) => r.dispute_id === dispute.id)!;
    expect(resolution).toBeDefined();
    expect(resolution.decision).toBe('RESOLVED');
    expect(resolution.reviewer_user_id).toBe(dataset.institutionalUsers[0].user_id);
    expect(resolution.reason).toContain('ordered to disburse ₹1,800 arrears');
  });

  it('1.4 Reversing settlement entry was made to make Ramesh whole', () => {
    const ramesh = dataset.workers[0];
    const suresh = dataset.contractors[0];
    const settlementTxn = dataset.paymentTransactions.find(
      (pt) => pt.worker_id === ramesh.id && pt.transaction_ref === 'TXN-20260816-REV-0002'
    )!;

    expect(settlementTxn).toBeDefined();
    expect(settlementTxn.amount_paise).toBe(180000); // ₹1,800 reversing entry
    expect(settlementTxn.status).toBe('SUCCESS');

    // Ledger double-entry check for reversal
    const reversingEntries = dataset.ledgerEntries.filter((le) => le.transaction_id === settlementTxn.id);
    expect(reversingEntries.length).toBe(2);

    const debitEntry = reversingEntries.find((le) => le.direction === 'DEBIT')!;
    const creditEntry = reversingEntries.find((le) => le.direction === 'CREDIT')!;

    const sureshWallet = dataset.walletAccounts.find((w) => w.owner_id === suresh.id)!;
    const rameshWallet = dataset.walletAccounts.find((w) => w.owner_id === ramesh.id)!;

    expect(debitEntry.account_id).toBe(sureshWallet.id);
    expect(debitEntry.amount_paise).toBe(180000);
    expect(creditEntry.account_id).toBe(rameshWallet.id);
    expect(creditEntry.amount_paise).toBe(180000);
  });

  it('1.5 Ramesh passport reflects 10 shifts, 0 arrears, and SETTLED completion statement', async () => {
    const ramesh = dataset.workers[0];
    const passport = await getBenefitPassportData(ramesh.id);

    expect(passport.workerName).toBe('Ramesh Kumar');
    expect(passport.totalVerifiedWorkdays).toBe(10);
    expect(passport.totalEarnedPaise).toBe(900000); // ₹9,000
    expect(passport.totalPaidPaise).toBe(900000); // ₹7,200 + ₹1,800
    expect(passport.totalOutstandingPaise).toBe(0); // Fully reconciled!

    expect(passport.completionStatements.length).toBeGreaterThan(0);
    const stmt = passport.completionStatements[0];
    expect(stmt.verified_workdays).toBe(10);
    expect(stmt.total_earned_paise).toBe(900000);
    expect(stmt.total_paid_paise).toBe(900000);
    expect(stmt.outstanding_paise).toBe(0);
    expect(stmt.settlement_status).toBe('SETTLED');
  });

  // ==========================================================================
  // SECTION 2: CROSS-SERVICE RECONCILIATION (DASHBOARD vs WALLET vs PASSPORT)
  // ==========================================================================

  it('2.1 Reconciliation service and financial summary service yield identical figures', async () => {
    const ramesh = dataset.workers[0];
    const contract = dataset.contracts[0];

    const contractRecon = await getContractReconciliation({ contractId: contract.id });
    const workerSummary = await getWorkerFinancialSummary(ramesh.id);
    const passportData = await getBenefitPassportData(ramesh.id);

    // Shifts must match across all 3
    expect(contractRecon.verifiedDaysCount).toBe(10);
    expect(workerSummary.verifiedDaysCount).toBe(10);
    expect(passportData.totalVerifiedWorkdays).toBe(10);

    // Total earned must match across all 3
    expect(contractRecon.totalEarnedPaise).toBe(900000);
    expect(workerSummary.totalEarnedPaise).toBe(900000);
    expect(passportData.totalEarnedPaise).toBe(900000);

    // Total paid must match across all 3
    expect(contractRecon.totalPaidPaise).toBe(900000);
    expect(workerSummary.totalPaidPaise).toBe(900000);
    expect(passportData.totalPaidPaise).toBe(900000);

    // Arrears must be 0 across all 3
    expect(contractRecon.outstandingPaise).toBe(0);
    expect(workerSummary.outstandingPaise).toBe(0);
    expect(passportData.totalOutstandingPaise).toBe(0);
  });

  // ==========================================================================
  // SECTION 3: DOUBLE-ENTRY LEDGER BALANCE
  // ==========================================================================

  it('3.1 Total ledger debits strictly equal total ledger credits across all transactions', () => {
    let sumDebits = 0;
    let sumCredits = 0;

    for (const le of dataset.ledgerEntries) {
      if (le.direction === 'DEBIT') sumDebits += le.amount_paise;
      if (le.direction === 'CREDIT') sumCredits += le.amount_paise;
    }

    expect(sumDebits).toBeGreaterThan(0);
    expect(sumDebits).toBe(sumCredits); // Double-entry balance holds!

    // Verify every transaction has matching debit and credit entries
    for (const tx of dataset.paymentTransactions) {
      const txEntries = dataset.ledgerEntries.filter((le) => le.transaction_id === tx.id);
      expect(txEntries.length).toBe(2);

      const d = txEntries.find((e) => e.direction === 'DEBIT')!;
      const c = txEntries.find((e) => e.direction === 'CREDIT')!;

      expect(d.amount_paise).toBe(tx.amount_paise);
      expect(c.amount_paise).toBe(tx.amount_paise);
      expect(d.account_id).toBe(tx.sender_account_id);
      expect(c.account_id).toBe(tx.receiver_account_id);
    }
  });

  // ==========================================================================
  // SECTION 4: DISPUTES SYSTEM INTEGRITY (12 DISPUTES: 4/4/4)
  // ==========================================================================

  it('4.1 Exactly 12 disputes across OPEN, UNDER_REVIEW, and RESOLVED', () => {
    expect(dataset.disputes.length).toBe(12);

    const openDisputes = dataset.disputes.filter((d) => d.status === 'OPEN');
    const underReviewDisputes = dataset.disputes.filter((d) => d.status === 'UNDER_REVIEW');
    const resolvedDisputes = dataset.disputes.filter((d) => d.status === 'RESOLVED');

    expect(openDisputes.length).toBe(4);
    expect(underReviewDisputes.length).toBe(4);
    expect(resolvedDisputes.length).toBe(4);

    // All 12 have snapshots
    expect(dataset.disputeEvidenceSnapshots.length).toBe(12);

    // All 4 resolved have inspector resolutions
    expect(dataset.disputeResolutions.length).toBe(4);
    for (const res of dataset.disputeResolutions) {
      expect(res.decision).toBe('RESOLVED');
      expect(res.reviewer_user_id).toBe(dataset.institutionalUsers[0].user_id);
    }
  });

  // ==========================================================================
  // SECTION 5: CONTRACTOR COMPLIANCE & MINIMUM WAGE BENCHMARKS
  // ==========================================================================

  it('5.1 Exactly 3 contractors underpay vs minimum-wage benchmark, 1 is compliant', () => {
    expect(dataset.contractors.length).toBe(4);

    const underpayingContractorIds = new Set<string>();

    for (const log of dataset.complianceCheckLogs) {
      if (log.result === 'NON_COMPLIANT' || log.result === 'POTENTIAL_NON_COMPLIANCE') {
        const contract = dataset.contracts.find((c) => c.id === log.contract_id)!;
        underpayingContractorIds.add(contract.contractor_id);
      }
    }

    // Assert exactly 3 contractors have non-compliant underpayment logs
    expect(underpayingContractorIds.size).toBe(3);

    // Verify Suresh Builders (0), Sahyadri (2), Konkan (3) are flagged
    expect(underpayingContractorIds.has(dataset.contractors[0].id)).toBe(true);
    expect(underpayingContractorIds.has(dataset.contractors[2].id)).toBe(true);
    expect(underpayingContractorIds.has(dataset.contractors[3].id)).toBe(true);

    // Verify Apex Metro (1) is 100% compliant
    expect(underpayingContractorIds.has(dataset.contractors[1].id)).toBe(false);
  });

  // ==========================================================================
  // SECTION 6: SYSTEM DEMOGRAPHICS & STRUCTURE
  // ==========================================================================

  it('6.1 Exactly 1 jurisdiction (Mumbai Suburban) and 1 inspector', () => {
    expect(dataset.organizations.some((o) => o.org_type === 'INSPECTORATE')).toBe(true);
    expect(dataset.institutionalUsers.length).toBe(1);
    expect(dataset.institutionalUsers[0].jurisdiction_region).toBe('Mumbai Suburban');
    expect(dataset.institutionalUsers[0].full_name).toBe('Vikram Jadhav');
  });

  it('6.2 Exactly 8 projects and 8 worksites across Mumbai Suburban', () => {
    expect(dataset.projects.length).toBe(8);
    expect(dataset.worksites.length).toBe(8);

    // 2 projects per contractor
    for (const c of dataset.contractors) {
      const cProjects = dataset.projects.filter((p) => p.contractor_id === c.id);
      expect(cProjects.length).toBe(2);
    }
  });

  it('6.3 Exactly 40 workers across skill tiers and languages', () => {
    expect(dataset.workers.length).toBe(40);

    const unskilled = dataset.workers.filter((w) => w.skill_category === 'UNSKILLED').length;
    const semiSkilled = dataset.workers.filter((w) => w.skill_category === 'SEMI_SKILLED').length;
    const skilled = dataset.workers.filter((w) => w.skill_category === 'SKILLED').length;
    const highlySkilled = dataset.workers.filter((w) => w.skill_category === 'HIGHLY_SKILLED').length;

    expect(unskilled).toBe(12);
    expect(semiSkilled).toBe(14);
    expect(skilled).toBe(10);
    expect(highlySkilled).toBe(4);

    const hi = dataset.users.filter((u) => u.locale === 'hi' && u.role === 'WORKER').length;
    const mr = dataset.users.filter((u) => u.locale === 'mr' && u.role === 'WORKER').length;
    const en = dataset.users.filter((u) => u.locale === 'en' && u.role === 'WORKER').length;

    expect(hi).toBe(20);
    expect(mr).toBe(15);
    expect(en).toBe(5);
  });

  it('6.4 Contracts span all states: PENDING_ACCEPTANCE, ACTIVE, COMPLETED, REJECTED', () => {
    const statuses = new Set(dataset.contracts.map((c) => c.status));
    expect(statuses.has('PENDING_ACCEPTANCE')).toBe(true);
    expect(statuses.has('ACTIVE')).toBe(true);
    expect(statuses.has('COMPLETED')).toBe(true);
    expect(statuses.has('REJECTED')).toBe(true);
  });

  it('6.5 60 days of attendance include weekends off, absences, and GPS-failed punches', () => {
    expect(dataset.attendanceEvents.length).toBeGreaterThan(500);

    // Verify presence of FLAGGED punches
    const flagged = dataset.attendanceEvents.filter((a) => a.status === 'FLAGGED');
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.some((f) => f.calculated_distance_meters > 1000)).toBe(true);

    // Verify verified majority
    const verified = dataset.attendanceEvents.filter((a) => a.status === 'VERIFIED');
    expect(verified.length).toBeGreaterThan(1000);
  });

  it('6.6 Inspector analytics service aggregates accurately over the seed dataset', async () => {
    const metrics = await InstitutionalAnalyticsService.getInstitutionalMetrics({});

    expect(metrics.totalWorkers).toBe(40);
    expect(metrics.activeProjects).toBe(7); // 7 active, 1 completed
    expect(metrics.openDisputes).toBe(8); // 4 OPEN + 4 UNDER_REVIEW
    expect(metrics.contractorIndicators.length).toBe(4);
  });
});
