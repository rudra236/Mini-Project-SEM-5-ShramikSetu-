-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 12
-- Migration 021: Atomic Double-Entry Ledger, Wage Accruals & Payment Confirmations
-- ============================================================================
-- DESIGN PRINCIPLES:
--   1. Pure Double-Entry Bookkeeping:
--      Every ledger entry has a debit_account, credit_account, and amount_paise.
--      Constraint: sum(debits) = sum(credits) is mathematically invariant.
--   2. Tamper-evident Hash Chaining:
--      Each entry chains to the SHA-256 hash of the previous entry.
--   3. Automatic Wage Accrual:
--      A verified shift automatically creates a wage accrual entry (contractor owes worker).
--   4. Payment States:
--      PAID_CLAIMED -> WORKER_CONFIRMED (reduces arrears) or WORKER_DISPUTED.
--      Auto-escalates to dispute if unconfirmed after N days.
--   5. Single Source of Truth for Arrears:
--      Outstanding Balance = Accruals - Confirmed Payments, computed in ONE SQL view.
-- ============================================================================

-- 1. ACCOUNTS TABLE -----------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE account_type AS ENUM (
        'WORKER',
        'CONTRACTOR',
        'ESCROW_LIABILITY',
        'SYSTEM_CLEARING'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type    account_type NOT NULL,
    owner_id        UUID,               -- references workers(id) or contractors(id) (NULL for escrow)
    code            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'INR',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT accounts_owner_unique UNIQUE (account_type, owner_id)
);

-- Seed System Escrow Liability Account
INSERT INTO accounts (account_type, code, name)
VALUES ('ESCROW_LIABILITY', 'ESCROW_SYSTEM_LIABILITY', 'Statutory Wage Escrow & Liability Account')
ON CONFLICT (code) DO NOTHING;

-- Seed Accounts for Existing Contractors
INSERT INTO accounts (account_type, owner_id, code, name)
SELECT 
    'CONTRACTOR'::account_type,
    c.id,
    'CONTRACTOR-' || c.id::text,
    COALESCE(c.company_name, 'Contractor Account')
FROM contractors c
ON CONFLICT (account_type, owner_id) DO NOTHING;

-- Seed Accounts for Existing Workers
INSERT INTO accounts (account_type, owner_id, code, name)
SELECT 
    'WORKER'::account_type,
    w.id,
    'WORKER-' || COALESCE(w.internal_worker_id, w.id::text),
    COALESCE(w.full_name, 'Worker Account')
FROM workers w
ON CONFLICT (account_type, owner_id) DO NOTHING;

-- 2. ENHANCE LEDGER ENTRIES TABLE ---------------------------------------------
-- Ensure ledger_entries supports double-entry debit_account and credit_account,
-- ref_type, ref_id, and cryptographic hash chaining.

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS debit_account UUID REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS credit_account UUID REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS ref_type TEXT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS ref_id UUID;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS prev_hash TEXT DEFAULT '0000000000000000000000000000000000000000000000000000000000000000';
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS hash TEXT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES work_contracts(id) ON DELETE RESTRICT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE RESTRICT;

-- Support double-entry transactions where transaction_id and legacy columns are nullable
ALTER TABLE ledger_entries ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE ledger_entries ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE ledger_entries ALTER COLUMN direction DROP NOT NULL;
ALTER TABLE ledger_entries ALTER COLUMN balance_after_paise DROP NOT NULL;
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_one_entry_per_account_per_tx;

-- Index for fast lookup by reference and accounts
CREATE INDEX IF NOT EXISTS idx_ledger_ref ON ledger_entries(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_ledger_debit_account ON ledger_entries(debit_account);
CREATE INDEX IF NOT EXISTS idx_ledger_credit_account ON ledger_entries(credit_account);

-- Constraint: debit and credit accounts must be distinct
DO $$ BEGIN
    ALTER TABLE ledger_entries ADD CONSTRAINT chk_ledger_debit_credit_distinct
        CHECK (debit_account IS NULL OR credit_account IS NULL OR debit_account <> credit_account);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. ENHANCE PAYMENT TRANSACTIONS TABLE ----------------------------------------
-- Supports states: PAID_CLAIMED, WORKER_CONFIRMED, WORKER_DISPUTED, ESCALATED_TO_DISPUTE
-- Plus simulated UPI notice and proof document upload.

ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'UPI_SIMULATED';
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS reference_number TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS proof_url TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS dispute_reason TEXT;
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS escalation_deadline TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');
ALTER TABLE payment_transactions ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. UPDATE CONTRACT-LEVEL AND WORKER-LEVEL FINANCIAL SUMMARY VIEWS -----------
-- SINGLE SOURCE OF TRUTH:
-- Accruals = Verified shifts * daily wage
-- Confirmed Payments = Payments with status 'WORKER_CONFIRMED' or 'SUCCESS'
DROP VIEW IF EXISTS worker_financial_summary CASCADE;
DROP VIEW IF EXISTS contract_financial_summary CASCADE;

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
    COALESCE(pt.total_claimed_paise, 0)::BIGINT AS total_claimed_paise,
    (COALESCE(SUM(wc.daily_wage) FILTER (WHERE ae.status = 'VERIFIED'), 0) - COALESCE(pt.total_paid_paise, 0))::BIGINT AS outstanding_paise
FROM work_contracts wc
LEFT JOIN attendance_events ae ON ae.contract_id = wc.id
LEFT JOIN (
    SELECT
        contract_id,
        COALESCE(SUM(amount_paise) FILTER (WHERE status IN ('WORKER_CONFIRMED', 'SUCCESS')), 0)::BIGINT AS total_paid_paise,
        COALESCE(SUM(amount_paise) FILTER (WHERE status = 'PAID_CLAIMED'), 0)::BIGINT AS total_claimed_paise
    FROM payment_transactions
    GROUP BY contract_id
) pt ON pt.contract_id = wc.id
GROUP BY wc.id, wc.contract_code, wc.worker_id, wc.contractor_id, wc.project_id, wc.worksite_id, wc.status, wc.daily_wage, pt.total_paid_paise, pt.total_claimed_paise;

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
        COALESCE(SUM(pt.amount_paise) FILTER (WHERE pt.status IN ('WORKER_CONFIRMED', 'SUCCESS')), 0)::BIGINT AS total_paid_paise,
        COALESCE(SUM(pt.amount_paise) FILTER (WHERE pt.status = 'PAID_CLAIMED'), 0)::BIGINT AS total_claimed_paise
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
    COALESCE(pa.total_claimed_paise, 0)::BIGINT AS total_claimed_paise,
    (COALESCE(aa.total_earned_paise, 0) - COALESCE(pa.total_paid_paise, 0))::BIGINT AS outstanding_paise,
    COALESCE(ca.total_contracts_count, 0)::INT AS total_contracts_count,
    COALESCE(ca.active_contracts_count, 0)::INT AS active_contracts_count
FROM workers w
LEFT JOIN attendance_aggregates aa ON aa.worker_id = w.id
LEFT JOIN payment_aggregates pa ON pa.worker_id = w.id
LEFT JOIN contract_aggregates ca ON ca.worker_id = w.id;

-- 5. FUNCTION: AUTOMATIC WAGE ACCRUAL TRIGGER ----------------------------------
-- When an attendance shift is marked or verified (status = 'VERIFIED'),
-- automatically insert an accrual double-entry row in ledger_entries.

CREATE OR REPLACE FUNCTION fn_record_shift_wage_accrual()
RETURNS TRIGGER AS $$
DECLARE
    v_contract RECORD;
    v_contractor_account_id UUID;
    v_worker_account_id UUID;
    v_wage_paise BIGINT;
    v_prev_hash TEXT;
    v_entry_hash TEXT;
BEGIN
    -- Only act on VERIFIED attendance events
    IF NEW.status = 'VERIFIED' THEN
        -- Check if accrual already recorded for this attendance event
        IF EXISTS (SELECT 1 FROM ledger_entries WHERE ref_type = 'WAGE_ACCRUAL' AND ref_id = NEW.id) THEN
            RETURN NEW;
        END IF;

        -- Fetch contract details and daily wage
        SELECT id, worker_id, contractor_id, project_id, daily_wage
        INTO v_contract
        FROM work_contracts
        WHERE id = NEW.contract_id;

        IF NOT FOUND THEN
            RETURN NEW;
        END IF;

        v_wage_paise := v_contract.daily_wage;

        -- Ensure contractor account exists
        SELECT id INTO v_contractor_account_id
        FROM accounts
        WHERE account_type = 'CONTRACTOR' AND owner_id = v_contract.contractor_id;

        IF v_contractor_account_id IS NULL THEN
            INSERT INTO accounts (account_type, owner_id, code, name)
            VALUES ('CONTRACTOR', v_contract.contractor_id, 'CONTRACTOR-' || v_contract.contractor_id::text, 'Contractor Account')
            ON CONFLICT (account_type, owner_id) DO UPDATE SET updated_at = NOW()
            RETURNING id INTO v_contractor_account_id;
        END IF;

        -- Ensure worker account exists
        SELECT id INTO v_worker_account_id
        FROM accounts
        WHERE account_type = 'WORKER' AND owner_id = v_contract.worker_id;

        IF v_worker_account_id IS NULL THEN
            INSERT INTO accounts (account_type, owner_id, code, name)
            VALUES ('WORKER', v_contract.worker_id, 'WORKER-' || v_contract.worker_id::text, 'Worker Account')
            ON CONFLICT (account_type, owner_id) DO UPDATE SET updated_at = NOW()
            RETURNING id INTO v_worker_account_id;
        END IF;

        -- Get previous hash in ledger
        SELECT COALESCE(hash, '0000000000000000000000000000000000000000000000000000000000000000')
        INTO v_prev_hash
        FROM ledger_entries
        ORDER BY created_at DESC, id DESC
        LIMIT 1;

        IF v_prev_hash IS NULL THEN
            v_prev_hash := '0000000000000000000000000000000000000000000000000000000000000000';
        END IF;

        -- Compute SHA-256 hash for tamper prevention
        v_entry_hash := encode(
            digest(
                v_prev_hash || ':' ||
                NEW.id::text || ':' ||
                v_contractor_account_id::text || ':' ||
                v_worker_account_id::text || ':' ||
                v_wage_paise::text || ':WAGE_ACCRUAL:' ||
                NEW.id::text,
                'sha256'
            ),
            'hex'
        );

        -- Insert atomic double-entry accrual:
        -- DEBIT: Contractor (liability incurred)
        -- CREDIT: Worker (receivable earned)
        INSERT INTO ledger_entries (
            transaction_id,
            debit_account,
            credit_account,
            amount_paise,
            ref_type,
            ref_id,
            contract_id,
            project_id,
            description,
            prev_hash,
            hash,
            created_at
        ) VALUES (
            NULL,
            v_contractor_account_id,
            v_worker_account_id,
            v_wage_paise,
            'WAGE_ACCRUAL',
            NEW.id,
            v_contract.id,
            v_contract.project_id,
            'Statutory wage accrual for verified shift on ' || NEW.date::text,
            v_prev_hash,
            v_entry_hash,
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_attendance_wage_accrual ON attendance_events;
CREATE TRIGGER trg_attendance_wage_accrual
    AFTER INSERT OR UPDATE OF status ON attendance_events
    FOR EACH ROW
    EXECUTE FUNCTION fn_record_shift_wage_accrual();
