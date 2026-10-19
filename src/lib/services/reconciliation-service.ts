import { createAdminClient } from '@/lib/supabase/admin';
import { rupeesToPaise, paiseToRupees } from '@/types/payment.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class ReconciliationServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'RECONCILIATION_ERROR') {
    super(message);
    this.name = 'ReconciliationServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ContractReconciliationParams {
  contractId: string;
  periodStart?: string; // YYYY-MM-DD
  periodEnd?: string;   // YYYY-MM-DD
}

export interface ContractReconciliation {
  contractId: string;
  workerId: string;
  contractorId: string;
  projectId: string;
  verifiedDaysCount: number;
  dailyWagePaise: number;
  totalEarnedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
  totalEarnedRupees: number;
  totalPaidRupees: number;
  outstandingRupees: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface ActorReconciliationSummary {
  actorId: string;
  actorType: 'WORKER' | 'CONTRACTOR';
  totalContractsCount: number;
  totalEarnedPaise: number;
  totalPaidPaise: number;
  totalOutstandingPaise: number;
  totalEarnedRupees: number;
  totalPaidRupees: number;
  totalOutstandingRupees: number;
  contracts: ContractReconciliation[];
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Calculates authoritative contract reconciliation:
 *   TOTAL EARNED      = verified_days_count × daily_wage_paise
 *   TOTAL PAID        = SUM(payment_transactions.amount_paise WHERE status='SUCCESS')
 *   TOTAL OUTSTANDING = TOTAL EARNED - TOTAL PAID
 *
 * ALL calculations use integer paise to avoid floating point errors.
 */
export async function getContractReconciliation(
  params: ContractReconciliationParams
): Promise<ContractReconciliation> {
  const adminClient = createAdminClient();

  // 1. Fetch Work Contract
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('id, worker_id, contractor_id, project_id, daily_wage, status')
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new ReconciliationServiceError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  const dailyWagePaise = rupeesToPaise(contract.daily_wage);

  // 2. Query Verified Attendance Days
  let attendanceQuery = adminClient
    .from('attendance_events')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', params.contractId)
    .eq('status', 'VERIFIED');

  if (params.periodStart) {
    attendanceQuery = attendanceQuery.gte('date', params.periodStart);
  }
  if (params.periodEnd) {
    attendanceQuery = attendanceQuery.lte('date', params.periodEnd);
  }

  const { count: verifiedCount, error: attErr } = await attendanceQuery;

  if (attErr) {
    throw new ReconciliationServiceError(
      `Failed to query attendance records: ${attErr.message}`,
      500,
      'ATTENDANCE_QUERY_FAILED'
    );
  }

  const verifiedDaysCount = verifiedCount ?? 0;
  const totalEarnedPaise = verifiedDaysCount * dailyWagePaise;

  // 3. Query Authoritative Payments (SUCCESS status in double-entry ledger)
  const { data: payments, error: payErr } = await adminClient
    .from('payment_transactions')
    .select('amount_paise')
    .eq('contract_id', params.contractId)
    .eq('status', 'SUCCESS');

  if (payErr) {
    throw new ReconciliationServiceError(
      `Failed to query payment transactions: ${payErr.message}`,
      500,
      'PAYMENT_QUERY_FAILED'
    );
  }

  const totalPaidPaise = (payments ?? []).reduce(
    (sum: number, tx: { amount_paise: number }) => sum + Number(tx.amount_paise),
    0
  );

  const outstandingPaise = totalEarnedPaise - totalPaidPaise;

  return {
    contractId: contract.id,
    workerId: contract.worker_id,
    contractorId: contract.contractor_id,
    projectId: contract.project_id,
    verifiedDaysCount,
    dailyWagePaise,
    totalEarnedPaise,
    totalPaidPaise,
    outstandingPaise,
    totalEarnedRupees: paiseToRupees(totalEarnedPaise),
    totalPaidRupees: paiseToRupees(totalPaidPaise),
    outstandingRupees: paiseToRupees(outstandingPaise),
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  };
}

/**
 * Aggregates financial reconciliation across all contracts for a worker.
 */
export async function getWorkerReconciliation(
  workerId: string
): Promise<ActorReconciliationSummary> {
  const adminClient = createAdminClient();

  const { data: contracts, error } = await adminClient
    .from('work_contracts')
    .select('id')
    .eq('worker_id', workerId);

  if (error) {
    throw new ReconciliationServiceError(
      `Failed to fetch contracts for worker ${workerId}: ${error.message}`,
      500,
      'FETCH_CONTRACTS_FAILED'
    );
  }

  const contractReconciliations = await Promise.all(
    (contracts ?? []).map((c: { id: string }) => getContractReconciliation({ contractId: c.id }))
  );

  const totalEarnedPaise = contractReconciliations.reduce((sum, r) => sum + r.totalEarnedPaise, 0);
  const totalPaidPaise = contractReconciliations.reduce((sum, r) => sum + r.totalPaidPaise, 0);
  const totalOutstandingPaise = totalEarnedPaise - totalPaidPaise;

  return {
    actorId: workerId,
    actorType: 'WORKER',
    totalContractsCount: contractReconciliations.length,
    totalEarnedPaise,
    totalPaidPaise,
    totalOutstandingPaise,
    totalEarnedRupees: paiseToRupees(totalEarnedPaise),
    totalPaidRupees: paiseToRupees(totalPaidPaise),
    totalOutstandingRupees: paiseToRupees(totalOutstandingPaise),
    contracts: contractReconciliations,
  };
}

/**
 * Aggregates financial reconciliation across all contracts for a contractor.
 */
export async function getContractorReconciliation(
  contractorId: string
): Promise<ActorReconciliationSummary> {
  const adminClient = createAdminClient();

  const { data: contracts, error } = await adminClient
    .from('work_contracts')
    .select('id')
    .eq('contractor_id', contractorId);

  if (error) {
    throw new ReconciliationServiceError(
      `Failed to fetch contracts for contractor ${contractorId}: ${error.message}`,
      500,
      'FETCH_CONTRACTS_FAILED'
    );
  }

  const contractReconciliations = await Promise.all(
    (contracts ?? []).map((c: { id: string }) => getContractReconciliation({ contractId: c.id }))
  );

  const totalEarnedPaise = contractReconciliations.reduce((sum, r) => sum + r.totalEarnedPaise, 0);
  const totalPaidPaise = contractReconciliations.reduce((sum, r) => sum + r.totalPaidPaise, 0);
  const totalOutstandingPaise = totalEarnedPaise - totalPaidPaise;

  return {
    actorId: contractorId,
    actorType: 'CONTRACTOR',
    totalContractsCount: contractReconciliations.length,
    totalEarnedPaise,
    totalPaidPaise,
    totalOutstandingPaise,
    totalEarnedRupees: paiseToRupees(totalEarnedPaise),
    totalPaidRupees: paiseToRupees(totalPaidPaise),
    totalOutstandingRupees: paiseToRupees(totalOutstandingPaise),
    contracts: contractReconciliations,
  };
}
