-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 2
-- Migration 006: RLS Refinement & Authorization Security Definers
-- ============================================================================

-- 1. SECURITY DEFINER HELPER FUNCTIONS FOR SCOPE & ACCESS CHECKS

CREATE OR REPLACE FUNCTION is_supervisor_assigned_to_project(p_supervisor_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM supervisor_project_assignments spa
        JOIN supervisors s ON s.id = spa.supervisor_id
        WHERE s.user_id = p_supervisor_user_id
          AND spa.project_id = p_project_id
          AND spa.is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_worker_associated_with_contractor(p_worker_id UUID, p_contractor_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM work_contracts wc
        JOIN contractors c ON c.id = wc.contractor_id
        WHERE wc.worker_id = p_worker_id
          AND c.user_id = p_contractor_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_worker_on_project(p_worker_user_id UUID, p_project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM work_contracts wc
        JOIN workers w ON w.id = wc.worker_id
        WHERE w.user_id = p_worker_user_id
          AND wc.project_id = p_project_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- 2. ENSURE RLS POLICIES STRICTLY MATCH SPECIFICATION

-- WORKER POLICY: Workers can access ONLY their own profile, contracts, acceptances, and associated contractors
DROP POLICY IF EXISTS workers_read ON workers;
CREATE POLICY workers_read ON workers
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR is_worker_associated_with_contractor(workers.id, auth.uid())
        OR EXISTS (
            SELECT 1 FROM work_contracts wc
            WHERE wc.worker_id = workers.id
              AND is_supervisor_assigned_to_project(auth.uid(), wc.project_id)
        )
    );

DROP POLICY IF EXISTS contracts_read ON work_contracts;
CREATE POLICY contracts_read ON work_contracts
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR is_supervisor_assigned_to_project(auth.uid(), work_contracts.project_id)
    );

DROP POLICY IF EXISTS acceptances_read ON contract_acceptances;
CREATE POLICY acceptances_read ON contract_acceptances
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM work_contracts wc
            WHERE wc.id = contract_acceptances.contract_id
              AND (
                  wc.contractor_id = get_contractor_id(auth.uid())
                  OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                  OR is_supervisor_assigned_to_project(auth.uid(), wc.project_id)
              )
        )
    );

-- CONTRACTOR POLICY: Contractors can access ONLY own profile, projects, worksites, contracts, and workers associated with their contracts
DROP POLICY IF EXISTS projects_read ON projects;
CREATE POLICY projects_read ON projects
    FOR SELECT USING (
        contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR is_supervisor_assigned_to_project(auth.uid(), projects.id)
        OR is_worker_on_project(auth.uid(), projects.id)
    );

DROP POLICY IF EXISTS worksites_read ON worksites;
CREATE POLICY worksites_read ON worksites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = worksites.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                OR is_supervisor_assigned_to_project(auth.uid(), p.id)
                OR is_worker_on_project(auth.uid(), p.id)
            )
        )
    );

-- SUPERVISOR POLICY: Supervisors can access ONLY assigned projects/worksites/contracts
DROP POLICY IF EXISTS sup_assignments_read ON supervisor_project_assignments;
CREATE POLICY sup_assignments_read ON supervisor_project_assignments
    FOR SELECT USING (
        supervisor_id = get_supervisor_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = supervisor_project_assignments.project_id
              AND p.contractor_id = get_contractor_id(auth.uid())
        )
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

-- INSTITUTIONAL USERS & ADMIN POLICIES
DROP POLICY IF EXISTS inst_users_read ON institutional_users;
CREATE POLICY inst_users_read ON institutional_users
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );
