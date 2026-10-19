// Standard offline queue module for ShramikSetu

export interface OfflineAttendanceEventPayload {
  eventUuid: string;
  tokenUuid: string;
  workerLatitude: number;
  workerLongitude: number;
  attendanceDate: string;
  timestamp: string;
  queuedAt: string;
  status: 'QUEUED' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'DISCREPANCY';
  lastError?: string;
  serverEventId?: string;
}

const STORAGE_KEY = 'shramiksetu_offline_attendance_queue';

// In-memory queue fallback for non-browser / SSR environment
let memoryQueue: OfflineAttendanceEventPayload[] = [];

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'offline-evt-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now();
}

/**
 * Creates an offline attendance event with a unique client-side UUID.
 */
export function createOfflineAttendanceEvent(params: {
  tokenUuid: string;
  workerLatitude: number;
  workerLongitude: number;
  attendanceDate?: string;
}): OfflineAttendanceEventPayload {
  const eventUuid = generateUuid();
  const now = new Date().toISOString();

  const event: OfflineAttendanceEventPayload = {
    eventUuid,
    tokenUuid: params.tokenUuid,
    workerLatitude: params.workerLatitude,
    workerLongitude: params.workerLongitude,
    attendanceDate: params.attendanceDate || now.split('T')[0],
    timestamp: now,
    queuedAt: now,
    status: 'QUEUED',
  };

  enqueueOfflineEvent(event);
  return event;
}

/**
 * Persists an offline attendance event to queue storage.
 */
export function enqueueOfflineEvent(event: OfflineAttendanceEventPayload): void {
  if (isBrowser()) {
    try {
      const current = getOfflineQueue();
      const existingIndex = current.findIndex((item) => item.eventUuid === event.eventUuid);
      if (existingIndex >= 0) {
        current[existingIndex] = event;
      } else {
        current.push(event);
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      return;
    } catch {
      // Fallback to memoryQueue on storage error
    }
  }

  const existingIndex = memoryQueue.findIndex((item) => item.eventUuid === event.eventUuid);
  if (existingIndex >= 0) {
    memoryQueue[existingIndex] = event;
  } else {
    memoryQueue.push(event);
  }
}

/**
 * Retrieves all events in the offline queue.
 */
export function getOfflineQueue(): OfflineAttendanceEventPayload[] {
  if (isBrowser()) {
    try {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data) as OfflineAttendanceEventPayload[];
      }
    } catch {
      // Fallback
    }
  }
  return [...memoryQueue];
}

/**
 * Retrieves pending (queued/failed) events ready for sync.
 */
export function getPendingOfflineEvents(): OfflineAttendanceEventPayload[] {
  const queue = getOfflineQueue();
  return queue.filter((item) => item.status === 'QUEUED' || item.status === 'FAILED');
}

/**
 * Updates status of a queued offline event.
 */
export function updateOfflineEventStatus(
  eventUuid: string,
  status: OfflineAttendanceEventPayload['status'],
  extra?: { serverEventId?: string; lastError?: string }
): void {
  const queue = getOfflineQueue();
  const target = queue.find((item) => item.eventUuid === eventUuid);
  if (target) {
    target.status = status;
    if (extra?.serverEventId) target.serverEventId = extra.serverEventId;
    if (extra?.lastError) target.lastError = extra.lastError;
    enqueueOfflineEvent(target);
  }
}

/**
 * Clears synced events from the queue storage.
 */
export function clearSyncedOfflineEvents(): void {
  if (isBrowser()) {
    try {
      const pending = getPendingOfflineEvents();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
      return;
    } catch {
      // Fallback
    }
  }
  memoryQueue = memoryQueue.filter((item) => item.status !== 'SYNCED');
}

/**
 * Reset memory queue for unit testing environment.
 */
export function resetMemoryQueueForTesting(): void {
  memoryQueue = [];
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
