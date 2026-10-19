-- ============================================================================
-- SHRAMIKSETU DATABASE PERFORMANCE HARDENING - QUERY OPTIMIZATION
-- Migration 025: B-Tree Indexes for Top 5 Heaviest Analytical & Transactional Queries
-- ============================================================================

-- 1. HEAVIEST QUERY 1: Double-Entry Ledger Timeline & Running Balance Aggregation
-- Used by: /api/earnings, /api/ledger/timeline, /worker/wallet
-- Query pattern:
--   SELECT * FROM ledger_entries 
--   WHERE account_id = $1 
--   ORDER BY created_at ASC;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_wallet_created
    ON public.ledger_entries(account_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_hash
    ON public.ledger_entries(hash);

-- 2. HEAVIEST QUERY 2: Attendance Muster Verification & Geofence Deduplication
-- Used by: /api/attendance/mark, /api/attendance/summary, /worker/attendance
-- Query pattern:
--   SELECT id, status FROM attendance_events 
--   WHERE worker_id = $1 AND date = $2 AND status = 'VERIFIED';
CREATE INDEX IF NOT EXISTS idx_attendance_worker_date_status
    ON public.attendance_events(worker_id, date, status);

CREATE INDEX IF NOT EXISTS idx_attendance_contract_date
    ON public.attendance_events(contract_id, date);

-- 3. HEAVIEST QUERY 3: Contractor Compliance Risk & Statutory Shortfall Calculation
-- Used by: /api/compliance/enforcement, /api/compliance/check, /inspector
-- Query pattern:
--   SELECT c.id, c.worker_id, c.daily_wage, w.skill_category 
--   FROM work_contracts c 
--   JOIN workers w ON c.worker_id = w.id 
--   WHERE c.contractor_id = $1 AND c.status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_work_contracts_contractor_status
    ON public.work_contracts(contractor_id, status);

CREATE INDEX IF NOT EXISTS idx_work_contracts_worker_status
    ON public.work_contracts(worker_id, status);

-- 4. HEAVIEST QUERY 4: Multi-Worksite Duplicate Worker Punch Scan (Fraud Detection)
-- Used by: enforcement-service.ts (RULE_DUPLICATE_WORKER)
-- Query pattern:
--   SELECT a1.worker_id, a1.worksite_id, a1.created_at, a2.worksite_id, a2.created_at
--   FROM attendance_events a1
--   JOIN attendance_events a2 ON a1.worker_id = a2.worker_id AND a1.id != a2.id
--   WHERE a1.worksite_id != a2.worksite_id 
--     AND a2.created_at BETWEEN a1.created_at - INTERVAL '4 hours' AND a1.created_at + INTERVAL '4 hours';
CREATE INDEX IF NOT EXISTS idx_attendance_worker_created_worksite
    ON public.attendance_events(worker_id, created_at, worksite_id);

-- 5. HEAVIEST QUERY 5: Grievance Dispute SLA & Arbitration Roster
-- Used by: /api/disputes, /api/compliance/followup, /inspector/disputes
-- Query pattern:
--   SELECT * FROM disputes 
--   WHERE status IN ('OPEN', 'UNDER_REVIEW') 
--   ORDER BY contractor_response_deadline ASC;
CREATE INDEX IF NOT EXISTS idx_disputes_status_contractor_deadline
    ON public.disputes(status, contractor_response_deadline ASC);

CREATE INDEX IF NOT EXISTS idx_disputes_contractor_status
    ON public.disputes(contractor_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_status_escalation
    ON public.payment_transactions(status, escalation_deadline ASC);
