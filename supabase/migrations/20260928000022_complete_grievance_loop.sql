-- Migration: 20260928000022_complete_grievance_loop.sql
-- Description: Complete Grievance Loop End-to-End
-- 1. audit_log table with actor, action, before, after, timestamp
-- 2. Alter disputes table with claimed amount, multimedia evidence, linked rows, contractor response, ruling actions, and deadlines
-- 3. Alter contractors table with compliance_status and non_compliance_reason
-- 4. RLS policies and indexes

-- 1. Create audit_log Table
CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    before JSONB,
    after JSONB,
    entity_type TEXT,
    entity_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log (actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log (entity_type, entity_id);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select_authenticated"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "audit_log_insert_service"
    ON public.audit_log FOR INSERT
    TO authenticated, service_role
    WITH CHECK (true);

-- Ensure audit_log is strictly append-only
REVOKE UPDATE, DELETE ON public.audit_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION fn_prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only. UPDATE and DELETE operations are strictly forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_modification ON public.audit_log;
CREATE TRIGGER trg_prevent_audit_log_modification
    BEFORE UPDATE OR DELETE ON public.audit_log
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_audit_log_modification();

-- 2. Add Grievance Loop Columns to disputes Table
ALTER TABLE public.disputes
    ADD COLUMN IF NOT EXISTS amount_claimed_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS evidence_photo_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS evidence_voice_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS voice_transcription TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS linked_attendance_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS linked_ledger_entry_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS contractor_counter_statement TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS contractor_evidence_url TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS contractor_responded_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS contractor_response_deadline TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS ruling_decision TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS ruling_reason TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS ordered_amount_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS order_payment_deadline TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS ruling_issued_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS ruling_issued_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_deadline_missed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_settled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS settlement_ledger_entry_id UUID DEFAULT NULL;

DO $$ BEGIN
    ALTER TABLE public.disputes
        ADD CONSTRAINT check_dispute_ruling_decision
        CHECK (ruling_decision IS NULL OR ruling_decision IN ('DISMISS', 'ORDER_PAYMENT', 'PARTIAL_SETTLEMENT'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_disputes_deadline ON public.disputes (order_payment_deadline) WHERE is_deadline_missed = FALSE;
CREATE INDEX IF NOT EXISTS idx_disputes_contractor_deadline ON public.disputes (contractor_id, contractor_response_deadline);

-- 3. Add Compliance Status Columns to contractors Table
ALTER TABLE public.contractors
    ADD COLUMN IF NOT EXISTS compliance_status TEXT NOT NULL DEFAULT 'COMPLIANT',
    ADD COLUMN IF NOT EXISTS non_compliance_reason TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS non_compliant_since TIMESTAMPTZ DEFAULT NULL;

DO $$ BEGIN
    ALTER TABLE public.contractors
        ADD CONSTRAINT check_contractor_compliance_status
        CHECK (compliance_status IN ('COMPLIANT', 'NON_COMPLIANT', 'REVIEW_REQUIRED'));
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS idx_contractors_compliance_status ON public.contractors (compliance_status);
