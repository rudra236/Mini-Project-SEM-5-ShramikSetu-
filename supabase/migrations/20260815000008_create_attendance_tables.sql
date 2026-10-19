-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 4
-- Migration 008: Attendance Tokens, Attendance Events & RLS
-- ============================================================================

-- 1. ATTENDANCE STATUS ENUM
CREATE TYPE attendance_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'REJECTED',
    'DISPUTED',
    'CORRECTED'
);

-- 2. ATTENDANCE TOKENS TABLE (Opaque, short-lived QR tokens)
CREATE TABLE attendance_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    worksite_id UUID NOT NULL REFERENCES worksites(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    expires_at TIMESTAMPTZ NOT NULL,
    max_uses INT,
    used_count INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ATTENDANCE EVENTS TABLE
CREATE TABLE attendance_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    worksite_id UUID NOT NULL REFERENCES worksites(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    token_id UUID REFERENCES attendance_tokens(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    worker_latitude NUMERIC(10, 8) NOT NULL,
    worker_longitude NUMERIC(11, 8) NOT NULL,
    worksite_latitude NUMERIC(10, 8) NOT NULL,
    worksite_longitude NUMERIC(11, 8) NOT NULL,
    calculated_distance_meters NUMERIC(10, 2) NOT NULL,
    allowed_radius_meters NUMERIC(8, 2) NOT NULL DEFAULT 100.00,
    status attendance_status NOT NULL DEFAULT 'VERIFIED',
    rejection_reason TEXT,
    idempotency_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Duplicate Prevention: Same worker + contract + date cannot mark duplicate attendance
    CONSTRAINT attendance_unique_worker_contract_date UNIQUE (worker_id, contract_id, date)
);

-- 4. APPLY UPDATED_AT TRIGGER
CREATE TRIGGER set_attendance_events_updated_at
    BEFORE UPDATE ON attendance_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 5. PERFORMANCE INDEXES
CREATE INDEX idx_tokens_token ON attendance_tokens(token);
CREATE INDEX idx_tokens_project ON attendance_tokens(project_id);
CREATE INDEX idx_tokens_expires ON attendance_tokens(expires_at);

CREATE INDEX idx_attendance_worker_date ON attendance_events(worker_id, date);
CREATE INDEX idx_attendance_project ON attendance_events(project_id);
CREATE INDEX idx_attendance_contract ON attendance_events(contract_id);
CREATE INDEX idx_attendance_status ON attendance_events(status);

-- 6. ENABLE ROW LEVEL SECURITY
ALTER TABLE attendance_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_events ENABLE ROW LEVEL SECURITY;

-- 7. RLS POLICIES FOR ATTENDANCE TOKENS
CREATE POLICY tokens_read ON attendance_tokens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p WHERE p.id = attendance_tokens.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR is_supervisor_assigned_to_project(auth.uid(), p.id)
                OR is_worker_on_project(auth.uid(), p.id)
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
            )
        )
    );

CREATE POLICY tokens_manage ON attendance_tokens
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects p WHERE p.id = attendance_tokens.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR is_supervisor_assigned_to_project(auth.uid(), p.id)
                OR get_user_role(auth.uid()) = 'ADMIN'
            )
        )
    );

-- 8. RLS POLICIES FOR ATTENDANCE EVENTS
CREATE POLICY attendance_read ON attendance_events
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR is_supervisor_assigned_to_project(auth.uid(), project_id)
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

CREATE POLICY attendance_worker_insert ON attendance_events
    FOR INSERT WITH CHECK (
        worker_id = get_worker_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
    );
