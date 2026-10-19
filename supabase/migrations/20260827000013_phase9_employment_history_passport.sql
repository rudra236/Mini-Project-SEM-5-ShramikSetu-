-- Migration: 20260827000013_phase9_employment_history_passport.sql
-- Description: Phase 9 Employment History, Job Completion Statements, and Benefit Passport
--
-- DESIGN NOTES:
--   - job_completion_statements is an IMMUTABLE record generated when employment ends.
--   - settlement_status is computed at generation time from reconciliation:
--       outstanding_paise > 0  → OUTSTANDING_PAYMENT
--       outstanding_paise = 0  → SETTLED
--   - The statement can never be edited after creation (no UPDATE endpoint).

-- ─── 1. Settlement Status Enum ─────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE settlement_status_enum AS ENUM (
        'SETTLED',
        'OUTSTANDING_PAYMENT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ─── 2. Job Completion Statements Table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_completion_statements (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Core references (indexed)
    employment_relationship_id  UUID NOT NULL REFERENCES public.employment_relationships(id) ON DELETE CASCADE,
    contract_id                 UUID NOT NULL REFERENCES public.work_contracts(id) ON DELETE CASCADE,
    worker_id                   UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    contractor_id               UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    project_id                  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    -- Contract summary (snapshot at completion time)
    work_type                   TEXT NOT NULL,
    contract_period_start       DATE NOT NULL,
    contract_period_end         DATE,
    acceptance_date             TIMESTAMPTZ NOT NULL,

    -- Financial summary (all monetary values in integer paise — ₹1 = 100 paise)
    daily_wage_paise            BIGINT NOT NULL CHECK (daily_wage_paise > 0),
    verified_workdays           INTEGER NOT NULL DEFAULT 0 CHECK (verified_workdays >= 0),
    total_earned_paise          BIGINT NOT NULL DEFAULT 0 CHECK (total_earned_paise >= 0),
    total_paid_paise            BIGINT NOT NULL DEFAULT 0 CHECK (total_paid_paise >= 0),
    outstanding_paise           BIGINT NOT NULL DEFAULT 0,

    -- Dispute summary
    total_disputes              INTEGER NOT NULL DEFAULT 0 CHECK (total_disputes >= 0),
    open_disputes               INTEGER NOT NULL DEFAULT 0 CHECK (open_disputes >= 0),
    resolved_disputes           INTEGER NOT NULL DEFAULT 0 CHECK (resolved_disputes >= 0),

    -- Settlement determination (computed from reconciliation, stored immutably)
    settlement_status           settlement_status_enum NOT NULL,

    -- Provenance
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by                UUID NOT NULL REFERENCES public.users(id)
);

-- Unique: one completion statement per employment relationship
CREATE UNIQUE INDEX IF NOT EXISTS idx_jcs_employment_relationship
    ON public.job_completion_statements (employment_relationship_id);

-- Secondary lookup indexes
CREATE INDEX IF NOT EXISTS idx_jcs_worker
    ON public.job_completion_statements (worker_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jcs_contractor
    ON public.job_completion_statements (contractor_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jcs_contract
    ON public.job_completion_statements (contract_id);

-- ─── 3. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE public.job_completion_statements ENABLE ROW LEVEL SECURITY;

-- Workers can read their own statements
CREATE POLICY "Workers read own job completion statements"
    ON public.job_completion_statements
    FOR SELECT
    USING (
        worker_id IN (
            SELECT w.id FROM public.workers w
            WHERE w.user_id = auth.uid()
        )
    );

-- Contractors can read statements for workers under their contracts
CREATE POLICY "Contractors read their worker statements"
    ON public.job_completion_statements
    FOR SELECT
    USING (
        contractor_id IN (
            SELECT c.id FROM public.contractors c
            WHERE c.user_id = auth.uid()
        )
    );

-- Service role (API layer) has full access — all write operations go through API handlers
CREATE POLICY "Service role full access to job completion statements"
    ON public.job_completion_statements
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ─── 4. Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.job_completion_statements IS
    'Immutable record generated when a work contract/employment ends. '
    'settlement_status is computed from reconciliation at generation time and never updated. '
    'outstanding_paise > 0 → OUTSTANDING_PAYMENT. outstanding_paise = 0 → SETTLED.';

COMMENT ON COLUMN public.job_completion_statements.settlement_status IS
    'SETTLED: all earned wages fully paid. OUTSTANDING_PAYMENT: unpaid wages remain.';

COMMENT ON COLUMN public.job_completion_statements.outstanding_paise IS
    'total_earned_paise - total_paid_paise. May be negative if overpaid (rare edge case).';
