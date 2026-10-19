-- Migration: 20260822000011_phase7_reconciliation_compliance_indicator.sql
-- Description: Phase 7 Minimum Wage Rules, Compliance Check Logs, and Contractor Compliance Snapshots

-- Create ENUM for Compliance Check Result
DO $$ BEGIN
    CREATE TYPE compliance_result_enum AS ENUM (
        'COMPLIANT',
        'REVIEW_REQUIRED',
        'POTENTIAL_NON_COMPLIANCE',
        'INSUFFICIENT_DATA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ENUM for Contractor Risk Level
DO $$ BEGIN
    CREATE TYPE contractor_risk_level_enum AS ENUM (
        'GOOD_STANDING',
        'LOW_RISK',
        'MEDIUM_RISK',
        'HIGH_RISK'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Minimum Wage Rules Table (Versioned Legal Wage Benchmarks)
CREATE TABLE IF NOT EXISTS public.minimum_wage_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version INTEGER NOT NULL DEFAULT 1,
    state TEXT NOT NULL,
    district TEXT DEFAULT NULL, -- NULL indicates state-wide default rule
    worker_category TEXT DEFAULT NULL, -- e.g. 'CONSTRUCTION', 'AGRICULTURE', or NULL for all
    skill_level skill_category_enum NOT NULL, -- 'UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED'
    wage_type TEXT NOT NULL DEFAULT 'DAILY', -- 'DAILY', 'MONTHLY', 'HOURLY'
    minimum_amount_paise BIGINT NOT NULL CHECK (minimum_amount_paise > 0),
    effective_from DATE NOT NULL,
    effective_to DATE DEFAULT NULL, -- NULL indicates currently active/ongoing
    source_reference TEXT NOT NULL, -- e.g. Gazette Notification No. XYZ
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient rule lookups by jurisdiction, skill level, and effective dates
CREATE INDEX IF NOT EXISTS idx_min_wage_rules_lookup 
ON public.minimum_wage_rules (state, skill_level, is_active, effective_from, effective_to);

-- 2. Compliance Check Logs Table (Tamper-evident Audit Records of Compliance Evaluations)
CREATE TABLE IF NOT EXISTS public.compliance_check_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES public.work_contracts(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES public.minimum_wage_rules(id) ON DELETE SET NULL,
    rule_version INTEGER DEFAULT NULL,
    rule_snapshot JSONB DEFAULT NULL,
    inputs JSONB NOT NULL,
    calculation JSONB NOT NULL,
    result compliance_result_enum NOT NULL,
    explanation TEXT NOT NULL,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_by UUID DEFAULT NULL REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_logs_contract 
ON public.compliance_check_logs (contract_id, checked_at DESC);

-- 3. Contractor Compliance Snapshots Table (Explainable Risk Indicator History)
CREATE TABLE IF NOT EXISTS public.contractor_compliance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    risk_level contractor_risk_level_enum NOT NULL,
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    breakdown JSONB NOT NULL,
    explanations JSONB NOT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractor_compliance_snapshots_contractor 
ON public.contractor_compliance_snapshots (contractor_id, evaluated_at DESC);
