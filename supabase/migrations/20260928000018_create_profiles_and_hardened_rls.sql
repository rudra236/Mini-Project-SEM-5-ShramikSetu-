-- ============================================================================
-- SHRAMIKSETU SECURITY & AUTHORIZATION HARDENING
-- Migration 018: Profiles Table, Role Immutability Triggers, & Hardened RLS Policies
-- ============================================================================

-- 1. PROFILES TABLE (Mirrored to auth.users and public.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'WORKER',
    phone TEXT,
    email TEXT,
    full_name TEXT,
    locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'hi', 'mr')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT profiles_phone_format_check CHECK (phone IS NULL OR phone ~ '^\+?91?[6-9][0-9]{9}$')
);

-- Backfill profiles from users
INSERT INTO public.profiles (id, role, phone, email, locale, is_active, created_at, updated_at)
SELECT id, role, phone, email, locale, is_active, created_at, updated_at
FROM public.users
ON CONFLICT (id) DO UPDATE
SET role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    locale = EXCLUDED.locale,
    is_active = EXCLUDED.is_active;

-- Update phone constraint on public.users to strictly enforce Indian mobile numbers
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_phone_format_check;
ALTER TABLE public.users ADD CONSTRAINT users_phone_format_check CHECK (phone ~ '^\+?91?[6-9][0-9]{9}$');

-- Update action check on audit_events to support role and supervisor assignments
ALTER TABLE public.audit_events DROP CONSTRAINT IF EXISTS audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
    'contract_created',
    'contract_accepted',
    'attendance_recorded',
    'attendance_confirmed',
    'payment_created',
    'payment_confirmed',
    'dispute_created',
    'dispute_updated',
    'dispute_resolved',
    'job_completed',
    'role_assigned',
    'supervisor_assigned'
));

-- 2. PRIVILEGE ESCALATION IMMUTABILITY TRIGGER
-- Prevents authenticated clients from writing or mutating 'role'
CREATE OR REPLACE FUNCTION public.prevent_role_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role) THEN
        IF (auth.role() = 'authenticated' OR current_user = 'authenticated') THEN
            RAISE EXCEPTION 'PRIVILEGE_ESCALATION_FORBIDDEN: Client is prohibited from modifying user role from % to %.', OLD.role, NEW.role
                USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_mutation_profiles ON public.profiles;
CREATE TRIGGER trg_prevent_role_mutation_profiles
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_mutation();

DROP TRIGGER IF EXISTS trg_prevent_role_mutation_users ON public.users;
CREATE TRIGGER trg_prevent_role_mutation_users
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_role_mutation();

-- 3. TWO-WAY SYNC TRIGGER BETWEEN USERS AND PROFILES
CREATE OR REPLACE FUNCTION public.sync_users_to_profiles()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, phone, email, locale, is_active, created_at, updated_at)
    VALUES (NEW.id, NEW.role, NEW.phone, NEW.email, NEW.locale, NEW.is_active, NEW.created_at, NEW.updated_at)
    ON CONFLICT (id) DO UPDATE
    SET role = EXCLUDED.role,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        locale = EXCLUDED.locale,
        is_active = EXCLUDED.is_active,
        updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_users_to_profiles ON public.users;
CREATE TRIGGER trg_sync_users_to_profiles
AFTER INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_users_to_profiles();

-- 4. HARDENED ROW LEVEL SECURITY (RLS) POLICIES

-- Helper functions to prevent mutual RLS recursion between projects, workers, and supervisor assignments
CREATE OR REPLACE FUNCTION public.get_project_contractor_id(proj_uuid UUID)
RETURNS UUID AS $$
    SELECT contractor_id FROM public.projects WHERE id = proj_uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

DROP FUNCTION IF EXISTS public.is_supervisor_assigned_to_project(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.is_supervisor_assigned_to_project(proj_uuid UUID, sup_uuid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.supervisor_project_assignments
        WHERE project_id = proj_uuid AND supervisor_id = sup_uuid
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4.1 PROFILES POLICIES
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles
    FOR SELECT USING (
        auth.uid() = id
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
CREATE POLICY profiles_self_insert ON public.profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id AND role IN ('WORKER', 'CONTRACTOR')
    );

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 4.2 USERS POLICIES
DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users
    FOR SELECT USING (
        auth.uid() = id
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

DROP POLICY IF EXISTS users_self_insert ON public.users;
CREATE POLICY users_self_insert ON public.users
    FOR INSERT WITH CHECK (
        auth.uid() = id AND role IN ('WORKER', 'CONTRACTOR')
    );

DROP POLICY IF EXISTS users_self_update ON public.users;
CREATE POLICY users_self_update ON public.users
    FOR UPDATE USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 4.3 WORKERS POLICIES
DROP POLICY IF EXISTS workers_read ON public.workers;
CREATE POLICY workers_read ON public.workers
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM public.work_contracts wc
            WHERE wc.worker_id = workers.id
            AND (
                wc.contractor_id = get_contractor_id(auth.uid())
                OR is_supervisor_assigned_to_project(wc.project_id, get_supervisor_id(auth.uid()))
            )
        )
    );

DROP POLICY IF EXISTS workers_self_insert ON public.workers;
CREATE POLICY workers_self_insert ON public.workers
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS workers_self_update ON public.workers;
CREATE POLICY workers_self_update ON public.workers
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 4.4 CONTRACTORS POLICIES
DROP POLICY IF EXISTS contractors_read ON public.contractors;
CREATE POLICY contractors_read ON public.contractors
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM public.work_contracts wc
            WHERE wc.contractor_id = contractors.id
            AND wc.worker_id = get_worker_id(auth.uid())
        )
        OR EXISTS (
            SELECT 1 FROM public.supervisors s
            WHERE s.contractor_id = contractors.id
            AND s.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS contractors_self_insert ON public.contractors;
CREATE POLICY contractors_self_insert ON public.contractors
    FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS contractors_self_update ON public.contractors;
CREATE POLICY contractors_self_update ON public.contractors
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- 4.5 SUPERVISORS POLICIES
DROP POLICY IF EXISTS supervisors_read ON public.supervisors;
CREATE POLICY supervisors_read ON public.supervisors
    FOR SELECT USING (
        user_id = auth.uid()
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

DROP POLICY IF EXISTS supervisors_contractor_manage ON public.supervisors;
CREATE POLICY supervisors_contractor_manage ON public.supervisors
    FOR ALL USING (
        contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) = 'ADMIN'
    );

-- 4.6 PROJECTS POLICIES
DROP POLICY IF EXISTS projects_read ON public.projects;
CREATE POLICY projects_read ON public.projects
    FOR SELECT USING (
        contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR is_supervisor_assigned_to_project(projects.id, get_supervisor_id(auth.uid()))
        OR EXISTS (
            SELECT 1 FROM public.work_contracts wc
            WHERE wc.project_id = projects.id AND wc.worker_id = get_worker_id(auth.uid())
        )
    );

DROP POLICY IF EXISTS projects_contractor_manage ON public.projects;
CREATE POLICY projects_contractor_manage ON public.projects
    FOR ALL USING (
        contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) = 'ADMIN'
    );

-- 4.7 SUPERVISOR PROJECT ASSIGNMENTS POLICIES
DROP POLICY IF EXISTS sup_assignments_read ON public.supervisor_project_assignments;
CREATE POLICY sup_assignments_read ON public.supervisor_project_assignments
    FOR SELECT USING (
        supervisor_id = get_supervisor_id(auth.uid())
        OR get_project_contractor_id(supervisor_project_assignments.project_id) = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

DROP POLICY IF EXISTS sup_assignments_contractor_manage ON public.supervisor_project_assignments;
CREATE POLICY sup_assignments_contractor_manage ON public.supervisor_project_assignments
    FOR ALL USING (
        get_project_contractor_id(supervisor_project_assignments.project_id) = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) = 'ADMIN'
    );

-- 4.8 WORK CONTRACTS POLICIES
DROP POLICY IF EXISTS contracts_read ON public.work_contracts;
CREATE POLICY contracts_read ON public.work_contracts
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR is_supervisor_assigned_to_project(work_contracts.project_id, get_supervisor_id(auth.uid()))
    );

DROP POLICY IF EXISTS contracts_contractor_manage ON public.work_contracts;
CREATE POLICY contracts_contractor_manage ON public.work_contracts
    FOR INSERT WITH CHECK (
        contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
    );

DROP POLICY IF EXISTS contracts_contractor_update ON public.work_contracts;
CREATE POLICY contracts_contractor_update ON public.work_contracts
    FOR UPDATE USING (
        contractor_id = get_contractor_id(auth.uid()) OR get_user_role(auth.uid()) = 'ADMIN'
    );

DROP POLICY IF EXISTS contracts_worker_update_status ON public.work_contracts;
CREATE POLICY contracts_worker_update_status ON public.work_contracts
    FOR UPDATE USING (
        worker_id = get_worker_id(auth.uid())
    ) WITH CHECK (
        worker_id = get_worker_id(auth.uid())
    );

-- 4.9 ATTENDANCE TOKENS POLICIES (Supervisors and Contractors create; Workers scan)
DROP POLICY IF EXISTS tokens_read ON public.attendance_tokens;
CREATE POLICY tokens_read ON public.attendance_tokens
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = attendance_tokens.project_id
            AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.supervisor_project_assignments spa
                    WHERE spa.project_id = p.id AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
                OR EXISTS (
                    SELECT 1 FROM public.work_contracts wc
                    WHERE wc.project_id = p.id AND wc.worker_id = get_worker_id(auth.uid())
                )
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
            )
        )
    );

DROP POLICY IF EXISTS tokens_supervisor_contractor_insert ON public.attendance_tokens;
CREATE POLICY tokens_supervisor_contractor_insert ON public.attendance_tokens
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = attendance_tokens.project_id
            AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.supervisor_project_assignments spa
                    WHERE spa.project_id = p.id AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
                OR get_user_role(auth.uid()) = 'ADMIN'
            )
        )
    );

-- 4.10 ATTENDANCE EVENTS POLICIES (Worker records own; Supervisor can log at gate; Contractor reviews)
DROP POLICY IF EXISTS attendance_read ON public.attendance_events;
CREATE POLICY attendance_read ON public.attendance_events
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
        OR EXISTS (
            SELECT 1 FROM public.work_contracts wc
            WHERE wc.id = attendance_events.contract_id
            AND (
                wc.contractor_id = get_contractor_id(auth.uid())
                OR EXISTS (
                    SELECT 1 FROM public.supervisor_project_assignments spa
                    WHERE spa.project_id = wc.project_id
                    AND spa.supervisor_id = get_supervisor_id(auth.uid())
                )
            )
        )
    );

DROP POLICY IF EXISTS attendance_insert ON public.attendance_events;
CREATE POLICY attendance_insert ON public.attendance_events
    FOR INSERT WITH CHECK (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.work_contracts wc
            WHERE wc.id = attendance_events.contract_id
            AND EXISTS (
                SELECT 1 FROM public.supervisor_project_assignments spa
                WHERE spa.project_id = wc.project_id
                AND spa.supervisor_id = get_supervisor_id(auth.uid())
            )
        )
        OR get_user_role(auth.uid()) = 'ADMIN'
    );

-- 4.11 LEDGER & WALLET POLICIES (Append-only; no raw write access for Inspector/Contractor)
DROP POLICY IF EXISTS wallet_accounts_read ON public.wallet_accounts;
CREATE POLICY wallet_accounts_read ON public.wallet_accounts
    FOR SELECT USING (
        (account_type = 'WORKER'     AND owner_id = get_worker_id(auth.uid()))
        OR (account_type = 'CONTRACTOR' AND owner_id = get_contractor_id(auth.uid()))
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

DROP POLICY IF EXISTS payment_transactions_read ON public.payment_transactions;
CREATE POLICY payment_transactions_read ON public.payment_transactions
    FOR SELECT USING (
        worker_id     = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

DROP POLICY IF EXISTS ledger_entries_read ON public.ledger_entries;
CREATE POLICY ledger_entries_read ON public.ledger_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.payment_transactions pt
            WHERE pt.id = ledger_entries.transaction_id
              AND (
                  pt.worker_id     = get_worker_id(auth.uid())
                  OR pt.contractor_id = get_contractor_id(auth.uid())
                  OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
              )
        )
    );

-- 4.12 DISPUTES POLICIES (Workers/Contractors see own; Inspector reviews and updates status)
DROP POLICY IF EXISTS disputes_read ON public.disputes;
CREATE POLICY disputes_read ON public.disputes
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

DROP POLICY IF EXISTS disputes_worker_insert ON public.disputes;
CREATE POLICY disputes_worker_insert ON public.disputes
    FOR INSERT WITH CHECK (
        worker_id = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) = 'ADMIN'
    );

DROP POLICY IF EXISTS disputes_inspector_update ON public.disputes;
CREATE POLICY disputes_inspector_update ON public.disputes
    FOR UPDATE USING (
        get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    ) WITH CHECK (
        get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

-- 4.13 AUDIT EVENTS POLICIES (Inspector/Admin read-only audit log; no modifications)
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_read ON public.audit_events;
CREATE POLICY audit_events_read ON public.audit_events
    FOR SELECT USING (
        get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

-- 4.14 ACCEPTANCES & WORKSITES POLICIES (recreated after cascade)
DROP POLICY IF EXISTS acceptances_read ON public.contract_acceptances;
CREATE POLICY acceptances_read ON public.contract_acceptances
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.work_contracts wc
            WHERE wc.id = contract_acceptances.contract_id
              AND (
                  wc.contractor_id = get_contractor_id(auth.uid())
                  OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                  OR is_supervisor_assigned_to_project(wc.project_id, get_supervisor_id(auth.uid()))
              )
        )
    );

DROP POLICY IF EXISTS worksites_read ON public.worksites;
CREATE POLICY worksites_read ON public.worksites
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = worksites.project_id AND (
                p.contractor_id = get_contractor_id(auth.uid())
                OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
                OR is_supervisor_assigned_to_project(p.id, get_supervisor_id(auth.uid()))
                OR is_worker_on_project(auth.uid(), p.id)
            )
        )
    );
