/**
 * SHRAMIKSETU PHASE 8 — DISPUTES, AUTOMATIC EVIDENCE & TAMPER-EVIDENT AUDIT TRAIL
 *
 * Comprehensive test suite verifying:
 *  1. Attendance dispute creation & automatic evidence collection
 *  2. Payment dispute creation & evidence snapshot
 *  3. Automatic evidence collection across all domain tables
 *  4. Server-side automatic dispute analysis (PAYMENT_DISCREPANCY)
 *  5. Server-side automatic dispute analysis (NO_DISCREPANCY_DETECTED)
 *  6. Authorized dispute resolution by reviewer
 *  7. Unauthorized resolution rejection (RBAC guard)
 *  8. Cryptographic audit trail SHA-256 hash chain verification & tamper detection
 *
 * Run: npx tsx tests/phase8/dispute-audit.test.ts
 */

import assert from 'node:assert';
import { describe, it, beforeEach } from 'vitest';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import type { DisputeRow, DisputeEvidenceSnapshotRow, DisputeResolutionRow, AuditEventRow } from '../../src/types/database.types';

// Set mock env vars
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

// ─── In-Memory Data Store for Testing ────────────────────────────────────────

const mockContracts: any[] = [];
const mockContractVersions: any[] = [];
const mockContractAcceptances: any[] = [];
const mockAttendanceEvents: any[] = [];
const mockWorkerConfirmations: any[] = [];
const mockEarningsSnapshots: any[] = [];
const mockPaymentTransactions: any[] = [];
const mockPaymentConfirmations: any[] = [];
const mockDisputes: DisputeRow[] = [];
const mockEvidenceSnapshots: DisputeEvidenceSnapshotRow[] = [];
const mockDisputeResolutions: DisputeResolutionRow[] = [];
const mockAuditEvents: AuditEventRow[] = [];

// Register in-memory factory for DB queries
setMockAdminClientFactory(() => {
  return {
    from: (table: string) => {
      let data: any[] = [];
      if (table === 'work_contracts') data = mockContracts;
      else if (table === 'contract_versions') data = mockContractVersions;
      else if (table === 'contract_acceptances') data = mockContractAcceptances;
      else if (table === 'attendance_events') data = mockAttendanceEvents;
      else if (table === 'worker_confirmations') data = mockWorkerConfirmations;
      else if (table === 'earnings_snapshots') data = mockEarningsSnapshots;
      else if (table === 'payment_transactions') data = mockPaymentTransactions;
      else if (table === 'payment_confirmations') data = mockPaymentConfirmations;
      else if (table === 'disputes') data = mockDisputes;
      else if (table === 'dispute_evidence_snapshots') data = mockEvidenceSnapshots;
      else if (table === 'dispute_resolutions') data = mockDisputeResolutions;
      else if (table === 'audit_events') data = mockAuditEvents;

      let filtered = [...data];

      const builder: any = {
        select: (fields?: string, opts?: any) => {
          if (opts?.count === 'exact') {
            builder._isCount = true;
          }
          return builder;
        },
        eq: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] === value);
          return builder;
        },
        in: (field: string, values: any[]) => {
          filtered = filtered.filter((row) => values.includes(row[field]));
          return builder;
        },
        gte: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] >= value);
          return builder;
        },
        lte: (field: string, value: any) => {
          filtered = filtered.filter((row) => row[field] <= value);
          return builder;
        },
        order: (field: string, opts?: any) => {
          const asc = opts?.ascending !== false;
          filtered.sort((a, b) => {
            if (a[field] < b[field]) return asc ? -1 : 1;
            if (a[field] > b[field]) return asc ? 1 : -1;
            return 0;
          });
          return builder;
        },
        maybeSingle: async () => {
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          if (filtered.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: filtered[0], error: null };
        },
        insert: (item: any) => {
          const seq = table === 'audit_events' ? (item.sequence_number || data.length + 1) : undefined;
          const inserted = { id: item.id || `id-${Math.random()}`, ...(seq ? { sequence_number: seq } : {}), ...item };
          data.push(inserted);
          return {
            data: inserted,
            error: null,
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
              maybeSingle: async () => ({ data: inserted, error: null }),
              then: (resolve: Function) => resolve({ data: [inserted], error: null }),
            }),
            single: async () => ({ data: inserted, error: null }),
            maybeSingle: async () => ({ data: inserted, error: null }),
            then: (resolve: Function) => resolve({ data: inserted, error: null }),
          };
        },
        update: (updates: any) => {
          const updatedRows = filtered.map((row) => Object.assign(row, updates));
          return {
            eq: (field: string, value: any) => {
              filtered.forEach((row) => {
                if (row[field] === value) Object.assign(row, updates);
              });
              return {
                select: () => ({
                  single: async () => ({ data: filtered[0] || null, error: null })
                }),
                then: (resolve: Function) => resolve({ data: filtered, error: null })
              };
            }
          };
        },
        then: (resolve: Function) => {
          if (builder._isCount) {
            resolve({ count: filtered.length, data: null, error: null });
          } else {
            resolve({ data: filtered, count: filtered.length, error: null });
          }
        }
      };

      return builder;
    }
  };
});

// Import services after setting mock factory
import { createDispute, resolveDispute, getDisputeDetails, DisputeServiceError } from '../../src/lib/services/dispute-service';
import { recordAuditEvent, verifyAuditTrailIntegrity, computeAuditEventHash } from '../../src/lib/services/audit-service';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function clearMockStore() {
  mockContracts.length = 0;
  mockContractVersions.length = 0;
  mockContractAcceptances.length = 0;
  mockAttendanceEvents.length = 0;
  mockWorkerConfirmations.length = 0;
  mockEarningsSnapshots.length = 0;
  mockPaymentTransactions.length = 0;
  mockPaymentConfirmations.length = 0;
  mockDisputes.length = 0;
  mockEvidenceSnapshots.length = 0;
  mockDisputeResolutions.length = 0;
  mockAuditEvents.length = 0;
}

// ─── Main Test Runner ─────────────────────────────────────────────────────────

// ─── Main Test Runner ─────────────────────────────────────────────────────────

describe('Phase 8 Dispute & Audit Trail Suite', () => {
  beforeEach(() => {
    clearMockStore();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Attendance Dispute Raising & Automatic Evidence Snapshot
  // ─────────────────────────────────────────────────────────────────────────────
  it('Attendance dispute raising captures evidence snapshot & creates dispute', async () => {
    mockContracts.push({
      id: 'c-att-1',
      worker_id: 'worker-1',
      contractor_id: 'contractor-1',
      project_id: 'project-1',
      daily_wage: 700,
      status: 'ACTIVE',
    });

    mockAttendanceEvents.push(
      { id: 'att-1', contract_id: 'c-att-1', status: 'REJECTED', date: '2026-08-20' },
      { id: 'att-2', contract_id: 'c-att-1', status: 'VERIFIED', date: '2026-08-21' }
    );

    const result = await createDispute({
      workerId: 'worker-1',
      contractorId: 'contractor-1',
      projectId: 'project-1',
      contractId: 'c-att-1',
      category: 'ATTENDANCE',
      description: 'Supervisor rejected my attendance on 2026-08-20 despite me being present at worksite.',
      priority: 'HIGH',
      raisedByUserId: 'user-worker-1',
    });

    assert(result.dispute.id);
    assert.strictEqual(result.dispute.category, 'ATTENDANCE');
    assert.strictEqual(result.dispute.status, 'OPEN');
    assert.strictEqual(result.dispute.priority, 'HIGH');
    assert(result.dispute.dispute_ref.startsWith('DSP-'));

    // Check Evidence Snapshot
    assert.strictEqual(result.evidenceSnapshot.dispute_id, result.dispute.id);
    const attendanceSnap = result.evidenceSnapshot.attendance_snapshot as any[];
    assert.strictEqual(attendanceSnap.length, 2);

    // Audit Event created
    assert.strictEqual(mockAuditEvents.length, 1);
    assert.strictEqual(mockAuditEvents[0].action, 'dispute_created');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Payment Dispute Raising & Evidence Collection
  // ─────────────────────────────────────────────────────────────────────────────
  it('Payment dispute captures payment transactions and confirmations snapshot', async () => {
    mockContracts.push({
      id: 'c-pay-1',
      worker_id: 'worker-2',
      contractor_id: 'contractor-1',
      project_id: 'project-1',
      daily_wage: 700,
      status: 'ACTIVE',
    });

    mockPaymentTransactions.push({
      id: 'tx-1',
      contract_id: 'c-pay-1',
      amount_paise: 200000, // ₹2000
      status: 'SUCCESS',
    });

    mockPaymentConfirmations.push({
      id: 'conf-1',
      transaction_id: 'tx-1',
      is_confirmed: false,
      dispute_reason: 'I only received ₹1500 in cash, not ₹2000.',
    });

    const result = await createDispute({
      workerId: 'worker-2',
      contractorId: 'contractor-1',
      projectId: 'project-1',
      contractId: 'c-pay-1',
      category: 'PAYMENT',
      description: 'Cash payment reported by contractor differs from actual cash received.',
      raisedByUserId: 'user-worker-2',
    });

    assert.strictEqual(result.dispute.category, 'PAYMENT');
    const payTxSnap = result.evidenceSnapshot.payment_transactions_snapshot as any[];
    const payConfSnap = result.evidenceSnapshot.payment_confirmations_snapshot as any[];

    assert.strictEqual(payTxSnap.length, 1);
    assert.strictEqual(payConfSnap.length, 1);
    assert.strictEqual(payConfSnap[0].is_confirmed, false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Automatic Evidence Collection across all domain tables
  // ─────────────────────────────────────────────────────────────────────────────
  it('Automatic evidence collection gathers full 360-degree contract context', async () => {
    mockContracts.push({ id: 'c-360', worker_id: 'w-1', contractor_id: 'ctr-1', project_id: 'p-1', daily_wage: 800 });
    mockContractVersions.push({ id: 'cv-1', contract_id: 'c-360', version_no: 1 });
    mockContractAcceptances.push({ id: 'ca-1', contract_id: 'c-360', status: 'ACCEPTED' });
    mockAttendanceEvents.push({ id: 'att-1', contract_id: 'c-360', status: 'VERIFIED' });
    mockEarningsSnapshots.push({ id: 'es-1', contract_id: 'c-360', total_earned_paise: 80000 });
    mockPaymentTransactions.push({ id: 'pt-1', contract_id: 'c-360', amount_paise: 80000, status: 'SUCCESS' });

    const result = await createDispute({
      workerId: 'w-1',
      contractorId: 'ctr-1',
      projectId: 'p-1',
      contractId: 'c-360',
      category: 'WAGE',
      description: 'Wage rate issue',
      raisedByUserId: 'u-1',
    });

    const snap = result.evidenceSnapshot;
    assert.strictEqual((snap.contract_versions_snapshot as any[]).length, 1);
    assert.strictEqual((snap.worker_acceptance_snapshot as any).status, 'ACCEPTED');
    assert.strictEqual((snap.attendance_snapshot as any[]).length, 1);
    assert.strictEqual((snap.earnings_snapshot as any).total_earned_paise, 80000);
    assert.strictEqual((snap.payment_transactions_snapshot as any[]).length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Backend Automatic Dispute Analysis — PAYMENT_DISCREPANCY
  // ─────────────────────────────────────────────────────────────────────────────
  it('Server-side automatic dispute analysis detects PAYMENT_DISCREPANCY (10 days × ₹700 = ₹7000 vs ₹5600 paid)', async () => {
    mockContracts.push({ id: 'c-disc-1', worker_id: 'w-1', contractor_id: 'ctr-1', project_id: 'p-1', daily_wage: 700 });

    // 10 verified days = ₹7,000 expected
    for (let i = 1; i <= 10; i++) {
      mockAttendanceEvents.push({ id: `att-${i}`, contract_id: 'c-disc-1', status: 'VERIFIED' });
    }

    // Payments: ₹2,000 + ₹1,500 + ₹2,100 = ₹5,600 paid
    mockPaymentTransactions.push(
      { id: 'tx-1', contract_id: 'c-disc-1', amount_paise: 200000, status: 'SUCCESS' },
      { id: 'tx-2', contract_id: 'c-disc-1', amount_paise: 150000, status: 'SUCCESS' },
      { id: 'tx-3', contract_id: 'c-disc-1', amount_paise: 210000, status: 'SUCCESS' }
    );

    const result = await createDispute({
      workerId: 'w-1',
      contractorId: 'ctr-1',
      projectId: 'p-1',
      contractId: 'c-disc-1',
      category: 'PARTIAL_PAYMENT',
      description: 'Outstanding balance not paid.',
      raisedByUserId: 'u-1',
    });

    const analysis = result.automatedAnalysis;
    assert.strictEqual(analysis.discrepancyType, 'PAYMENT_DISCREPANCY');
    assert.strictEqual(analysis.hasDiscrepancy, true);
    assert.strictEqual(analysis.verifiedAttendanceDaysCount, 10);
    assert.strictEqual(analysis.totalEarnedPaise, 700000);  // ₹7,000
    assert.strictEqual(analysis.totalPaidPaise, 560000);    // ₹5,600
    assert.strictEqual(analysis.outstandingPaise, 140000);  // ₹1,400
    assert.strictEqual(analysis.outstandingRupees, 1400);

    assert(analysis.analysisSummary.includes('PAYMENT DISCREPANCY DETECTED'));
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Backend Automatic Dispute Analysis — NO_DISCREPANCY_DETECTED
  // ─────────────────────────────────────────────────────────────────────────────
  it('Server-side automatic dispute analysis identifies NO_DISCREPANCY_DETECTED when paid matches earned', async () => {
    mockContracts.push({ id: 'c-clean-1', worker_id: 'w-1', contractor_id: 'ctr-1', project_id: 'p-1', daily_wage: 600 });

    // 5 verified days = ₹3,000 expected
    for (let i = 1; i <= 5; i++) {
      mockAttendanceEvents.push({ id: `att-cl-${i}`, contract_id: 'c-clean-1', status: 'VERIFIED' });
    }

    // Payment ₹3,000 paid
    mockPaymentTransactions.push({ id: 'tx-cl-1', contract_id: 'c-clean-1', amount_paise: 300000, status: 'SUCCESS' });

    const result = await createDispute({
      workerId: 'w-1',
      contractorId: 'ctr-1',
      projectId: 'p-1',
      contractId: 'c-clean-1',
      category: 'MISSING_PAYMENT',
      description: 'Worker thought payment was missing',
      raisedByUserId: 'u-1',
    });

    const analysis = result.automatedAnalysis;
    assert.strictEqual(analysis.discrepancyType, 'NO_DISCREPANCY_DETECTED');
    assert.strictEqual(analysis.hasDiscrepancy, false);
    assert.strictEqual(analysis.outstandingPaise, 0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Authorized Dispute Resolution
  // ─────────────────────────────────────────────────────────────────────────────
  it('Authorized reviewer resolves dispute preserving immutable evidence snapshot', async () => {
    mockContracts.push({ id: 'c-res-1', worker_id: 'w-1', contractor_id: 'ctr-1', project_id: 'p-1', daily_wage: 500 });

    const createRes = await createDispute({
      workerId: 'w-1',
      contractorId: 'ctr-1',
      projectId: 'p-1',
      contractId: 'c-res-1',
      category: 'WAGE',
      description: 'Wage claim',
      raisedByUserId: 'u-1',
    });

    const disputeId = createRes.dispute.id;

    // Authorized resolution by LABOUR_ORGANIZATION reviewer
    const resolveRes = await resolveDispute({
      disputeId,
      decision: 'RESOLVED',
      reason: 'Contractor agreed to pay back-wages.',
      resolutionNotes: 'Payment scheduled for next payroll cycle.',
      reviewerUserId: 'user-inspector-1',
      reviewerRole: 'LABOUR_ORGANIZATION',
    });

    assert.strictEqual(resolveRes.dispute.status, 'RESOLVED');
    assert.strictEqual(resolveRes.resolution.decision, 'RESOLVED');
    assert.strictEqual(resolveRes.resolution.reason, 'Contractor agreed to pay back-wages.');

    // Fetch dispute details and verify evidence snapshot remains intact
    const details = await getDisputeDetails(disputeId);
    assert.strictEqual(details.dispute.status, 'RESOLVED');
    assert(details.evidenceSnapshot);
    assert.strictEqual(details.resolutions.length, 1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 7: Unauthorized Resolution Rejection (RBAC Guard)
  // ─────────────────────────────────────────────────────────────────────────────
  it('Unauthorized user role (WORKER/CONTRACTOR) is blocked from resolving dispute', async () => {
    mockContracts.push({ id: 'c-unauth-1', worker_id: 'w-1', contractor_id: 'ctr-1', project_id: 'p-1', daily_wage: 500 });

    const createRes = await createDispute({
      workerId: 'w-1',
      contractorId: 'ctr-1',
      projectId: 'p-1',
      contractId: 'c-unauth-1',
      category: 'WAGE',
      description: 'Wage claim',
      raisedByUserId: 'u-1',
    });

    try {
      await resolveDispute({
        disputeId: createRes.dispute.id,
        decision: 'RESOLVED',
        reason: 'Attempted resolution',
        reviewerUserId: 'user-worker-1',
        reviewerRole: 'WORKER', // Non-reviewer role!
      });
      assert.fail('Should have thrown DisputeServiceError for unauthorized reviewer role');
    } catch (err: any) {
      assert(err instanceof DisputeServiceError);
      assert.strictEqual(err.statusCode, 403);
      assert.strictEqual(err.reasonCode, 'UNAUTHORIZED_REVIEWER');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 8: Cryptographic Audit Hash Chain Integrity & Tamper Detection
  // ─────────────────────────────────────────────────────────────────────────────
  it('Tamper-Evident Audit Trail verifies SHA-256 hash chaining and detects data tampering', async () => {
    // 1. Record 3 valid audit events in sequence
    const event1 = await recordAuditEvent({
      actorId: 'actor-1',
      action: 'contract_created',
      entityType: 'work_contracts',
      entityId: 'c-100',
      payload: { wage: 700 },
      timestamp: '2026-08-22T10:00:00.000Z',
    });

    const event2 = await recordAuditEvent({
      actorId: 'actor-2',
      action: 'attendance_recorded',
      entityType: 'attendance_events',
      entityId: 'att-100',
      payload: { status: 'VERIFIED' },
      timestamp: '2026-08-22T11:00:00.000Z',
    });

    const event3 = await recordAuditEvent({
      actorId: 'actor-1',
      action: 'payment_created',
      entityType: 'payment_transactions',
      entityId: 'tx-100',
      payload: { amount_paise: 70000 },
      timestamp: '2026-08-22T12:00:00.000Z',
    });

    // Verify initial unbroken chain
    const initialCheck = await verifyAuditTrailIntegrity();
    assert.strictEqual(initialCheck.isValid, true);
    assert.strictEqual(initialCheck.totalEventsCount, 3);
    assert.strictEqual(initialCheck.tamperedEventsCount, 0);

    // 2. Simulate malicious tampering: Modify payload of event 2 directly in memory
    mockAuditEvents[1].payload = { status: 'REJECTED' }; // Tampered!

    // Verify integrity check now detects tampering!
    const tamperedCheck = await verifyAuditTrailIntegrity();
    assert.strictEqual(tamperedCheck.isValid, false);
    assert(tamperedCheck.tamperedEventsCount > 0);
    assert.strictEqual(tamperedCheck.details[1].currentHashValid, false);
  });
});

