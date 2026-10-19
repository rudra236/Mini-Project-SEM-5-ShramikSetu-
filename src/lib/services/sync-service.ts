import { createAdminClient } from '@/lib/supabase/admin';
import { calculateHaversineDistance } from '@/lib/geo/haversine';
import { logSensitiveOperation } from '@/lib/auth/audit';
import type { Database } from '@/types/database.types';

export interface OfflineEventSyncParams {
  workerUserId: string;
  eventUuid: string;
  tokenUuid: string;
  workerLatitude: number;
  workerLongitude: number;
  attendanceDate: string;
  timestamp?: string;
}

export interface SyncResult {
  success: boolean;
  status: 'VERIFIED' | 'REJECTED' | 'DISCREPANCY' | 'ALREADY_SYNCED';
  eventUuid: string;
  attendanceEventId?: string;
  discrepancyId?: string;
  isDuplicate: boolean;
  message: string;
  details?: any;
}

export class SyncEngineError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode: number = 400, reasonCode: string = 'SYNC_FAILED') {
    super(message);
    this.name = 'SyncEngineError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

/**
 * SYNC ENGINE: Offline-First Attendance Event Synchronization & Idempotent Processor.
 */
export async function syncOfflineAttendanceEvent(params: OfflineEventSyncParams): Promise<SyncResult> {
  const adminClient = createAdminClient();
  const currentDateStr = params.attendanceDate || new Date().toISOString().split('T')[0];

  // 1. IDEMPOTENCY CHECK (by eventUuid)
  const { data: existingByUuid } = await adminClient
    .from('attendance_events')
    .select('*')
    .eq('idempotency_key', params.eventUuid)
    .maybeSingle();

  if (existingByUuid) {
    return {
      success: true,
      status: existingByUuid.status === 'VERIFIED' ? 'VERIFIED' : existingByUuid.status === 'REJECTED' ? 'REJECTED' : 'ALREADY_SYNCED',
      eventUuid: params.eventUuid,
      attendanceEventId: existingByUuid.id,
      isDuplicate: true,
      message: `Event ${params.eventUuid} was already processed idempotently.`,
      details: existingByUuid,
    };
  }

  // Check if already registered as a discrepancy
  const { data: existingDiscrepancyByUuid } = await adminClient
    .from('attendance_discrepancies')
    .select('*')
    .eq('event_uuid', params.eventUuid)
    .maybeSingle();

  if (existingDiscrepancyByUuid) {
    return {
      success: true,
      status: 'DISCREPANCY',
      eventUuid: params.eventUuid,
      discrepancyId: existingDiscrepancyByUuid.id,
      isDuplicate: true,
      message: `Event ${params.eventUuid} already exists in discrepancy state.`,
      details: existingDiscrepancyByUuid,
    };
  }

  // 2. AUTHENTICATE WORKER & PROFILE LOOKUP
  const { data: worker, error: workerErr } = await adminClient
    .from('workers')
    .select('*')
    .eq('user_id', params.workerUserId)
    .maybeSingle();

  if (workerErr || !worker) {
    throw new SyncEngineError('Worker profile not found for authenticated user.', 403, 'UNAUTHORIZED_WORKER');
  }

  // 3. QR TOKEN VALIDATION
  const { data: tokenRecord, error: tokenErr } = await adminClient
    .from('attendance_tokens')
    .select('*, worksites(*)')
    .eq('token', params.tokenUuid)
    .maybeSingle();

  if (tokenErr || !tokenRecord) {
    // Preserve claim in discrepancy table instead of failing silently
    const discrepancy = await createAttendanceDiscrepancy({
      eventUuid: params.eventUuid,
      workerId: worker.id,
      contractId: '00000000-0000-0000-0000-000000000000',
      projectId: '00000000-0000-0000-0000-000000000000',
      date: currentDateStr,
      conflictType: 'INVALID_TOKEN_CLAIM',
      workerClaim: params,
      contractorRecord: null,
      status: 'OPEN',
      notes: 'Submitted attendance token was not found or invalid.',
    });

    return {
      success: false,
      status: 'DISCREPANCY',
      eventUuid: params.eventUuid,
      discrepancyId: discrepancy.id,
      isDuplicate: false,
      message: 'QR Attendance token not found. Claim saved in discrepancy state.',
    };
  }

  if (!tokenRecord.is_active || new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    throw new SyncEngineError('Attendance token is inactive or expired.', 422, 'TOKEN_EXPIRED');
  }

  const projectId = tokenRecord.project_id;
  const worksiteId = tokenRecord.worksite_id;
  const worksite = tokenRecord.worksites as any;

  if (!worksite) {
    throw new SyncEngineError('Token worksite reference not found.', 404, 'WORKSITE_NOT_FOUND');
  }

  // 4. ACTIVE EMPLOYMENT & WORK CONTRACT VALIDATION
  const { data: activeEmployment } = await adminClient
    .from('employment_relationships')
    .select('*')
    .eq('worker_id', worker.id)
    .eq('project_id', projectId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!activeEmployment) {
    throw new SyncEngineError('Worker does not have an active employment relationship on this project.', 403, 'INACTIVE_EMPLOYMENT');
  }

  const { data: contract } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', activeEmployment.contract_id)
    .eq('worker_id', worker.id)
    .eq('project_id', projectId)
    .eq('status', 'ACTIVE')
    .maybeSingle();

  if (!contract) {
    throw new SyncEngineError('Active work contract not found for worker on this project.', 403, 'INACTIVE_CONTRACT');
  }

  // 5. DUPLICATE & CONFLICT CHECK (same worker + contract + date)
  const { data: existingSameDayAttendance } = await adminClient
    .from('attendance_events')
    .select('*')
    .eq('worker_id', worker.id)
    .eq('contract_id', contract.id)
    .eq('date', currentDateStr)
    .maybeSingle();

  if (existingSameDayAttendance) {
    // If idempotency_key matches, it's the exact same submission
    if (existingSameDayAttendance.idempotency_key === params.eventUuid) {
      return {
        success: true,
        status: existingSameDayAttendance.status === 'VERIFIED' ? 'VERIFIED' : 'REJECTED',
        eventUuid: params.eventUuid,
        attendanceEventId: existingSameDayAttendance.id,
        isDuplicate: true,
        message: 'Same-day attendance already synced with this UUID.',
        details: existingSameDayAttendance,
      };
    }

    // CONFLICT HANDLING: Duplicate attendance claim for same date with different UUID.
    // Do NOT silently overwrite original record! Create discrepancy state preserving both records.
    const discrepancy = await createAttendanceDiscrepancy({
      eventUuid: params.eventUuid,
      workerId: worker.id,
      contractId: contract.id,
      projectId: projectId,
      date: currentDateStr,
      conflictType: 'DUPLICATE_SAME_DAY_CLAIM',
      workerClaim: params,
      contractorRecord: existingSameDayAttendance,
      status: 'OPEN',
      notes: `Worker submitted offline claim for date ${currentDateStr}, but an attendance record (ID: ${existingSameDayAttendance.id}) already exists.`,
    });

    return {
      success: true,
      status: 'DISCREPANCY',
      eventUuid: params.eventUuid,
      discrepancyId: discrepancy.id,
      isDuplicate: true,
      message: `Conflict detected: Attendance already exists for date ${currentDateStr}. Discrepancy state created.`,
      details: discrepancy,
    };
  }

  // 6. HAVERSINE GEOFENCE VALIDATION
  if (
    params.workerLatitude === undefined ||
    params.workerLongitude === undefined ||
    isNaN(params.workerLatitude) ||
    isNaN(params.workerLongitude)
  ) {
    throw new SyncEngineError('Worker GPS coordinates (latitude and longitude) are required.', 400, 'MISSING_GPS');
  }

  const calculatedDistanceMeters = calculateHaversineDistance(
    params.workerLatitude,
    params.workerLongitude,
    Number(worksite.latitude),
    Number(worksite.longitude)
  );

  const allowedRadius = Number(worksite.allowed_radius_meters) || 100.0;
  const isWithinRadius = calculatedDistanceMeters <= allowedRadius;

  const attendanceStatus = isWithinRadius ? 'VERIFIED' : 'REJECTED';
  const rejectionReason = isWithinRadius
    ? null
    : `OUT_OF_RADIUS: Worker distance ${calculatedDistanceMeters}m exceeds allowed radius ${allowedRadius}m.`;

  // 7. PERSIST BACKEND EVENT
  const { data: attendanceEvent, error: insertErr } = await adminClient
    .from('attendance_events')
    .insert({
      worker_id: worker.id,
      contractor_id: contract.contractor_id,
      project_id: projectId,
      worksite_id: worksiteId,
      contract_id: contract.id,
      token_id: tokenRecord.id,
      date: currentDateStr,
      worker_latitude: params.workerLatitude,
      worker_longitude: params.workerLongitude,
      worksite_latitude: Number(worksite.latitude),
      worksite_longitude: Number(worksite.longitude),
      calculated_distance_meters: calculatedDistanceMeters,
      allowed_radius_meters: allowedRadius,
      status: attendanceStatus,
      rejection_reason: rejectionReason,
      idempotency_key: params.eventUuid,
    })
    .select()
    .single();

  if (insertErr || !attendanceEvent) {
    if (insertErr?.code === '23505') {
      // Idempotency race condition catch
      return {
        success: true,
        status: 'ALREADY_SYNCED',
        eventUuid: params.eventUuid,
        isDuplicate: true,
        message: 'Event was concurrently synced by another request.',
      };
    }
    throw new SyncEngineError(`Failed to persist synced attendance event: ${insertErr?.message}`, 500, 'INSERT_FAILED');
  }

  // Increment token use count
  await adminClient
    .from('attendance_tokens')
    .update({ used_count: (tokenRecord.used_count || 0) + 1 })
    .eq('id', tokenRecord.id);

  // Audit log
  await logSensitiveOperation({
    actorId: params.workerUserId,
    action: `OFFLINE_ATTENDANCE_SYNCED_${attendanceStatus}`,
    entityType: 'attendance_events',
    entityId: attendanceEvent.id,
    afterState: {
      eventUuid: params.eventUuid,
      status: attendanceStatus,
      distanceMeters: calculatedDistanceMeters,
    },
  });

  return {
    success: isWithinRadius,
    status: attendanceStatus,
    eventUuid: params.eventUuid,
    attendanceEventId: attendanceEvent.id,
    isDuplicate: false,
    message: isWithinRadius
      ? 'Offline attendance event successfully verified and synced.'
      : `Attendance event synced but rejected: distance ${calculatedDistanceMeters}m exceeds allowed radius ${allowedRadius}m.`,
    details: attendanceEvent,
  };
}

/**
 * Helper to record an append-only discrepancy row without overwriting existing records.
 */
export async function createAttendanceDiscrepancy(params: {
  eventUuid: string;
  workerId: string;
  contractId: string;
  projectId: string;
  date: string;
  conflictType: string;
  workerClaim: any;
  contractorRecord: any;
  status?: string;
  notes?: string;
}) {
  const adminClient = createAdminClient();

  const { data: discrepancy, error } = await adminClient
    .from('attendance_discrepancies')
    .insert({
      event_uuid: params.eventUuid,
      worker_id: params.workerId,
      contract_id: params.contractId,
      project_id: params.projectId,
      date: params.date,
      conflict_type: params.conflictType,
      worker_claim: params.workerClaim,
      contractor_record: params.contractorRecord || null,
      status: params.status || 'OPEN',
      resolution_notes: params.notes || null,
    })
    .select()
    .single();

  if (error || !discrepancy) {
    // If discrepancy with event_uuid already exists, return existing
    const { data: existing } = await adminClient
      .from('attendance_discrepancies')
      .select('*')
      .eq('event_uuid', params.eventUuid)
      .single();
    if (existing) return existing;
    throw new SyncEngineError(`Failed to record attendance discrepancy: ${error?.message}`, 500, 'DISCREPANCY_RECORD_FAILED');
  }

  await logSensitiveOperation({
    actorId: params.workerId,
    action: 'ATTENDANCE_DISCREPANCY_CREATED',
    entityType: 'attendance_discrepancies',
    entityId: discrepancy.id,
    afterState: discrepancy,
  });

  return discrepancy;
}

