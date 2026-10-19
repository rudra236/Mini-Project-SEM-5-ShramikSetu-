-- Migration: 20260920000015_append_only_tamper_prevention.sql
-- Description: Enforces append-only immutability at the PostgreSQL database level on audit_events and dispute_evidence_snapshots.
-- Prevents UPDATE and DELETE operations by raising exceptions via trigger functions.

-- 1. Create reusable trigger function for append-only enforcement
CREATE OR REPLACE FUNCTION prevent_update_or_delete_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TAMPER_PREVENTION_ERROR: Table % is append-only. UPDATE and DELETE operations are strictly prohibited.', TG_TABLE_NAME
    USING ERRCODE = '27000';
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to audit_events
DROP TRIGGER IF EXISTS trg_prevent_update_or_delete_audit_events ON audit_events;
CREATE TRIGGER trg_prevent_update_or_delete_audit_events
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW
EXECUTE FUNCTION prevent_update_or_delete_append_only();

-- 3. Attach trigger to dispute_evidence_snapshots
DROP TRIGGER IF EXISTS trg_prevent_update_or_delete_dispute_evidence_snapshots ON dispute_evidence_snapshots;
CREATE TRIGGER trg_prevent_update_or_delete_dispute_evidence_snapshots
BEFORE UPDATE OR DELETE ON dispute_evidence_snapshots
FOR EACH ROW
EXECUTE FUNCTION prevent_update_or_delete_append_only();
