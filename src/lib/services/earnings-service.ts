import { createAdminClient } from '@/lib/supabase/admin';
import { logSensitiveOperation } from '@/lib/auth/audit';
import { rupeesToPaise } from '@/types/payment.types';
import type { EarningsSnapshotRow } from '@/types/database.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class EarningsServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'EARNINGS_ERROR') {
    super(message);
    this.name = 'EarningsServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeEarningsParams {
  contractId: string;
  periodStart: string; // 'YYYY-MM-DD'
  periodEnd: string;   // 'YYYY-MM-DD'
}

export interface EarningsComputation {
  contractId: string;
  workerId: string;
  contractorId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  /** Integer: number of attendance_events with status='VERIFIED' in the period */
  verifiedDaysCount: number;
  /** Integer paise: daily_wage × 100, rounded. Never floating point. */
  dailyWagePaise: number;
  /** Integer paise: verifiedDaysCount × dailyWagePaise */
  totalEarnedPaise: number;
}

export interface CreateEarningsSnapshotParams extends ComputeEarningsParams {
  computedByUserId: string;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Computes earnings for a contract period.
 *
 * Formula: verified_workdays × daily_wage_in_paise
 *
 * INVARIANTS:
 *   - daily_wage from DB (NUMERIC type) is converted to integer paise via rupeesToPaise()
 *     immediately on ingestion. All subsequent arithmetic is integer-only.
 *   - Only attendance_events with status = 'VERIFIED' are counted.
 *   - No floating-point arithmetic anywhere in this function.
 */
export async function computeEarnings(params: ComputeEarningsParams): Promise<EarningsComputation> {
  const adminClient = createAdminClient();

  // 1. Fetch contract (includes daily_wage as NUMERIC from DB)
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('id, worker_id, contractor_id, project_id, daily_wage, status')
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new EarningsServiceError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  const statusUpper = String(contract.status).toUpperCase();
  const eligibleStatuses = ['ACTIVE', 'ACCEPTED', 'COMPLETED'];
  if (!eligibleStatuses.includes(statusUpper)) {
    throw new EarningsServiceError(
      `Cannot compute earnings: contract status is '${contract.status}'. Only accepted or active contracts accrue wages.`,
      400,
      'CONTRACT_NOT_ACTIVE'
    );
  }

  // 2. Convert daily_wage (DB NUMERIC → floating point JS number) to integer paise.
  //    rupeesToPaise does Math.round(rupees * 100) → always an integer.
  const dailyWagePaise = rupeesToPaise(contract.daily_wage);

  if (dailyWagePaise <= 0) {
    throw new EarningsServiceError(
      `Invalid daily_wage for contract ${params.contractId}: ${contract.daily_wage}`,
      422,
      'INVALID_DAILY_WAGE'
    );
  }

  // 3. Count verified attendance events in the period
  const { count: verifiedCount, error: countErr } = await adminClient
    .from('attendance_events')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', params.contractId)
    .eq('status', 'VERIFIED')
    .gte('date', params.periodStart)
    .lte('date', params.periodEnd);

  if (countErr) {
    throw new EarningsServiceError(
      `Failed to count verified attendance events: ${countErr.message}`,
      500,
      'ATTENDANCE_COUNT_FAILED'
    );
  }

  const verifiedDaysCount = verifiedCount ?? 0;

  // 4. Compute total — pure integer multiplication, no floats involved
  const totalEarnedPaise = verifiedDaysCount * dailyWagePaise;

  return {
    contractId: contract.id,
    workerId: contract.worker_id,
    contractorId: contract.contractor_id,
    projectId: contract.project_id,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
    verifiedDaysCount,
    dailyWagePaise,
    totalEarnedPaise,
  };
}

/**
 * Creates (or returns existing) an earnings snapshot for a contract period.
 * Idempotent: unique constraint on (contract_id, period_start, period_end).
 *
 * If a snapshot already exists for this period, returns it without re-computing.
 */
export async function createEarningsSnapshot(
  params: CreateEarningsSnapshotParams
): Promise<EarningsSnapshotRow> {
  const adminClient = createAdminClient();

  // Check if snapshot already exists for this period (idempotent)
  const { data: existing } = await adminClient
    .from('earnings_snapshots')
    .select('*')
    .eq('contract_id', params.contractId)
    .eq('period_start', params.periodStart)
    .eq('period_end', params.periodEnd)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  // Compute fresh earnings
  const computation = await computeEarnings({
    contractId: params.contractId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });

  // Insert snapshot
  const { data: snapshot, error: insertErr } = await adminClient
    .from('earnings_snapshots')
    .insert({
      contract_id: computation.contractId,
      worker_id: computation.workerId,
      contractor_id: computation.contractorId,
      period_start: computation.periodStart,
      period_end: computation.periodEnd,
      verified_days_count: computation.verifiedDaysCount,
      daily_wage_paise: computation.dailyWagePaise,
      total_earned_paise: computation.totalEarnedPaise,
      computed_by: params.computedByUserId,
    })
    .select()
    .single();

  if (insertErr || !snapshot) {
    // Handle race condition: another request may have inserted simultaneously
    if (insertErr?.code === '23505') {
      const { data: raceResult } = await adminClient
        .from('earnings_snapshots')
        .select('*')
        .eq('contract_id', params.contractId)
        .eq('period_start', params.periodStart)
        .eq('period_end', params.periodEnd)
        .single();
      if (raceResult) return raceResult;
    }
    throw new EarningsServiceError(
      `Failed to persist earnings snapshot: ${insertErr?.message}`,
      500,
      'SNAPSHOT_CREATION_FAILED'
    );
  }

  await logSensitiveOperation({
    actorId: params.computedByUserId,
    action: 'EARNINGS_SNAPSHOT_CREATED',
    entityType: 'earnings_snapshots',
    entityId: snapshot.id,
    afterState: {
      contractId: snapshot.contract_id,
      verifiedDays: snapshot.verified_days_count,
      dailyWagePaise: snapshot.daily_wage_paise,
      totalEarnedPaise: snapshot.total_earned_paise,
    },
  });

  return snapshot;
}

/**
 * Returns the total amount paid (in paise) for a contract across all SUCCESS transactions.
 * Used to compute outstanding balance.
 */
export async function getTotalPaidPaise(contractId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { data: transactions, error } = await adminClient
    .from('payment_transactions')
    .select('amount_paise')
    .eq('contract_id', contractId)
    .eq('status', 'SUCCESS');

  if (error) {
    throw new EarningsServiceError(
      `Failed to fetch payment transactions: ${error.message}`,
      500,
      'PAYMENT_FETCH_FAILED'
    );
  }

  // Integer summation — amount_paise values are always integers stored in the DB
  const totalPaid = (transactions ?? []).reduce(
    (sum: number, tx: { amount_paise: number }) => sum + tx.amount_paise,
    0
  );

  return totalPaid;
}

/**
 * Returns outstanding balance in paise for a contract period.
 * outstanding = total_earned_paise - total_paid_paise
 * Negative values indicate overpayment (which initiatePayment rejects).
 */
export async function getOutstandingPaise(
  params: ComputeEarningsParams
): Promise<{
  totalEarnedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
}> {
  const computation = await computeEarnings(params);
  const totalPaidPaise = await getTotalPaidPaise(params.contractId);

  return {
    totalEarnedPaise: computation.totalEarnedPaise,
    totalPaidPaise,
    outstandingPaise: computation.totalEarnedPaise - totalPaidPaise,
  };
}
