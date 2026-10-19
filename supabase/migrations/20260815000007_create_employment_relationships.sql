-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 3
-- Migration 007: Employment Relationships & RLS
-- ============================================================================

-- 1. EMPLOYMENT RELATIONSHIPS STATUS ENUM
CREATE TYPE employment_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'COMPLETED',
    'TERMINATED'
);

-- 2. EMPLOYMENT RELATIONSHIPS TABLE
CREATE TABLE employment_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    contract_version_id UUID NOT NULL REFERENCES contract_versions(id) ON DELETE RESTRICT,
    acceptance_id UUID REFERENCES contract_acceptances(id) ON DELETE SET NULL,
    status employment_status NOT NULL DEFAULT 'ACTIVE',
    acceptance_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT emp_rel_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

-- 3. APPLY UPDATED_AT TRIGGER
CREATE TRIGGER set_employment_relationships_updated_at
    BEFORE UPDATE ON employment_relationships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. PERFORMANCE & LOOKUP INDEXES
CREATE INDEX idx_emp_rel_worker ON employment_relationships(worker_id);
CREATE INDEX idx_emp_rel_contractor ON employment_relationships(contractor_id);
CREATE INDEX idx_emp_rel_project ON employment_relationships(project_id);
CREATE INDEX idx_emp_rel_contract ON employment_relationships(contract_id);
CREATE INDEX idx_emp_rel_status ON employment_relationships(status);

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE employment_relationships ENABLE ROW LEVEL SECURITY;

-- 6. RLS POLICIES FOR EMPLOYMENT RELATIONSHIPS
CREATE POLICY emp_rel_read ON employment_relationships
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR is_supervisor_assigned_to_project(auth.uid(), project_id)
    );

CREATE POLICY emp_rel_insert_system ON employment_relationships
    FOR INSERT WITH CHECK (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) = 'ADMIN'
    );

CREATE POLICY emp_rel_update_contractor_admin ON employment_relationships
    FOR UPDATE USING (
        contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
    );
