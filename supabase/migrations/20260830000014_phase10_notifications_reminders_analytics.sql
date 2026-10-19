-- ============================================================================
-- SHRAMIKSETU DATABASE HARDENING - PHASE 10
-- Migration 014: Notifications, Reminders, and Geographic Filtering Support
-- ============================================================================

-- 1. NOTIFICATION TYPES ENUM
DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        -- Worker notification types
        'NEW_CONTRACT',
        'CONTRACT_ACCEPTANCE',
        'ATTENDANCE_MARKED',
        'ATTENDANCE_CONFIRMATION',
        'PAYMENT_RECORDED',
        'PAYMENT_CONFIRMATION',
        'OUTSTANDING_WAGE',
        'DISPUTE_RAISED',
        'DISPUTE_RESOLUTION',
        'JOB_COMPLETION',
        
        -- Contractor notification types
        'WORKER_ACCEPTANCE',
        'ATTENDANCE_REMINDER',
        'ATTENDANCE_DISCREPANCY',
        'PAYMENT_DISCREPANCY',
        'CONTRACTOR_DISPUTE',

        -- Institutional notification types
        'NEW_ESCALATED_CASE',
        'POTENTIAL_COMPLIANCE_ISSUE',
        'REPEATED_DISCREPANCY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    type notification_type_enum NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_title_check CHECK (length(trim(title)) > 0),
    CONSTRAINT notifications_message_check CHECK (length(trim(message)) > 0)
);

-- 3. REMINDERS TABLE
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES work_contracts(id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'COMPLETED', 'CANCELLED')),
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. INDEXES FOR NOTIFICATIONS AND REMINDERS
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id_status ON reminders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);

-- 5. ROW LEVEL SECURITY (RLS) POLICIES FOR NOTIFICATIONS & REMINDERS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

-- Notifications RLS
CREATE POLICY notifications_read ON notifications
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

CREATE POLICY notifications_user_update ON notifications
    FOR UPDATE USING (
        user_id = auth.uid()
    ) WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY notifications_service_insert ON notifications
    FOR INSERT WITH CHECK (TRUE);

-- Reminders RLS
CREATE POLICY reminders_read ON reminders
    FOR SELECT USING (
        user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

CREATE POLICY reminders_user_update ON reminders
    FOR UPDATE USING (
        user_id = auth.uid()
    ) WITH CHECK (
        user_id = auth.uid()
    );

CREATE POLICY reminders_insert ON reminders
    FOR INSERT WITH CHECK (TRUE);
