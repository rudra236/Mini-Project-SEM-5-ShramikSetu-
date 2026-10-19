-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 11
-- Migration 017: Unified Financial & Attendance Summary Views
-- ============================================================================
-- Single Source of Truth for Worker Shifts, Lifetime Earnings, Disbursements,
-- and Outstanding Wage Arrears. Used identically by Dashboard, Wallet, and Passport.
-- ============================================================================

-- 1. CONTRACT-LEVEL FINANCIAL SUMMARY VIEW
CREATE OR REPLACE VIEW contract_financial_summary AS
SELECT
    wc.id AS contract_id,
    wc.contract_code,
    wc.worker_id,
    wc.contractor_id,
    wc.project_id,
    wc.worksite_id,
    wc.status AS contract_status,
    wc.daily_wage AS daily_wage_paise,
    COALESCE(COUNT(DISTINCT ae.date) FILTER (WHERE ae.status = 'VERIFIED'), 0)::INT AS verified_days_count,
    COALESCE(SUM(wc.daily_wage) FILTER (WHERE ae.status = 'VERIFIED'), 0)::BIGINT AS total_earned_paise,
    COALESCE(pt.total_paid_paise, 0)::BIGINT AS total_paid_paise,
    (COALESCE(SUM(wc.daily_wage) FILTER (WHERE ae.status = 'VERIFIED'), 0) - COALESCE(pt.total_paid_paise, 0))::BIGINT AS outstanding_paise
FROM work_contracts wc
LEFT JOIN attendance_events ae ON ae.contract_id = wc.id
LEFT JOIN (
    SELECT
        contract_id,
        COALESCE(SUM(amount_paise) FILTER (WHERE status = 'SUCCESS'), 0)::BIGINT AS total_paid_paise
    FROM payment_transactions
    GROUP BY contract_id
) pt ON pt.contract_id = wc.id
GROUP BY wc.id, wc.contract_code, wc.worker_id, wc.contractor_id, wc.project_id, wc.worksite_id, wc.status, wc.daily_wage, pt.total_paid_paise;

-- 2. WORKER-LEVEL LIFETIME FINANCIAL SUMMARY VIEW
CREATE OR REPLACE VIEW worker_financial_summary AS
WITH attendance_aggregates AS (
    SELECT
        ae.worker_id,
        COUNT(DISTINCT ae.date) FILTER (WHERE ae.status = 'VERIFIED') AS verified_days_count,
        COALESCE(SUM(wc.daily_wage) FILTER (WHERE ae.status = 'VERIFIED'), 0)::BIGINT AS total_earned_paise
    FROM attendance_events ae
    JOIN work_contracts wc ON wc.id = ae.contract_id
    GROUP BY ae.worker_id
),
payment_aggregates AS (
    SELECT
        pt.worker_id,
        COALESCE(SUM(pt.amount_paise) FILTER (WHERE pt.status = 'SUCCESS'), 0)::BIGINT AS total_paid_paise
    FROM payment_transactions pt
    GROUP BY pt.worker_id
),
contract_aggregates AS (
    SELECT
        wc.worker_id,
        COUNT(wc.id) AS total_contracts_count,
        COUNT(wc.id) FILTER (WHERE wc.status = 'ACTIVE') AS active_contracts_count
    FROM work_contracts wc
    GROUP BY wc.worker_id
)
SELECT
    w.id AS worker_id,
    w.user_id,
    w.full_name,
    w.internal_worker_id,
    w.occupation,
    w.skill_category,
    COALESCE(aa.verified_days_count, 0)::INT AS verified_days_count,
    COALESCE(aa.total_earned_paise, 0)::BIGINT AS total_earned_paise,
    COALESCE(pa.total_paid_paise, 0)::BIGINT AS total_paid_paise,
    (COALESCE(aa.total_earned_paise, 0) - COALESCE(pa.total_paid_paise, 0))::BIGINT AS outstanding_paise,
    COALESCE(ca.total_contracts_count, 0)::INT AS total_contracts_count,
    COALESCE(ca.active_contracts_count, 0)::INT AS active_contracts_count
FROM workers w
LEFT JOIN attendance_aggregates aa ON aa.worker_id = w.id
LEFT JOIN payment_aggregates pa ON pa.worker_id = w.id
LEFT JOIN contract_aggregates ca ON ca.worker_id = w.id;

-- Comments
COMMENT ON VIEW contract_financial_summary IS 'Contract-level source of truth for verified shifts, total earned, total paid, and arrears in integer paise.';
COMMENT ON VIEW worker_financial_summary IS 'Worker-level authoritative summary for dashboard, wallet, and passport verification.';
