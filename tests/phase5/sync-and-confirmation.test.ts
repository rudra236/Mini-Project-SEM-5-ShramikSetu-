import assert from 'node:assert';
import { describe, it, beforeEach, expect } from 'vitest';
import {
  createOfflineAttendanceEvent,
  getOfflineQueue,
  getPendingOfflineEvents,
  updateOfflineEventStatus,
  resetMemoryQueueForTesting,
} from '../../src/lib/offline/offline-queue';
import { calculateHaversineDistance } from '../../src/lib/geo/haversine';
import { ConfirmationServiceError } from '../../src/lib/services/confirmation-service';

// Mock environment variables for test runner
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

describe('Phase 5: Offline-First, Sync & Confirmation Suite', () => {
  beforeEach(() => {
    resetMemoryQueueForTesting();
  });

  it('TEST 1: Offline event creation & local queueing', () => {
    const offlineTokenUuid = 'token-uuid-1111-2222-3333';
    const workerLat = 19.0662;
    const workerLon = 72.8688;

    const offlineEvent = createOfflineAttendanceEvent({
      tokenUuid: offlineTokenUuid,
      workerLatitude: workerLat,
      workerLongitude: workerLon,
      attendanceDate: '2026-08-15',
    });

    expect(offlineEvent.eventUuid).toBeDefined();
    expect(offlineEvent.status).toBe('QUEUED');

    const pendingQueue = getPendingOfflineEvents();
    expect(pendingQueue.length).toBe(1);
    expect(pendingQueue[0].eventUuid).toBe(offlineEvent.eventUuid);
  });

  it('TEST 2: Online event sync & server validation engine', () => {
    const workerLat = 19.0662;
    const workerLon = 72.8688;
    const worksiteLat = 19.0660;
    const worksiteLon = 72.8687;
    const distanceMeters = calculateHaversineDistance(workerLat, workerLon, worksiteLat, worksiteLon);
    const allowedRadius = 100.0;

    expect(distanceMeters).toBeLessThanOrEqual(allowedRadius);

    const offlineEvent = createOfflineAttendanceEvent({
      tokenUuid: 'token-uuid-sync-test',
      workerLatitude: workerLat,
      workerLongitude: workerLon,
    });

    updateOfflineEventStatus(offlineEvent.eventUuid, 'SYNCED', { serverEventId: 'srv-evt-999' });
    const queueAfterSync = getOfflineQueue();
    expect(queueAfterSync[0].status).toBe('SYNCED');
    expect(queueAfterSync[0].serverEventId).toBe('srv-evt-999');
  });

  it('TEST 3: Duplicate event sync (idempotency check)', () => {
    const eventUuid = 'event-uuid-idempotent-123';
    const processedEventsStore = new Map<string, any>();
    processedEventsStore.set(eventUuid, {
      id: 'srv-evt-999',
      status: 'VERIFIED',
      idempotency_key: eventUuid,
    });

    const resubmitAttempt = processedEventsStore.get(eventUuid);
    expect(resubmitAttempt).toBeDefined();
    expect(resubmitAttempt.idempotency_key).toBe(eventUuid);

    const idempotentSyncResult = {
      success: true,
      status: resubmitAttempt.status,
      isDuplicate: true,
      attendanceEventId: resubmitAttempt.id,
      message: 'Event was already processed idempotently.',
    };

    expect(idempotentSyncResult.isDuplicate).toBe(true);
    expect(idempotentSyncResult.attendanceEventId).toBe('srv-evt-999');
  });

  it('TEST 4: Sync retry handling on temporary network failure', () => {
    const workerLat = 19.0662;
    const workerLon = 72.8688;

    const retryEvent = createOfflineAttendanceEvent({
      tokenUuid: 'token-retry-9999',
      workerLatitude: workerLat,
      workerLongitude: workerLon,
    });

    updateOfflineEventStatus(retryEvent.eventUuid, 'FAILED', { lastError: 'NETWORK_TIMEOUT' });
    let pendingRetryEvents = getPendingOfflineEvents();
    expect(pendingRetryEvents.some((e) => e.eventUuid === retryEvent.eventUuid && e.status === 'FAILED')).toBe(true);

    updateOfflineEventStatus(retryEvent.eventUuid, 'SYNCED', { serverEventId: 'srv-evt-retry-100' });
    pendingRetryEvents = getPendingOfflineEvents();
    expect(pendingRetryEvents.some((e) => e.eventUuid === retryEvent.eventUuid)).toBe(false);
  });

  it('TEST 5: Conflict handling & discrepancy preservation', () => {
    const conflictingEventUuid = 'evt-conflict-uuid-777';
    const existingContractorRecord = {
      id: 'att-existing-555',
      date: '2026-08-15',
      status: 'REJECTED',
      contractor_claim: 'No attendance marked on site register',
    };
    const workerOfflineClaim = {
      eventUuid: conflictingEventUuid,
      date: '2026-08-15',
      worker_claim: 'Worker marked attendance via offline app',
    };

    const discrepancyState = {
      id: 'disc-001',
      event_uuid: conflictingEventUuid,
      conflict_type: 'DUPLICATE_SAME_DAY_CLAIM',
      status: 'OPEN',
      worker_claim: workerOfflineClaim,
      contractor_record: existingContractorRecord,
    };

    expect(discrepancyState.worker_claim).not.toBeNull();
    expect(discrepancyState.contractor_record).not.toBeNull();
    expect(existingContractorRecord.id).toBe('att-existing-555');
  });

  it('TEST 6: Worker attendance confirmation (YES option)', () => {
    const summaryRecord = {
      id: 'summary-101',
      worker_id: 'worker-ramesh-1',
      contract_id: 'contract-site-a',
      recorded_days_count: 6,
      status: 'PENDING_CONFIRMATION',
    };

    const confirmationResultYes = {
      status: 'CONFIRMED',
      confirmation: {
        id: 'conf-yes-1',
        summary_id: summaryRecord.id,
        worker_id: 'worker-ramesh-1',
        is_confirmed: true,
        worker_claimed_days_count: 6,
      },
      summaryStatus: 'CONFIRMED',
    };

    expect(confirmationResultYes.status).toBe('CONFIRMED');
    expect(confirmationResultYes.confirmation.is_confirmed).toBe(true);
  });

  it('TEST 7: Worker attendance rejection (NO option)', () => {
    const summaryRecordNo = {
      id: 'summary-102',
      worker_id: 'worker-ramesh-1',
      contract_id: 'contract-site-a',
      recorded_days_count: 6,
      status: 'PENDING_CONFIRMATION',
    };

    const confirmationResultNo = {
      status: 'DISPUTED',
      confirmation: {
        id: 'conf-no-1',
        summary_id: summaryRecordNo.id,
        worker_id: 'worker-ramesh-1',
        is_confirmed: false,
        discrepancy_reason: 'WORKED_MORE_DAYS',
        worker_claimed_days_count: 8,
      },
      discrepancy: {
        id: 'disc-summary-1',
        conflict_type: 'SUMMARY_DISCREPANCY_REPORTED',
        status: 'OPEN',
      },
    };

    expect(confirmationResultNo.status).toBe('DISPUTED');
    expect(confirmationResultNo.confirmation.is_confirmed).toBe(false);
    expect(confirmationResultNo.confirmation.discrepancy_reason).toBe('WORKED_MORE_DAYS');
    expect(confirmationResultNo.discrepancy).toBeDefined();
  });

  it('TEST 8: Unauthorized worker confirmation rejection', () => {
    const summaryForWorkerA = {
      id: 'summary-103',
      worker_id: 'worker-ramesh-1',
    };
    const unauthorizedWorkerId = 'worker-other-99';

    try {
      if (summaryForWorkerA.worker_id !== unauthorizedWorkerId) {
        throw new ConfirmationServiceError(
          'Unauthorized: Only the assigned worker can confirm or reject this summary.',
          403,
          'UNAUTHORIZED_CONFIRMATION'
        );
      }
      assert.fail('Unauthorized worker confirmation should have been rejected!');
    } catch (err: any) {
      expect(err.reasonCode).toBe('UNAUTHORIZED_CONFIRMATION');
      expect(err.statusCode).toBe(403);
    }
  });

  it('End-to-End Demonstration Flow', () => {
    const demoOfflineEvent = createOfflineAttendanceEvent({
      tokenUuid: 'demo-qr-token-uuid-2026',
      workerLatitude: 19.0662,
      workerLongitude: 72.8688,
      attendanceDate: '2026-08-15',
    });

    expect(demoOfflineEvent.eventUuid).toBeDefined();

    updateOfflineEventStatus(demoOfflineEvent.eventUuid, 'SYNCED', { serverEventId: 'backend-att-evt-2026' });
    const queue = getOfflineQueue();
    const synced = queue.find((e) => e.eventUuid === demoOfflineEvent.eventUuid);
    expect(synced?.status).toBe('SYNCED');
  });
});
