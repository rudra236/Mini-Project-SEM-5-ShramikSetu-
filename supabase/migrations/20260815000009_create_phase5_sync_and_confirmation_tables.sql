-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 5
-- Migration 009: Offline Sync, Conflict Discrepancies & Worker Confirmation
-- ============================================================================

-- 1. ADD 'DISCREPANCY' TO ATTENDANCE STATUS ENUM (IF NOT EXISTS)
ALTER TYPE attendance_status ADD VALUE IF NOT EXISTS 'DISCREPANCY';

-- 2. ATTENDANCE SUMMARIES TABLE (Contractor/System recorded period summaries)
CREATE TABLE IF NOT EXISTS attendance_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    recorded_days_count INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION', -- PENDING_CONFIRMATION, CONFIRMED, DISPUTED
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WORKER CONFIRMATIONS TABLE (Worker YES/NO responses)
CREATE TABLE IF NOT EXISTS worker_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    summary_id UUID NOT NULL REFERENCES attendance_summaries(id) ON DELETE RESTRICT,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    is_confirmed BOOLEAN NOT NULL, -- true for YES, false for NO
    discrepancy_reason TEXT, -- WORKED_MORE_DAYS, WORKED_FEWER_DAYS, MISSING_ATTENDANCE, INCORRECT_ATTENDANCE
    worker_claimed_days_count INT,
    comments TEXT,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ATTENDANCE DISCREPANCIES TABLE (Preserving conflicting claims without silent overwrites)
CREATE TABLE IF NOT EXISTS attendance_discrepancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_uuid UUID NOT NULL UNIQUE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    date DATE NOT NULL,
    conflict_type TEXT NOT NULL, -- WORKER_CLAIMS_ATTENDANCE, CONTRACTOR_DENIES_ATTENDANCE, DUPLICATE_CONFLICT, SUMMARY_MISMATCH
    worker_claim JSONB NOT NULL,
    contractor_record JSONB,
    status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, UNDER_REVIEW, RESOLVED
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RLS POLICIES FOR PHASE 5 TABLES
ALTER TABLE attendance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_discrepancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY summaries_read ON attendance_summaries
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

CREATE POLICY confirmations_read ON worker_confirmations
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM work_contracts c WHERE c.id = worker_confirmations.contract_id AND c.contractor_id = get_contractor_id(auth.uid())
        )
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

CREATE POLICY discrepancies_read ON attendance_discrepancies
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM work_contracts c WHERE c.id = attendance_discrepancies.contract_id AND c.contractor_id = get_contractor_id(auth.uid())
        )
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );
