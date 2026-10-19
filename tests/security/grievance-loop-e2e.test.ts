/**
 * SHRAMIKSETU STATUTORY GRIEVANCE LOOP END-TO-END TEST SUITE
 *
 * Verifies:
 * 1. Worker raises dispute with type, claimed amount in paise, voice note & transcription, photo,
 *    and auto-attached attendance & ledger rows.
 * 2. Contractor gets notified and submits counter-statement during 5-day response window;
 *    dispute transitions from OPEN to UNDER_REVIEW.
 * 3. Single Source of Truth Invariant:
 *    The compliance ledger's "Review Open Disputes (N)" count MUST come from the exact same
 *    query as the arbitration roster across all states.
 * 4. Inspector arbitration desk ruling actions:
 *    - DISMISS
 *    - ORDER_PAYMENT: creates reversing double-entry row in ledger_entries with hash chain and sets deadline
 *    - PARTIAL_SETTLEMENT: creates partial reversing ledger entry and sets deadline
 * 5. Missed deadline monitoring:
 *    An unpaid order past deadline automatically flags contractor as NON_COMPLIANT.
 * 6. Audit Trail Invariant:
 *    Every state change writes to public.audit_log with (actor, action, before, after, timestamp).
 */

import assert from 'node:assert';
import { describe, it, beforeEach } from 'vitest';
import { setMockAdminClientFactory } from '../../src/lib/supabase/admin';
import {
  createDispute,
  submitContractorCounterStatement,
  issueInspectorRuling,
  checkAndFlagMissedDisputeDeadlines,
  getOpenDisputesCount,
} from '../../src/lib/services/dispute-service';
import { InstitutionalAnalyticsService } from '../../src/lib/services/institutional-analytics-service';
import { verifyLedgerInvariants } from '../../src/lib/services/ledger-service';
import { getAuditLogs } from '../../src/lib/services/audit-service';

// Mock in-memory tables
let mockUsers: any[] = [];
let mockWorkers: any[] = [];
let mockContractors: any[] = [];
let mockProjects: any[] = [];
let mockContracts: any[] = [];
let mockAttendanceEvents: any[] = [];
let mockPaymentTransactions: any[] = [];
let mockDisputes: any[] = [];
let mockEvidenceSnapshots: any[] = [];
let mockDisputeResolutions: any[] = [];
let mockNotifications: any[] = [];
let mockAccounts: any[] = [];
let mockLedgerEntries: any[] = [];
let mockComplianceCheckLogs: any[] = [];
let mockAuditLog: any[] = [];
let mockAuditEvents: any[] = [];

// Wire in-memory Supabase Admin Client
setMockAdminClientFactory(() => {
  return {
    from: (table: string) => {
      let data: any[] = [];
      if (table === 'users') data = mockUsers;
      else if (table === 'workers') data = mockWorkers;
      else if (table === 'contractors') data = mockContractors;
      else if (table === 'projects') data = mockProjects;
      else if (table === 'work_contracts') data = mockContracts;
      else if (table === 'attendance_events') data = mockAttendanceEvents;
      else if (table === 'payment_transactions') data = mockPaymentTransactions;
      else if (table === 'disputes') data = mockDisputes;
      else if (table === 'dispute_evidence_snapshots') data = mockEvidenceSnapshots;
      else if (table === 'dispute_resolutions') data = mockDisputeResolutions;
      else if (table === 'notifications') data = mockNotifications;
      else if (table === 'accounts') data = mockAccounts;
      else if (table === 'ledger_entries') data = mockLedgerEntries;
      else if (table === 'compliance_check_logs') data = mockComplianceCheckLogs;
      else if (table === 'audit_log') data = mockAuditLog;
      else if (table === 'audit_events') data = mockAuditEvents;

      let filtered = [...data];
      let isCountHead = false;

      const builder: any = {
        select: (fields?: string, opts?: any) => {
          if (opts?.count === 'exact') {
            builder._isCount = true;
          }
          if (opts?.head) {
            isCountHead = true;
          }
          return builder;
        },
        eq: (field: string, value: any) => {
          filtered = filtered.filter((r) => r[field] === value);
          return builder;
        },
        in: (field: string, values: any[]) => {
          filtered = filtered.filter((r) => values.includes(r[field]));
          return builder;
        },
        lt: (field: string, value: any) => {
          filtered = filtered.filter((r) => r[field] < value);
          return builder;
        },
        gt: (field: string, value: any) => {
          filtered = filtered.filter((r) => r[field] > value);
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
        limit: (n: number) => {
          filtered = filtered.slice(0, n);
          return builder;
        },
        insert: (itemOrItems: any) => {
          const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
          const insertedItems = items.map((item, i) => {
            const seq = table === 'audit_events' ? (item.sequence_number || data.length + 1) : undefined;
            const row = {
              id: item.id || `id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
              ...(seq ? { sequence_number: seq } : {}),
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString(),
              ...item,
            };
            data.push(row);
            return row;
          });
          const inserted = insertedItems[0];
          return {
            data: Array.isArray(itemOrItems) ? insertedItems : inserted,
            error: null,
            select: () => ({
              single: async () => ({ data: inserted, error: null }),
              maybeSingle: async () => ({ data: inserted, error: null }),
              then: (resolve: any) => resolve({ data: insertedItems, error: null }),
            }),
            single: async () => ({ data: inserted, error: null }),
            maybeSingle: async () => ({ data: inserted, error: null }),
            then: (resolve: any) => resolve({ data: Array.isArray(itemOrItems) ? insertedItems : inserted, error: null }),
          };
        },
        update: (updates: any) => {
          return {
            eq: (field: string, value: any) => {
              for (const row of data) {
                if (row[field] === value) {
                  Object.assign(row, updates);
                }
              }
              const updatedRow = data.find((r) => r[field] === value);
              return {
                select: () => ({
                  single: async () => ({ data: updatedRow || null, error: null }),
                  maybeSingle: async () => ({ data: updatedRow || null, error: null }),
                  then: (resolve: any) => resolve({ data: updatedRow ? [updatedRow] : [], error: null }),
                }),
                single: async () => ({ data: updatedRow || null, error: null }),
                maybeSingle: async () => ({ data: updatedRow || null, error: null }),
                then: (resolve: any) => resolve({ data: updatedRow || null, error: null }),
              };
            },
          };
        },
        maybeSingle: async () => {
          return { data: filtered[0] || null, error: null };
        },
        single: async () => {
          if (filtered.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: filtered[0], error: null };
        },
        then: (resolve: any) => {
          resolve({
            data: isCountHead ? null : filtered,
            count: filtered.length,
            error: null,
          });
        },
      };

      return builder;
    },
  };
});

describe('Statutory Grievance Loop End-to-End', () => {
  const workerUserId = '11111111-1111-1111-1111-111111111111';
  const workerId = '22222222-2222-2222-2222-222222222222';
  const contractorUserId = '33333333-3333-3333-3333-333333333333';
  const contractorId = '44444444-4444-4444-4444-444444444444';
  const projectId = '55555555-5555-5555-5555-555555555555';
  const contractId = '66666666-6666-6666-6666-666666666666';
  const inspectorUserId = '77777777-7777-7777-7777-777777777777';

  beforeEach(() => {
    // Reset state
    mockUsers = [
      { id: workerUserId, role: 'WORKER', full_name: 'Ramesh Kumar' },
      { id: contractorUserId, role: 'CONTRACTOR', full_name: 'Suresh Builder' },
      { id: inspectorUserId, role: 'INSTITUTIONAL_USER', full_name: 'Inspector Jadhav' },
    ];
    mockWorkers = [
      { id: workerId, user_id: workerUserId, full_name: 'Ramesh Kumar', skill_category: 'SKILLED' },
    ];
    mockContractors = [
      {
        id: contractorId,
        user_id: contractorUserId,
        company_name: 'Suresh Builders Pvt Ltd',
        compliance_status: 'COMPLIANT',
      },
    ];
    mockProjects = [
      { id: projectId, contractor_id: contractorId, name: 'Metro Line 3 Station', status: 'ACTIVE' },
    ];
    mockContracts = [
      {
        id: contractId,
        worker_id: workerId,
        contractor_id: contractorId,
        project_id: projectId,
        daily_wage_paise: 85000,
        status: 'ACTIVE',
      },
    ];
    mockAttendanceEvents = [
      { id: 'att-1', contract_id: contractId, worker_id: workerId, status: 'VERIFIED' },
      { id: 'att-2', contract_id: contractId, worker_id: workerId, status: 'VERIFIED' },
      { id: 'att-3', contract_id: contractId, worker_id: workerId, status: 'VERIFIED' },
    ];
    mockPaymentTransactions = [
      { id: 'pay-1', contract_id: contractId, amount_paise: 85000, status: 'SUCCESS' },
    ];
    mockDisputes = [];
    mockEvidenceSnapshots = [];
    mockDisputeResolutions = [];
    mockNotifications = [];
    mockAccounts = [];
    mockLedgerEntries = [];
    mockComplianceCheckLogs = [];
    mockAuditLog = [];
    mockAuditEvents = [];
  });

  it('1. Worker raises dispute: amount claimed in paise, voice note & transcription, photo, and auto-attached attendance/ledger rows', async () => {
    const result = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'WAGE',
      description: 'Underpaid for 2 shifts; contractor withheld ₹1,800 without explanation.',
      amountClaimedPaise: 180000, // ₹1,800
      priority: 'HIGH',
      raisedByUserId: workerUserId,
      evidencePhotoUrl: 'https://storage.shramiksetu.in/evidence/site-photo-1.jpg',
      evidenceVoiceUrl: 'https://storage.shramiksetu.in/evidence/voice-note-1.webm',
      voiceTranscription: 'ठेकेदार ने 2 दिनों की हाजिरी काट ली और ₹1,800 नहीं दिए।',
    });

    const d = result.dispute;
    assert.strictEqual(d.status, 'OPEN');
    assert.strictEqual(d.amount_claimed_paise, 180000);
    assert.strictEqual(d.evidence_photo_url, 'https://storage.shramiksetu.in/evidence/site-photo-1.jpg');
    assert.strictEqual(d.evidence_voice_url, 'https://storage.shramiksetu.in/evidence/voice-note-1.webm');
    assert.strictEqual(d.voice_transcription, 'ठेकेदार ने 2 दिनों की हाजिरी काट ली और ₹1,800 नहीं दिए।');

    // Auto-attached records
    assert.strictEqual((d.linked_attendance_event_ids as any[]).length, 3);
    assert.strictEqual((d.linked_ledger_entry_ids as any[]).length, 1);

    // 5-day contractor response window
    assert(d.contractor_response_deadline);
    const deadlineTime = new Date(d.contractor_response_deadline).getTime();
    assert(deadlineTime > Date.now() + 4 * 24 * 60 * 60 * 1000);

    // Contractor notification sent
    assert.strictEqual(mockNotifications.length, 1);
    assert.strictEqual(mockNotifications[0].user_id, contractorUserId);
    assert.strictEqual(mockNotifications[0].type, 'CONTRACTOR_DISPUTE');

    // Audit log written
    const auditLogs = await getAuditLogs({ action: 'DISPUTE_RAISED' });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].actor, workerUserId);
    assert.strictEqual(auditLogs[0].before, null);
    assert.strictEqual((auditLogs[0].after as any).amount_claimed_paise, 180000);
  });

  it('2. Contractor gets notified and submits counter-statement during response window -> advances to UNDER_REVIEW', async () => {
    const { dispute } = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'WAGE',
      description: 'Contractor withheld ₹1,800.',
      amountClaimedPaise: 180000,
      raisedByUserId: workerUserId,
    });

    assert.strictEqual(dispute.status, 'OPEN');

    // Contractor submits counter-statement
    const updated = await submitContractorCounterStatement({
      disputeId: dispute.id,
      counterStatement: 'Worker left site early on 2nd shift without gate punch; cash advance of ₹500 already given.',
      evidenceUrl: 'https://storage.shramiksetu.in/evidence/gate-voucher-99.pdf',
      contractorUserId,
    });

    assert.strictEqual(updated.status, 'UNDER_REVIEW');
    assert.strictEqual(updated.contractor_counter_statement, 'Worker left site early on 2nd shift without gate punch; cash advance of ₹500 already given.');
    assert(updated.contractor_responded_at);

    // Audit log verifies transition
    const auditLogs = await getAuditLogs({ action: 'CONTRACTOR_COUNTER_STATEMENT_SUBMITTED' });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].actor, contractorUserId);
    assert.strictEqual((auditLogs[0].before as any).status, 'OPEN');
    assert.strictEqual((auditLogs[0].after as any).status, 'UNDER_REVIEW');
  });

  it('3. Invariant: Compliance ledger "Review Open Disputes (N)" count MUST match arbitration roster query exactly', async () => {
    // 0 open disputes initially
    let rosterCount = await getOpenDisputesCount();
    let ledgerMetrics = await InstitutionalAnalyticsService.getInstitutionalMetrics({});
    assert.strictEqual(rosterCount, 0);
    assert.strictEqual(ledgerMetrics.openDisputes, 0);

    // Create 3 disputes across different states
    const d1 = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'WAGE',
      description: 'Claim 1',
      amountClaimedPaise: 100000,
      raisedByUserId: workerUserId,
    });

    const d2 = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'ATTENDANCE',
      description: 'Claim 2',
      amountClaimedPaise: 85000,
      raisedByUserId: workerUserId,
    });

    const d3 = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'MISSING_PAYMENT',
      description: 'Claim 3',
      amountClaimedPaise: 170000,
      raisedByUserId: workerUserId,
    });

    // Advance d2 to UNDER_REVIEW
    await submitContractorCounterStatement({
      disputeId: d2.dispute.id,
      counterStatement: 'Reviewing biometrics',
      contractorUserId,
    });

    // Both queries must produce EXACT same count (3 open: 2 OPEN + 1 UNDER_REVIEW)
    rosterCount = await getOpenDisputesCount();
    ledgerMetrics = await InstitutionalAnalyticsService.getInstitutionalMetrics({});
    assert.strictEqual(rosterCount, 3);
    assert.strictEqual(ledgerMetrics.openDisputes, 3);
    assert.strictEqual(rosterCount, ledgerMetrics.openDisputes, 'Roster count must match compliance ledger count identically');

    // Resolve d1 -> count drops to 2 in both simultaneously
    await issueInspectorRuling({
      disputeId: d1.dispute.id,
      rulingDecision: 'ORDER_PAYMENT',
      reason: 'Contractor ordered to disburse shortfall.',
      orderedAmountPaise: 100000,
      reviewerUserId: inspectorUserId,
      reviewerRole: 'INSTITUTIONAL_USER',
    });

    rosterCount = await getOpenDisputesCount();
    ledgerMetrics = await InstitutionalAnalyticsService.getInstitutionalMetrics({});
    assert.strictEqual(rosterCount, 2);
    assert.strictEqual(ledgerMetrics.openDisputes, 2);
    assert.strictEqual(rosterCount, ledgerMetrics.openDisputes, 'Roster and Compliance Ledger must reconcile after resolution');
  });

  it('4. Inspector ruling actions: ORDER_PAYMENT creates reversing ledger entry with hash chain and sets deadline', async () => {
    const { dispute } = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'WAGE',
      description: 'Underpaid ₹1,800',
      amountClaimedPaise: 180000,
      raisedByUserId: workerUserId,
    });

    await submitContractorCounterStatement({
      disputeId: dispute.id,
      counterStatement: 'Worker claims shortfall',
      contractorUserId,
    });

    // Inspector orders payment of ₹1,800 with 48h deadline
    const rulingResult = await issueInspectorRuling({
      disputeId: dispute.id,
      rulingDecision: 'ORDER_PAYMENT',
      reason: 'Inspector audit verified 2 unpaid shifts. Employer ordered to pay ₹1,800 within 48 hours.',
      orderedAmountPaise: 180000,
      deadlineDays: 2,
      reviewerUserId: inspectorUserId,
      reviewerRole: 'INSTITUTIONAL_USER',
    });

    assert.strictEqual(rulingResult.dispute.status, 'RESOLVED');
    assert.strictEqual(rulingResult.dispute.ruling_decision, 'ORDER_PAYMENT');
    assert.strictEqual(rulingResult.dispute.ordered_amount_paise, 180000);
    assert(rulingResult.dispute.order_payment_deadline);

    // Ledger entry was created
    assert(rulingResult.ledgerEntry);
    assert.strictEqual(rulingResult.ledgerEntry.ref_type, 'DISPUTE_REVERSAL');
    assert.strictEqual(rulingResult.ledgerEntry.amount_paise, 180000);
    assert(rulingResult.ledgerEntry.hash);

    // Double-entry invariant holds: debits == credits
    const ledgerIntegrity = await verifyLedgerInvariants();
    assert.strictEqual(ledgerIntegrity.isBalanced, true, 'Ledger must remain strictly balanced after dispute reversal');
    assert.strictEqual(ledgerIntegrity.isChainValid, true, 'Ledger hash chain must be valid');

    // Audit log records ruling
    const auditLogs = await getAuditLogs({ action: 'INSPECTOR_RULING_ISSUED' });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].actor, inspectorUserId);
    assert.strictEqual((auditLogs[0].after as any).ruling_decision, 'ORDER_PAYMENT');
    assert.strictEqual((auditLogs[0].after as any).ordered_amount_paise, 180000);
  });

  it('5. Inspector ruling actions: DISMISS rejects claim without creating reversing ledger row', async () => {
    const { dispute } = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'WAGE',
      description: 'Fabricated claim',
      amountClaimedPaise: 50000,
      raisedByUserId: workerUserId,
    });

    const rulingResult = await issueInspectorRuling({
      disputeId: dispute.id,
      rulingDecision: 'DISMISS',
      reason: 'Biometric records show worker was not present on site.',
      reviewerUserId: inspectorUserId,
      reviewerRole: 'INSTITUTIONAL_USER',
    });

    assert.strictEqual(rulingResult.dispute.status, 'RESOLVED');
    assert.strictEqual(rulingResult.dispute.ruling_decision, 'DISMISS');
    assert.strictEqual(rulingResult.dispute.ordered_amount_paise, 0);
    assert.strictEqual(rulingResult.ledgerEntry, null);

    // No reversing entry added to ledger
    const reversalEntries = mockLedgerEntries.filter((l) => l.ref_type === 'DISPUTE_REVERSAL');
    assert.strictEqual(reversalEntries.length, 0);
  });

  it('6. Missed deadline flags contractor as NON_COMPLIANT in statutory registry', async () => {
    // Create a resolved dispute with an expired payment deadline
    const expiredDeadline = new Date(Date.now() - 3600 * 1000).toISOString(); // 1 hour ago
    const disputeId = 'dispute-overdue-1';

    mockDisputes.push({
      id: disputeId,
      dispute_ref: 'DSP-20260928-TEST',
      worker_id: workerId,
      contractor_id: contractorId,
      project_id: projectId,
      contract_id: contractId,
      status: 'RESOLVED',
      ruling_decision: 'ORDER_PAYMENT',
      ordered_amount_paise: 180000,
      order_payment_deadline: expiredDeadline,
      is_deadline_missed: false,
      is_settled: false,
    });

    assert.strictEqual(mockContractors[0].compliance_status, 'COMPLIANT');

    // Run statutory deadline checker
    const checkResult = await checkAndFlagMissedDisputeDeadlines();
    assert.strictEqual(checkResult.flaggedCount, 1);
    assert.strictEqual(checkResult.flaggedDisputeIds[0], disputeId);

    // Contractor is now marked NON_COMPLIANT
    const contractor = mockContractors.find((c) => c.id === contractorId);
    assert.strictEqual(contractor.compliance_status, 'NON_COMPLIANT');
    assert(contractor.non_compliance_reason.includes('deadline missed'));

    // Dispute marked with is_deadline_missed = true
    const updatedDispute = mockDisputes.find((d) => d.id === disputeId);
    assert.strictEqual(updatedDispute.is_deadline_missed, true);

    // Compliance log was recorded
    assert(mockComplianceCheckLogs.some((l) => l.result === 'NON_COMPLIANT' || l.result === 'POTENTIAL_NON_COMPLIANCE'));

    // Audit log records contractor flagging
    const auditLogs = await getAuditLogs({ action: 'CONTRACTOR_FLAGGED_NON_COMPLIANT' });
    assert.strictEqual(auditLogs.length, 1);
    assert.strictEqual(auditLogs[0].actor, 'SYSTEM_COMPLIANCE_MONITOR');
    assert.strictEqual((auditLogs[0].before as any).compliance_status, 'COMPLIANT');
    assert.strictEqual((auditLogs[0].after as any).compliance_status, 'NON_COMPLIANT');
  });

  it('7. Complete Grievance Redressal Audit Trail: all state transitions are documented', async () => {
    // 1. Worker raises
    const { dispute } = await createDispute({
      workerId,
      contractorId,
      projectId,
      contractId,
      category: 'WAGE',
      description: 'Statutory wage claim for unpaid muster.',
      amountClaimedPaise: 250000,
      raisedByUserId: workerUserId,
    });

    // 2. Contractor responds
    await submitContractorCounterStatement({
      disputeId: dispute.id,
      counterStatement: 'Contractor acknowledgment.',
      contractorUserId,
    });

    // 3. Inspector orders partial settlement
    await issueInspectorRuling({
      disputeId: dispute.id,
      rulingDecision: 'PARTIAL_SETTLEMENT',
      reason: 'Compromise settlement ordered after hearing.',
      orderedAmountPaise: 200000,
      deadlineDays: 3,
      reviewerUserId: inspectorUserId,
      reviewerRole: 'INSTITUTIONAL_USER',
    });

    // Verify all 3 state changes are recorded in audit_log
    const allLogs = await getAuditLogs();
    const disputeLogs = allLogs.filter((l) => (l.after as any)?.dispute_id === dispute.id || l.entity_id === dispute.id);

    assert(disputeLogs.length >= 3, 'Audit log must record every transition in dispute lifecycle');

    const actions = disputeLogs.map((l) => l.action);
    assert(actions.includes('DISPUTE_RAISED'), 'Audit log must contain DISPUTE_RAISED');
    assert(actions.includes('CONTRACTOR_COUNTER_STATEMENT_SUBMITTED'), 'Audit log must contain CONTRACTOR_COUNTER_STATEMENT_SUBMITTED');
    assert(actions.includes('INSPECTOR_RULING_ISSUED'), 'Audit log must contain INSPECTOR_RULING_ISSUED');

    for (const log of disputeLogs) {
      assert(log.actor, 'Every audit log entry must have an actor');
      assert(log.timestamp, 'Every audit log entry must have a timestamp');
      assert(log.action, 'Every audit log entry must have an action');
      assert(log.after, 'Every audit log entry must have an after state');
    }
  });
});
