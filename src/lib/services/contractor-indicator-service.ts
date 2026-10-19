import { createAdminClient } from '@/lib/supabase/admin';
import { getContractReconciliation } from './reconciliation-service';
import { checkContractCompliance } from './compliance-engine';
import { paiseToRupees } from '@/types/payment.types';
import type {
  ContractorRiskLevelEnum,
  ContractorComplianceSnapshotRow,
} from '@/types/database.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class ContractorIndicatorError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'CONTRACTOR_INDICATOR_ERROR') {
    super(message);
    this.name = 'ContractorIndicatorError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface FactorBreakdown {
  paymentDiscrepanciesCount: number;
  attendanceDiscrepanciesCount: number;
  openDisputesCount: number;
  unresolvedDisputesCount: number;
  outstandingWagesPaise: number;
  outstandingWagesRupees: number;
  workerConfirmationDiscrepanciesCount: number;
  totalContractsEvaluated: number;
}

export interface ContractorComplianceIndicator {
  contractorId: string;
  riskLevel: ContractorRiskLevelEnum;
  score: number; // 0 to 100
  breakdown: FactorBreakdown;
  explanations: string[];
  evaluatedAt: string;
}

// ─── Core Service Function ───────────────────────────────────────────────────

/**
 * Calculates an explainable, rule-based compliance risk score for a contractor.
 *
 * Scoring Rules (Base Score = 100):
 * 1. Payment Discrepancies (Underpaid minimum wage contracts): -15 pts per contract
 * 2. Attendance Discrepancies (Rejected/Disputed attendance events): -5 pts per event
 * 3. Open Disputes: -10 pts per active open dispute
 * 4. Unresolved Disputes (Open > 7 days SLA): -15 pts per stale dispute
 * 5. Outstanding Overdue Wages: -10 pts if > ₹10,000; -25 pts if > ₹50,000
 * 6. Worker Confirmation Discrepancies (Worker rejected payment): -15 pts per rejection
 *
 * Score mapping:
 * - 85 to 100 : GOOD_STANDING
 * - 70 to 84  : LOW_RISK
 * - 50 to 69  : MEDIUM_RISK
 * - 0 to 49   : HIGH_RISK
 */
export async function evaluateContractorComplianceIndicator(
  contractorId: string
): Promise<ContractorComplianceIndicator> {
  const adminClient = createAdminClient();

  // 1. Fetch contractor contracts
  const { data: contracts, error: contractsErr } = await adminClient
    .from('work_contracts')
    .select('id, worker_id, status, created_at')
    .eq('contractor_id', contractorId);

  if (contractsErr) {
    throw new ContractorIndicatorError(
      `Failed to fetch contractor contracts: ${contractsErr.message}`,
      500,
      'CONTRACTS_FETCH_FAILED'
    );
  }

  const contractIds = (contracts ?? []).map((c: { id: string }) => c.id);

  // 2. Factor 1: Payment / Wage Compliance Discrepancies across contracts
  let paymentDiscrepanciesCount = 0;
  let totalOutstandingWagesPaise = 0;

  for (const cId of contractIds) {
    // Reconciliation check
    const recon = await getContractReconciliation({ contractId: cId });
    if (recon.outstandingPaise > 0) {
      totalOutstandingWagesPaise += recon.outstandingPaise;
    }

    // Wage compliance check
    try {
      const compliance = await checkContractCompliance({ contractId: cId });
      if (compliance.result === 'POTENTIAL_NON_COMPLIANCE') {
        paymentDiscrepanciesCount++;
      }
    } catch {
      // Ignore individual check errors in aggregate scoring
    }
  }

  // 3. Factor 2: Attendance Discrepancies (REJECTED or DISPUTED status)
  let attendanceDiscrepanciesCount = 0;
  if (contractIds.length > 0) {
    const { count: attCount } = await adminClient
      .from('attendance_events')
      .select('id', { count: 'exact', head: true })
      .in('contract_id', contractIds)
      .in('status', ['REJECTED', 'DISPUTED', 'DISCREPANCY']);

    attendanceDiscrepanciesCount = attCount ?? 0;
  }

  // 4. Factor 3 & 4: Open and Unresolved Disputes
  let openDisputesCount = 0;
  let unresolvedDisputesCount = 0;

  // Query disputes linked to contractor's contracts or raised by contractor's workers
  // If table exists in database
  const { data: openDisputes } = await adminClient
    .from('attendance_discrepancies')
    .select('id, created_at, status')
    .in('contract_id', contractIds.length > 0 ? contractIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('status', 'PENDING');

  if (openDisputes) {
    openDisputesCount = openDisputes.length;
    const now = new Date().getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    unresolvedDisputesCount = openDisputes.filter((d: { created_at: string }) => {
      const created = new Date(d.created_at).getTime();
      return now - created > sevenDaysMs;
    }).length;
  }

  // 5. Factor 6: Worker Confirmation Discrepancies (where worker marked is_confirmed = false)
  let workerConfirmationDiscrepanciesCount = 0;
  const { data: txns } = await adminClient
    .from('payment_transactions')
    .select('id')
    .eq('contractor_id', contractorId);

  const txnIds = (txns ?? []).map((t: { id: string }) => t.id);
  if (txnIds.length > 0) {
    const { count: confCount } = await adminClient
      .from('payment_confirmations')
      .select('id', { count: 'exact', head: true })
      .in('transaction_id', txnIds)
      .eq('is_confirmed', false);

    workerConfirmationDiscrepanciesCount = confCount ?? 0;
  }

  // ─── Score Calculation & Explanations Assembly ─────────────────────────────

  let score = 100;
  const explanations: string[] = [];

  // Deduction 1: Payment Discrepancies
  if (paymentDiscrepanciesCount > 0) {
    const deduction = paymentDiscrepanciesCount * 15;
    score -= deduction;
    explanations.push(
      `Deducted ${deduction} pts: ${paymentDiscrepanciesCount} contract(s) flagged for potential minimum wage underpayment.`
    );
  }

  // Deduction 2: Attendance Discrepancies
  if (attendanceDiscrepanciesCount > 0) {
    const deduction = attendanceDiscrepanciesCount * 5;
    score -= deduction;
    explanations.push(
      `Deducted ${deduction} pts: ${attendanceDiscrepanciesCount} attendance event(s) rejected or disputed.`
    );
  }

  // Deduction 3: Open Disputes
  if (openDisputesCount > 0) {
    const deduction = openDisputesCount * 10;
    score -= deduction;
    explanations.push(
      `Deducted ${deduction} pts: ${openDisputesCount} active unresolved dispute(s) pending resolution.`
    );
  }

  // Deduction 4: Unresolved SLA Breaches
  if (unresolvedDisputesCount > 0) {
    const deduction = unresolvedDisputesCount * 15;
    score -= deduction;
    explanations.push(
      `Deducted ${deduction} pts: ${unresolvedDisputesCount} dispute(s) open past 7-day resolution SLA.`
    );
  }

  // Deduction 5: Outstanding Overdue Wages
  const outstandingRupees = paiseToRupees(totalOutstandingWagesPaise);
  if (totalOutstandingWagesPaise > 5000000) { // > ₹50,000
    score -= 25;
    explanations.push(
      `Deducted 25 pts: Total outstanding worker wages ₹${outstandingRupees.toLocaleString('en-IN')} exceeds ₹50,000 threshold.`
    );
  } else if (totalOutstandingWagesPaise > 1000000) { // > ₹10,000
    score -= 10;
    explanations.push(
      `Deducted 10 pts: Total outstanding worker wages ₹${outstandingRupees.toLocaleString('en-IN')} exceeds ₹10,000 threshold.`
    );
  }

  // Deduction 6: Worker Confirmation Discrepancies
  if (workerConfirmationDiscrepanciesCount > 0) {
    const deduction = workerConfirmationDiscrepanciesCount * 15;
    score -= deduction;
    explanations.push(
      `Deducted ${deduction} pts: ${workerConfirmationDiscrepanciesCount} payment transaction(s) disputed/rejected by worker confirmation.`
    );
  }

  // Final score bounds
  score = Math.max(0, Math.min(100, score));

  if (explanations.length === 0) {
    explanations.push('Full compliance: No wage underpayments, attendance disputes, or outstanding wage debt detected.');
  }

  // Risk Rating Determination
  let riskLevel: ContractorRiskLevelEnum;
  if (score >= 85) {
    riskLevel = 'GOOD_STANDING';
  } else if (score >= 70) {
    riskLevel = 'LOW_RISK';
  } else if (score >= 50) {
    riskLevel = 'MEDIUM_RISK';
  } else {
    riskLevel = 'HIGH_RISK';
  }

  const breakdown: FactorBreakdown = {
    paymentDiscrepanciesCount,
    attendanceDiscrepanciesCount,
    openDisputesCount,
    unresolvedDisputesCount,
    outstandingWagesPaise: totalOutstandingWagesPaise,
    outstandingWagesRupees: outstandingRupees,
    workerConfirmationDiscrepanciesCount,
    totalContractsEvaluated: contractIds.length,
  };

  const evaluatedAt = new Date().toISOString();

  // Save snapshot to DB
  await adminClient.from('contractor_compliance_snapshots').insert({
    contractor_id: contractorId,
    risk_level: riskLevel,
    score,
    breakdown: breakdown as any,
    explanations: explanations as any,
    evaluated_at: evaluatedAt,
  });

  return {
    contractorId,
    riskLevel,
    score,
    breakdown,
    explanations,
    evaluatedAt,
  };
}
