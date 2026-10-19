-- ============================================================================
-- SHRAMIKSETU DATABASE MIGRATION: Standardize Auth, Login IDs, & Password Hashes
-- Migration: 20261004000027_standardize_auth_and_passwords.sql
-- ============================================================================

-- 1. Add login_id, password_hash, and set_password_token columns to public.users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS login_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS set_password_token TEXT,
ADD COLUMN IF NOT EXISTS set_password_token_expires_at TIMESTAMPTZ;

-- 2. Add internal_contractor_id and password_hash to public.contractors
ALTER TABLE public.contractors
ADD COLUMN IF NOT EXISTS internal_contractor_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 3. Ensure workers has password_hash
ALTER TABLE public.workers
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 4. Create Indexes for High-Speed Login Lookups
CREATE INDEX IF NOT EXISTS idx_users_login_id ON public.users(login_id);
CREATE INDEX IF NOT EXISTS idx_contractors_internal_id ON public.contractors(internal_contractor_id);
CREATE INDEX IF NOT EXISTS idx_users_set_password_token ON public.users(set_password_token) WHERE set_password_token IS NOT NULL;

-- 5. Safe Backfill for Existing Workers (Map internal_worker_id -> users.login_id and sync password_hash)
UPDATE public.users u
SET login_id = w.internal_worker_id,
    password_hash = COALESCE(u.password_hash, w.password_hash)
FROM public.workers w
WHERE w.user_id = u.id AND (u.login_id IS NULL OR u.login_id = '');

-- 6. Safe Backfill for Existing Contractors (Assign SS-C-2026-XXXXXX identifiers)
DO $$
DECLARE
    r RECORD;
    seq_num INT := 1;
    new_id TEXT;
BEGIN
    FOR r IN SELECT id, user_id FROM public.contractors WHERE internal_contractor_id IS NULL ORDER BY created_at ASC LOOP
        new_id := 'SS-C-2026-' || LPAD(seq_num::TEXT, 6, '0');
        UPDATE public.contractors SET internal_contractor_id = new_id WHERE id = r.id;
        UPDATE public.users SET login_id = new_id WHERE id = r.user_id AND (login_id IS NULL OR login_id = '');
        seq_num := seq_num + 1;
    END LOOP;
END $$;

-- 7. Sync backfill to profiles table if profiles table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS login_id TEXT;
        UPDATE public.profiles p
        SET login_id = u.login_id
        FROM public.users u
        WHERE u.id = p.id AND p.login_id IS NULL;
    END IF;
END $$;

-- Rollback instructions:
-- ALTER TABLE public.users DROP COLUMN IF EXISTS login_id;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS password_hash;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS set_password_token;
-- ALTER TABLE public.users DROP COLUMN IF EXISTS set_password_token_expires_at;
-- ALTER TABLE public.contractors DROP COLUMN IF EXISTS internal_contractor_id;
-- ALTER TABLE public.contractors DROP COLUMN IF EXISTS password_hash;
-- DROP INDEX IF EXISTS idx_users_login_id;
-- DROP INDEX IF EXISTS idx_contractors_internal_id;
-- DROP INDEX IF EXISTS idx_users_set_password_token;
