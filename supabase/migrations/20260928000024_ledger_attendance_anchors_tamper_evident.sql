-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 14
-- Migration 024: Tamper-Evident Ledger, Attendance Hash-Chaining & Merkle Anchors
-- ============================================================================
-- 1. Cryptographic Hash-Chaining:
--    Every attendance event and ledger entry is chained:
--    hash = SHA-256(prev_hash || canonical_row).
-- 2. Append-Only Database Level Protection:
--    REVOKE UPDATE and DELETE on ledger_entries, attendance_events, and anchors
--    for application roles (anon, authenticated).
-- 3. Immutability Triggers:
--    BEFORE UPDATE OR DELETE triggers raise SQLSTATE 27000 exceptions to prevent
--    any modifications at the database engine level.
-- 4. Merkle Anchors Table:
--    Nightly anchors store the Merkle root of the day's entries, with proof
--    and external transparency log publication metadata.
-- ============================================================================

-- 1. ADD HASH CHAIN COLUMNS TO ATTENDANCE_EVENTS -----------------------------
ALTER TABLE attendance_events 
    ADD COLUMN IF NOT EXISTS prev_hash TEXT DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';

ALTER TABLE attendance_events 
    ADD COLUMN IF NOT EXISTS hash TEXT;

CREATE INDEX IF NOT EXISTS idx_attendance_events_hash ON attendance_events(hash);
CREATE INDEX IF NOT EXISTS idx_attendance_events_prev_hash ON attendance_events(prev_hash);

-- Drop obsolete update trigger on attendance_events since table is append-only
DROP TRIGGER IF EXISTS set_attendance_events_updated_at ON attendance_events;

-- 2. AUTOMATIC ATTENDANCE HASH COMPUTATION TRIGGER (Fallback) -----------------
CREATE OR REPLACE FUNCTION fn_attendance_events_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    v_prev_hash TEXT;
    v_canonical TEXT;
BEGIN
    IF NEW.hash IS NULL OR NEW.hash = '' THEN
        -- Get previous hash in attendance_events ordered by created_at and id
        SELECT COALESCE(hash, '0000000000000000000000000000000000000000000000000000000000000000')
        INTO v_prev_hash
        FROM attendance_events
        WHERE id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        ORDER BY created_at DESC, id DESC
        LIMIT 1;

        IF v_prev_hash IS NULL THEN
            v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
        END IF;

        NEW.prev_hash := v_prev_hash;

        v_canonical := NEW.worker_id::text || ':' ||
                       NEW.contract_id::text || ':' ||
                       NEW.project_id::text || ':' ||
                       NEW.worksite_id::text || ':' ||
                       NEW.date::text || ':' ||
                       COALESCE(NEW.punch_type::text, 'IN') || ':' ||
                       ROUND(COALESCE(NEW.worker_latitude, 0), 6)::text || ':' ||
                       ROUND(COALESCE(NEW.worker_longitude, 0), 6)::text || ':' ||
                       NEW.status::text || ':' ||
                       COALESCE(NEW.created_at, NOW())::text;

        NEW.hash := encode(digest(v_prev_hash || ':' || v_canonical, 'sha256'), 'hex');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_attendance_events_hash_chain ON attendance_events;
CREATE TRIGGER trg_attendance_events_hash_chain
    BEFORE INSERT ON attendance_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_attendance_events_hash_chain();

-- 3. CREATE APPEND-ONLY ANCHORS TABLE ----------------------------------------
CREATE TABLE IF NOT EXISTS anchors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anchor_date DATE NOT NULL,
    merkle_root TEXT NOT NULL,
    ledger_entries_count INT NOT NULL DEFAULT 0,
    attendance_events_count INT NOT NULL DEFAULT 0,
    ledger_start_hash TEXT,
    ledger_end_hash TEXT,
    attendance_start_hash TEXT,
    attendance_end_hash TEXT,
    combined_leaves_count INT NOT NULL DEFAULT 0,
    external_publication_url TEXT,
    external_publication_proof TEXT,
    published_to_external BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT anchors_anchor_date_key UNIQUE (anchor_date)
);

CREATE INDEX IF NOT EXISTS idx_anchors_date ON anchors(anchor_date);
CREATE INDEX IF NOT EXISTS idx_anchors_created_at ON anchors(created_at);

-- Enable RLS on anchors table
ALTER TABLE anchors ENABLE ROW LEVEL SECURITY;

-- Allow read-only access to all authenticated users and anon for transparency
CREATE POLICY "Public read-only anchors"
    ON anchors FOR SELECT
    USING (true);

-- 4. REVOKE UPDATE AND DELETE PRIVILEGES (DB-LEVEL HARDENING) -----------------
REVOKE UPDATE, DELETE ON ledger_entries FROM anon, authenticated;
REVOKE UPDATE, DELETE ON attendance_events FROM anon, authenticated;
REVOKE UPDATE, DELETE ON anchors FROM anon, authenticated;

-- 5. IMMUTABILITY TRIGGER FUNCTION (RAISES ON ATTEMPTS) -----------------------
CREATE OR REPLACE FUNCTION prevent_append_only_tampering()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'TAMPER_PREVENTION_ERROR: Table % is strictly append-only. UPDATE and DELETE operations are prohibited at the database engine level.', TG_TABLE_NAME
        USING ERRCODE = '27000';
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to ledger_entries
DROP TRIGGER IF EXISTS trg_prevent_update_or_delete_ledger_entries ON ledger_entries;
CREATE TRIGGER trg_prevent_update_or_delete_ledger_entries
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_append_only_tampering();

-- Attach trigger to attendance_events
DROP TRIGGER IF EXISTS trg_prevent_update_or_delete_attendance_events ON attendance_events;
CREATE TRIGGER trg_prevent_update_or_delete_attendance_events
    BEFORE UPDATE OR DELETE ON attendance_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_append_only_tampering();

-- Attach trigger to anchors
DROP TRIGGER IF EXISTS trg_prevent_update_or_delete_anchors ON anchors;
CREATE TRIGGER trg_prevent_update_or_delete_anchors
    BEFORE UPDATE OR DELETE ON anchors
    FOR EACH ROW
    EXECUTE FUNCTION prevent_append_only_tampering();
