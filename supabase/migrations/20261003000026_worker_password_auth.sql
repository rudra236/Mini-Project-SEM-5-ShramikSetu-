-- ============================================================================
-- SHRAMIKSETU DATABASE MIGRATION: Worker Password Auth & Attendance Method
-- Migration: 20261003000026_worker_password_auth.sql
-- ============================================================================

-- 1. Add password_hash column to workers table (for Worker ID + Password authentication)
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 2. Add attendance_method column to attendance_events (values: 'qr', 'otp')
ALTER TABLE attendance_events
ADD COLUMN IF NOT EXISTS attendance_method TEXT DEFAULT 'qr' CHECK (attendance_method IN ('qr', 'otp', 'manual'));

-- 3. Index on workers(internal_worker_id) for fast lookup by worker ID
CREATE INDEX IF NOT EXISTS idx_workers_internal_id ON workers(internal_worker_id);

-- Rollback script:
-- ALTER TABLE workers DROP COLUMN IF EXISTS password_hash;
-- ALTER TABLE attendance_events DROP COLUMN IF EXISTS attendance_method;
-- DROP INDEX IF EXISTS idx_workers_internal_id;
