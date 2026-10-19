/**
 * Phase 6: Payment, Ledger & Earnings Type Definitions
 *
 * DESIGN INVARIANTS:
 *   - All monetary amounts are stored and computed as integer PAISE (₹1 = 100 paise).
 *   - No floating-point arithmetic anywhere in the payment path.
 *   - Wallet balances are computed from ledger entries — never from a balance column.
 *   - Every successful payment_transaction has exactly 2 ledger_entry rows.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'REVERSED'
  | 'DISPUTED'
  | 'PAID_CLAIMED'
  | 'WORKER_CONFIRMED'
  | 'WORKER_DISPUTED'
  | 'ESCALATED_TO_DISPUTE';

export type PaymentSource =
  | 'PLATFORM_TRANSFER'
  | 'CONTRACTOR_REPORTED_CASH_PAYMENT'
  | 'BANK_TRANSFER';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

// ─── Wallet Accounts ─────────────────────────────────────────────────────────

export interface WalletAccountRow {
  id: string;
  account_type: 'CONTRACTOR' | 'WORKER';
  owner_id: string; // references contractors.id or workers.id
  currency: string; // 'INR'
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletAccountInsert {
  id?: string;
  account_type: 'CONTRACTOR' | 'WORKER';
  owner_id: string;
  currency?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Payment Transactions ────────────────────────────────────────────────────

export interface PaymentTransactionRow {
  id: string;
  transaction_ref: string;       // human-readable: TXN-YYYYMMDD-XXXX
  idempotency_key: string;       // caller-provided, unique
  sender_account_id: string;     // wallet_accounts.id
  receiver_account_id: string;   // wallet_accounts.id
  worker_id: string;
  contractor_id: string;
  contract_id: string;
  project_id: string;
  amount_paise: number;          // integer paise — NEVER floating point
  payment_source: PaymentSource;
  status: PaymentStatus;
  notes: string | null;
  initiated_by: string;          // users.id
  created_at: string;
  updated_at: string;
}

export interface PaymentTransactionInsert {
  id?: string;
  transaction_ref: string;
  idempotency_key: string;
  sender_account_id: string;
  receiver_account_id: string;
  worker_id: string;
  contractor_id: string;
  contract_id: string;
  project_id: string;
  amount_paise: number;
  payment_source?: PaymentSource;
  status?: PaymentStatus;
  notes?: string | null;
  initiated_by: string;
  created_at?: string;
  updated_at?: string;
}

// ─── Ledger Entries ───────────────────────────────────────────────────────────

export interface LedgerEntryRow {
  id: string;
  transaction_id: string | null;        // payment_transactions.id
  account_id: string | null;            // wallet_accounts.id
  direction: LedgerDirection | null;
  amount_paise: number;          // always positive integer paise
  balance_after_paise: number | null;   // running balance snapshot
  description: string | null;
  created_at: string;
}

export interface LedgerEntryInsert {
  id?: string;
  transaction_id: string;
  account_id: string;
  direction: LedgerDirection;
  amount_paise: number;
  balance_after_paise: number;
  description?: string | null;
  created_at?: string;
}

// ─── Earnings Snapshots ───────────────────────────────────────────────────────

export interface EarningsSnapshotRow {
  id: string;
  contract_id: string;
  worker_id: string;
  contractor_id: string;
  period_start: string;          // ISO date string 'YYYY-MM-DD'
  period_end: string;            // ISO date string 'YYYY-MM-DD'
  verified_days_count: number;   // integer
  daily_wage_paise: number;      // integer paise
  total_earned_paise: number;    // verified_days_count × daily_wage_paise (integer)
  computed_at: string;
  computed_by: string;           // users.id
}

export interface EarningsSnapshotInsert {
  id?: string;
  contract_id: string;
  worker_id: string;
  contractor_id: string;
  period_start: string;
  period_end: string;
  verified_days_count: number;
  daily_wage_paise: number;
  total_earned_paise: number;
  computed_at?: string;
  computed_by: string;
}

// ─── Payment Confirmations ────────────────────────────────────────────────────

export interface PaymentConfirmationRow {
  id: string;
  transaction_id: string;        // payment_transactions.id — NEVER mutated
  worker_id: string;
  is_confirmed: boolean;
  dispute_reason: string | null;
  worker_notes: string | null;
  confirmed_at: string;
}

export interface PaymentConfirmationInsert {
  id?: string;
  transaction_id: string;
  worker_id: string;
  is_confirmed: boolean;
  dispute_reason?: string | null;
  worker_notes?: string | null;
  confirmed_at?: string;
}

// ─── Service Input/Output Types ───────────────────────────────────────────────

/**
 * Parameters for initiating a payment.
 * amount_paise must be a positive integer. No floats allowed.
 */
export interface InitiatePaymentParams {
  initiatorUserId: string;
  contractId: string;
  workerId: string;        // workers.id (not user_id)
  contractorId: string;    // contractors.id
  projectId: string;
  /** Payment amount in INTEGER PAISE. ₹700 = 70000 paise. Must be > 0. */
  amountPaise: number;
  idempotencyKey: string;
  paymentSource?: PaymentSource;
  paymentMethod?: 'UPI_SIMULATED' | 'CASH' | 'BANK_TRANSFER';
  referenceNumber?: string;
  proofUrl?: string;
  notes?: string;
  isAdvance?: boolean;
  disputeId?: string;
}

export interface InitiatePaymentResult {
  transaction: PaymentTransactionRow;
  isDuplicate: boolean;  // true if idempotencyKey was already used
  senderLedgerEntry: LedgerEntryRow;
  receiverLedgerEntry: LedgerEntryRow;
}

export interface EarningsComputationResult {
  contractId: string;
  periodStart: string;
  periodEnd: string;
  verifiedDaysCount: number;
  dailyWagePaise: number;      // integer paise
  totalEarnedPaise: number;    // integer paise = verifiedDaysCount × dailyWagePaise
  totalPaidPaise: number;      // integer paise (sum of SUCCESS payments)
  outstandingPaise: number;    // totalEarnedPaise - totalPaidPaise
}

export interface PaymentSummary {
  contractId: string;
  workerId: string;
  totalEarnedPaise: number;    // from earnings snapshot
  totalPaidPaise: number;      // sum of all SUCCESS payment_transactions for contract
  outstandingPaise: number;    // totalEarnedPaise - totalPaidPaise
  transactions: PaymentTransactionRow[];
}

/**
 * Helper: Convert rupees (may be decimal number from DB NUMERIC type) to integer paise.
 * This is the ONLY place where the rupee-to-paise conversion occurs.
 * Result is always an integer — floating point is truncated by Math.round.
 */
export function rupeesToPaise(rupees: number): number {
  if (rupees >= 10000) {
    return Math.round(rupees);
  }
  return Math.round(rupees * 100);
}

/**
 * Helper: Convert integer paise back to rupees (numeric).
 */
export function paiseToRupees(paise: number): number {
  return Math.trunc(paise) / 100;
}

/**
 * Helper: Format paise as rupee string for display only.
 * Never use this value in calculations — always work in paise internally.
 */
export function paiseToRupeeDisplay(paise: number): string {
  const wholePaise = Math.trunc(paise);
  const rupees = Math.trunc(wholePaise / 100);
  const remainingPaise = wholePaise % 100;
  return `₹${rupees}.${remainingPaise.toString().padStart(2, '0')}`;
}
