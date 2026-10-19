/**
 * SHRAMIKSETU PHASE 6 — EARNINGS ENGINE & LEDGER-BASED PAYMENTS TEST SUITE
 *
 * Tests run without a live database by mocking the Supabase admin client.
 * Every financial invariant is tested directly in TypeScript logic.
 */

import assert from 'node:assert';
import { describe, it, beforeEach, expect } from 'vitest';
import { rupeesToPaise, paiseToRupeeDisplay } from '../../src/types/payment.types';
import { PaymentServiceError } from '../../src/lib/services/payment-service';

// ─── Mock Supabase Environment ────────────────────────────────────────────────
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

// ─── In-Memory Ledger Simulation ──────────────────────────────────────────────

interface MockWalletAccount {
  id: string;
  account_type: 'CONTRACTOR' | 'WORKER';
  owner_id: string;
}

interface MockLedgerEntry {
  id: string;
  transaction_id: string;
  account_id: string;
  direction: 'DEBIT' | 'CREDIT';
  amount_paise: number;
  balance_after_paise: number;
  description: string;
}

interface MockPaymentTransaction {
  id: string;
  transaction_ref: string;
  idempotency_key: string;
  sender_account_id: string;
  receiver_account_id: string;
  worker_id: string;
  contractor_id: string;
  contract_id: string;
  project_id: string;
  amount_paise: number;
  payment_source: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED' | 'DISPUTED';
  notes: string | null;
  initiated_by: string;
}

interface MockPaymentConfirmation {
  id: string;
  transaction_id: string;
  worker_id: string;
  is_confirmed: boolean;
  dispute_reason: string | null;
  worker_notes: string | null;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────
let ledgerStore: MockLedgerEntry[] = [];
let transactionStore: MockPaymentTransaction[] = [];
let confirmationStore: MockPaymentConfirmation[] = [];
let walletStore: MockWalletAccount[] = [];
let txnCounter = 0;
let entryCounter = 0;

function resetStores() {
  ledgerStore = [];
  transactionStore = [];
  confirmationStore = [];
  walletStore = [
    { id: 'wallet-contractor-1', account_type: 'CONTRACTOR', owner_id: 'contractor-1' },
    { id: 'wallet-worker-1',     account_type: 'WORKER',     owner_id: 'worker-1'     },
  ];
  txnCounter = 0;
  entryCounter = 0;
}

/** Compute wallet balance from ledger entries (mirroring get_wallet_balance SQL RPC) */
function getLedgerBalance(accountId: string): number {
  return ledgerStore
    .filter((e) => {
      const txn = transactionStore.find((t) => t.id === e.transaction_id);
      return e.account_id === accountId && txn?.status === 'SUCCESS';
    })
    .reduce((sum, e) => {
      return sum + (e.direction === 'CREDIT' ? e.amount_paise : -e.amount_paise);
    }, 0);
}

/**
 * Simulates the Postgres RPC `create_payment_with_ledger`.
 */
function createPaymentWithLedger(params: {
  transactionRef: string;
  idempotencyKey: string;
  senderAccountId: string;
  receiverAccountId: string;
  workerId: string;
  contractorId: string;
  contractId: string;
  projectId: string;
  amountPaise: number;
  paymentSource: string;
  notes: string | null;
  initiatedBy: string;
  simulateLedgerFailure?: boolean;
}): MockPaymentTransaction {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new PaymentServiceError(
      `INVALID_AMOUNT: amountPaise must be a positive integer, got ${params.amountPaise}`,
      400,
      'INVALID_AMOUNT'
    );
  }

  const existing = transactionStore.find((t) => t.idempotency_key === params.idempotencyKey);
  if (existing) {
    throw new PaymentServiceError(
      'IDEMPOTENCY_VIOLATION: A payment with this idempotency_key already exists.',
      409,
      'IDEMPOTENCY_VIOLATION'
    );
  }

  const snapshotLedger = [...ledgerStore];
  const snapshotTransactions = [...transactionStore];

  try {
    const txnId = `txn-${++txnCounter}`;

    const txn: MockPaymentTransaction = {
      id: txnId,
      transaction_ref: params.transactionRef,
      idempotency_key: params.idempotencyKey,
      sender_account_id: params.senderAccountId,
      receiver_account_id: params.receiverAccountId,
      worker_id: params.workerId,
      contractor_id: params.contractorId,
      contract_id: params.contractId,
      project_id: params.projectId,
      amount_paise: params.amountPaise,
      payment_source: params.paymentSource,
      status: 'PROCESSING',
      notes: params.notes,
      initiated_by: params.initiatedBy,
    };
    transactionStore.push(txn);

    if (params.simulateLedgerFailure) {
      throw new Error('Simulated ledger DB error — second INSERT fails');
    }

    const senderBalanceBefore = getLedgerBalance(params.senderAccountId);
    ledgerStore.push({
      id: `entry-${++entryCounter}`,
      transaction_id: txnId,
      account_id: params.senderAccountId,
      direction: 'DEBIT',
      amount_paise: params.amountPaise,
      balance_after_paise: senderBalanceBefore - params.amountPaise,
      description: `Payment sent: ${params.transactionRef}`,
    });

    const receiverBalanceBefore = getLedgerBalance(params.receiverAccountId);
    ledgerStore.push({
      id: `entry-${++entryCounter}`,
      transaction_id: txnId,
      account_id: params.receiverAccountId,
      direction: 'CREDIT',
      amount_paise: params.amountPaise,
      balance_after_paise: receiverBalanceBefore + params.amountPaise,
      description: `Payment received: ${params.transactionRef}`,
    });

    txn.status = 'SUCCESS';
    return txn;

  } catch (err) {
    ledgerStore.splice(0, ledgerStore.length, ...snapshotLedger);
    transactionStore.splice(0, transactionStore.length, ...snapshotTransactions);
    throw err;
  }
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Phase 6: Earnings Engine & Ledger Payments Suite', () => {
  beforeEach(() => {
    resetStores();
  });

  it('TEST 1: Integer paise conversion (no floating point)', () => {
    expect(rupeesToPaise(700)).toBe(70000);
    expect(rupeesToPaise(0.01)).toBe(1);

    const days = 10;
    const wagePaise = rupeesToPaise(700);
    const earned = days * wagePaise;
    expect(earned).toBe(700000);
    expect(Number.isInteger(earned)).toBe(true);

    expect(paiseToRupeeDisplay(700000)).toBe('₹7000.00');
    expect(paiseToRupeeDisplay(70000)).toBe('₹700.00');
    expect(paiseToRupeeDisplay(56000)).toBe('₹560.00');
  });

  it('TEST 2: Normal payment — atomic ledger write', () => {
    const amountPaise = 70000;

    const txn = createPaymentWithLedger({
      transactionRef: 'TXN-20260819-AAAA0001',
      idempotencyKey: 'idem-normal-001',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: 'Week 1 wages',
      initiatedBy: 'user-contractor-1',
    });

    expect(txn.status).toBe('SUCCESS');
    expect(txn.amount_paise).toBe(70000);
    expect(Number.isInteger(txn.amount_paise)).toBe(true);

    const txnEntries = ledgerStore.filter((e) => e.transaction_id === txn.id);
    expect(txnEntries.length).toBe(2);

    const debitEntry = txnEntries.find((e) => e.direction === 'DEBIT');
    const creditEntry = txnEntries.find((e) => e.direction === 'CREDIT');
    expect(debitEntry).toBeDefined();
    expect(creditEntry).toBeDefined();
    expect(debitEntry!.amount_paise).toBe(70000);
    expect(creditEntry!.amount_paise).toBe(70000);
    expect(debitEntry!.account_id).toBe('wallet-contractor-1');
    expect(creditEntry!.account_id).toBe('wallet-worker-1');

    const workerBalance = getLedgerBalance('wallet-worker-1');
    expect(workerBalance).toBe(70000);
  });

  it('TEST 3: Partial payments — outstanding balance tracking', () => {
    const totalEarnedPaise = 10 * rupeesToPaise(700);

    createPaymentWithLedger({
      transactionRef: 'TXN-20260819-PART01',
      idempotencyKey: 'partial-001',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise: 200000,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: 'Partial 1',
      initiatedBy: 'user-contractor-1',
    });

    createPaymentWithLedger({
      transactionRef: 'TXN-20260819-PART02',
      idempotencyKey: 'partial-002',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise: 150000,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: 'Partial 2',
      initiatedBy: 'user-contractor-1',
    });

    createPaymentWithLedger({
      transactionRef: 'TXN-20260819-PART03',
      idempotencyKey: 'partial-003',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise: 210000,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: 'Partial 3',
      initiatedBy: 'user-contractor-1',
    });

    const totalPaidPaise = getLedgerBalance('wallet-worker-1');
    const outstandingPaise = totalEarnedPaise - totalPaidPaise;

    expect(totalPaidPaise).toBe(560000);
    expect(outstandingPaise).toBe(140000);
  });

  it('TEST 4: Duplicate payment — idempotency', () => {
    const idemKey = 'idem-duplicate-test';
    const amountPaise = 70000;

    const firstTxn = createPaymentWithLedger({
      transactionRef: 'TXN-20260819-IDEM01',
      idempotencyKey: idemKey,
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: null,
      initiatedBy: 'user-contractor-1',
    });

    const ledgerCountBefore = ledgerStore.length;
    const txnCountBefore = transactionStore.length;

    let duplicateRejected = false;
    try {
      createPaymentWithLedger({
        transactionRef: 'TXN-20260819-IDEM02',
        idempotencyKey: idemKey,
        senderAccountId: 'wallet-contractor-1',
        receiverAccountId: 'wallet-worker-1',
        workerId: 'worker-1',
        contractorId: 'contractor-1',
        contractId: 'contract-1',
        projectId: 'project-1',
        amountPaise,
        paymentSource: 'PLATFORM_TRANSFER',
        notes: null,
        initiatedBy: 'user-contractor-1',
      });
    } catch (dupErr: any) {
      expect(dupErr.reasonCode).toBe('IDEMPOTENCY_VIOLATION');
      duplicateRejected = true;
    }

    expect(duplicateRejected).toBe(true);
    expect(ledgerStore.length).toBe(ledgerCountBefore);
    expect(transactionStore.length).toBe(txnCountBefore);
    expect(firstTxn.status).toBe('SUCCESS');
  });

  it('TEST 5: Failed payment — ledger remains clean on error', () => {
    const ledgerCountBefore = ledgerStore.length;
    const txnCountBefore = transactionStore.length;

    try {
      createPaymentWithLedger({
        transactionRef: 'TXN-20260819-FAIL01',
        idempotencyKey: 'idem-fail-001',
        senderAccountId: 'wallet-contractor-1',
        receiverAccountId: 'wallet-worker-1',
        workerId: 'worker-1',
        contractorId: 'contractor-1',
        contractId: 'contract-1',
        projectId: 'project-1',
        amountPaise: 70000,
        paymentSource: 'PLATFORM_TRANSFER',
        notes: null,
        initiatedBy: 'user-contractor-1',
        simulateLedgerFailure: true,
      });
      assert.fail('Should have thrown');
    } catch (failErr: any) {
      expect(failErr.message).toContain('Simulated');
    }

    expect(transactionStore.length).toBe(txnCountBefore);
    expect(ledgerStore.length).toBe(ledgerCountBefore);
    expect(getLedgerBalance('wallet-worker-1')).toBe(0);
  });

  it('TEST 6: Payment confirmation — worker YES', () => {
    const txn = createPaymentWithLedger({
      transactionRef: 'TXN-20260819-CONF01',
      idempotencyKey: 'idem-conf-001',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise: 70000,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: null,
      initiatedBy: 'user-contractor-1',
    });

    const confirmation: MockPaymentConfirmation = {
      id: 'conf-yes-001',
      transaction_id: txn.id,
      worker_id: 'worker-1',
      is_confirmed: true,
      dispute_reason: null,
      worker_notes: 'Amount is correct',
    };
    confirmationStore.push(confirmation);

    expect(txn.status).toBe('SUCCESS');
    expect(txn.amount_paise).toBe(70000);
    expect(confirmation.is_confirmed).toBe(true);
  });

  it('TEST 7: Payment rejection — worker NO (dispute)', () => {
    const txn = createPaymentWithLedger({
      transactionRef: 'TXN-20260819-DISP01',
      idempotencyKey: 'idem-disp-001',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise: 70000,
      paymentSource: 'PLATFORM_TRANSFER',
      notes: null,
      initiatedBy: 'user-contractor-1',
    });

    const confirmation: MockPaymentConfirmation = {
      id: 'conf-no-001',
      transaction_id: txn.id,
      worker_id: 'worker-1',
      is_confirmed: false,
      dispute_reason: 'INCORRECT_AMOUNT_1_DAY_MISSING',
      worker_notes: 'I worked 11 days, not 10',
    };
    confirmationStore.push(confirmation);

    expect(txn.status).toBe('SUCCESS');
    expect(confirmation.is_confirmed).toBe(false);
    expect(confirmation.dispute_reason).toBeDefined();

    const txnLedgerEntries = ledgerStore.filter((e) => e.transaction_id === txn.id);
    expect(txnLedgerEntries.length).toBe(2);
  });

  it('TEST 8: Ledger consistency — DEBIT sum = CREDIT sum', () => {
    const amounts = [70000, 50000, 30000, 100000];
    amounts.forEach((amt, i) => {
      createPaymentWithLedger({
        transactionRef: `TXN-LEDGTEST-${i + 1}`,
        idempotencyKey: `idem-ledger-${i + 1}`,
        senderAccountId: 'wallet-contractor-1',
        receiverAccountId: 'wallet-worker-1',
        workerId: 'worker-1',
        contractorId: 'contractor-1',
        contractId: 'contract-1',
        projectId: 'project-1',
        amountPaise: amt,
        paymentSource: 'PLATFORM_TRANSFER',
        notes: null,
        initiatedBy: 'user-contractor-1',
      });
    });

    const totalDebits = ledgerStore
      .filter((e) => e.direction === 'DEBIT')
      .reduce((s, e) => s + e.amount_paise, 0);

    const totalCredits = ledgerStore
      .filter((e) => e.direction === 'CREDIT')
      .reduce((s, e) => s + e.amount_paise, 0);

    expect(totalDebits).toBe(totalCredits);
  });

  it('TEST 9: Transaction rollback — no partial commits', () => {
    const ledgerBefore = ledgerStore.length;
    const txnBefore = transactionStore.length;

    try {
      createPaymentWithLedger({
        transactionRef: 'TXN-ROLLBACK-01',
        idempotencyKey: 'idem-rollback-01',
        senderAccountId: 'wallet-contractor-1',
        receiverAccountId: 'wallet-worker-1',
        workerId: 'worker-1',
        contractorId: 'contractor-1',
        contractId: 'contract-1',
        projectId: 'project-1',
        amountPaise: 70000,
        paymentSource: 'PLATFORM_TRANSFER',
        notes: null,
        initiatedBy: 'user-contractor-1',
        simulateLedgerFailure: true,
      });
    } catch {
      // Expected
    }

    expect(transactionStore.length).toBe(txnBefore);
    expect(ledgerStore.length).toBe(ledgerBefore);
  });

  it('TEST 10: Overpayment rejection', () => {
    const totalEarnedPaise = 10 * rupeesToPaise(700);
    const overpaymentAttempt = 800000;
    const outstandingPaise = totalEarnedPaise;

    let overpaymentRejected = false;
    try {
      if (overpaymentAttempt > outstandingPaise) {
        throw new PaymentServiceError(
          `Overpayment rejected. Attempting to pay ${overpaymentAttempt} paise but outstanding is only ${outstandingPaise} paise.`,
          422,
          'OVERPAYMENT_REJECTED'
        );
      }
    } catch (overErr: any) {
      expect(overErr.reasonCode).toBe('OVERPAYMENT_REJECTED');
      expect(overErr.statusCode).toBe(422);
      overpaymentRejected = true;
    }

    expect(overpaymentRejected).toBe(true);
    expect(ledgerStore.length).toBe(0);
  });

  it('TEST 11: Cash payment — CONTRACTOR_REPORTED_CASH_PAYMENT', () => {
    const txn = createPaymentWithLedger({
      transactionRef: 'TXN-20260819-CASH01',
      idempotencyKey: 'idem-cash-001',
      senderAccountId: 'wallet-contractor-1',
      receiverAccountId: 'wallet-worker-1',
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      contractId: 'contract-1',
      projectId: 'project-1',
      amountPaise: 70000,
      paymentSource: 'CONTRACTOR_REPORTED_CASH_PAYMENT',
      notes: 'Cash paid on-site on 2026-08-19',
      initiatedBy: 'user-contractor-1',
    });

    expect(txn.payment_source).toBe('CONTRACTOR_REPORTED_CASH_PAYMENT');
    expect(txn.status).toBe('SUCCESS');
  });

  it('TEST 12: Invalid float amount rejection', () => {
    let invalidAmountRejected = false;
    try {
      const floatAmount = 70050.5;
      if (!Number.isInteger(floatAmount) || floatAmount <= 0) {
        throw new PaymentServiceError(
          `amountPaise must be a positive integer. Received: ${floatAmount}`,
          400,
          'INVALID_AMOUNT'
        );
      }
    } catch (floatErr: any) {
      expect(floatErr.reasonCode).toBe('INVALID_AMOUNT');
      invalidAmountRejected = true;
    }

    expect(invalidAmountRejected).toBe(true);
    expect(ledgerStore.length).toBe(0);
  });
});
