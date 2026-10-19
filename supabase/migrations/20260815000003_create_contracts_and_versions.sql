-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 1
-- Migration 003: Work Contracts, Contract Versions & Acceptances
-- ============================================================================

-- 1. ENUMS FOR CONTRACTS
CREATE TYPE contract_status AS ENUM (
    'DRAFT',
    'PENDING_ACCEPTANCE',
    'ACTIVE',
    'REJECTED',
    'COMPLETED',
    'TERMINATED',
    'DISPUTED'
);

CREATE TYPE payment_frequency AS ENUM (
    'DAILY',
    'WEEKLY',
    'FORTNIGHTLY',
    'MONTHLY'
);

CREATE TYPE acceptance_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED'
);

-- 2. WORK CONTRACTS TABLE
CREATE TABLE work_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_code TEXT NOT NULL UNIQUE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    worksite_id UUID NOT NULL REFERENCES worksites(id) ON DELETE RESTRICT,
    work_type TEXT NOT NULL,
    daily_wage NUMERIC(10, 2) NOT NULL,
    expected_working_hours NUMERIC(4, 2) NOT NULL DEFAULT 8.00,
    payment_frequency payment_frequency NOT NULL DEFAULT 'DAILY',
    start_date DATE NOT NULL,
    end_date DATE,
    status contract_status NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    current_version_number INT NOT NULL DEFAULT 1,
    join_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT contracts_wage_check CHECK (daily_wage > 0),
    CONSTRAINT contracts_hours_check CHECK (expected_working_hours > 0 AND expected_working_hours <= 24),
    CONSTRAINT contracts_dates_check CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT contracts_version_num_check CHECK (current_version_number >= 1)
);

-- 3. CONTRACT VERSIONS TABLE
CREATE TABLE contract_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    daily_wage NUMERIC(10, 2) NOT NULL,
    expected_working_hours NUMERIC(4, 2) NOT NULL,
    payment_frequency payment_frequency NOT NULL,
    work_type TEXT NOT NULL,
    effective_date DATE NOT NULL,
    change_reason TEXT NOT NULL,
    terms_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT contract_version_num_check CHECK (version_number >= 1),
    CONSTRAINT contract_version_wage_check CHECK (daily_wage > 0),
    CONSTRAINT contract_version_hours_check CHECK (expected_working_hours > 0 AND expected_working_hours <= 24),
    CONSTRAINT contract_version_unique UNIQUE (contract_id, version_number)
);

-- 4. CONTRACT ACCEPTANCES TABLE
CREATE TABLE contract_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID NOT NULL REFERENCES work_contracts(id) ON DELETE CASCADE,
    contract_version_id UUID NOT NULL REFERENCES contract_versions(id) ON DELETE CASCADE,
    worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    response acceptance_status NOT NULL,
    rejection_reason TEXT,
    ip_address TEXT,
    user_agent TEXT,
    responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT contract_acceptance_unique UNIQUE (contract_version_id, worker_id)
);
