-- Migration: 20260822000012_phase8_disputes_and_audit_trail.sql
-- Description: Phase 8 Disputes, Evidence Snapshots, Dispute Resolutions, and Tamper-Evident Audit Trail with Cryptographic Hash Chaining

-- Create Dispute Category Enum
DO $$ BEGIN
    CREATE TYPE dispute_category_enum AS ENUM (
        'ATTENDANCE',
        'WAGE',
        'PAYMENT',
        'PARTIAL_PAYMENT',
        'MISSING_PAYMENT',
        'CONTRACT_TERMS',
        'CONTRACT_AMENDMENT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Dispute Status Enum
DO $$ BEGIN
    CREATE TYPE dispute_status_enum AS ENUM (
        'OPEN',
        'UNDER_REVIEW',
        'WAITING_FOR_INFORMATION',
        'RESOLVED',
        'REJECTED',
        'CLOSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create Dispute Priority Enum
DO $$ BEGIN
    CREATE TYPE dispute_priority_enum AS ENUM (
        'LOW',
        'MEDIUM',
        'HIGH',
        'URGENT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Disputes Table
CREATE TABLE IF NOT EXISTS public.disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_ref TEXT NOT NULL UNIQUE,
    worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    contract_id UUID NOT NULL REFERENCES public.work_contracts(id) ON DELETE CASCADE,
    category dispute_category_enum NOT NULL,
    description TEXT NOT NULL,
    status dispute_status_enum NOT NULL DEFAULT 'OPEN',
    priority dispute_priority_enum NOT NULL DEFAULT 'MEDIUM',
    raised_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disputes_contractor ON public.disputes (contractor_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_worker ON public.disputes (worker_id, status);
CREATE INDEX IF NOT EXISTS idx_disputes_contract ON public.disputes (contract_id);

-- 2. Dispute Evidence Snapshots Table (Immutable Snapshot Gathered at Dispute Creation)
CREATE TABLE IF NOT EXISTS public.dispute_evidence_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    contract_snapshot JSONB NOT NULL,
    contract_versions_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    worker_acceptance_snapshot JSONB DEFAULT NULL,
    attendance_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    worker_attendance_confirmations_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    earnings_snapshot JSONB DEFAULT NULL,
    payment_transactions_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_confirmations_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    audit_events_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    automated_analysis JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_dispute ON public.dispute_evidence_snapshots (dispute_id);

-- 3. Dispute Resolutions Table (Append-Only Resolution Records)
CREATE TABLE IF NOT EXISTS public.dispute_resolutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    decision TEXT NOT NULL CHECK (decision IN ('RESOLVED', 'REJECTED')),
    reason TEXT NOT NULL,
    resolution_notes TEXT DEFAULT NULL,
    reviewer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_resolutions_dispute ON public.dispute_resolutions (dispute_id);

-- 4. Audit Events Table (Tamper-Evident Audit Trail with Cryptographic Hash Chaining)
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_number BIGSERIAL UNIQUE,
    actor_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN (
        'contract_created',
        'contract_accepted',
        'attendance_recorded',
        'attendance_confirmed',
        'payment_created',
        'payment_confirmed',
        'dispute_created',
        'dispute_updated',
        'dispute_resolved',
        'job_completed'
    )),
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash TEXT NOT NULL, -- Cryptographic SHA-256 hash of previous audit event row
    current_hash TEXT NOT NULL,  -- SHA-256(sequence_number + actor_id + action + entity_type + entity_id + timestamp + payload + previous_hash)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_sequence ON public.audit_events (sequence_number ASC);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON public.audit_events (entity_type, entity_id);
