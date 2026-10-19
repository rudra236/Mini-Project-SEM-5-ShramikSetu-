import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AuditEventActionEnum, AuditEventRow, AuditLogRow } from '@/types/database.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class AuditServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'AUDIT_SERVICE_ERROR') {
    super(message);
    this.name = 'AuditServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface RecordAuditEventParams {
  actorId: string;
  action: AuditEventActionEnum;
  entityType: string;
  entityId: string;
  payload?: Record<string, any>;
  timestamp?: string;
}

export interface AuditIntegrityVerificationResult {
  isValid: boolean;
  totalEventsCount: number;
  tamperedEventsCount: number;
  details: Array<{
    sequenceNumber: number;
    eventId: string;
    action: string;
    expectedHash: string;
    actualHash: string;
    previousHashValid: boolean;
    currentHashValid: boolean;
  }>;
  verifiedAt: string;
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes SHA-256 hash for an audit event.
 */
export function computeAuditEventHash(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, any>;
  timestamp: string;
  previousHash: string;
}): string {
  const payloadStr = JSON.stringify(params.payload || {});
  const data = [
    params.actorId,
    params.action,
    params.entityType,
    params.entityId,
    payloadStr,
    params.timestamp,
    params.previousHash,
  ].join('|');

  return crypto.createHash('sha256').update(data).digest('hex');
}

// ─── Core Service Functions ───────────────────────────────────────────────────

/**
 * Records an append-only audit event with cryptographic SHA-256 hash chaining.
 * Guarantees a TAMPER-EVIDENT AUDIT TRAIL.
 */
export async function recordAuditEvent(params: RecordAuditEventParams): Promise<AuditEventRow> {
  const adminClient = createAdminClient();
  const timestamp = params.timestamp || new Date().toISOString();
  const payload = params.payload || {};

  // 1. Fetch the latest audit event row to get its current_hash (previous_hash for new row)
  const { data: lastEvent } = await adminClient
    .from('audit_events')
    .select('current_hash, sequence_number')
    .order('sequence_number', { ascending: false })
    .maybeSingle();

  const previousHash = lastEvent?.current_hash || GENESIS_HASH;

  // 2. Compute current SHA-256 hash
  const currentHash = computeAuditEventHash({
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    payload,
    timestamp,
    previousHash,
  });

  // 3. Insert append-only audit event
  const { data: created, error } = await adminClient
    .from('audit_events')
    .insert({
      actor_id: params.actorId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      payload: payload as any,
      previous_hash: previousHash,
      current_hash: currentHash,
      created_at: timestamp,
    })
    .select()
    .single();

  if (error || !created) {
    throw new AuditServiceError(
      `Failed to record audit event: ${error?.message}`,
      500,
      'AUDIT_INSERT_FAILED'
    );
  }

  return created;
}

/**
 * Scans all audit events in sequence order, verifying previous_hash links
 * and recalculating SHA-256 current_hash values to detect any data tampering.
 */
export async function verifyAuditTrailIntegrity(): Promise<AuditIntegrityVerificationResult> {
  const adminClient = createAdminClient();

  const { data: events, error } = await adminClient
    .from('audit_events')
    .select('*')
    .order('sequence_number', { ascending: true });

  if (error) {
    throw new AuditServiceError(
      `Failed to fetch audit events for verification: ${error.message}`,
      500,
      'AUDIT_VERIFY_FAILED'
    );
  }

  const allEvents = events || [];
  let tamperedCount = 0;
  let expectedPreviousHash = GENESIS_HASH;

  const details = allEvents.map((event: AuditEventRow, idx: number) => {
    const previousHashValid = event.previous_hash === expectedPreviousHash;

    const expectedCurrentHash = computeAuditEventHash({
      actorId: event.actor_id,
      action: event.action,
      entityType: event.entity_type,
      entityId: event.entity_id,
      payload: (event.payload as Record<string, any>) || {},
      timestamp: event.created_at,
      previousHash: event.previous_hash,
    });

    const currentHashValid = event.current_hash === expectedCurrentHash;
    const isRowValid = previousHashValid && currentHashValid;

    if (!isRowValid) {
      tamperedCount++;
    }

    // Update expected previous hash for next iteration
    expectedPreviousHash = event.current_hash;

    return {
      sequenceNumber: event.sequence_number || idx + 1,
      eventId: event.id,
      action: event.action,
      expectedHash: expectedCurrentHash,
      actualHash: event.current_hash,
      previousHashValid,
      currentHashValid,
    };
  });

  return {
    isValid: tamperedCount === 0,
    totalEventsCount: allEvents.length,
    tamperedEventsCount: tamperedCount,
    details,
    verifiedAt: new Date().toISOString(),
  };
}

// ─── Direct Audit Log Table Operations (actor, action, before, after, timestamp) ───

export interface RecordAuditLogParams {
  actor: string;
  action: string;
  before: any;
  after: any;
  entityType?: string;
  entityId?: string;
  timestamp?: string;
}

/**
 * Records a state transition to public.audit_log table: (actor, action, before, after, timestamp).
 * Also writes into cryptographic SHA-256 hash chained audit_events.
 */
export async function recordAuditLog(params: RecordAuditLogParams): Promise<AuditLogRow> {
  const adminClient = createAdminClient();
  const timestamp = params.timestamp || new Date().toISOString();

  // 1. Insert into audit_log table
  const { data: logEntry, error } = await adminClient
    .from('audit_log')
    .insert({
      actor: params.actor,
      action: params.action,
      before: params.before !== undefined ? params.before : null,
      after: params.after !== undefined ? params.after : null,
      entity_type: params.entityType || null,
      entity_id: params.entityId || null,
      timestamp,
    })
    .select()
    .single();

  if (error || !logEntry) {
    throw new AuditServiceError(`Failed to insert into audit_log: ${error?.message}`);
  }

  // 2. Also record in audit_events for SHA-256 tamper-evident hash chaining if possible
  try {
    const validActions: AuditEventActionEnum[] = [
      'contract_created',
      'contract_accepted',
      'attendance_recorded',
      'attendance_confirmed',
      'payment_created',
      'payment_confirmed',
      'dispute_created',
      'dispute_updated',
      'dispute_resolved',
      'job_completed',
    ];
    const actionMap: Record<string, AuditEventActionEnum> = {
      'dispute_raised': 'dispute_created',
      'dispute_created': 'dispute_created',
      'contractor_counter_statement_submitted': 'dispute_updated',
      'inspector_ruling_issued': 'dispute_resolved',
      'dispute_resolved': 'dispute_resolved',
    };
    const lower = params.action.toLowerCase();
    const actionToRecord: AuditEventActionEnum = actionMap[lower] || (validActions.includes(lower as any) ? (lower as any) : 'dispute_updated');

    await recordAuditEvent({
      actorId: params.actor && params.actor.includes('-') ? params.actor : '00000000-0000-0000-0000-000000000000',
      action: actionToRecord,
      entityType: params.entityType || 'grievance',
      entityId: params.entityId || logEntry.id,
      payload: {
        actor: params.actor,
        action: params.action,
        before: params.before,
        after: params.after,
      },
      timestamp,
    });
  } catch {
    // Non-blocking
  }

  return logEntry as AuditLogRow;
}

/**
 * Fetches audit log records matching criteria.
 */
export async function getAuditLogs(params?: {
  actor?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
}): Promise<AuditLogRow[]> {
  const adminClient = createAdminClient();
  let query = adminClient
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false });

  if (params?.actor) query = query.eq('actor', params.actor);
  if (params?.action) query = query.eq('action', params.action);
  if (params?.entityType) query = query.eq('entity_type', params.entityType);
  if (params?.entityId) query = query.eq('entity_id', params.entityId);

  const { data, error } = await query;
  if (error) {
    throw new AuditServiceError(`Failed to fetch audit logs: ${error.message}`);
  }
  return (data || []) as AuditLogRow[];
}

