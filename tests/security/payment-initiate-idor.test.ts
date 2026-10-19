import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/payments/initiate/route';
import { setMockServerClientFactory } from '@/lib/supabase/server';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';
import { NextRequest } from 'next/server';

/**
 * SECURITY TEST SUITE FOR IDOR / IMPERSONATION PREVENTION IN POST /api/payments/initiate
 */

describe('Payment Initiate Security & IDOR Authorization Tests', () => {
  // Test Fixture IDs
  const contractorA_UserId = '11111111-1111-4111-a111-111111111111';
  const contractorA_Id     = '33333333-3333-4333-b333-333333333333';

  const contractorB_UserId = '22222222-2222-4222-a222-222222222222';
  const contractorB_Id     = '44444444-4444-4444-b444-444444444444';

  const workerA_UserId     = '55555555-5555-4555-a555-555555555555';
  const workerA_Id         = '66666666-6666-4666-b666-666666666666';

  const projectA_Id        = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const projectB_Id        = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  const contractA_Id       = 'c1111111-1111-4111-c111-111111111111';

  // In-Memory Database Stores
  let currentAuthUser: { id: string } | null = null;
  let transactionStore: any[] = [];
  let ledgerStore: any[] = [];
  let walletStore: any[] = [];
  let txnCounter = 0;
  let entryCounter = 0;

  beforeEach(() => {
    currentAuthUser = null;
    transactionStore = [];
    ledgerStore = [];
    walletStore = [
      { id: 'w-contractor-a', account_type: 'CONTRACTOR', owner_id: contractorA_Id },
      { id: 'w-contractor-b', account_type: 'CONTRACTOR', owner_id: contractorB_Id },
      { id: 'w-worker-a',     account_type: 'WORKER',     owner_id: workerA_Id     },
    ];
    txnCounter = 0;
    entryCounter = 0;

    // 1. Mock createServerSupabaseClient for auth.getUser()
    setMockServerClientFactory(() => ({
      auth: {
        getUser: async () => ({
          data: { user: currentAuthUser },
          error: currentAuthUser ? null : new Error('No session'),
        }),
      },
    }));

    // 2. Mock createAdminClient for database tables and RPC
    setMockAdminClientFactory(() => {
      const mockChain = {
        select: (_cols?: string, _opts?: any) => mockChain,
        eq: (col: string, val: any) => {
          (mockChain as any)._filters = (mockChain as any)._filters || [];
          (mockChain as any)._filters.push({ col, val });
          return mockChain;
        },
        gte: (_col: string, _val: any) => mockChain,
        lte: (_col: string, _val: any) => mockChain,
        in: (col: string, vals: any[]) => mockChain,
        limit: (_n: number) => mockChain,
        order: (_col: string, _opts?: any) => mockChain,
        then: (resolve: any) => {
          const filters = (mockChain as any)._filters || [];
          (mockChain as any)._filters = [];

          const txnIdFilter = filters.find((f: any) => f.col === 'transaction_id');
          if (txnIdFilter) {
            const entries = ledgerStore.filter((e) => e.transaction_id === txnIdFilter.val);
            return resolve({ data: entries, count: entries.length, error: null });
          }

          const statusFilter = filters.find((f: any) => f.col === 'status');
          if (statusFilter && statusFilter.val === 'SUCCESS') {
            const txs = transactionStore.filter(
              (t) => t.contract_id === filters.find((f: any) => f.col === 'contract_id')?.val && t.status === 'SUCCESS'
            );
            return resolve({ data: txs, count: txs.length, error: null });
          }

          // Default for attendance_events count (returns 10 verified days = ₹7,000 earned)
          return resolve({ count: 10, data: [], error: null });
        },
        maybeSingle: async () => {
          const filters = (mockChain as any)._filters || [];
          (mockChain as any)._filters = [];

          // Querying users table
          if (filters.some((f: any) => f.col === 'id' && f.val === contractorA_UserId)) {
            return { data: { id: contractorA_UserId, role: 'CONTRACTOR', is_active: true } };
          }
          if (filters.some((f: any) => f.col === 'id' && f.val === contractorB_UserId)) {
            return { data: { id: contractorB_UserId, role: 'CONTRACTOR', is_active: true } };
          }
          if (filters.some((f: any) => f.col === 'id' && f.val === workerA_UserId)) {
            return { data: { id: workerA_UserId, role: 'WORKER', is_active: true } };
          }

          // Querying contractors table
          if (filters.some((f: any) => f.col === 'user_id' && f.val === contractorA_UserId)) {
            return { data: { id: contractorA_Id, user_id: contractorA_UserId } };
          }
          if (filters.some((f: any) => f.col === 'user_id' && f.val === contractorB_UserId)) {
            return { data: { id: contractorB_Id, user_id: contractorB_UserId } };
          }

          // Querying workers table
          if (filters.some((f: any) => f.col === 'user_id' && f.val === workerA_UserId)) {
            return { data: { id: workerA_Id, user_id: workerA_UserId } };
          }

          // Querying projects table
          const projIdFilter = filters.find((f: any) => f.col === 'id');
          const contractorFilter = filters.find((f: any) => f.col === 'contractor_id');
          if (projIdFilter && contractorFilter) {
            if (projIdFilter.val === projectA_Id && contractorFilter.val === contractorA_Id) {
              return { data: { id: projectA_Id, contractor_id: contractorA_Id } };
            }
            if (projIdFilter.val === projectB_Id && contractorFilter.val === contractorB_Id) {
              return { data: { id: projectB_Id, contractor_id: contractorB_Id } };
            }
            return { data: null };
          }

          // Querying work_contracts table
          if (filters.some((f: any) => f.col === 'id' && f.val === contractA_Id)) {
            return {
              data: {
                id: contractA_Id,
                worker_id: workerA_Id,
                contractor_id: contractorA_Id,
                project_id: projectA_Id,
                status: 'ACTIVE',
                daily_wage: 700,
              },
            };
          }

          // Querying wallet_accounts table
          const ownerFilter = filters.find((f: any) => f.col === 'owner_id');
          if (ownerFilter) {
            const found = walletStore.find((w) => w.owner_id === ownerFilter.val);
            return { data: found || null };
          }

          // Querying payment_transactions table (idempotency check)
          const idemFilter = filters.find((f: any) => f.col === 'idempotency_key');
          if (idemFilter) {
            const found = transactionStore.find((t) => t.idempotency_key === idemFilter.val);
            return { data: found || null };
          }

          return { data: null };
        },
        single: async () => mockChain.maybeSingle(),
        insert: (data: any) => mockChain,
      };

      return {
        from: (_table: string) => mockChain,
        rpc: async (fnName: string, args: any) => {
          if (fnName === 'compute_earnings_paise' || fnName === 'get_total_paid_paise') {
            return { data: 700000, error: null }; // 10 days earned = ₹7000 = 700000 paise
          }

          if (fnName === 'create_payment_with_ledger') {
            const txnId = `txn-${++txnCounter}`;
            const txn = {
              id: txnId,
              transaction_ref: args.p_transaction_ref,
              idempotency_key: args.p_idempotency_key,
              sender_account_id: args.p_sender_account_id,
              receiver_account_id: args.p_receiver_account_id,
              worker_id: args.p_worker_id,
              contractor_id: args.p_contractor_id,
              contract_id: args.p_contract_id,
              project_id: args.p_project_id,
              amount_paise: args.p_amount_paise,
              payment_source: args.p_payment_source,
              status: 'SUCCESS',
              notes: args.p_notes,
              initiated_by: args.p_initiated_by,
              created_at: new Date().toISOString(),
            };

            const debit = {
              id: `entry-${++entryCounter}`,
              transaction_id: txnId,
              account_id: args.p_sender_account_id,
              direction: 'DEBIT',
              amount_paise: args.p_amount_paise,
              balance_after_paise: -args.p_amount_paise,
            };

            const credit = {
              id: `entry-${++entryCounter}`,
              transaction_id: txnId,
              account_id: args.p_receiver_account_id,
              direction: 'CREDIT',
              amount_paise: args.p_amount_paise,
              balance_after_paise: args.p_amount_paise,
            };

            transactionStore.push(txn);
            ledgerStore.push(debit, credit);

            return { data: txn, error: null };
          }

          return { data: null, error: null };
        },
      };
    });
  });

  afterEach(() => {
    setMockServerClientFactory(null);
    setMockAdminClientFactory(null);
  });

  function createPostRequest(body: any) {
    return new NextRequest('http://localhost:3000/api/payments/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // 1. Contractor A paying from Contractor A account → PASS
  it('1. Contractor A paying from Contractor A account -> PASS', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectA_Id,
      amountPaise: 70000,
      idempotencyKey: 'idem-pass-001',
      paymentSource: 'PLATFORM_TRANSFER',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(transactionStore.length).toBe(1);
    expect(ledgerStore.length).toBe(2);
  });

  // 2. Contractor A attempting Contractor B payment → FAIL with authorization error
  it('2. Contractor A attempting Contractor B payment -> FAIL with authorization error (403)', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorB_Id, // Trying to debit Contractor B
      projectId: projectA_Id,
      amountPaise: 70000,
      idempotencyKey: 'idem-idor-001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe('UNAUTHORIZED');
    expect(json.error).toContain('Access denied to contractor resource');

    // VERIFY ZERO FINANCIAL RECORDS
    expect(transactionStore.length).toBe(0);
    expect(ledgerStore.length).toBe(0);
  });

  // 3. Worker attempting contractor payment → FAIL
  it('3. Worker attempting contractor payment -> FAIL with authorization error (403)', async () => {
    currentAuthUser = { id: workerA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectA_Id,
      amountPaise: 70000,
      idempotencyKey: 'idem-worker-pay-001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe('UNAUTHORIZED');

    // VERIFY ZERO FINANCIAL RECORDS
    expect(transactionStore.length).toBe(0);
    expect(ledgerStore.length).toBe(0);
  });

  // 4. Unauthenticated request → FAIL
  it('4. Unauthenticated request -> FAIL with 401', async () => {
    currentAuthUser = null; // unauthenticated

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectA_Id,
      amountPaise: 70000,
      idempotencyKey: 'idem-unauth-001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.code).toBe('UNAUTHORIZED');

    // VERIFY ZERO FINANCIAL RECORDS
    expect(transactionStore.length).toBe(0);
    expect(ledgerStore.length).toBe(0);
  });

  // 5. Missing contractorId → FAIL
  it('5. Missing contractorId -> FAIL with 400 validation error', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      // contractorId missing
      projectId: projectA_Id,
      amountPaise: 70000,
      idempotencyKey: 'idem-missing-001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Validation failed');

    // VERIFY ZERO FINANCIAL RECORDS
    expect(transactionStore.length).toBe(0);
    expect(ledgerStore.length).toBe(0);
  });

  // 6. Invalid contractorId → FAIL
  it('6. Invalid contractorId -> FAIL with 400 validation error', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: 'not-a-valid-uuid',
      projectId: projectA_Id,
      amountPaise: 70000,
      idempotencyKey: 'idem-invalid-001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe('Validation failed');

    // VERIFY ZERO FINANCIAL RECORDS
    expect(transactionStore.length).toBe(0);
    expect(ledgerStore.length).toBe(0);
  });

  // 7. Valid contractor but unauthorized project/contract → FAIL
  it('7. Valid contractor but unauthorized project -> FAIL with authorization error (403)', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectB_Id, // Project B belongs to Contractor B, not A
      amountPaise: 70000,
      idempotencyKey: 'idem-unauth-proj-001',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe('UNAUTHORIZED');

    // VERIFY ZERO FINANCIAL RECORDS
    expect(transactionStore.length).toBe(0);
    expect(ledgerStore.length).toBe(0);
  });

  // 8. Successful authorized payment still works → PASS
  it('8. Successful authorized payment still works -> PASS', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectA_Id,
      amountPaise: 140000,
      idempotencyKey: 'idem-success-002',
      paymentSource: 'PLATFORM_TRANSFER',
      notes: 'Final settlement payment',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.transaction.amount_paise).toBe(140000);
    expect(json.ledger.debit.amount_paise).toBe(140000);
    expect(json.ledger.credit.amount_paise).toBe(140000);
    expect(transactionStore.length).toBe(1);
    expect(ledgerStore.length).toBe(2);
  });

  // 9. Payment exceeding outstanding dues without isAdvance -> REJECTED (422)
  it('9. Payment exceeding outstanding dues without isAdvance -> REJECTED (422)', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectA_Id,
      amountPaise: 800000, // 800000 > 700000 outstanding
      idempotencyKey: 'idem-overpay-reject-001',
      paymentSource: 'PLATFORM_TRANSFER',
      isAdvance: false,
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.code).toBe('OVERPAYMENT_REJECTED');
    expect(json.error).toContain('Overpayment rejected');
    expect(transactionStore.length).toBe(0);
  });

  // 10. Payment exceeding outstanding dues with isAdvance: true -> PASS (201)
  it('10. Payment exceeding outstanding dues with isAdvance: true -> PASS (201)', async () => {
    currentAuthUser = { id: contractorA_UserId };

    const req = createPostRequest({
      contractId: contractA_Id,
      workerId: workerA_Id,
      contractorId: contractorA_Id,
      projectId: projectA_Id,
      amountPaise: 800000, // 800000 > 700000 outstanding, marked advance
      idempotencyKey: 'idem-advance-pass-001',
      paymentSource: 'PLATFORM_TRANSFER',
      isAdvance: true,
      notes: 'Festival advance payment',
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.transaction.amount_paise).toBe(800000);
    expect(transactionStore.length).toBe(1);
  });
});
