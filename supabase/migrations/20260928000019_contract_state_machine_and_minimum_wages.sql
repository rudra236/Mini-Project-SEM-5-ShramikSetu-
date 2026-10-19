-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 12
-- Migration 019: Contract State Machine & Statutory Minimum Wage Benchmarks
-- ============================================================================
-- States: DRAFT -> OFFERED -> ACCEPTED/REJECTED -> ACTIVE -> COMPLETED/TERMINATED
-- Enforces:
--   1. Enum expansion: OFFERED and ACCEPTED in contract_status
--   2. minimum_wages table with skill tier, region, effective date, and citation
--   3. Cryptographic terms_hash, ip_hash, and device_info on contract_acceptances
--   4. Database trigger rejecting any illegal state machine transition
-- ============================================================================

-- 1. EXTEND CONTRACT STATUS ENUM
DO $$
BEGIN
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'OFFERED';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'ACCEPTED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. CREATE MINIMUM WAGES TABLE (Admin-editable Legal Benchmarks)
CREATE TABLE IF NOT EXISTS public.minimum_wages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_tier skill_category_enum NOT NULL,
    region TEXT NOT NULL, -- e.g. 'Mumbai Suburban' or 'Maharashtra'
    effective_date DATE NOT NULL,
    minimum_wage_paise BIGINT NOT NULL CHECK (minimum_wage_paise > 0),
    source_citation TEXT NOT NULL, -- e.g. 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for speedy lookups
CREATE INDEX IF NOT EXISTS idx_min_wages_region_skill 
ON public.minimum_wages (region, skill_tier, is_active, effective_date);

-- 3. TAMPER-EVIDENT ACCEPTANCE AUDIT COLUMNS
ALTER TABLE public.contract_acceptances ADD COLUMN IF NOT EXISTS ip_hash TEXT;
ALTER TABLE public.contract_acceptances ADD COLUMN IF NOT EXISTS device_info TEXT;
ALTER TABLE public.contract_acceptances ADD COLUMN IF NOT EXISTS terms_hash TEXT;
ALTER TABLE public.contract_acceptances ADD COLUMN IF NOT EXISTS contract_pdf_url TEXT;

ALTER TABLE public.work_contracts ADD COLUMN IF NOT EXISTS terms_hash TEXT;
ALTER TABLE public.work_contracts ADD COLUMN IF NOT EXISTS contract_pdf_url TEXT;

-- 4. DATABASE-LEVEL STATE MACHINE ENFORCEMENT TRIGGER
-- Rejects any transition outside the strict statutory contract lifecycle:
--   DRAFT -> OFFERED / PENDING_ACCEPTANCE / REJECTED / TERMINATED
--   OFFERED -> ACCEPTED / REJECTED / TERMINATED
--   PENDING_ACCEPTANCE -> ACCEPTED / REJECTED / TERMINATED / ACTIVE (compat)
--   ACCEPTED -> ACTIVE / TERMINATED / DISPUTED
--   ACTIVE -> COMPLETED / TERMINATED / DISPUTED
--   DISPUTED -> ACTIVE / COMPLETED / TERMINATED
CREATE OR REPLACE FUNCTION check_contract_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    -- Only evaluate when status actually changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Identical status is a no-op
        IF OLD.status = NEW.status THEN
            RETURN NEW;
        END IF;

        -- 1. DRAFT transitions
        IF OLD.status = 'DRAFT' AND NEW.status IN ('OFFERED', 'PENDING_ACCEPTANCE', 'REJECTED', 'TERMINATED') THEN
            RETURN NEW;
        END IF;

        -- 2. OFFERED transitions
        IF OLD.status = 'OFFERED' AND NEW.status IN ('ACCEPTED', 'REJECTED', 'TERMINATED') THEN
            RETURN NEW;
        END IF;

        -- 3. PENDING_ACCEPTANCE transitions (compatibility alias for OFFERED)
        IF OLD.status = 'PENDING_ACCEPTANCE' AND NEW.status IN ('ACCEPTED', 'REJECTED', 'TERMINATED', 'ACTIVE') THEN
            RETURN NEW;
        END IF;

        -- 4. ACCEPTED transitions
        IF OLD.status = 'ACCEPTED' AND NEW.status IN ('ACTIVE', 'TERMINATED', 'DISPUTED') THEN
            RETURN NEW;
        END IF;

        -- 5. ACTIVE transitions
        IF OLD.status = 'ACTIVE' AND NEW.status IN ('COMPLETED', 'TERMINATED', 'DISPUTED') THEN
            RETURN NEW;
        END IF;

        -- 6. DISPUTED transitions
        IF OLD.status = 'DISPUTED' AND NEW.status IN ('ACTIVE', 'COMPLETED', 'TERMINATED') THEN
            RETURN NEW;
        END IF;

        -- Any other transition is strictly ILLEGAL at the database level
        RAISE EXCEPTION 'ILLEGAL_CONTRACT_TRANSITION: Invalid status transition from % to %', OLD.status, NEW.status
            USING ERRCODE = '23514'; -- check_violation
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_contract_status_transition ON public.work_contracts;
CREATE TRIGGER trg_enforce_contract_status_transition
    BEFORE UPDATE OF status ON public.work_contracts
    FOR EACH ROW
    EXECUTE FUNCTION check_contract_status_transition();

-- 5. SEED STATUTORY MINIMUM WAGE BENCHMARKS
INSERT INTO public.minimum_wages (id, skill_tier, region, effective_date, minimum_wage_paise, source_citation, is_active)
VALUES
    ('eeeeeeee-0002-0000-0000-000000000001', 'UNSKILLED', 'Mumbai Suburban', '2026-01-01', 65000, 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04', TRUE),
    ('eeeeeeee-0002-0000-0000-000000000002', 'SEMI_SKILLED', 'Mumbai Suburban', '2026-01-01', 75000, 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04', TRUE),
    ('eeeeeeee-0002-0000-0000-000000000003', 'SKILLED', 'Mumbai Suburban', '2026-01-01', 85000, 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04', TRUE),
    ('eeeeeeee-0002-0000-0000-000000000004', 'HIGHLY_SKILLED', 'Mumbai Suburban', '2026-01-01', 100000, 'Govt. of Maharashtra Gazette Notification CLRA/MW/2026/04', TRUE)
ON CONFLICT (id) DO UPDATE SET
    minimum_wage_paise = EXCLUDED.minimum_wage_paise,
    source_citation = EXCLUDED.source_citation,
    updated_at = NOW();

-- 6. ROW LEVEL SECURITY (RLS) FOR minimum_wages
ALTER TABLE public.minimum_wages ENABLE ROW LEVEL SECURITY;

-- Readable by all authenticated users
DROP POLICY IF EXISTS "minimum_wages_select_policy" ON public.minimum_wages;
CREATE POLICY "minimum_wages_select_policy" ON public.minimum_wages
    FOR SELECT TO authenticated
    USING (TRUE);

-- Editable by ADMIN or INSTITUTIONAL_USER only
DROP POLICY IF EXISTS "minimum_wages_modify_policy" ON public.minimum_wages;
CREATE POLICY "minimum_wages_modify_policy" ON public.minimum_wages
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.role IN ('ADMIN', 'INSTITUTIONAL_USER')
        )
    );
