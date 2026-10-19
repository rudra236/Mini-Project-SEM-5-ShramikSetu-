-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 1
-- Migration 004: Updated Timestamp Triggers & Performance Indexes
-- ============================================================================

-- 1. TRIGGER FUNCTION FOR UPDATED_AT TIMESTAMP
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. APPLY TIMESTAMP TRIGGERS TO ALL TABLES WITH UPDATED_AT
CREATE TRIGGER set_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_workers_updated_at
    BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_contractors_updated_at
    BEFORE UPDATE ON contractors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_supervisors_updated_at
    BEFORE UPDATE ON supervisors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_institutional_users_updated_at
    BEFORE UPDATE ON institutional_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_worksites_updated_at
    BEFORE UPDATE ON worksites
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_work_contracts_updated_at
    BEFORE UPDATE ON work_contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. PERFORMANCE & LOOKUP INDEXES
-- Index users by role and phone
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_phone ON users(phone);

-- Index workers by user_id and occupation
CREATE INDEX idx_workers_user_id ON workers(user_id);
CREATE INDEX idx_workers_internal_id ON workers(internal_worker_id);

-- Index contractors by user_id and organization_id
CREATE INDEX idx_contractors_user_id ON contractors(user_id);
CREATE INDEX idx_contractors_org_id ON contractors(organization_id);

-- Index supervisors by user_id and contractor_id
CREATE INDEX idx_supervisors_user_id ON supervisors(user_id);
CREATE INDEX idx_supervisors_contractor_id ON supervisors(contractor_id);

-- Index institutional users by user_id and organization_id
CREATE INDEX idx_inst_users_user_id ON institutional_users(user_id);
CREATE INDEX idx_inst_users_org_id ON institutional_users(organization_id);

-- Index projects by contractor_id and status
CREATE INDEX idx_projects_contractor_id ON projects(contractor_id);
CREATE INDEX idx_projects_status ON projects(status);

-- Index worksites by project_id and location coordinates
CREATE INDEX idx_worksites_project_id ON worksites(project_id);
CREATE INDEX idx_worksites_coords ON worksites(latitude, longitude);

-- Index supervisor assignments
CREATE INDEX idx_sup_assignments_supervisor ON supervisor_project_assignments(supervisor_id);
CREATE INDEX idx_sup_assignments_project ON supervisor_project_assignments(project_id);

-- Index work_contracts by worker, contractor, project, worksite, join_token, status
CREATE INDEX idx_contracts_worker_id ON work_contracts(worker_id);
CREATE INDEX idx_contracts_contractor_id ON work_contracts(contractor_id);
CREATE INDEX idx_contracts_project_id ON work_contracts(project_id);
CREATE INDEX idx_contracts_worksite_id ON work_contracts(worksite_id);
CREATE INDEX idx_contracts_join_token ON work_contracts(join_token);
CREATE INDEX idx_contracts_status ON work_contracts(status);
CREATE INDEX idx_contracts_code ON work_contracts(contract_code);

-- Index contract versions
CREATE INDEX idx_contract_versions_contract_id ON contract_versions(contract_id);

-- Index contract acceptances
CREATE INDEX idx_contract_acceptances_contract_id ON contract_acceptances(contract_id);
CREATE INDEX idx_contract_acceptances_worker_id ON contract_acceptances(worker_id);
