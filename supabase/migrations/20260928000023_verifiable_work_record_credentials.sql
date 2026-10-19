-- Migration: 20260928000023_verifiable_work_record_credentials.sql
-- Description: Tamper-evident verifiable work record credentials chained to the wage ledger

CREATE TABLE IF NOT EXISTS public.issued_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_ref TEXT UNIQUE NOT NULL,
    worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
    snapshot_payload JSONB NOT NULL,
    ledger_hash_at_issuance TEXT NOT NULL,
    credential_hash TEXT NOT NULL,
    sharing_consent JSONB NOT NULL DEFAULT '{"shareEarnings": true, "shareDisputes": true, "shareEmployerNames": true, "shareGpsMetrics": true}'::jsonb,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_credentials_ref
    ON public.issued_credentials(credential_ref);

CREATE INDEX IF NOT EXISTS idx_issued_credentials_worker
    ON public.issued_credentials(worker_id, issued_at DESC);

-- Enable RLS
ALTER TABLE public.issued_credentials ENABLE ROW LEVEL SECURITY;

-- 1. Anyone (including unauthenticated third parties) can read issued credentials by reference
CREATE POLICY "Public read issued credentials by ref"
    ON public.issued_credentials
    FOR SELECT
    USING (true);

-- 2. Service role has full administrative access
CREATE POLICY "Service role full access to issued credentials"
    ON public.issued_credentials
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.issued_credentials IS
    'Tamper-evident work record credentials issued to workers. Chained to the latest append-only double-entry wage ledger hash.';

COMMENT ON COLUMN public.issued_credentials.credential_ref IS
    'Human-readable unique verification reference, e.g. WR-20260928-8F2B.';

COMMENT ON COLUMN public.issued_credentials.snapshot_payload IS
    'Canonical JSON snapshot of verified metrics (shifts, earnings, GPS, disputes, tier) at issuance time.';

COMMENT ON COLUMN public.issued_credentials.credential_hash IS
    'SHA-256 of canonical snapshot payload concatenated with ledger_hash_at_issuance.';
