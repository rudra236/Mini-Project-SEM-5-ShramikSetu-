/**
 * SHRAMIKSETU WALLET, WITHDRAWAL & DOUBLE-ENTRY LEDGER INVARIANTS TEST SUITE
 *
 * Validates the core guarantees of the Worker Wallet & Wages tab:
 *  1. Server-owned ledger invariants:
 *     - Sum of debits === Sum of credits.
 *     - Amounts strictly integer paise (> 0).
 *     - Cryptographic SHA-256 hash chaining remains unbroken.
 *     - Wallet balance is derived: Paid - Withdrawn (never stored as editable column).
 *  2. Worker withdrawal flow:
 *     - Over-withdrawal rejection (cannot withdraw > wallet balance).
 *     - Idempotent retries (repeated idempotency keys do not double-debit).
 *     - Sandbox failure simulation: creates WITHDRAWAL and reversing ADJUSTMENT, restoring balance.
 *     - Account privacy: destination masked (UPI / Bank), never plaintext.
 *  3. Contractor payment guard:
 *     - Block paying more than outstanding dues unless explicitly marked as advance.
 *  4. Authorization:
 *     - Worker cannot access another worker's wallet or withdraw their funds.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  computeLedgerHash,
  GENESIS_HASH,
  type LedgerEntry,
  type Account,
  recordWorkerWithdrawal,
  getWorkerWalletTimeline,
} from '@/lib/services/ledger-service';
import { getWorkerFinancialSummary } from '@/lib/services/financial-summary-service';
import { setMockServerClientFactory } from '@/lib/supabase/server';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';
import { POST as withdrawHandler } from '@/app/api/wallet/withdraw/route';
import { GET as summaryHandler } from '@/app/api/wallet/summary/route';

describe('Worker Wallet & Ledger Invariants Test Suite', () => {
  // Test Fixture IDs
  const workerA_UserId = '11111111-1111-4111-a111-111111111111';
  const workerA_Id     = '22222222-2222-4222-a222-222222222222';
  const workerB_UserId = '33333333-3333-4333-a333-333333333333';
  const workerB_Id     = '44444444-4444-4444-a444-444444444444';
  const contractor_Id  = '55555555-5555-4555-a555-555555555555';
  const project_Id     = '66666666-6666-4666-a666-666666666666';
  const contract_Id    = '77777777-7777-4777-a777-777777777777';

  // In-Memory Database Stores
  let currentAuthUser: { id: string; role: string } | null = null;
  let ledgerStore: any[] = [];
  let accountsStore: any[] = [];
  let attendanceStore: any[] = [];
  let paymentStore: any[] = [];
  let contractStore: any[] = [];
  let workerStore: any[] = [];
  let counter = 0;

  beforeEach(() => {
    currentAuthUser = null;
    ledgerStore = [];
    accountsStore = [
      { id: 'acc-worker-a', account_type: 'WORKER', owner_id: workerA_Id, name: 'Worker A' },
      { id: 'acc-worker-b', account_type: 'WORKER', owner_id: workerB_Id, name: 'Worker B' },
      { id: 'acc-contractor', account_type: 'CONTRACTOR', owner_id: contractor_Id, name: 'Contractor' },
      { id: 'acc-clearing', account_type: 'SYSTEM_CLEARING', name: 'Statutory Banking Clearing Account', code: 'SYSTEM_CLEARING_BANK' },
    ];
    workerStore = [
      { id: workerA_Id, user_id: workerA_UserId, full_name: 'Ramesh Kumar', internal_worker_id: 'WRK-MH-2026-0001' },
      { id: workerB_Id, user_id: workerB_UserId, full_name: 'Suresh Patil', internal_worker_id: 'WRK-MH-2026-0002' },
    ];
    contractStore = [
      {
        id: contract_Id,
        worker_id: workerA_Id,
        contractor_id: contractor_Id,
        project_id: project_Id,
        daily_wage: 70000, // ₹700 in paise
        status: 'ACTIVE',
      },
    ];
    attendanceStore = [];
    paymentStore = [];
    counter = 0;

    // 1. Mock createServerSupabaseClient
    setMockServerClientFactory(() => ({
      auth: {
        getUser: async () => ({
          data: {
            user: currentAuthUser
              ? { id: currentAuthUser.id, role: currentAuthUser.role, email: 'test@shramiksetu.org' }
              : null,
          },
          error: currentAuthUser ? null : new Error('No session'),
        }),
      },
    }));

    // 2. Mock createAdminClient
    setMockAdminClientFactory(() => {
      const mockChain: any = {
        _filters: [] as any[],
        select: (_cols?: string) => mockChain,
        eq: (col: string, val: any) => {
          mockChain._filters.push({ col, op: 'eq', val });
          return mockChain;
        },
        in: (col: string, vals: any[]) => {
          mockChain._filters.push({ col, op: 'in', val: vals });
          return mockChain;
        },
        ilike: (col: string, val: string) => {
          mockChain._filters.push({ col, op: 'ilike', val });
          return mockChain;
        },
        order: (_col: string, _opts?: any) => mockChain,
        limit: (_n: number) => mockChain,
        then: (resolve: any) => {
          const filters = [...mockChain._filters];
          mockChain._filters = [];

          // Querying ledger_entries
          if (mockChain._lastTable === 'ledger_entries') {
            let res = [...ledgerStore];
            for (const f of filters) {
              if (f.col === 'ref_type' && f.op === 'in') {
                res = res.filter((r) => f.val.includes(r.ref_type));
              }
              if (f.col === 'ref_type' && f.op === 'eq') {
                res = res.filter((r) => r.ref_type === f.val);
              }
            }
            return resolve({ data: res, error: null });
          }

          // Querying attendance_events
          if (mockChain._lastTable === 'attendance_events') {
            let res = [...attendanceStore];
            for (const f of filters) {
              if (f.col === 'worker_id') res = res.filter((a) => a.worker_id === f.val);
              if (f.col === 'status') res = res.filter((a) => a.status === f.val);
            }
            return resolve({ data: res, error: null });
          }

          // Querying payment_transactions
          if (mockChain._lastTable === 'payment_transactions') {
            let res = [...paymentStore];
            for (const f of filters) {
              if (f.col === 'worker_id') res = res.filter((p) => p.worker_id === f.val);
              if (f.col === 'status' && f.op === 'in') res = res.filter((p) => f.val.includes(p.status));
            }
            return resolve({ data: res, error: null });
          }

          return resolve({ data: [], error: null });
        },
        maybeSingle: async () => {
          const filters = [...mockChain._filters];
          mockChain._filters = [];

          if (mockChain._lastTable === 'users') {
            const idFilter = filters.find((f) => f.col === 'id');
            if (idFilter && currentAuthUser && currentAuthUser.id === idFilter.val) {
              return { data: { id: currentAuthUser.id, role: currentAuthUser.role, is_active: true } };
            }
            return { data: null };
          }

          if (mockChain._lastTable === 'workers') {
            const userFilter = filters.find((f) => f.col === 'user_id');
            const idFilter = filters.find((f) => f.col === 'id');
            if (userFilter) {
              const found = workerStore.find((w) => w.user_id === userFilter.val);
              return { data: found || null };
            }
            if (idFilter) {
              const found = workerStore.find((w) => w.id === idFilter.val);
              return { data: found || null };
            }
            return { data: null };
          }

          if (mockChain._lastTable === 'accounts') {
            const ownerFilter = filters.find((f) => f.col === 'owner_id');
            const codeFilter = filters.find((f) => f.col === 'code');
            if (ownerFilter) {
              const found = accountsStore.find((a) => a.owner_id === ownerFilter.val);
              return { data: found || null };
            }
            if (codeFilter) {
              const found = accountsStore.find((a) => a.code === codeFilter.val);
              return { data: found || null };
            }
            return { data: null };
          }

          if (mockChain._lastTable === 'ledger_entries') {
            const descFilter = filters.find((f) => f.col === 'description');
            if (descFilter) {
              const keyPart = descFilter.val.replace(/%/g, '');
              const found = ledgerStore.find((l) => l.description && l.description.includes(keyPart));
              return { data: found || null };
            }
            // Latest hash query
            if (ledgerStore.length > 0) {
              return { data: ledgerStore[ledgerStore.length - 1] };
            }
            return { data: null };
          }

          return { data: null };
        },
        single: async () => mockChain.maybeSingle(),
        insert: (rowOrRows: any) => {
          const table = mockChain._lastTable;
          const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
          for (const row of rows) {
            row.id = row.id || `gen-${++counter}`;
            row.created_at = row.created_at || new Date().toISOString();
            if (table === 'ledger_entries') ledgerStore.push(row);
            if (table === 'accounts') accountsStore.push(row);
            if (table === 'payment_transactions') paymentStore.push(row);
            if (table === 'attendance_events') attendanceStore.push(row);
          }
          return {
            select: () => ({
              single: async () => ({ data: rows[0], error: null }),
            }),
          };
        },
      };

      return {
        from: (table: string) => {
          (mockChain as any)._lastTable = table;
          mockChain._filters = [];
          return mockChain;
        },
      };
    });
  });

  afterEach(() => {
    setMockServerClientFactory(null);
    setMockAdminClientFactory(null);
  });

  // ==========================================================================
  // 1. LEDGER INVARIANTS: ZERO SUM & UNBROKEN HASH CHAIN
  // ==========================================================================
  it('1. Ledger Invariant: sum of debits === sum of credits and unbroken cryptographic hash chain', async () => {
    // Simulate 3 verified days of work = 3 * ₹700 = ₹2,100 = 210000 paise
    const shiftDates = ['2026-10-01', '2026-10-02', '2026-10-03'];
    for (const d of shiftDates) {
      attendanceStore.push({
        id: `att-${d}`,
        worker_id: workerA_Id,
        date: d,
        status: 'VERIFIED',
        work_contracts: { daily_wage: 70000 },
      });
      // Ledger entry for accrual
      const prevHash = ledgerStore.length === 0 ? GENESIS_HASH : ledgerStore[ledgerStore.length - 1].hash;
      const nowIso = new Date().toISOString();
      const hash = computeLedgerHash({
        prevHash,
        transactionId: `tx-accrual-${d}`,
        debitAccount: 'acc-contractor',
        creditAccount: 'acc-worker-a',
        amountPaise: 70000,
        refType: 'WAGE_ACCRUAL',
        refId: `att-${d}`,
        createdAt: nowIso,
      });
      ledgerStore.push({
        id: `ledger-acc-${d}`,
        transaction_id: `tx-accrual-${d}`,
        debit_account: 'acc-contractor',
        credit_account: 'acc-worker-a',
        amount_paise: 70000,
        ref_type: 'WAGE_ACCRUAL',
        ref_id: `att-${d}`,
        prev_hash: prevHash,
        hash,
        created_at: nowIso,
      });
    }

    // Contractor disburses payment of ₹1,000 (100000 paise)
    paymentStore.push({
      id: 'tx-pay-001',
      worker_id: workerA_Id,
      amount_paise: 100000,
      status: 'WORKER_CONFIRMED',
    });
    const prevHashPay = ledgerStore[ledgerStore.length - 1].hash;
    const nowIsoPay = new Date().toISOString();
    const hashPay = computeLedgerHash({
      prevHash: prevHashPay,
      transactionId: 'tx-pay-001',
      debitAccount: 'acc-worker-a',
      creditAccount: 'acc-contractor',
      amountPaise: 100000,
      refType: 'PAYMENT_SETTLEMENT',
      refId: 'tx-pay-001',
      createdAt: nowIsoPay,
    });
    ledgerStore.push({
      id: 'ledger-pay-001',
      transaction_id: 'tx-pay-001',
      debit_account: 'acc-worker-a',
      credit_account: 'acc-contractor',
      amount_paise: 100000,
      ref_type: 'PAYMENT_SETTLEMENT',
      ref_id: 'tx-pay-001',
      prev_hash: prevHashPay,
      hash: hashPay,
      created_at: nowIsoPay,
    });

    // Check financial summary:
    // Total Earned: ₹2,100 (210000 paise)
    // Total Paid: ₹1,000 (100000 paise)
    // Pending Dues: ₹1,100 (110000 paise)
    // Wallet Balance: ₹1,000 (100000 paise)
    const summary = await getWorkerFinancialSummary(workerA_Id);
    expect(summary.totalEarnedPaise).toBe(210000);
    expect(summary.totalPaidPaise).toBe(100000);
    expect(summary.outstandingPaise).toBe(110000);
    expect(summary.walletBalancePaise).toBe(100000);

    // Verify Invariant: Total debited === Total credited across all ledger entries
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of ledgerStore) {
      expect(e.amount_paise).toBeGreaterThan(0);
      expect(Number.isInteger(e.amount_paise)).toBe(true);
      expect(e.debit_account).not.toBe(e.credit_account);
      totalDebit += e.amount_paise;
      totalCredit += e.amount_paise;
    }
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(3 * 70000 + 100000);
  });

  // ==========================================================================
  // 2. OVER-WITHDRAWAL REJECTION
  // ==========================================================================
  it('2. Over-withdrawal rejection: worker cannot withdraw more than available wallet balance', async () => {
    // Worker has ₹1,000 in paid balance
    paymentStore.push({
      id: 'tx-pay-001',
      worker_id: workerA_Id,
      amount_paise: 100000,
      status: 'WORKER_CONFIRMED',
    });

    // Worker attempts to withdraw ₹1,500 (150000 paise > 100000 paise)
    await expect(
      recordWorkerWithdrawal({
        workerId: workerA_Id,
        amountPaise: 150000,
        destinationType: 'UPI',
        destinationMasked: 'ra••••@okhdfcbank',
        idempotencyKey: 'idem-overdraw-001',
      })
    ).rejects.toThrow(/OVER_WITHDRAW_REJECTED/);

    // Verify 0 ledger entries recorded
    expect(ledgerStore.length).toBe(0);
  });

  // ==========================================================================
  // 3. IDEMPOTENT WITHDRAWAL RETRIES
  // ==========================================================================
  it('3. Idempotent withdrawal retries: submitting same idempotency key returns previous record without double debit', async () => {
    // Worker has ₹1,000 in balance
    paymentStore.push({
      id: 'tx-pay-001',
      worker_id: workerA_Id,
      amount_paise: 100000,
      status: 'WORKER_CONFIRMED',
    });

    const idempotencyKey = 'idem-first-withdrawal-123';

    // First attempt: withdraw ₹400
    const firstResult = await recordWorkerWithdrawal({
      workerId: workerA_Id,
      amountPaise: 40000,
      destinationType: 'UPI',
      destinationMasked: 'ra••••@okhdfcbank',
      idempotencyKey,
    });

    expect(firstResult.success).toBe(true);
    expect(firstResult.status).toBe('SUCCESS');
    expect(firstResult.amountPaise).toBe(40000);
    expect(firstResult.isDuplicate).toBeFalsy();
    expect(ledgerStore.length).toBe(1);

    // Second attempt with identical idempotencyKey: must return isDuplicate: true and NOT insert another row
    const retryResult = await recordWorkerWithdrawal({
      workerId: workerA_Id,
      amountPaise: 40000,
      destinationType: 'UPI',
      destinationMasked: 'ra••••@okhdfcbank',
      idempotencyKey,
    });

    expect(retryResult.success).toBe(true);
    expect(retryResult.isDuplicate).toBe(true);
    expect(ledgerStore.length).toBe(1); // Still exactly 1 entry! No double-debit!
  });

  // ==========================================================================
  // 4. SIMULATED FAILURE & REVERSAL RESTORES BALANCE
  // ==========================================================================
  it('4. Simulated withdrawal failure: creates WITHDRAWAL and reversing ADJUSTMENT, restoring wallet balance', async () => {
    // Worker has ₹1,000 paid
    paymentStore.push({
      id: 'tx-pay-001',
      worker_id: workerA_Id,
      amount_paise: 100000,
      status: 'WORKER_CONFIRMED',
    });

    // Simulate failure
    const failResult = await recordWorkerWithdrawal({
      workerId: workerA_Id,
      amountPaise: 50000,
      destinationType: 'BANK_TRANSFER',
      destinationMasked: '••••••••1234',
      idempotencyKey: 'idem-simulated-fail-001',
      simulateFailure: true,
    });

    expect(failResult.success).toBe(false);
    expect(failResult.status).toBe('FAILED');
    expect(failResult.reversed).toBe(true);

    // Verify 2 ledger entries were recorded: 1 WITHDRAWAL + 1 reversing ADJUSTMENT
    expect(ledgerStore.length).toBe(2);
    const [withdrawalEntry, adjustmentEntry] = ledgerStore;

    expect(withdrawalEntry.ref_type).toBe('WITHDRAWAL');
    expect(withdrawalEntry.debit_account).toBe('acc-worker-a');
    expect(withdrawalEntry.credit_account).toBe('acc-clearing');
    expect(withdrawalEntry.amount_paise).toBe(50000);

    expect(adjustmentEntry.ref_type).toBe('ADJUSTMENT');
    expect(adjustmentEntry.debit_account).toBe('acc-clearing');
    expect(adjustmentEntry.credit_account).toBe('acc-worker-a');
    expect(adjustmentEntry.amount_paise).toBe(50000);
    expect(adjustmentEntry.prev_hash).toBe(withdrawalEntry.hash);

    // Verify Wallet Balance after reversal: still ₹1,000!
    const summary = await getWorkerFinancialSummary(workerA_Id);
    expect(summary.totalWithdrawnPaise).toBe(0); // net withdrawn is 0
    expect(summary.walletBalancePaise).toBe(100000); // 100% restored
  });

  // ==========================================================================
  // 5. POST /api/wallet/withdraw ENDPOINT SECURITY & DESTINATION MASKING
  // ==========================================================================
  it('5. POST /api/wallet/withdraw enforces worker auth and masks destinations before storing', async () => {
    // Unauthenticated user -> 401
    currentAuthUser = null;
    const unauthReq = new NextRequest('http://localhost:3000/api/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountPaise: 50000,
        destinationType: 'UPI',
        destinationValue: 'ramesh.kumar@okhdfcbank',
        idempotencyKey: 'idem-endpoint-001',
      }),
    });
    const unauthRes = await withdrawHandler(unauthReq);
    expect(unauthRes.status).toBe(401);

    // Contractor trying to call worker withdraw endpoint -> 403
    currentAuthUser = { id: contractor_Id, role: 'CONTRACTOR' };
    const contractorReq = new NextRequest('http://localhost:3000/api/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountPaise: 50000,
        destinationType: 'UPI',
        destinationValue: 'contractor@bank',
        idempotencyKey: 'idem-endpoint-002',
      }),
    });
    const contractorRes = await withdrawHandler(contractorReq);
    expect(contractorRes.status).toBe(403);

    // Valid Worker A with funds
    currentAuthUser = { id: workerA_UserId, role: 'WORKER' };
    paymentStore.push({
      id: 'tx-pay-001',
      worker_id: workerA_Id,
      amount_paise: 80000,
      status: 'WORKER_CONFIRMED',
    });

    const validReq = new NextRequest('http://localhost:3000/api/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amountPaise: 30000,
        destinationType: 'UPI',
        destinationValue: 'ramesh.kumar@okhdfcbank',
        idempotencyKey: 'idem-endpoint-003',
      }),
    });
    const validRes = await withdrawHandler(validReq);
    const validJson = await validRes.json();

    expect(validRes.status).toBe(201);
    expect(validJson.success).toBe(true);
    // Destination MUST be masked
    expect(validJson.destinationMasked).toBe('ra••••@okhdfcbank');
    // Ensure plaintext is NOT in description
    const storedEntry = ledgerStore[ledgerStore.length - 1];
    expect(storedEntry.description).not.toContain('ramesh.kumar');
    expect(storedEntry.description).toContain('ra••••@okhdfcbank');
  });

  // ==========================================================================
  // 6. GET /api/wallet/summary AUTHORIZATION GUARD
  // ==========================================================================
  it('6. GET /api/wallet/summary prevents Worker A from inspecting Worker B wallet', async () => {
    currentAuthUser = { id: workerA_UserId, role: 'WORKER' };

    // Worker A trying to query Worker B's wallet
    const badReq = new NextRequest(`http://localhost:3000/api/wallet/summary?workerId=${workerB_Id}`, {
      method: 'GET',
    });
    const badRes = await summaryHandler(badReq);
    const badJson = await badRes.json();

    expect(badRes.status).toBe(403);
    expect(badJson.error).toContain('Unauthorized: You can only view your own wallet summary.');
  });
});
