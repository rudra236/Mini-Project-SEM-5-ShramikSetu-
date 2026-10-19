-- ============================================================================
-- SHRAMIKSETU POSTGRESQL QUERY PLAN EXPLAIN SCRIPT (TOP 5 HEAVIEST QUERIES)
-- Run this against a populated database to inspect real execution plans & buffers.
-- ============================================================================

\echo '================================================================'
\echo '1. QUERY 1: Double-Entry Ledger Timeline & Running Balance'
\echo '================================================================'
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    id, 
    transaction_id, 
    debit_account, 
    credit_account, 
    amount_paise, 
    ref_type, 
    ref_id, 
    hash, 
    prev_hash, 
    created_at
FROM public.ledger_entries
WHERE wallet_account_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at ASC
LIMIT 100;

\echo '================================================================'
\echo '2. QUERY 2: Attendance Muster Verification & Geofence Deduplication'
\echo '================================================================'
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    id, 
    worker_id, 
    contract_id, 
    project_id, 
    worksite_id, 
    attendance_date, 
    status, 
    created_at
FROM public.attendance_events
WHERE worker_id = '00000000-0000-0000-0000-000000000001'
  AND attendance_date = '2026-09-28'
  AND status = 'VERIFIED';

\echo '================================================================'
\echo '3. QUERY 3: Contractor Compliance Risk & Statutory Shortfall Calculation'
\echo '================================================================'
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    c.id AS contract_id,
    c.contract_code,
    c.worker_id,
    c.daily_wage,
    c.status,
    w.full_name,
    w.skill_category,
    r.minimum_amount_paise,
    (r.minimum_amount_paise - c.daily_wage) AS shortfall_paise
FROM public.work_contracts c
JOIN public.workers w ON c.worker_id = w.id
JOIN public.minimum_wage_rules r ON r.state = 'Maharashtra' AND r.skill_level = w.skill_category
WHERE c.contractor_id = '00000000-0000-0000-0000-000000000001'
  AND c.status = 'ACTIVE';

\echo '================================================================'
\echo '4. QUERY 4: Multi-Worksite Duplicate Worker Punch Scan (Fraud Detection)'
\echo '================================================================'
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    a1.worker_id,
    a1.worksite_id AS worksite_1,
    a1.created_at AS punch_1,
    a2.worksite_id AS worksite_2,
    a2.created_at AS punch_2
FROM public.attendance_events a1
JOIN public.attendance_events a2 
  ON a1.worker_id = a2.worker_id 
 AND a1.id != a2.id
WHERE a1.worksite_id != a2.worksite_id
  AND a2.created_at >= a1.created_at - INTERVAL '4 hours'
  AND a2.created_at <= a1.created_at + INTERVAL '4 hours'
LIMIT 50;

\echo '================================================================'
\echo '5. QUERY 5: Grievance Dispute SLA & Arbitration Roster'
\echo '================================================================'
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    d.id,
    d.dispute_ref,
    d.worker_id,
    d.contractor_id,
    d.claimed_amount_paise,
    d.status,
    d.escalation_deadline,
    w.full_name AS worker_name,
    c.company_name AS contractor_name
FROM public.disputes d
JOIN public.workers w ON d.worker_id = w.id
JOIN public.contractors c ON d.contractor_id = c.id
WHERE d.status IN ('OPEN', 'UNDER_REVIEW')
ORDER BY d.escalation_deadline ASC
LIMIT 50;
