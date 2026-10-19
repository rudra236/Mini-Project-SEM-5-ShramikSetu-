import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateContractStatusTransition,
  respondToContract,
  cancelAssignment,
} from '@/lib/services/employment-service';
import { computeEarnings } from '@/lib/services/earnings-service';

// Mock DB and admin client
const mockContract = {
  id: 'ctr-test-uuid-001',
  contract_code: 'CTR-TEST-001',
  worker_id: 'wrk-test-uuid-001',
  contractor_id: 'ctr-user-uuid-001',
  project_id: 'prj-test-uuid-001',
  worksite_id: 'ws-test-uuid-001',
  work_type: 'Mason',
  daily_wage: 75000, // 750 rupees in paise
  expected_working_hours: 8,
  payment_frequency: 'DAILY',
  start_date: '2026-10-08',
  status: 'PENDING',
  current_version_number: 1,
  responded_at: null,
  rejection_reason: null,
};

const mockWorker = {
  id: 'wrk-test-uuid-001',
  user_id: 'user-worker-uuid-001',
  full_name: 'Ganesh Shinde',
};

const mockContractor = {
  id: 'ctr-user-uuid-001',
  user_id: 'user-contractor-uuid-001',
  company_name: 'Metro Infra Build',
};

const mockProject = {
  id: 'prj-test-uuid-001',
  name: 'Pune Metro Line 3',
  contractor_id: 'ctr-user-uuid-001',
};

describe('Worker Assignment Acceptance Lifecycle Feature', () => {
  describe('1. State Machine Transitions', () => {
    it('allows transition PENDING -> ACCEPTED', () => {
      expect(() => validateContractStatusTransition('PENDING', 'ACCEPTED')).not.toThrow();
    });

    it('allows transition PENDING -> REJECTED', () => {
      expect(() => validateContractStatusTransition('PENDING', 'REJECTED')).not.toThrow();
    });

    it('allows transition PENDING -> CANCELLED', () => {
      expect(() => validateContractStatusTransition('PENDING', 'CANCELLED')).not.toThrow();
    });

    it('allows transition ACCEPTED -> ACTIVE and ACCEPTED -> COMPLETED', () => {
      expect(() => validateContractStatusTransition('ACCEPTED', 'ACTIVE')).not.toThrow();
      expect(() => validateContractStatusTransition('ACCEPTED', 'COMPLETED')).not.toThrow();
    });

    it('rejects illegal transition from REJECTED to ACCEPTED directly', () => {
      expect(() => validateContractStatusTransition('REJECTED', 'ACCEPTED')).toThrow();
    });

    it('rejects illegal transition from CANCELLED to ACCEPTED directly', () => {
      expect(() => validateContractStatusTransition('CANCELLED', 'ACCEPTED')).toThrow();
    });
  });

  describe('2. Server-side Enforcement: Pending Contract cannot accrue earnings', () => {
    it('throws CONTRACT_NOT_ACTIVE when computing earnings for a PENDING contract', async () => {
      vi.mock('@/lib/supabase/admin', () => ({
        createAdminClient: () => ({
          from: (table: string) => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { ...mockContract, status: 'PENDING' },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }));

      await expect(
        computeEarnings({
          contractId: 'ctr-test-uuid-001',
          periodStart: '2026-10-01',
          periodEnd: '2026-10-08',
        })
      ).rejects.toThrow(/Cannot compute earnings: contract status is 'PENDING'/);
    });
  });
});
