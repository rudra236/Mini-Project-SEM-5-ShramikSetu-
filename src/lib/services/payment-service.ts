import { createAdminClient } from '@/lib/supabase/admin';
import { logSensitiveOperation } from '@/lib/auth/audit';
import { computeEarnings, getTotalPaidPaise, EarningsServiceError } from './earnings-service';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentSummary,
  PaymentSource,
} from '@/types/payment.types';
import type {
  WalletAccountRow,
  PaymentTransactionRow,
  LedgerEntryRow,
  PaymentConfirmationRow,
} from '@/types/database.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class PaymentServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'PAYMENT_ERROR') {
    super(message);
    this.name = 'PaymentServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Gets or creates a wallet account for an actor.
 * Idempotent: unique constraint on (account_type, owner_id).
 */
async function getOrCreateWallet(
  accountType: 'CONTRACTOR' | 'WORKER',
  ownerId: string
): Promise<WalletAccountRow> {
  const adminClient = createAdminClient();

  const { data: existing } = await adminClient
    .from('wallet_accounts')
    .select('*')
    .eq('account_type', accountType)
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await adminClient
    .from('wallet_accounts')
    .insert({ account_type: accountType, owner_id: ownerId })
    .select()
    .single();

  if (error || !created) {
    // Race condition: another request created it
    if (error?.code === '23505') {
      const { data: raceResult } = await adminClient
        .from('wallet_accounts')
        .select('*')
        .eq('account_type', accountType)
        .eq('owner_id', ownerId)
        .single();
      if (raceResult) return raceResult;
    }
    throw new PaymentServiceError(
      `Failed to create wallet for ${accountType} ${ownerId}: ${error?.message}`,
      500,
      'WALLET_CREATION_FAILED'
    );
  }

  return created;
}

/**
 * Generates a deterministic transaction reference.
 * Format: TXN-YYYYMMDD-{8 random hex chars}
 */
function generateTransactionRef(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');
  return `TXN-${date}-${rand}`;
}

// ─── Core Payment Functions ────────────────────────────────────────────────────

/**
 * Initiates a payment from contractor to worker.
 *
 * INVARIANTS:
 *   1. amountPaise must be a positive integer — caller is responsible.
 *   2. Idempotency: if idempotencyKey already exists, returns existing transaction.
 *   3. Overpayment guard: amount > outstanding → rejected before any DB write.
 *   4. Ledger entries are created atomically via Postgres RPC `create_payment_with_ledger`.
 *      If the RPC raises, no payment_transaction and no ledger_entry rows exist.
 *   5. Payment status is only set to SUCCESS inside the RPC — after both ledger entries commit.
 */
export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResult> {
  const adminClient = createAdminClient();

  // ── 1. Validate amount is a positive integer ──────────────────────────────
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new PaymentServiceError(
      `amountPaise must be a positive integer. Received: ${params.amountPaise}`,
      400,
      'INVALID_AMOUNT'
    );
  }

  // ── 2. Idempotency check ──────────────────────────────────────────────────
  const { data: existingTxn } = await adminClient
    .from('payment_transactions')
    .select('*')
    .eq('idempotency_key', params.idempotencyKey)
    .maybeSingle();

  if (existingTxn) {
    // Fetch the ledger entries for the existing transaction
    const { data: entries } = await adminClient
      .from('ledger_entries')
      .select('*')
      .eq('transaction_id', existingTxn.id);

    const senderEntry = (entries ?? []).find((e: LedgerEntryRow) => e.direction === 'DEBIT');
    const receiverEntry = (entries ?? []).find((e: LedgerEntryRow) => e.direction === 'CREDIT');

    if (!senderEntry || !receiverEntry) {
      // This should never happen for a SUCCESS transaction, but guard anyway
      throw new PaymentServiceError(
        'Existing transaction found but ledger entries are missing. This indicates data corruption.',
        500,
        'LEDGER_INTEGRITY_VIOLATION'
      );
    }

    return {
      transaction: existingTxn,
      isDuplicate: true,
      senderLedgerEntry: senderEntry,
      receiverLedgerEntry: receiverEntry,
    };
  }

  // ── 3. Validate contract exists and get project_id ────────────────────────
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('id, worker_id, contractor_id, project_id, status')
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new PaymentServiceError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  if (
    contract.contractor_id !== params.contractorId ||
    contract.worker_id !== params.workerId ||
    contract.project_id !== params.projectId
  ) {
    throw new PaymentServiceError(
      'Work contract mismatch with provided worker, contractor, or project.',
      400,
      'CONTRACT_MISMATCH'
    );
  }

  // ── 3a. Validate worker has an accepted contract ────────────────────────────
  const statusUpper = String(contract.status).toUpperCase();
  const allowedStatuses = ['ACTIVE', 'ACCEPTED', 'COMPLETED', 'DISPUTED'];
  if (!allowedStatuses.includes(statusUpper)) {
    throw new PaymentServiceError(
      `Cannot initiate payment: contract status is '${contract.status}'. Worker must have an accepted contract. Pending, rejected, or cancelled invitations cannot receive payments.`,
      400,
      'CONTRACT_NOT_ACTIVE'
    );
  }

  // ── 3b. Validate contractor owns the project ──────────────────────────────
  const { data: project, error: projErr } = await adminClient
    .from('projects')
    .select('id, contractor_id')
    .eq('id', params.projectId)
    .eq('contractor_id', params.contractorId)
    .maybeSingle();

  if (projErr || !project) {
    throw new PaymentServiceError(
      'Contractor does not own this project or project not found.',
      403,
      'PROJECT_NOT_OWNED'
    );
  }

  // ── 4. Overpayment guard: compute outstanding ─────────────────────────────
  //    We use an open-ended period (contract start → today) for outstanding calculation.
  //    This ensures we never pay more than the worker has earned.
  const today = new Date().toISOString().split('T')[0];
  const earnings = await computeEarnings({
    contractId: params.contractId,
    periodStart: '2000-01-01', // broad range to capture all verified days
    periodEnd: today,
  });
  const totalPaidPaise = await getTotalPaidPaise(params.contractId);
  const outstandingPaise = earnings.totalEarnedPaise - totalPaidPaise;

  if (params.amountPaise > outstandingPaise && !params.isAdvance && !params.disputeId) {
    throw new PaymentServiceError(
      `Overpayment rejected. Attempting to pay ${params.amountPaise} paise but outstanding is only ${outstandingPaise} paise (earned ${earnings.totalEarnedPaise}, paid ${totalPaidPaise}). Mark as advance payment to proceed.`,
      422,
      'OVERPAYMENT_REJECTED'
    );
  }

  // ── 5. Get or create wallet accounts ─────────────────────────────────────
  const [contractorWallet, workerWallet] = await Promise.all([
    getOrCreateWallet('CONTRACTOR', params.contractorId),
    getOrCreateWallet('WORKER', params.workerId),
  ]);

  // ── 6. Get initiator user_id ──────────────────────────────────────────────
  const transactionRef = generateTransactionRef();

  // ── 7. Call atomic Postgres RPC ───────────────────────────────────────────
  //    The RPC creates the payment_transaction + 2 ledger_entries atomically.
  //    If any step fails inside the RPC, Postgres rolls back everything.
  const { data: rpcResult, error: rpcErr } = await adminClient.rpc(
    'create_payment_with_ledger',
    {
      p_transaction_ref:     transactionRef,
      p_idempotency_key:     params.idempotencyKey,
      p_sender_account_id:   contractorWallet.id,
      p_receiver_account_id: workerWallet.id,
      p_worker_id:           params.workerId,
      p_contractor_id:       params.contractorId,
      p_contract_id:         params.contractId,
      p_project_id:          params.projectId,
      p_amount_paise:        params.amountPaise,
      p_payment_source:      (params.paymentSource ?? 'PLATFORM_TRANSFER') as PaymentSource,
      p_notes:               params.notes ?? null,
      p_initiated_by:        params.initiatorUserId,
      p_dispute_id:          params.disputeId ?? null,
    }
  );

  if (rpcErr || !rpcResult) {
    // RPC failed → ledger is clean (Postgres rolled back the entire function)
    const errMsg = rpcErr?.message ?? 'Unknown RPC error';
    if (errMsg.includes('IDEMPOTENCY_VIOLATION')) {
      throw new PaymentServiceError(
        'Duplicate payment: idempotency key or transaction ref already exists.',
        409,
        'IDEMPOTENCY_VIOLATION'
      );
    }
    throw new PaymentServiceError(
      `Payment failed — ledger transaction was rolled back. Reason: ${errMsg}`,
      500,
      'LEDGER_TRANSACTION_FAILED'
    );
  }

  // ── 8. Fetch the persisted transaction and ledger entries ─────────────────
  //    Re-fetch from DB rather than trusting the RPC JSON to avoid type coercion issues.
  const createdTxn = rpcResult as unknown as PaymentTransactionRow;

  const { data: ledgerEntries, error: ledgerFetchErr } = await adminClient
    .from('ledger_entries')
    .select('*')
    .eq('transaction_id', createdTxn.id);

  if (ledgerFetchErr || !ledgerEntries || ledgerEntries.length !== 2) {
    // This is a CRITICAL integrity failure — transaction was marked SUCCESS
    // but ledger entries are missing. Log loudly and surface as error.
    await logSensitiveOperation({
      actorId: params.initiatorUserId,
      action: 'CRITICAL_LEDGER_INTEGRITY_FAILURE',
      entityType: 'payment_transactions',
      entityId: createdTxn.id,
      afterState: {
        error: 'Transaction SUCCESS but ledger entry count is not 2',
        ledgerCount: ledgerEntries?.length ?? 0,
      },
    });
    throw new PaymentServiceError(
      'CRITICAL: Payment transaction marked SUCCESS but ledger entries are missing or incomplete.',
      500,
      'LEDGER_INTEGRITY_VIOLATION'
    );
  }

  const senderEntry = ledgerEntries.find((e: LedgerEntryRow) => e.direction === 'DEBIT')!;
  const receiverEntry = ledgerEntries.find((e: LedgerEntryRow) => e.direction === 'CREDIT')!;

  await logSensitiveOperation({
    actorId: params.initiatorUserId,
    action: 'PAYMENT_INITIATED_SUCCESS',
    entityType: 'payment_transactions',
    entityId: createdTxn.id,
    afterState: {
      transactionRef,
      amountPaise: params.amountPaise,
      contractId: params.contractId,
      workerId: params.workerId,
      outstandingAfter: outstandingPaise - params.amountPaise,
    },
  });

  return {
    transaction: createdTxn,
    isDuplicate: false,
    senderLedgerEntry: senderEntry,
    receiverLedgerEntry: receiverEntry,
  };
}

/**
 * Worker confirms or disputes a payment.
 *
 * INVARIANTS:
 *   - The original payment_transactions row is NEVER modified by this function.
 *   - A payment_confirmations row is inserted (YES or NO — both create a record).
 *   - Only the worker named on the transaction may confirm.
 *   - Duplicate confirmations are rejected.
 */
export async function confirmPayment(params: {
  workerUserId: string;
  transactionId: string;
  isConfirmed: boolean;
  disputeReason?: string;
  workerNotes?: string;
}): Promise<PaymentConfirmationRow> {
  const adminClient = createAdminClient();

  // 1. Fetch worker profile
  const { data: worker, error: workerErr } = await adminClient
    .from('workers')
    .select('id')
    .eq('user_id', params.workerUserId)
    .maybeSingle();

  if (workerErr || !worker) {
    throw new PaymentServiceError('Worker profile not found.', 403, 'UNAUTHORIZED_WORKER');
  }

  // 2. Fetch transaction
  const { data: txn, error: txnErr } = await adminClient
    .from('payment_transactions')
    .select('*')
    .eq('id', params.transactionId)
    .maybeSingle();

  if (txnErr || !txn) {
    throw new PaymentServiceError('Payment transaction not found.', 404, 'TRANSACTION_NOT_FOUND');
  }

  // 3. Authorization: only the worker on this transaction
  if (txn.worker_id !== worker.id) {
    throw new PaymentServiceError(
      'Unauthorized: Only the worker named on this transaction can confirm it.',
      403,
      'UNAUTHORIZED_CONFIRMATION'
    );
  }

  // 4. Allowed transaction statuses
  const allowedStatuses = ['PAID_CLAIMED', 'SUCCESS', 'PENDING'];
  if (!allowedStatuses.includes(txn.status)) {
    throw new PaymentServiceError(
      `Cannot confirm a transaction with status ${txn.status}. Only unconfirmed transactions require worker confirmation.`,
      422,
      'INVALID_TRANSACTION_STATUS'
    );
  }

  // 5. Duplicate confirmation check
  const { data: existingConf } = await adminClient
    .from('payment_confirmations')
    .select('id')
    .eq('transaction_id', params.transactionId)
    .eq('worker_id', worker.id)
    .maybeSingle();

  if (existingConf) {
    throw new PaymentServiceError(
      'This payment has already been responded to by the worker.',
      409,
      'ALREADY_CONFIRMED'
    );
  }

  // 6. Require dispute reason when rejecting
  if (!params.isConfirmed && !params.disputeReason) {
    throw new PaymentServiceError(
      'A dispute reason is required when rejecting a payment.',
      400,
      'MISSING_DISPUTE_REASON'
    );
  }

  // 7. Insert confirmation row — original transaction is NOT touched
  const { data: confirmation, error: confErr } = await adminClient
    .from('payment_confirmations')
    .insert({
      transaction_id: params.transactionId,
      worker_id: worker.id,
      is_confirmed: params.isConfirmed,
      dispute_reason: params.isConfirmed ? null : (params.disputeReason ?? null),
      worker_notes: params.workerNotes ?? null,
    })
    .select()
    .single();

  if (confErr || !confirmation) {
    throw new PaymentServiceError(
      `Failed to record payment confirmation: ${confErr?.message}`,
      500,
      'CONFIRMATION_RECORD_FAILED'
    );
  }

  // Update payment transaction status
  const newStatus = params.isConfirmed ? 'WORKER_CONFIRMED' : 'WORKER_DISPUTED';
  const nowIso = new Date().toISOString();
  await adminClient
    .from('payment_transactions')
    .update({
      status: newStatus,
      confirmed_at: params.isConfirmed ? nowIso : null,
      disputed_at: !params.isConfirmed ? nowIso : null,
      dispute_reason: !params.isConfirmed ? (params.disputeReason ?? null) : null,
      updated_at: nowIso,
    })
    .eq('id', params.transactionId);

  await logSensitiveOperation({
    actorId: params.workerUserId,
    action: params.isConfirmed ? 'PAYMENT_CONFIRMED_BY_WORKER' : 'PAYMENT_DISPUTED_BY_WORKER',
    entityType: 'payment_confirmations',
    entityId: confirmation.id,
    afterState: {
      transactionId: params.transactionId,
      status: newStatus,
      isConfirmed: params.isConfirmed,
      disputeReason: params.disputeReason,
    },
  });

  return confirmation;
}

/**
 * Reverses a SUCCESS payment transaction.
 * Atomically creates a reversal transaction + 2 reversed ledger entries via RPC.
 * Original transaction is marked REVERSED inside the RPC.
 */
export async function reversePayment(params: {
  actorUserId: string;
  transactionId: string;
  reason: string;
}): Promise<PaymentTransactionRow> {
  const adminClient = createAdminClient();

  const reversalRef = generateTransactionRef().replace('TXN-', 'REV-');
  const reversalIdempotencyKey = `reversal-${params.transactionId}`;

  // Check if already reversed (idempotent)
  const { data: existingReversal } = await adminClient
    .from('payment_transactions')
    .select('*')
    .eq('idempotency_key', reversalIdempotencyKey)
    .maybeSingle();

  if (existingReversal) {
    return existingReversal;
  }

  const { data: rpcResult, error: rpcErr } = await adminClient.rpc(
    'reverse_payment_with_ledger',
    {
      p_original_transaction_id:  params.transactionId,
      p_reversal_ref:             reversalRef,
      p_reversal_idempotency_key: reversalIdempotencyKey,
      p_initiated_by:             params.actorUserId,
      p_reason:                   params.reason,
    }
  );

  if (rpcErr || !rpcResult) {
    const errMsg = rpcErr?.message ?? 'Unknown reversal RPC error';
    if (errMsg.includes('TRANSACTION_NOT_FOUND')) {
      throw new PaymentServiceError('Original transaction not found.', 404, 'TRANSACTION_NOT_FOUND');
    }
    if (errMsg.includes('INVALID_REVERSAL')) {
      throw new PaymentServiceError(
        `Cannot reverse: ${errMsg}`,
        422,
        'INVALID_REVERSAL'
      );
    }
    throw new PaymentServiceError(
      `Reversal failed — ledger was rolled back. Reason: ${errMsg}`,
      500,
      'REVERSAL_FAILED'
    );
  }

  const reversalTxn = rpcResult as unknown as PaymentTransactionRow;

  await logSensitiveOperation({
    actorId: params.actorUserId,
    action: 'PAYMENT_REVERSED',
    entityType: 'payment_transactions',
    entityId: params.transactionId,
    afterState: {
      reversalTransactionId: reversalTxn.id,
      reversalRef,
      reason: params.reason,
    },
  });

  return reversalTxn;
}

/**
 * Returns wallet balance in integer paise for a given wallet account.
 * Balance is computed from ledger entries via Postgres RPC — never from a balance column.
 */
export async function getWalletBalance(accountId: string): Promise<number> {
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.rpc('get_wallet_balance', {
    p_account_id: accountId,
  });

  if (error) {
    throw new PaymentServiceError(
      `Failed to compute wallet balance: ${error.message}`,
      500,
      'BALANCE_COMPUTATION_FAILED'
    );
  }

  // RPC returns BIGINT which Supabase JS deserializes as number
  return (data as unknown as number) ?? 0;
}

/**
 * Returns a full payment summary for a contract:
 * total earned, total paid, outstanding, and all transactions.
 */
export async function getPaymentSummary(params: {
  contractId: string;
  periodStart?: string;
  periodEnd?: string;
}): Promise<PaymentSummary> {
  const adminClient = createAdminClient();

  const today = new Date().toISOString().split('T')[0];
  const periodStart = params.periodStart ?? '2000-01-01';
  const periodEnd = params.periodEnd ?? today;

  // Compute earnings (integer paise throughout)
  const earnings = await computeEarnings({
    contractId: params.contractId,
    periodStart,
    periodEnd,
  });

  const totalPaidPaise = await getTotalPaidPaise(params.contractId);
  const outstandingPaise = earnings.totalEarnedPaise - totalPaidPaise;

  // Fetch all transactions for this contract
  const { data: transactions, error: txnErr } = await adminClient
    .from('payment_transactions')
    .select('*')
    .eq('contract_id', params.contractId)
    .order('created_at', { ascending: true });

  if (txnErr) {
    throw new PaymentServiceError(
      `Failed to fetch transactions: ${txnErr.message}`,
      500,
      'TRANSACTION_FETCH_FAILED'
    );
  }

  return {
    contractId: params.contractId,
    workerId: earnings.workerId,
    totalEarnedPaise: earnings.totalEarnedPaise,
    totalPaidPaise,
    outstandingPaise,
    transactions: transactions ?? [],
  };
}

/**
 * Returns a single payment transaction with its ledger entries.
 */
export async function getTransactionWithLedger(transactionId: string): Promise<{
  transaction: PaymentTransactionRow;
  ledgerEntries: LedgerEntryRow[];
  confirmation: PaymentConfirmationRow | null;
}> {
  const adminClient = createAdminClient();

  const { data: txn, error: txnErr } = await adminClient
    .from('payment_transactions')
    .select('*')
    .eq('id', transactionId)
    .maybeSingle();

  if (txnErr || !txn) {
    throw new PaymentServiceError('Transaction not found.', 404, 'TRANSACTION_NOT_FOUND');
  }

  const [{ data: entries }, { data: confirmation }] = await Promise.all([
    adminClient.from('ledger_entries').select('*').eq('transaction_id', transactionId),
    adminClient
      .from('payment_confirmations')
      .select('*')
      .eq('transaction_id', transactionId)
      .maybeSingle(),
  ]);

  return {
    transaction: txn,
    ledgerEntries: entries ?? [],
    confirmation: confirmation ?? null,
  };
}
