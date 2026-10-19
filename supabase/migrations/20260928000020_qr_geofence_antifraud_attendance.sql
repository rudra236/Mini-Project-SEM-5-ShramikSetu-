-- ============================================================================
-- SHRAMIKSETU MIGRATION 020: Rotating QR, Geofence, Anti-Fraud Attendance
--
-- 1. Extends attendance_tokens: nonce, hmac_secret, short_code (6-digit),
--    ttl_seconds, payload_json (signed data)
-- 2. Extends attendance_events: gps_accuracy_meters, mock_location_flag,
--    device_fingerprint, punch_type (IN/OUT), captured_at (offline timestamp),
--    fraud_flags JSONB, review_status
-- 3. Creates fraud_review_queue for supervisor review of flagged punches
-- 4. Adds DISCREPANCY to attendance_status enum (already exists, safe DO block)
-- ============================================================================

-- 1. Safely add DISCREPANCY to attendance_status enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum WHERE enumlabel = 'FLAGGED'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'attendance_status')
  ) THEN
    ALTER TYPE attendance_status ADD VALUE 'FLAGGED';
  END IF;
END$$;

-- 2. Extend attendance_tokens for rotating signed QR
ALTER TABLE attendance_tokens
  ADD COLUMN IF NOT EXISTS nonce TEXT,
  ADD COLUMN IF NOT EXISTS hmac_secret TEXT,
  ADD COLUMN IF NOT EXISTS short_code VARCHAR(6),
  ADD COLUMN IF NOT EXISTS ttl_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS payload_json JSONB;

-- Index on short_code for manual fallback lookup
CREATE INDEX IF NOT EXISTS idx_tokens_short_code
  ON attendance_tokens(short_code) WHERE short_code IS NOT NULL;

-- Unique constraint on nonce to prevent replay
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_nonce_unique
  ON attendance_tokens(nonce) WHERE nonce IS NOT NULL;

-- 3. Extend attendance_events for anti-fraud and offline support
ALTER TABLE attendance_events
  ADD COLUMN IF NOT EXISTS gps_accuracy_meters NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS mock_location_flag BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS punch_type VARCHAR(3) NOT NULL DEFAULT 'IN'
    CHECK (punch_type IN ('IN', 'OUT')),
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fraud_flags JSONB DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (review_status IN ('NONE', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'));

-- 4. Fraud review queue table
CREATE TABLE IF NOT EXISTS fraud_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_event_id UUID NOT NULL REFERENCES attendance_events(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
  flag_reasons JSONB NOT NULL DEFAULT '[]'::JSONB,
  severity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_decision VARCHAR(10)
    CHECK (review_decision IS NULL OR review_decision IN ('APPROVED', 'REJECTED')),
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for review queue
CREATE INDEX IF NOT EXISTS idx_fraud_review_project
  ON fraud_review_queue(project_id);
CREATE INDEX IF NOT EXISTS idx_fraud_review_pending
  ON fraud_review_queue(review_decision) WHERE review_decision IS NULL;
CREATE INDEX IF NOT EXISTS idx_fraud_review_worker
  ON fraud_review_queue(worker_id);

-- 5. RLS on fraud_review_queue
ALTER TABLE fraud_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY fraud_review_read ON fraud_review_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = fraud_review_queue.project_id AND (
        p.contractor_id = get_contractor_id(auth.uid())
        OR is_supervisor_assigned_to_project(auth.uid(), p.id)
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
      )
    )
  );

CREATE POLICY fraud_review_manage ON fraud_review_queue
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p WHERE p.id = fraud_review_queue.project_id AND (
        p.contractor_id = get_contractor_id(auth.uid())
        OR is_supervisor_assigned_to_project(auth.uid(), p.id)
        OR get_user_role(auth.uid()) = 'ADMIN'
      )
    )
  );

-- 6. Index for device fingerprint fraud detection (many workers same device)
CREATE INDEX IF NOT EXISTS idx_attendance_device
  ON attendance_events(device_fingerprint) WHERE device_fingerprint IS NOT NULL;

-- 7. Index for captured_at (offline timestamp) queries
CREATE INDEX IF NOT EXISTS idx_attendance_captured_at
  ON attendance_events(captured_at) WHERE captured_at IS NOT NULL;
