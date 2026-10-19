-- ============================================================================
-- SHRAMIKSETU MIGRATION 032: Attendance Tokens Redesign & Anti-Fraud Hardening
--
-- Fixes UUID syntax error by eliminating storage of raw signed token in uuid column.
-- Implements SHA-256 token hashing, HMAC-SHA256 6-digit code hashing,
-- IST date alignment, AES-256 encrypted storage for contractor UI reload,
-- and strict partial unique index (one non-revoked token per project per valid_date).
-- ============================================================================

-- 1. Make legacy columns nullable
ALTER TABLE attendance_tokens
  ALTER COLUMN token DROP NOT NULL,
  ALTER COLUMN worksite_id DROP NOT NULL;

-- 2. Add required security and metadata columns
ALTER TABLE attendance_tokens
  ADD COLUMN IF NOT EXISTS valid_date DATE NOT NULL DEFAULT (timezone('Asia/Kolkata', now())::DATE),
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS code_hash TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_code TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_token TEXT,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Safely revoke existing historical rows so index constraint is clean
UPDATE attendance_tokens
SET revoked_at = COALESCE(expires_at, created_at, now())
WHERE revoked_at IS NULL;

-- 4. Partial unique index: strictly one active (non-revoked) token per project per valid_date
DROP INDEX IF EXISTS idx_attendance_tokens_active_project_date;
CREATE UNIQUE INDEX idx_attendance_tokens_active_project_date
  ON attendance_tokens (project_id, valid_date)
  WHERE (revoked_at IS NULL);

-- 5. Performance lookup indexes
CREATE INDEX IF NOT EXISTS idx_attendance_tokens_token_hash
  ON attendance_tokens (token_hash)
  WHERE (revoked_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_attendance_tokens_code_hash
  ON attendance_tokens (code_hash)
  WHERE (revoked_at IS NULL);
