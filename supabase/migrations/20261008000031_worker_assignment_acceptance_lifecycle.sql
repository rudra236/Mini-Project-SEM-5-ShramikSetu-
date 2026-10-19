-- ============================================================================
-- SHRAMIKSETU DATABASE MIGRATION - PHASE 14
-- Migration 031: Worker Assignment Acceptance Lifecycle, Rejection Reason & Notifications
-- ============================================================================

-- 1. EXTEND CONTRACT STATUS ENUM
DO $$
BEGIN
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'PENDING';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'CANCELLED';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'ENDED';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'accepted';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'rejected';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'cancelled';
    ALTER TYPE contract_status ADD VALUE IF NOT EXISTS 'ended';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. ADD ASSIGNMENT LIFECYCLE COLUMNS TO WORK_CONTRACTS
ALTER TABLE public.work_contracts ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE public.work_contracts ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- 3. EXTEND NOTIFICATIONS TABLE
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title_key TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body_key TEXT;

DO $$
BEGIN
    ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'ASSIGNMENT_INVITE';
    ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'ASSIGNMENT_ACCEPTED';
    ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'ASSIGNMENT_REJECTED';
    ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'ASSIGNMENT_CANCELLED';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 4. UPDATE STATE MACHINE TRANSITION TRIGGER
CREATE OR REPLACE FUNCTION check_contract_status_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        -- Identical status is a no-op
        IF OLD.status::text = NEW.status::text THEN
            RETURN NEW;
        END IF;

        -- Normalize uppercase string representation for comparison
        DECLARE
            old_s text := UPPER(OLD.status::text);
            new_s text := UPPER(NEW.status::text);
        BEGIN
            -- 1. DRAFT transitions
            IF old_s = 'DRAFT' AND new_s IN ('PENDING', 'OFFERED', 'PENDING_ACCEPTANCE', 'REJECTED', 'TERMINATED', 'CANCELLED') THEN
                RETURN NEW;
            END IF;

            -- 2. PENDING / OFFERED transitions
            IF old_s IN ('PENDING', 'OFFERED', 'PENDING_ACCEPTANCE') AND new_s IN ('ACCEPTED', 'ACTIVE', 'REJECTED', 'CANCELLED', 'TERMINATED') THEN
                RETURN NEW;
            END IF;

            -- 3. ACCEPTED transitions
            IF old_s = 'ACCEPTED' AND new_s IN ('ACTIVE', 'COMPLETED', 'ENDED', 'TERMINATED', 'DISPUTED', 'CANCELLED') THEN
                RETURN NEW;
            END IF;

            -- 4. ACTIVE transitions
            IF old_s = 'ACTIVE' AND new_s IN ('ACCEPTED', 'COMPLETED', 'ENDED', 'TERMINATED', 'DISPUTED', 'CANCELLED') THEN
                RETURN NEW;
            END IF;

            -- 5. DISPUTED transitions
            IF old_s = 'DISPUTED' AND new_s IN ('ACTIVE', 'ACCEPTED', 'COMPLETED', 'ENDED', 'TERMINATED') THEN
                RETURN NEW;
            END IF;

            -- Any other transition is rejected
            RAISE EXCEPTION 'ILLEGAL_CONTRACT_TRANSITION: Invalid status transition from % to %', OLD.status, NEW.status
                USING ERRCODE = '23514';
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. MIGRATE ALL EXISTING ASSIGNMENTS TO ACCEPTED SO NOTHING BREAKS
UPDATE public.work_contracts
SET status = 'ACCEPTED'
WHERE status IN ('OFFERED', 'PENDING_ACCEPTANCE');

-- 6. KEEP DB-LEVEL UNIQUENESS (Partial unique index)
-- Only pending/active/accepted assignments are unique per worker per project.
-- After rejected or cancelled, the contractor can invite again.
DROP INDEX IF EXISTS idx_unique_active_project_worker;
CREATE UNIQUE INDEX idx_unique_active_project_worker 
ON public.work_contracts (project_id, worker_id) 
WHERE status IN ('ACTIVE', 'ACCEPTED', 'PENDING', 'OFFERED', 'PENDING_ACCEPTANCE');

