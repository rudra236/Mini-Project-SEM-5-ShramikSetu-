-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 1
-- Migration 005: Security Definer Helper Functions & Strict RLS Policies
-- ============================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS (Prevent RLS recursion & enforce strict lookup)

CREATE OR REPLACE FUNCTION get_user_role(user_uuid UUID)
RETURNS user_role AS $$
    SELECT role FROM users WHERE id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_worker_id(user_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM workers WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_contractor_id(user_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM contractors WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_supervisor_id(user_uuid UUID)
RETURNS UUID AS $$
    SELECT id FROM supervisors WHERE user_id = user_uuid;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;


-- 2. ENABLE ROW LEVEL SECURITY (RLS) ON ALL TABLES

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutional_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE worksites ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisor_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_acceptances ENABLE ROW LEVEL SECURITY;


-- 3. RLS POLICIES FOR USERS TABLE
CREATE POLICY users_self_read ON users
    FOR SELECT USING (
        auth.uid() = id OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

CREATE POLICY users_self_update ON users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- 4. RLS POLICIES FOR ORGANIZATIONS TABLE
CREATE POLICY orgs_read_authenticated ON organizations
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY orgs_admin_manage ON organizations
    FOR ALL USING (get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER'));


-- 5. RLS POLICIES FOR WORKERS TABLE
CREATE POLICY workers_read ON workers
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM work_contracts wc
            WHERE wc.worker_id = workers.id
            AND (
                wc.contractor_id = get_contractor_id(auth.uid())
                OR EXISTS (
                    SELECT 1 FROM supervisor_project_assignments spa
                    WHERE spa.project_id = wc.project_id
                    AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
            )
        )
    );

CREATE POLICY workers_self_update ON workers
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY workers_self_insert ON workers
    FOR INSERT WITH CHECK (user_id = auth.uid());


-- 6. RLS POLICIES FOR CONTRACTORS TABLE
CREATE POLICY contractors_read ON contractors
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM work_contracts wc
            WHERE wc.contractor_id = contractors.id
            AND wc.worker_id = get_worker_id(auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM supervisors s
            WHERE s.contractor_id = contractors.id
            AND s.user_id = auth.uid()
        )
    );

CREATE POLICY contractors_self_update ON contractors
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY contractors_self_insert ON contractors
    FOR INSERT WITH CHECK (user_id = auth.uid());


-- 7. RLS POLICIES FOR SUPERVISORS TABLE
CREATE POLICY supervisors_read ON supervisors
    FOR SELECT USING (
        user_id = auth.uid()
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

CREATE POLICY supervisors_contractor_manage ON supervisors
    FOR ALL USING (contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN');


-- 8. RLS POLICIES FOR INSTITUTIONAL USERS TABLE
CREATE POLICY inst_users_read ON institutional_users
    FOR SELECT USING (
        user_id = auth.uid() OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );


-- 9. RLS POLICIES FOR PROJECTS TABLE
CREATE POLICY projects_read ON projects
    FOR SELECT USING (
        contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM supervisor_project_assignments spa
            WHERE spa.project_id = projects.id AND spa.supervisor_id = get_supervisor_id(auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM work_contracts wc
            WHERE wc.project_id = projects.id AND wc.worker_id = get_worker_id(auth.uid())
        )
    );

CREATE POLICY projects_contractor_manage ON projects
    FOR ALL USING (contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN');


-- 10. RLS POLICIES FOR WORKSITES TABLE
CREATE POLICY worksites_read ON worksites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p WHERE p.id = worksites.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                OR EXISTS (
                    SELECT 1 FROM supervisor_project_assignments spa
                    WHERE spa.project_id = p.id AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
                OR EXISTS (
                    SELECT 1 FROM work_contracts wc
                    WHERE wc.project_id = p.id AND wc.worker_id = get_worker_id(auth.uid())
                )
            )
        )
    );

CREATE POLICY worksites_contractor_manage ON worksites
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects p WHERE p.id = worksites.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
            )
        )
    );


-- 11. RLS POLICIES FOR SUPERVISOR PROJECT ASSIGNMENTS TABLE
CREATE POLICY sup_assignments_read ON supervisor_project_assignments
    FOR SELECT USING (
        supervisor_id = get_supervisor_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM projects p WHERE p.id = supervisor_project_assignments.project_id AND p.contractor_id = get_contractor_id(auth.uid())
        )
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

CREATE POLICY sup_assignments_contractor_manage ON supervisor_project_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects p WHERE p.id = supervisor_project_assignments.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
            )
        )
    );


-- 12. RLS POLICIES FOR WORK CONTRACTS TABLE
CREATE POLICY contracts_read ON work_contracts
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM supervisor_project_assignments spa
            WHERE spa.project_id = work_contracts.project_id AND spa.supervisor_id = get_supervisor_id(auth.uid())
        )
    );

CREATE POLICY contracts_contractor_manage ON work_contracts
    FOR ALL USING (
        contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
    );

CREATE POLICY contracts_worker_update_status ON work_contracts
    FOR UPDATE USING (
        worker_id = get_worker_id(auth.uid())
    ) WITH CHECK (
        worker_id = get_worker_id(auth.uid())
    );


-- 13. RLS POLICIES FOR CONTRACT VERSIONS TABLE
CREATE POLICY contract_versions_read ON contract_versions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM work_contracts wc WHERE wc.id = contract_versions.contract_id AND (
                wc.worker_id = get_worker_id(auth.uid())
                OR wc.contractor_id = get_contractor_id(auth.uid())
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                OR EXISTS (
                    SELECT 1 FROM supervisor_project_assignments spa
                    WHERE spa.project_id = wc.project_id AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
            )
        )
    );

CREATE POLICY contract_versions_contractor_create ON contract_versions
    FOR INSERT WITH CHECK (
        created_by = auth.uid() AND (
            EXISTS (
                SELECT 1 FROM work_contracts wc WHERE wc.id = contract_versions.contract_id AND (
                    wc.contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
                )
            )
        )
    );


-- 14. RLS POLICIES FOR CONTRACT ACCEPTANCES TABLE
CREATE POLICY acceptances_read ON contract_acceptances
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM work_contracts wc WHERE wc.id = contract_acceptances.contract_id AND (
                wc.contractor_id = get_contractor_id(auth.uid())
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                OR EXISTS (
                    SELECT 1 FROM supervisor_project_assignments spa
                    WHERE spa.project_id = wc.project_id AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
            )
        )
    );

CREATE POLICY acceptances_worker_insert ON contract_acceptances
    FOR INSERT WITH CHECK (
        worker_id = get_worker_id(auth.uid())
    );
