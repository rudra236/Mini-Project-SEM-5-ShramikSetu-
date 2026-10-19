import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as getContractHandler } from '@/app/api/contracts/[id]/route';
import { NextRequest } from 'next/server';
import { setMockServerClientFactory } from '@/lib/supabase/server';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';

describe('Worker Contract Authorization Isolation (IDOR Protection)', () => {
  const worker1Id = '33333333-3333-3333-3333-333333333301';
  const worker1UserId = '11111111-1111-1111-1111-111111111101';

  const worker2Id = '33333333-3333-3333-3333-333333333302';
  const worker2UserId = '11111111-1111-1111-1111-111111111110';

  const contractWorker1 = {
    id: '55555555-5555-5555-5555-555555555501',
    worker_id: worker1Id,
    contractor_id: '22222222-2222-2222-2222-222222222201',
    project_id: '66666666-6666-6666-6666-666666666601',
    daily_wage: 85000,
    status: 'ACTIVE',
  };

  const contractWorker2 = {
    id: '55555555-5555-5555-5555-555555555502',
    worker_id: worker2Id,
    contractor_id: '22222222-2222-2222-2222-222222222201',
    project_id: '66666666-6666-6666-6666-666666666601',
    daily_wage: 65000,
    status: 'ACTIVE',
  };

  let currentAuthUser: any = null;

  beforeEach(() => {
    // Mock Supabase Server Client
    setMockServerClientFactory(() => ({
      auth: {
        getUser: vi.fn().mockImplementation(async () => {
          if (!currentAuthUser) return { data: { user: null }, error: new Error('No session') };
          return { data: { user: currentAuthUser }, error: null };
        }),
      },
    }));

    // Mock Admin Client
    setMockAdminClientFactory(() => ({
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: val,
                      role: 'WORKER',
                      is_active: true,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'workers') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => ({
                  data: {
                    id: val === worker1UserId ? worker1Id : worker2Id,
                    user_id: val,
                    full_name: val === worker1UserId ? 'Ramesh Kumar' : 'Sunita Patil',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'work_contracts') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: async () => {
                  if (val === contractWorker1.id) return { data: contractWorker1, error: null };
                  if (val === contractWorker2.id) return { data: contractWorker2, error: null };
                  return { data: null, error: null };
                },
              }),
            }),
          };
        }
        if (table === 'attendance_events') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  data: [
                    { id: 'att-1', date: '2026-10-01', status: 'VERIFIED', attendance_method: 'qr' },
                    { id: 'att-2', date: '2026-10-02', status: 'VERIFIED', attendance_method: 'otp' },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      }),
    }));
  });

  it('1. Allows a worker to retrieve their OWN contract with linked attendance summary', async () => {
    currentAuthUser = { id: worker1UserId, email: 'worker1@shramiksetu.local', role: 'WORKER' };

    const req = new NextRequest(`http://localhost:3000/api/contracts/${contractWorker1.id}`);
    const res = await getContractHandler(req, { params: { id: contractWorker1.id } });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.contract.id).toBe(contractWorker1.id);
    expect(data.contract.worker_id).toBe(worker1Id);
    expect(data.attendanceSummary.verifiedDaysCount).toBe(2);
    expect(data.attendanceSummary.totalEarnedPaise).toBe(2 * contractWorker1.daily_wage);
  });

  it('2. BLOCKS a worker from retrieving another worker contract (IDOR protection)', async () => {
    currentAuthUser = { id: worker1UserId, email: 'worker1@shramiksetu.local', role: 'WORKER' };

    // Worker 1 tries to fetch Worker 2's contract
    const req = new NextRequest(`http://localhost:3000/api/contracts/${contractWorker2.id}`);
    const res = await getContractHandler(req, { params: { id: contractWorker2.id } });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error.code).toBe('FORBIDDEN_CONTRACT_ACCESS');
    expect(data.error.message).toContain('Access denied');
  });

  it('3. Rejects requests from unauthenticated clients with 401 Unauthorized', async () => {
    currentAuthUser = null;

    const req = new NextRequest(`http://localhost:3000/api/contracts/${contractWorker1.id}`);
    const res = await getContractHandler(req, { params: { id: contractWorker1.id } });

    expect(res.status).toBe(401);
  });
});
