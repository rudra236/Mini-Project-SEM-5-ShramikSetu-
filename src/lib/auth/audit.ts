import { createAdminClient } from '@/lib/supabase/admin';

export interface AuditEventParams {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, any> | null;
  afterState?: Record<string, any> | null;
}

/**
 * Logs sensitive operations and service-role actions to the insert-only audit_events table.
 * Isolates service-role write operations and guarantees audit trails.
 */
export async function logSensitiveOperation(params: AuditEventParams): Promise<void> {
  try {
    const adminClient = createAdminClient();

    const { error } = await adminClient.from('audit_log').insert({
      actor: params.actorId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      before: params.beforeState ? params.beforeState : null,
      after: params.afterState ? params.afterState : null,
    });

    if (error) {
      console.error('[AUDIT ERROR] Failed to record audit event:', error.message, params);
    }
  } catch (err: any) {
    console.error('[AUDIT EXCEPTION] Failed to execute logSensitiveOperation:', err?.message || err);
  }
}
