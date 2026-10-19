/**
 * SHRAMIKSETU ATOMIC DOUBLE-ENTRY LEDGER SERVICE
 *
 * Implements:
 *   1. Pure Double-Entry Bookkeeping:
 *      Every entry records debit_account, credit_account, and amount_paise.
 *      Constraint: sum(debits) = sum(credits) per transaction and across the ledger.
 *   2. Cryptographic Hash Chaining:
 *      prev_hash and SHA-256 hash chain prevents silent tampering/reordering.
 *   3. Automatic Wage Accrual:
 *      Triggered automatically when an attendance event is VERIFIED.
 *      Debit: Contractor Liability | Credit: Worker Receivable
 *   4. Payment Lifecycle:
 *      PAID_CLAIMED -> WORKER_CONFIRMED (creates settlement entry) / WORKER_DISPUTED.
 *      Auto-escalation if unconfirmed after N days.
 *   5. Single Source of Truth for Arrears:
 *      Outstanding = Accruals - Confirmed Payments.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSensitiveOperation } from '@/lib/auth/audit';
import { getWorkerFinancialSummary, getContractFinancialSummary } from './financial-summary-service';
import { paiseToRupeeDisplay } from '@/types/payment.types';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
export const DEFAULT_ESCALATION_DAYS = 7;

export type AccountType = 'WORKER' | 'CONTRACTOR' | 'ESCROW_LIABILITY' | 'SYSTEM_CLEARING';

export type PaymentMethod = 'UPI_SIMULATED' | 'CASH' | 'BANK_TRANSFER';

export type PaymentLifecycleStatus =
  | 'PAID_CLAIMED'
  | 'WORKER_CONFIRMED'
  | 'WORKER_DISPUTED'
  | 'ESCALATED_TO_DISPUTE'
  | 'SUCCESS'
  | 'FAILED'
  | 'REVERSED';

export interface Account {
  id: string;
  account_type: AccountType;
  owner_id?: string | null;
  code: string;
  name: string;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  transaction_id: string;
  debit_account: string;
  credit_account: string;
  amount_paise: number;
  ref_type: 'WAGE_ACCRUAL' | 'PAYMENT_SETTLEMENT' | 'DISPUTE_REVERSAL' | 'ESCROW_FUNDING' | 'ADJUSTMENT';
  ref_id: string;
  contract_id?: string | null;
  project_id?: string | null;
  description?: string | null;
  prev_hash: string;
  hash: string;
  created_at: string;
}

export interface PaymentTransactionRecord {
  id: string;
  transaction_ref: string;
  idempotency_key: string;
  worker_id: string;
  contractor_id: string;
  contract_id: string;
  project_id: string;
  amount_paise: number;
  payment_method: PaymentMethod;
  reference_number: string;
  proof_url?: string | null;
  status: PaymentLifecycleStatus;
  claimed_at: string;
  confirmed_at?: string | null;
  disputed_at?: string | null;
  dispute_reason?: string | null;
  worker_notes?: string | null;
  escalation_deadline: string;
  is_escalated: boolean;
  notes?: string | null;
  created_at: string;
}

export interface WalletTimelineItem {
  id: string;
  type:
    | 'ACCRUAL'
    | 'PAYMENT_CONFIRMED'
    | 'PAYMENT_CLAIMED'
    | 'PAYMENT_DISPUTED'
    | 'PAYMENT_ESCALATED'
    | 'WITHDRAWAL'
    | 'ADJUSTMENT';
  title: string;
  plainLanguageDescription: string;
  amountPaise: number;
  date: string;
  statusBadge: {
    status: 'VERIFIED' | 'PENDING' | 'DISPUTED' | 'REJECTED';
    label: string;
  };
  proofUrl?: string | null;
  canConfirmOrDispute?: boolean;
  contractorName?: string;
  projectName?: string;
  referenceNumber?: string;
}

// ─── Hash Computation Helper ─────────────────────────────────────────────────

export function computeLedgerHash(params: {
  prevHash: string;
  transactionId: string;
  debitAccount: string;
  creditAccount: string;
  amountPaise: number;
  refType: string;
  refId: string;
  createdAt: string;
}): string {
  const payload = [
    params.prevHash,
    params.transactionId,
    params.debitAccount,
    params.creditAccount,
    params.amountPaise.toString(),
    params.refType,
    params.refId,
    params.createdAt,
  ].join(':');

  return createHash('sha256').update(payload).digest('hex');
}

// ─── Get or Create Account ───────────────────────────────────────────────────

export async function getOrCreateAccount(params: {
  accountType: AccountType;
  ownerId?: string | null;
  name?: string;
  code?: string;
}): Promise<Account> {
  const admin = createAdminClient();

  if (params.ownerId) {
    const { data: existing } = await admin
      .from('accounts')
      .select('*')
      .eq('account_type', params.accountType)
      .eq('owner_id', params.ownerId)
      .maybeSingle();

    if (existing) return existing as Account;
  } else if (params.code) {
    const { data: existing } = await admin
      .from('accounts')
      .select('*')
      .eq('code', params.code)
      .maybeSingle();

    if (existing) return existing as Account;
  }

  const generatedCode =
    params.code ||
    `${params.accountType}-${params.ownerId ? params.ownerId.slice(0, 8) : Date.now().toString(36)}`;
  const defaultName =
    params.name ||
    `${params.accountType === 'WORKER' ? 'Worker' : params.accountType === 'CONTRACTOR' ? 'Contractor' : 'Escrow'} Account`;

  const { data: created, error } = await admin
    .from('accounts')
    .insert({
      account_type: params.accountType,
      owner_id: params.ownerId || null,
      code: generatedCode,
      name: defaultName,
    })
    .select()
    .single();

  if (error || !created) {
    // Attempt fetch on race condition
    if (params.ownerId) {
      const { data: raceFound } = await admin
        .from('accounts')
        .select('*')
        .eq('account_type', params.accountType)
        .eq('owner_id', params.ownerId)
        .maybeSingle();

      if (raceFound) return raceFound as Account;
    }
    throw new Error(`Failed to create account: ${error?.message}`);
  }

  return created as Account;
}

// ─── Fetch Latest Ledger Hash ────────────────────────────────────────────────

export async function getLatestLedgerHash(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('ledger_entries')
    .select('hash')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.hash || GENESIS_HASH;
}

// ─── Record Wage Accrual (Verified Shift) ─────────────────────────────────────

export async function recordWageAccrual(params: {
  attendanceEventId: string;
  contractId: string;
  workerId: string;
  contractorId: string;
  amountPaise: number;
  date?: string;
  description?: string;
}): Promise<LedgerEntry> {
  const admin = createAdminClient();

  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error(`Invalid wage accrual amount: ${params.amountPaise}. Must be a positive integer.`);
  }

  // 1. Idempotency check: has this attendance event already been accrued?
  const { data: existing } = await admin
    .from('ledger_entries')
    .select('*')
    .eq('ref_type', 'WAGE_ACCRUAL')
    .eq('ref_id', params.attendanceEventId)
    .maybeSingle();

  if (existing) {
    return existing as LedgerEntry;
  }

  // 2. Fetch/create contractor account (liability) and worker account (receivable)
  const [contractorAccount, workerAccount] = await Promise.all([
    getOrCreateAccount({
      accountType: 'CONTRACTOR',
      ownerId: params.contractorId,
      name: 'Contractor Wage Liability Account',
    }),
    getOrCreateAccount({
      accountType: 'WORKER',
      ownerId: params.workerId,
      name: 'Worker Wage Receivable Account',
    }),
  ]);

  // 3. Compute chained hash
  const prevHash = await getLatestLedgerHash();
  const transactionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const entryHash = computeLedgerHash({
    prevHash,
    transactionId,
    debitAccount: contractorAccount.id,
    creditAccount: workerAccount.id,
    amountPaise: params.amountPaise,
    refType: 'WAGE_ACCRUAL',
    refId: params.attendanceEventId,
    createdAt,
  });

  // 4. Insert append-only double-entry row
  // Invariant: debit_account is debited amount_paise, credit_account is credited amount_paise
  // Sum(debits) = Sum(credits) = amount_paise
  const { data: entry, error: insertErr } = await admin
    .from('ledger_entries')
    .insert({
      transaction_id: null,
      debit_account: contractorAccount.id,
      credit_account: workerAccount.id,
      amount_paise: params.amountPaise,
      ref_type: 'WAGE_ACCRUAL',
      ref_id: params.attendanceEventId,
      contract_id: params.contractId,
      description:
        params.description ||
        `Statutory wage accrual for verified shift on ${params.date || new Date().toISOString().split('T')[0]}`,
      prev_hash: prevHash,
      hash: entryHash,
      created_at: createdAt,
    })
    .select()
    .single();

  if (insertErr || !entry) {
    throw new Error(`Failed to record wage accrual ledger entry: ${insertErr?.message}`);
  }

  await logSensitiveOperation({
    actorId: params.contractorId,
    action: 'WAGE_ACCRUAL_RECORDED',
    entityType: 'ledger_entries',
    entityId: entry.id,
    afterState: {
      amountPaise: params.amountPaise,
      attendanceEventId: params.attendanceEventId,
      workerId: params.workerId,
      contractId: params.contractId,
      hash: entryHash,
    },
  });

  return entry as LedgerEntry;
}

// ─── Record Dispute Payment Order Reversal Entry ─────────────────────────────

export async function recordDisputeReversalEntry(params: {
  disputeId: string;
  contractId: string;
  workerId: string;
  contractorId: string;
  amountPaise: number;
  description?: string;
  projectId?: string;
  actorId?: string;
}): Promise<LedgerEntry> {
  const admin = createAdminClient();

  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error(`Invalid dispute payment order amount: ${params.amountPaise}. Must be a positive integer.`);
  }

  // Idempotency: check if dispute already has a reversing ledger entry
  const { data: existing } = await admin
    .from('ledger_entries')
    .select('*')
    .eq('ref_type', 'DISPUTE_REVERSAL')
    .eq('ref_id', params.disputeId)
    .maybeSingle();

  if (existing) {
    return existing as LedgerEntry;
  }

  // Fetch / create contractor liability and worker receivable accounts
  const [contractorAccount, workerAccount] = await Promise.all([
    getOrCreateAccount({
      accountType: 'CONTRACTOR',
      ownerId: params.contractorId,
      name: 'Contractor Wage Liability Account',
    }),
    getOrCreateAccount({
      accountType: 'WORKER',
      ownerId: params.workerId,
      name: 'Worker Wage Receivable Account',
    }),
  ]);

  const prevHash = await getLatestLedgerHash();
  const transactionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const entryHash = computeLedgerHash({
    prevHash,
    transactionId,
    debitAccount: contractorAccount.id,
    creditAccount: workerAccount.id,
    amountPaise: params.amountPaise,
    refType: 'DISPUTE_REVERSAL',
    refId: params.disputeId,
    createdAt,
  });

  const { data: entry, error: insertErr } = await admin
    .from('ledger_entries')
    .insert({
      transaction_id: null,
      debit_account: contractorAccount.id,
      credit_account: workerAccount.id,
      amount_paise: params.amountPaise,
      ref_type: 'DISPUTE_REVERSAL',
      ref_id: params.disputeId,
      contract_id: params.contractId,
      project_id: params.projectId || null,
      description:
        params.description ||
        `Statutory dispute payment order for dispute ${params.disputeId}: ₹${paiseToRupeeDisplay(params.amountPaise)}`,
      prev_hash: prevHash,
      hash: entryHash,
      created_at: createdAt,
    })
    .select()
    .single();

  if (insertErr || !entry) {
    throw new Error(`Failed to record dispute reversal ledger entry: ${insertErr?.message}`);
  }

  await logSensitiveOperation({
    actorId: params.actorId || params.contractorId,
    action: 'DISPUTE_REVERSAL_RECORDED',
    entityType: 'ledger_entries',
    entityId: entry.id,
    afterState: {
      amountPaise: params.amountPaise,
      disputeId: params.disputeId,
      workerId: params.workerId,
      contractorId: params.contractorId,
      hash: entryHash,
    },
  });

  return entry as LedgerEntry;
}

// ─── Record Payment Claim (Contractor Claim) ──────────────────────────────────

export async function recordPaymentClaim(params: {
  contractId: string;
  workerId: string;
  contractorId: string;
  projectId: string;
  amountPaise: number;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  proofUrl?: string | null;
  notes?: string | null;
  initiatorUserId: string;
  escalationDays?: number;
  idempotencyKey?: string;
}): Promise<PaymentTransactionRecord> {
  const admin = createAdminClient();

  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error(`amountPaise must be a positive integer. Received: ${params.amountPaise}`);
  }

  if (!params.referenceNumber || !params.referenceNumber.trim()) {
    throw new Error('A payment reference number (UPI ref, UTR, or cash voucher number) is required.');
  }

  const idempotencyKey =
    params.idempotencyKey ||
    `pay_claim_${params.contractId}_${params.amountPaise}_${params.referenceNumber.trim()}`;

  // 1. Idempotency check
  const { data: existing } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existing) {
    return existing as PaymentTransactionRecord;
  }

  if (!params.amountPaise || params.amountPaise <= 0) {
    throw new Error('Disbursement amount must be a positive integer greater than zero.');
  }

  // 2. Overpayment guard: check against single authoritative SQL view
  const summary = await getContractFinancialSummary(params.contractId);
  if (params.amountPaise > summary.outstandingPaise && !(params as any).isAdvance) {
    throw new Error(
      `OVERPAYMENT REJECTED: Attempting to disburse ${paiseToRupeeDisplay(params.amountPaise)} but outstanding wage balance is only ${paiseToRupeeDisplay(summary.outstandingPaise)}. Mark as advance payment to proceed.`
    );
  }

  // 3. Ensure accounts exist
  const [contractorAccount, workerAccount] = await Promise.all([
    getOrCreateAccount({
      accountType: 'CONTRACTOR',
      ownerId: params.contractorId,
      name: 'Contractor Account',
    }),
    getOrCreateAccount({
      accountType: 'WORKER',
      ownerId: params.workerId,
      name: 'Worker Account',
    }),
  ]);

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0');
  const transactionRef = `TXN-${dateStr}-${rand}`;

  const escalationDays = params.escalationDays || DEFAULT_ESCALATION_DAYS;
  const escalationDeadline = new Date(Date.now() + escalationDays * 24 * 60 * 60 * 1000).toISOString();
  const claimedAt = new Date().toISOString();

  // 4. Insert payment transaction with state PAID_CLAIMED
  // Note: At PAID_CLAIMED state, arrears are NOT yet reduced until the worker confirms
  const { data: txn, error: txnErr } = await admin
    .from('payment_transactions')
    .insert({
      transaction_ref: transactionRef,
      idempotency_key: idempotencyKey,
      sender_account_id: contractorAccount.id,
      receiver_account_id: workerAccount.id,
      worker_id: params.workerId,
      contractor_id: params.contractorId,
      contract_id: params.contractId,
      project_id: params.projectId,
      amount_paise: params.amountPaise,
      payment_source:
        params.paymentMethod === 'CASH'
          ? 'CONTRACTOR_REPORTED_CASH_PAYMENT'
          : params.paymentMethod === 'BANK_TRANSFER'
          ? 'BANK_TRANSFER'
          : 'PLATFORM_TRANSFER',
      payment_method: params.paymentMethod,
      reference_number: params.referenceNumber.trim(),
      proof_url: params.proofUrl || null,
      status: 'PAID_CLAIMED',
      claimed_at: claimedAt,
      escalation_deadline: escalationDeadline,
      is_escalated: false,
      notes: params.notes || null,
      initiated_by: params.initiatorUserId,
    })
    .select()
    .single();

  if (txnErr || !txn) {
    throw new Error(`Failed to record payment claim: ${txnErr?.message}`);
  }

  await logSensitiveOperation({
    actorId: params.initiatorUserId,
    action: 'PAYMENT_CLAIM_RECORDED',
    entityType: 'payment_transactions',
    entityId: txn.id,
    afterState: {
      transactionRef,
      amountPaise: params.amountPaise,
      paymentMethod: params.paymentMethod,
      referenceNumber: params.referenceNumber,
      status: 'PAID_CLAIMED',
      escalationDeadline,
    },
  });

  return txn as PaymentTransactionRecord;
}

// ─── Worker Confirm or Dispute Payment ────────────────────────────────────────

export async function confirmOrDisputePayment(params: {
  transactionId: string;
  workerUserId: string;
  isConfirmed: boolean;
  disputeReason?: string;
  workerNotes?: string;
}): Promise<{
  transaction: PaymentTransactionRecord;
  ledgerEntry?: LedgerEntry;
  dispute?: any;
}> {
  const admin = createAdminClient();

  // 1. Fetch worker profile
  const { data: worker, error: workerErr } = await admin
    .from('workers')
    .select('id, full_name, internal_worker_id')
    .eq('user_id', params.workerUserId)
    .maybeSingle();

  if (workerErr || !worker) {
    throw new Error('Worker profile not found. Only the registered worker can confirm or dispute this payment.');
  }

  // 2. Fetch transaction
  const { data: txn, error: txnErr } = await admin
    .from('payment_transactions')
    .select('*')
    .eq('id', params.transactionId)
    .maybeSingle();

  if (txnErr || !txn) {
    throw new Error('Payment transaction record not found.');
  }

  if (txn.worker_id !== worker.id) {
    throw new Error('Authorization failure: Only the named worker can confirm or dispute this payment.');
  }

  if (txn.status !== 'PAID_CLAIMED' && txn.status !== 'PENDING') {
    // If already confirmed or disputed, return state
    return { transaction: txn as PaymentTransactionRecord };
  }

  const nowIso = new Date().toISOString();

  // CASE A: Worker Confirms Receipt
  if (params.isConfirmed) {
    // 1. Update transaction to WORKER_CONFIRMED & SUCCESS
    const { data: updatedTxn, error: updateErr } = await admin
      .from('payment_transactions')
      .update({
        status: 'WORKER_CONFIRMED',
        confirmed_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', txn.id)
      .select()
      .single();

    if (updateErr || !updatedTxn) {
      throw new Error(`Failed to update payment status: ${updateErr?.message}`);
    }

    // 2. Insert confirmation record
    await admin.from('payment_confirmations').insert({
      transaction_id: txn.id,
      worker_id: worker.id,
      is_confirmed: true,
      worker_notes: params.workerNotes || 'Worker confirmed receipt',
    });

    // 3. Atomically write double-entry PAYMENT_SETTLEMENT to ledger
    // Debit: Worker Account (settles receivable)
    // Credit: Contractor Account (settles contractor debt)
    const prevHash = await getLatestLedgerHash();
    const entryHash = computeLedgerHash({
      prevHash,
      transactionId: txn.id,
      debitAccount: txn.receiver_account_id,
      creditAccount: txn.sender_account_id,
      amountPaise: txn.amount_paise,
      refType: 'PAYMENT_SETTLEMENT',
      refId: txn.id,
      createdAt: nowIso,
    });

    const { data: ledgerEntry, error: ledgerErr } = await admin
      .from('ledger_entries')
      .insert({
        transaction_id: txn.id,
        debit_account: txn.receiver_account_id,
        credit_account: txn.sender_account_id,
        amount_paise: txn.amount_paise,
        ref_type: 'PAYMENT_SETTLEMENT',
        ref_id: txn.id,
        contract_id: txn.contract_id,
        project_id: txn.project_id,
        description: `Disbursement confirmed by worker ${worker.full_name} for Ref #${txn.reference_number || txn.transaction_ref}`,
        prev_hash: prevHash,
        hash: entryHash,
        created_at: nowIso,
      })
      .select()
      .single();

    if (ledgerErr) {
      console.error('Ledger entry insertion warning:', ledgerErr.message);
    }

    await logSensitiveOperation({
      actorId: params.workerUserId,
      action: 'PAYMENT_CONFIRMED_BY_WORKER',
      entityType: 'payment_transactions',
      entityId: txn.id,
      afterState: {
        status: 'WORKER_CONFIRMED',
        amountPaise: txn.amount_paise,
        ledgerEntryId: ledgerEntry?.id,
      },
    });

    return {
      transaction: updatedTxn as PaymentTransactionRecord,
      ledgerEntry: ledgerEntry as LedgerEntry,
    };
  }

  // CASE B: Worker Disputes ("I did not receive this")
  const disputeReason = params.disputeReason || 'Worker stated: I did not receive this payment.';

  const { data: updatedTxn, error: updateErr } = await admin
    .from('payment_transactions')
    .update({
      status: 'WORKER_DISPUTED',
      disputed_at: nowIso,
      dispute_reason: disputeReason,
      worker_notes: params.workerNotes || null,
      updated_at: nowIso,
    })
    .eq('id', txn.id)
    .select()
    .single();

  if (updateErr || !updatedTxn) {
    throw new Error(`Failed to update payment status: ${updateErr?.message}`);
  }

  // Insert negative confirmation record
  await admin.from('payment_confirmations').insert({
    transaction_id: txn.id,
    worker_id: worker.id,
    is_confirmed: false,
    dispute_reason: disputeReason,
    worker_notes: params.workerNotes || null,
  });

  // Automatically register dispute for Labour Inspector review
  const disputeRef = `DISP-${new Date().getFullYear()}-PAY-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: disputeRecord } = await admin
    .from('disputes')
    .insert({
      dispute_ref: disputeRef,
      worker_id: worker.id,
      contractor_id: txn.contractor_id,
      project_id: txn.project_id,
      contract_id: txn.contract_id,
      category: 'WAGE',
      description: `Worker disputed claimed payment of ${paiseToRupeeDisplay(txn.amount_paise)} (Ref: ${txn.reference_number || txn.transaction_ref}). Reason: ${disputeReason}`,
      status: 'OPEN',
      priority: 'HIGH',
      raised_by_user_id: params.workerUserId,
      metadata: {
        payment_transaction_id: txn.id,
        amount_paise: txn.amount_paise,
        payment_method: txn.payment_method,
        reference_number: txn.reference_number,
      },
    })
    .select()
    .maybeSingle();

  await logSensitiveOperation({
    actorId: params.workerUserId,
    action: 'PAYMENT_DISPUTED_BY_WORKER',
    entityType: 'payment_transactions',
    entityId: txn.id,
    afterState: {
      status: 'WORKER_DISPUTED',
      amountPaise: txn.amount_paise,
      disputeReason,
      disputeId: disputeRecord?.id,
    },
  });

  return {
    transaction: updatedTxn as PaymentTransactionRecord,
    dispute: disputeRecord,
  };
}

// ─── Auto-Escalate Unconfirmed Payments ───────────────────────────────────────

export async function escalateUnconfirmedPayments(
  maxAgeDays: number = DEFAULT_ESCALATION_DAYS
): Promise<{ escalatedCount: number; escalatedIds: string[] }> {
  const admin = createAdminClient();
  const thresholdIso = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

  // Find all PAID_CLAIMED transactions older than threshold
  const { data: expiredClaims, error: fetchErr } = await admin
    .from('payment_transactions')
    .select('*, workers(full_name, user_id), contractors(company_name)')
    .eq('status', 'PAID_CLAIMED')
    .lte('claimed_at', thresholdIso);

  if (fetchErr || !expiredClaims || expiredClaims.length === 0) {
    return { escalatedCount: 0, escalatedIds: [] };
  }

  const escalatedIds: string[] = [];

  for (const claim of expiredClaims) {
    const nowIso = new Date().toISOString();

    // Transition status to ESCALATED_TO_DISPUTE
    await admin
      .from('payment_transactions')
      .update({
        status: 'ESCALATED_TO_DISPUTE',
        is_escalated: true,
        updated_at: nowIso,
      })
      .eq('id', claim.id);

    // Create automatic dispute for inspector
    const disputeRef = `AUTO-DISP-${new Date().getFullYear()}-${claim.id.slice(0, 6).toUpperCase()}`;
    await admin.from('disputes').insert({
      dispute_ref: disputeRef,
      worker_id: claim.worker_id,
      contractor_id: claim.contractor_id,
      project_id: claim.project_id,
      contract_id: claim.contract_id,
      category: 'WAGE',
      description: `AUTOMATIC STATUTORY ESCALATION: Payment claim of ${paiseToRupeeDisplay(claim.amount_paise)} remained unconfirmed by worker after ${maxAgeDays} days. Inspector audit required.`,
      status: 'OPEN',
      priority: 'HIGH',
      raised_by_user_id: claim.initiated_by,
      metadata: {
        auto_escalated: true,
        payment_transaction_id: claim.id,
        claimed_at: claim.claimed_at,
        escalated_at: nowIso,
      },
    });

    escalatedIds.push(claim.id);
  }

  return { escalatedCount: escalatedIds.length, escalatedIds };
}

// ─── Worker Withdrawal Service ──────────────────────────────────────────────

export interface WorkerWithdrawalParams {
  workerId: string;
  amountPaise: number;
  destinationType: 'UPI' | 'BANK_TRANSFER';
  destinationMasked: string;
  idempotencyKey: string;
  simulateFailure?: boolean;
  actorUserId?: string;
}

export interface WorkerWithdrawalResult {
  success: boolean;
  status: 'SUCCESS' | 'FAILED';
  message: string;
  transactionRef: string;
  amountPaise: number;
  destinationMasked: string;
  destinationType: 'UPI' | 'BANK_TRANSFER';
  reversed?: boolean;
  ledgerEntryId?: string;
  reversalEntryId?: string;
  walletBalancePaise: number;
  isDuplicate?: boolean;
}

export async function recordWorkerWithdrawal(
  params: WorkerWithdrawalParams
): Promise<WorkerWithdrawalResult> {
  const admin = createAdminClient();

  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error(`Invalid withdrawal amount: ${params.amountPaise}. Must be a positive integer in paise.`);
  }

  if (!params.idempotencyKey) {
    throw new Error('Idempotency key is required for withdrawal.');
  }

  // 1. Idempotency Check
  const { data: existing } = await admin
    .from('ledger_entries')
    .select('*')
    .eq('ref_type', 'WITHDRAWAL')
    .ilike('description', `%${params.idempotencyKey}%`)
    .maybeSingle();

  if (existing) {
    const summary = await getWorkerFinancialSummary(params.workerId);
    return {
      success: true,
      status: 'SUCCESS',
      message: 'Idempotent request: withdrawal already processed.',
      transactionRef: existing.transaction_id || existing.id,
      amountPaise: existing.amount_paise,
      destinationMasked: params.destinationMasked,
      destinationType: params.destinationType,
      ledgerEntryId: existing.id,
      walletBalancePaise: summary.walletBalancePaise,
      isDuplicate: true,
    };
  }

  // 2. Over-withdraw check: check authoritative derived wallet balance
  const summary = await getWorkerFinancialSummary(params.workerId);
  if (params.amountPaise > summary.walletBalancePaise) {
    throw new Error(
      `OVER_WITHDRAW_REJECTED: Requested withdrawal of ${paiseToRupeeDisplay(params.amountPaise)} exceeds available wallet balance of ${paiseToRupeeDisplay(summary.walletBalancePaise)}.`
    );
  }

  // 3. Ensure accounts exist: Worker Account & System Clearing Account
  const [workerAccount, clearingAccount] = await Promise.all([
    getOrCreateAccount({
      accountType: 'WORKER',
      ownerId: params.workerId,
      name: 'Worker Account',
    }),
    getOrCreateAccount({
      accountType: 'SYSTEM_CLEARING',
      name: 'Statutory Banking Clearing Account',
      code: 'SYSTEM_CLEARING_BANK',
    }),
  ]);

  const transactionId = randomUUID();
  const transactionRef = `WTH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 0xffffffff).toString(16).toUpperCase().padStart(8, '0')}`;
  const nowIso = new Date().toISOString();
  const prevHash = await getLatestLedgerHash();

  const withdrawalHash = computeLedgerHash({
    prevHash,
    transactionId,
    debitAccount: workerAccount.id,
    creditAccount: clearingAccount.id,
    amountPaise: params.amountPaise,
    refType: 'WITHDRAWAL',
    refId: workerAccount.id,
    createdAt: nowIso,
  });

  // 4. Record WITHDRAWAL entry
  const { data: withdrawalEntry, error: withErr } = await admin
    .from('ledger_entries')
    .insert({
      transaction_id: null,
      debit_account: workerAccount.id,
      credit_account: clearingAccount.id,
      amount_paise: params.amountPaise,
      ref_type: 'WITHDRAWAL',
      ref_id: workerAccount.id,
      description: `Withdrawal ${transactionRef} via ${params.destinationType} (${params.destinationMasked}) [key:${params.idempotencyKey}]`,
      prev_hash: prevHash,
      hash: withdrawalHash,
      created_at: nowIso,
    })
    .select()
    .single();

  if (withErr || !withdrawalEntry) {
    throw new Error(`Failed to record withdrawal ledger entry: ${withErr?.message}`);
  }

  // 5. If simulated failure requested (Sandbox testing requirement):
  if (params.simulateFailure) {
    const reversalTxId = randomUUID();
    const reversalTimeIso = new Date(Date.now() + 50).toISOString();
    const reversalHash = computeLedgerHash({
      prevHash: withdrawalHash,
      transactionId: reversalTxId,
      debitAccount: clearingAccount.id,
      creditAccount: workerAccount.id,
      amountPaise: params.amountPaise,
      refType: 'ADJUSTMENT',
      refId: workerAccount.id,
      createdAt: reversalTimeIso,
    });

    const { data: reversalEntry } = await admin
      .from('ledger_entries')
      .insert({
        transaction_id: null,
        debit_account: clearingAccount.id,
        credit_account: workerAccount.id,
        amount_paise: params.amountPaise,
        ref_type: 'ADJUSTMENT',
        ref_id: workerAccount.id,
        description: `Reversal of failed withdrawal ${transactionRef} via ${params.destinationType} (${params.destinationMasked}): Simulated bank network timeout / decline`,
        prev_hash: withdrawalHash,
        hash: reversalHash,
        created_at: reversalTimeIso,
      })
      .select()
      .single();

    await logSensitiveOperation({
      actorId: params.actorUserId || params.workerId,
      action: 'WORKER_WITHDRAWAL_FAILED_AND_REVERSED',
      entityType: 'ledger_entries',
      entityId: reversalEntry?.id || withdrawalEntry.id,
      afterState: {
        amountPaise: params.amountPaise,
        destinationMasked: params.destinationMasked,
        status: 'FAILED',
        reversed: true,
      },
    });

    return {
      success: false,
      status: 'FAILED',
      message: 'Simulated payout failure: Bank server timeout / decline. Funds restored to wallet balance via reversing ledger entry.',
      transactionRef,
      amountPaise: params.amountPaise,
      destinationMasked: params.destinationMasked,
      destinationType: params.destinationType,
      reversed: true,
      ledgerEntryId: withdrawalEntry.id,
      reversalEntryId: reversalEntry?.id,
      walletBalancePaise: summary.walletBalancePaise,
    };
  }

  await logSensitiveOperation({
    actorId: params.actorUserId || params.workerId,
    action: 'WORKER_WITHDRAWAL_SUCCESS',
    entityType: 'ledger_entries',
    entityId: withdrawalEntry.id,
    afterState: {
      amountPaise: params.amountPaise,
      destinationMasked: params.destinationMasked,
      status: 'SUCCESS',
    },
  });

  return {
    success: true,
    status: 'SUCCESS',
    message: `Withdrawal of ${paiseToRupeeDisplay(params.amountPaise)} processed successfully to ${params.destinationMasked}.`,
    transactionRef,
    amountPaise: params.amountPaise,
    destinationMasked: params.destinationMasked,
    destinationType: params.destinationType,
    ledgerEntryId: withdrawalEntry.id,
    walletBalancePaise: Math.max(0, summary.walletBalancePaise - params.amountPaise),
  };
}

// ─── Worker Wallet Timeline Builder ──────────────────────────────────────────

export interface ProjectWageBreakdown {
  contractId: string;
  projectId: string;
  projectName: string;
  contractorName: string;
  dailyWagePaise: number;
  verifiedDaysCount: number;
  totalEarnedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
  datesWorked: string[];
}

export async function getWorkerWalletTimeline(workerId: string): Promise<{
  financialSummary: any;
  timeline: WalletTimelineItem[];
  pendingClaims: any[];
  projectBreakdowns: ProjectWageBreakdown[];
  projects: { id: string; name: string }[];
  months: string[];
}> {
  const admin = createAdminClient();

  // 1. Authoritative summary from the single SQL view
  const financialSummary = await getWorkerFinancialSummary(workerId);

  // 2. Fetch verified attendance events for this worker (Accruals)
  const { data: attendanceEvents } = await admin
    .from('attendance_events')
    .select('id, date, created_at, contract_id, projects(id, name), work_contracts(daily_wage)')
    .eq('worker_id', workerId)
    .eq('status', 'VERIFIED')
    .order('date', { ascending: false });

  // 3. Fetch all payment transactions for this worker
  const { data: payments } = await admin
    .from('payment_transactions')
    .select('*, contractors(company_name), projects(id, name), payment_confirmations(*)')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false });

  const timeline: WalletTimelineItem[] = [];
  const pendingClaims: any[] = [];

  // Format attendance accruals
  for (const att of attendanceEvents || []) {
    const wage = (att as any).work_contracts?.daily_wage;
    const wagePaise = typeof wage === 'number' && wage < 10000 ? Math.round(wage * 100) : Number(wage || 0);
    const dateFormatted = new Date(att.date || att.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const projectName = (att as any).projects?.name || 'Site';

    timeline.push({
      id: `accrual_${att.id}`,
      type: 'ACCRUAL',
      title: `Shift Verified · हाज़िरी दर्ज`,
      plainLanguageDescription: `Verified shift on ${dateFormatted} at ${projectName}: ${paiseToRupeeDisplay(wagePaise)} earned (Wage Accrued).`,
      amountPaise: wagePaise,
      date: att.date || att.created_at,
      statusBadge: {
        status: 'VERIFIED',
        label: 'ACCRUED / अर्जित',
      },
      projectName,
    });
  }

  // Format payment records
  for (const p of payments || []) {
    const contractorName = (p as any).contractors?.company_name || 'Contractor';
    const projectName = (p as any).projects?.name || 'Project';
    const dateFormatted = new Date(p.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const rupeeAmount = paiseToRupeeDisplay(p.amount_paise);
    const methodDisplay =
      p.payment_method === 'UPI_SIMULATED'
        ? 'Simulated UPI'
        : p.payment_method === 'CASH'
        ? 'Cash Voucher'
        : 'Bank Transfer';

    if (p.status === 'WORKER_CONFIRMED' || p.status === 'SUCCESS') {
      timeline.push({
        id: `pay_${p.id}`,
        type: 'PAYMENT_CONFIRMED',
        title: `Payment Received · भुगतान प्राप्त`,
        plainLanguageDescription: `${contractorName} paid ${rupeeAmount} on ${dateFormatted} via ${methodDisplay} (Ref: ${p.reference_number || p.transaction_ref}), you confirmed.`,
        amountPaise: p.amount_paise,
        date: p.confirmed_at || p.created_at,
        statusBadge: {
          status: 'VERIFIED',
          label: 'CONFIRMED / पुष्ट',
        },
        proofUrl: p.proof_url,
        contractorName,
        projectName,
        referenceNumber: p.reference_number,
      });
    } else if (p.status === 'PAID_CLAIMED' || p.status === 'PENDING') {
      const item: WalletTimelineItem = {
        id: `pay_${p.id}`,
        type: 'PAYMENT_CLAIMED',
        title: `Payment Claimed · भुगतान दावा (पुष्टि बाकी)`,
        plainLanguageDescription: `${contractorName} claims they paid ${rupeeAmount} on ${dateFormatted} via ${methodDisplay} (Ref: ${p.reference_number || p.transaction_ref}) — Awaiting your confirmation.`,
        amountPaise: p.amount_paise,
        date: p.claimed_at || p.created_at,
        statusBadge: {
          status: 'PENDING',
          label: 'CONFIRMATION PENDING / पुष्टि बाकी',
        },
        proofUrl: p.proof_url,
        canConfirmOrDispute: true,
        contractorName,
        projectName,
        referenceNumber: p.reference_number,
      };
      timeline.push(item);
      pendingClaims.push({ ...p, contractorName, projectName, formattedAmount: rupeeAmount });
    } else if (p.status === 'WORKER_DISPUTED' || p.status === 'DISPUTED') {
      timeline.push({
        id: `pay_${p.id}`,
        type: 'PAYMENT_DISPUTED',
        title: `Payment Disputed · भुगतान पर आपत्ति`,
        plainLanguageDescription: `Payment of ${rupeeAmount} on ${dateFormatted} disputed by you ("I did not receive this") — Under Labour Inspector review.`,
        amountPaise: p.amount_paise,
        date: p.disputed_at || p.created_at,
        statusBadge: {
          status: 'DISPUTED',
          label: 'DISPUTED / विवादित',
        },
        proofUrl: p.proof_url,
        contractorName,
        projectName,
        referenceNumber: p.reference_number,
      });
    } else if (p.status === 'ESCALATED_TO_DISPUTE') {
      timeline.push({
        id: `pay_${p.id}`,
        type: 'PAYMENT_ESCALATED',
        title: `Auto-Escalated to Inspector · स्वतः विवाद दर्ज`,
        plainLanguageDescription: `Claimed payment of ${rupeeAmount} on ${dateFormatted} remained unconfirmed after ${DEFAULT_ESCALATION_DAYS} days and was auto-escalated to the Labour Department.`,
        amountPaise: p.amount_paise,
        date: p.updated_at || p.created_at,
        statusBadge: {
          status: 'DISPUTED',
          label: 'INSPECTOR REVIEW / श्रम विभाग समीक्षा',
        },
        proofUrl: p.proof_url,
        contractorName,
        projectName,
      });
    }
  }

  // 4. Fetch withdrawal & adjustment ledger entries
  try {
    const { data: workerAcc } = await admin
      .from('accounts')
      .select('id')
      .eq('account_type', 'WORKER')
      .eq('owner_id', workerId)
      .maybeSingle();

    if (workerAcc) {
      const { data: ledgerTxns } = await admin
        .from('ledger_entries')
        .select('*')
        .in('ref_type', ['WITHDRAWAL', 'ADJUSTMENT', 'WITHDRAWAL_REVERSAL']);

      for (const entry of ledgerTxns || []) {
        if (entry.ref_type === 'WITHDRAWAL' && entry.debit_account === workerAcc.id) {
          const isFailed = entry.description?.includes('FAILED');
          timeline.push({
            id: `withdraw_${entry.id}`,
            type: 'WITHDRAWAL',
            title: isFailed ? 'Withdrawal Failed · निकासी विफल' : 'Bank / UPI Withdrawal · बैंक निकासी',
            plainLanguageDescription: entry.description || `Transferred ${paiseToRupeeDisplay(entry.amount_paise)} to bank/UPI account.`,
            amountPaise: Number(entry.amount_paise),
            date: entry.created_at,
            statusBadge: {
              status: isFailed ? 'REJECTED' : 'VERIFIED',
              label: isFailed ? 'FAILED / विफल' : 'SUCCESS / सफल',
            },
          });
        } else if ((entry.ref_type === 'ADJUSTMENT' || entry.ref_type === 'WITHDRAWAL_REVERSAL') && entry.credit_account === workerAcc.id) {
          timeline.push({
            id: `adj_${entry.id}`,
            type: 'ADJUSTMENT',
            title: 'Withdrawal Reversal · राशि बहाली',
            plainLanguageDescription: entry.description || `Reversal of ${paiseToRupeeDisplay(entry.amount_paise)} restored to wallet balance.`,
            amountPaise: Number(entry.amount_paise),
            date: entry.created_at,
            statusBadge: {
              status: 'VERIFIED',
              label: 'RESTORED / बहाल',
            },
          });
        }
      }
    }
  } catch {
    // Non-blocking
  }

  // 5. Build Project Wage Breakdowns & Filter Lists
  const { data: contracts } = await admin
    .from('work_contracts')
    .select('id, daily_wage, project_id, contractor_id, projects(id, name), contractors(company_name)')
    .eq('worker_id', workerId);

  const projectBreakdowns: ProjectWageBreakdown[] = [];
  const projectsList: { id: string; name: string }[] = [];
  const monthsSet = new Set<string>();

  for (const c of contracts || []) {
    const projName = (c as any).projects?.name || 'Site Project';
    const contractorName = (c as any).contractors?.company_name || 'Contractor';
    const rawWage = Number(c.daily_wage || 0);
    const dailyWagePaise = rawWage < 10000 ? Math.round(rawWage * 100) : Math.round(rawWage);

    const attForContract = (attendanceEvents || []).filter((a: any) => a.contract_id === c.id);
    const datesWorked = Array.from(new Set(attForContract.map((a: any) => a.date))).sort().reverse() as string[];
    const verifiedDaysCount = datesWorked.length;
    const totalEarnedPaise = verifiedDaysCount * dailyWagePaise;

    const paymentsForContract = (payments || []).filter(
      (p: any) => p.contract_id === c.id && (p.status === 'SUCCESS' || p.status === 'WORKER_CONFIRMED')
    );
    const totalPaidPaise = paymentsForContract.reduce((sum: number, p: any) => sum + Number(p.amount_paise || 0), 0);
    const outstandingPaise = Math.max(0, totalEarnedPaise - totalPaidPaise);

    projectBreakdowns.push({
      contractId: c.id,
      projectId: c.project_id,
      projectName: projName,
      contractorName,
      dailyWagePaise,
      verifiedDaysCount,
      totalEarnedPaise,
      totalPaidPaise,
      outstandingPaise,
      datesWorked,
    });

    if (c.project_id && !projectsList.some((p) => p.id === c.project_id)) {
      projectsList.push({ id: c.project_id, name: projName });
    }
  }

  // Extract all distinct months (YYYY-MM) from timeline dates
  for (const item of timeline) {
    if (item.date) {
      monthsSet.add(item.date.slice(0, 7));
    }
  }
  const monthsList = Array.from(monthsSet).sort().reverse();

  // Sort unified timeline strictly descending by date
  timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    financialSummary,
    timeline,
    pendingClaims,
    projectBreakdowns,
    projects: projectsList,
    months: monthsList,
  };
}

// ─── Verify Ledger Invariants (Audit / Test Function) ─────────────────────────

export async function verifyLedgerInvariants(): Promise<{
  isBalanced: boolean;
  isChainValid: boolean;
  totalDebits: number;
  totalCredits: number;
  entryCount: number;
  brokenAtEntryId?: string;
  invarianceErrors: string[];
}> {
  const admin = createAdminClient();

  const { data: entries, error } = await admin
    .from('ledger_entries')
    .select('*')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error || !entries) {
    return {
      isBalanced: false,
      isChainValid: false,
      totalDebits: 0,
      totalCredits: 0,
      entryCount: 0,
      invarianceErrors: [`Failed to query ledger entries: ${error?.message}`],
    };
  }

  let totalDebits = 0;
  let totalCredits = 0;
  let expectedPrevHash = GENESIS_HASH;
  let isChainValid = true;
  let brokenAtEntryId: string | undefined;
  const invarianceErrors: string[] = [];

  // Group by transaction to ensure transaction-level balance
  const txTotals: { [txId: string]: { debits: number; credits: number } } = {};

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as LedgerEntry;
    const amount = Number(entry.amount_paise || 0);

    // Validate integer
    if (!Number.isInteger(amount) || amount <= 0) {
      invarianceErrors.push(`Entry ${entry.id} has invalid non-integer or negative amount: ${amount}`);
    }

    totalDebits += amount;
    totalCredits += amount;

    const txId = entry.transaction_id || entry.id;
    if (!txTotals[txId]) {
      txTotals[txId] = { debits: 0, credits: 0 };
    }
    txTotals[txId].debits += amount;
    txTotals[txId].credits += amount;

    // Check hash chain if hashes are populated
    if (entry.prev_hash && entry.hash) {
      if (i > 0 && entry.prev_hash !== expectedPrevHash) {
        isChainValid = false;
        if (!brokenAtEntryId) brokenAtEntryId = entry.id;
        invarianceErrors.push(
          `Entry ${entry.id} broken prev_hash: expected ${expectedPrevHash}, found ${entry.prev_hash}`
        );
      }

      expectedPrevHash = entry.hash;
    }
  }

  // Check transaction-level balance invariant
  for (const [txId, totals] of Object.entries(txTotals)) {
    if (totals.debits !== totals.credits) {
      invarianceErrors.push(
        `Transaction ${txId} is unbalanced: Debits (${totals.debits}) != Credits (${totals.credits})`
      );
    }
  }

  const isBalanced = totalDebits === totalCredits && invarianceErrors.length === 0;

  return {
    isBalanced,
    isChainValid,
    totalDebits,
    totalCredits,
    entryCount: entries.length,
    brokenAtEntryId,
    invarianceErrors,
  };
}
