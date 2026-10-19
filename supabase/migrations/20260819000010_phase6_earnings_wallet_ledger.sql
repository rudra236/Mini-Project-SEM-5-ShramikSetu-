-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 6
-- Migration 010: Earnings Engine, Wallet Accounts, Ledger & Payments
-- ============================================================================
-- DESIGN PRINCIPLES:
--   1. No balance columns. Balance = SUM(ledger_entries) for an account.
--   2. All amounts stored as INTEGER (paise). ₹1 = 100 paise.
--   3. Every payment atomically creates 2 ledger rows (DEBIT + CREDIT) or 0.
--   4. Payment confirmations never mutate the original transaction row.
--   5. Idempotency enforced at DB level via unique constraint on idempotency_key.
-- ============================================================================

-- 1. ENUMS ---------------------------------------------------------------

CREATE TYPE payment_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'SUCCESS',
    'FAILED',
    'REVERSED',
    'DISPUTED',
    'PAID_CLAIMED',
    'WORKER_CONFIRMED',
    'WORKER_DISPUTED',
    'ESCALATED_TO_DISPUTE'
);

CREATE TYPE payment_source AS ENUM (
    'PLATFORM_TRANSFER',
    'CONTRACTOR_REPORTED_CASH_PAYMENT',
    'BANK_TRANSFER'
);

CREATE TYPE ledger_direction AS ENUM (
    'DEBIT',
    'CREDIT'
);

-- 2. WALLET ACCOUNTS TABLE -----------------------------------------------
-- One row per actor. No balance column — balance is derived from ledger_entries.

CREATE TABLE IF NOT EXISTS wallet_accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_type    TEXT NOT NULL CHECK (account_type IN ('CONTRACTOR', 'WORKER')),
    owner_id        UUID NOT NULL,          -- references contractors(id) or workers(id)
    currency        TEXT NOT NULL DEFAULT 'INR',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT wallet_accounts_unique_owner UNIQUE (account_type, owner_id)
);

-- 3. PAYMENT TRANSACTIONS TABLE ------------------------------------------
-- One row per payment attempt. Idempotency enforced by idempotency_key.

CREATE TABLE IF NOT EXISTS payment_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_ref     TEXT NOT NULL UNIQUE,           -- human-readable: TXN-YYYYMMDD-XXXX
    idempotency_key     TEXT NOT NULL UNIQUE,           -- caller-provided, prevents duplicates
    sender_account_id   UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
    receiver_account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
    worker_id           UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
    contract_id         UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
    amount_paise        BIGINT NOT NULL CHECK (amount_paise > 0),  -- always positive, integer paise
    payment_source      payment_source NOT NULL DEFAULT 'PLATFORM_TRANSFER',
    status              payment_status NOT NULL DEFAULT 'PENDING',
    notes               TEXT,
    initiated_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. LEDGER ENTRIES TABLE ------------------------------------------------
-- Append-only. Each payment_transaction produces exactly 2 rows.
-- DEBIT  → sender account (money leaves)
-- CREDIT → receiver account (money arrives)

CREATE TABLE IF NOT EXISTS ledger_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
    account_id          UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
    direction           ledger_direction NOT NULL,
    amount_paise        BIGINT NOT NULL CHECK (amount_paise > 0),
    balance_after_paise BIGINT NOT NULL,   -- running balance snapshot (informational)
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ledger_one_entry_per_account_per_tx
        UNIQUE (transaction_id, account_id)
);

-- Ledger is append-only. Forbid UPDATE and DELETE.
CREATE RULE ledger_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE ledger_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;

-- 5. EARNINGS SNAPSHOTS TABLE -------------------------------------------
-- Pre-computed: verified_days × daily_wage_paise for a contract period.
-- This is the authoritative earnings record used to derive outstanding amounts.

CREATE TABLE IF NOT EXISTS earnings_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id         UUID NOT NULL REFERENCES work_contracts(id) ON DELETE RESTRICT,
    worker_id           UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    contractor_id       UUID NOT NULL REFERENCES contractors(id) ON DELETE RESTRICT,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    verified_days_count INT NOT NULL CHECK (verified_days_count >= 0),
    daily_wage_paise    BIGINT NOT NULL CHECK (daily_wage_paise > 0),  -- integer paise
    total_earned_paise  BIGINT NOT NULL CHECK (total_earned_paise >= 0), -- verified_days × daily_wage_paise
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    computed_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT earnings_snapshot_unique_period
        UNIQUE (contract_id, period_start, period_end)
);

-- 6. PAYMENT CONFIRMATIONS TABLE ----------------------------------------
-- Worker YES/NO response to a payment. Never touches the original transaction.

CREATE TABLE IF NOT EXISTS payment_confirmations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id      UUID NOT NULL REFERENCES payment_transactions(id) ON DELETE RESTRICT,
    worker_id           UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    is_confirmed        BOOLEAN NOT NULL,
    dispute_reason      TEXT,              -- populated when is_confirmed = FALSE
    worker_notes        TEXT,
    confirmed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_confirmations_unique_per_tx UNIQUE (transaction_id, worker_id)
);

-- 7. INDEXES -------------------------------------------------------------

CREATE INDEX idx_payment_transactions_contract    ON payment_transactions(contract_id);
CREATE INDEX idx_payment_transactions_worker      ON payment_transactions(worker_id);
CREATE INDEX idx_payment_transactions_contractor  ON payment_transactions(contractor_id);
CREATE INDEX idx_payment_transactions_status      ON payment_transactions(status);
CREATE INDEX idx_ledger_entries_account           ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_transaction       ON ledger_entries(transaction_id);
CREATE INDEX idx_earnings_snapshots_contract      ON earnings_snapshots(contract_id);
CREATE INDEX idx_wallet_accounts_owner            ON wallet_accounts(owner_id);
CREATE INDEX idx_payment_confirmations_worker     ON payment_confirmations(worker_id);

-- 8. UPDATED_AT TRIGGERS -------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_wallet_accounts_updated_at
    BEFORE UPDATE ON wallet_accounts
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 9. RPC: get_wallet_balance ---------------------------------------------
-- Returns balance in integer paise for a given wallet account.
-- Balance = sum of CREDITs - sum of DEBITs for transactions in SUCCESS status.

CREATE OR REPLACE FUNCTION get_wallet_balance(p_account_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_balance BIGINT;
BEGIN
    SELECT
        COALESCE(SUM(
            CASE le.direction
                WHEN 'CREDIT' THEN  le.amount_paise
                WHEN 'DEBIT'  THEN -le.amount_paise
            END
        ), 0)
    INTO v_balance
    FROM ledger_entries le
    JOIN payment_transactions pt ON pt.id = le.transaction_id
    WHERE le.account_id = p_account_id
      AND pt.status = 'SUCCESS';

    RETURN v_balance;
END;
$$;

-- 10. RPC: create_payment_with_ledger ------------------------------------
-- Atomically:
--   a) Inserts the payment_transaction row (status = SUCCESS)
--   b) Inserts DEBIT ledger entry for the sender account
--   c) Inserts CREDIT ledger entry for the receiver account
-- If ANY step fails, the entire transaction is rolled back.
-- Returns the payment_transaction row as JSON.

CREATE OR REPLACE FUNCTION create_payment_with_ledger(
    p_transaction_ref       TEXT,
    p_idempotency_key       TEXT,
    p_sender_account_id     UUID,
    p_receiver_account_id   UUID,
    p_worker_id             UUID,
    p_contractor_id         UUID,
    p_contract_id           UUID,
    p_project_id            UUID,
    p_amount_paise          BIGINT,
    p_payment_source        payment_source,
    p_notes                 TEXT,
    p_initiated_by          UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_txn               payment_transactions;
    v_sender_balance    BIGINT;
    v_receiver_balance  BIGINT;
    v_debit_balance     BIGINT;
    v_credit_balance    BIGINT;
BEGIN
    -- Validate amount is positive integer
    IF p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be a positive integer, got %', p_amount_paise;
    END IF;

    -- Insert payment transaction
    INSERT INTO payment_transactions (
        transaction_ref,
        idempotency_key,
        sender_account_id,
        receiver_account_id,
        worker_id,
        contractor_id,
        contract_id,
        project_id,
        amount_paise,
        payment_source,
        status,
        notes,
        initiated_by
    ) VALUES (
        p_transaction_ref,
        p_idempotency_key,
        p_sender_account_id,
        p_receiver_account_id,
        p_worker_id,
        p_contractor_id,
        p_contract_id,
        p_project_id,
        p_amount_paise,
        p_payment_source,
        'PROCESSING',
        p_notes,
        p_initiated_by
    )
    RETURNING * INTO v_txn;

    -- Compute running balances for snapshot
    v_sender_balance   := get_wallet_balance(p_sender_account_id);
    v_receiver_balance := get_wallet_balance(p_receiver_account_id);

    v_debit_balance  := v_sender_balance   - p_amount_paise;
    v_credit_balance := v_receiver_balance + p_amount_paise;

    -- Insert DEBIT entry for sender
    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        direction,
        amount_paise,
        balance_after_paise,
        description
    ) VALUES (
        v_txn.id,
        p_sender_account_id,
        'DEBIT',
        p_amount_paise,
        v_debit_balance,
        'Payment sent: ' || p_transaction_ref
    );

    -- Insert CREDIT entry for receiver
    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        direction,
        amount_paise,
        balance_after_paise,
        description
    ) VALUES (
        v_txn.id,
        p_receiver_account_id,
        'CREDIT',
        p_amount_paise,
        v_credit_balance,
        'Payment received: ' || p_transaction_ref
    );

    -- Mark transaction as SUCCESS only after both ledger entries are committed
    UPDATE payment_transactions
    SET status = 'SUCCESS', updated_at = NOW()
    WHERE id = v_txn.id
    RETURNING * INTO v_txn;

    RETURN row_to_json(v_txn)::JSONB;

EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: A payment with idempotency_key or transaction_ref already exists.';
    WHEN OTHERS THEN
        RAISE;  -- re-raise; Postgres automatically rolls back the entire function's transaction
END;
$$;

-- 11. RPC: reverse_payment_with_ledger -----------------------------------
-- Atomically inserts a reversal pair (CREDIT sender, DEBIT receiver)
-- and marks the original transaction as REVERSED.

CREATE OR REPLACE FUNCTION reverse_payment_with_ledger(
    p_original_transaction_id   UUID,
    p_reversal_ref              TEXT,
    p_reversal_idempotency_key  TEXT,
    p_initiated_by              UUID,
    p_reason                    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_original      payment_transactions;
    v_reversal      payment_transactions;
    v_sender_bal    BIGINT;
    v_receiver_bal  BIGINT;
BEGIN
    -- Fetch original transaction (lock it for update)
    SELECT * INTO v_original
    FROM payment_transactions
    WHERE id = p_original_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'TRANSACTION_NOT_FOUND: Original transaction % does not exist', p_original_transaction_id;
    END IF;

    IF v_original.status <> 'SUCCESS' THEN
        RAISE EXCEPTION 'INVALID_REVERSAL: Only SUCCESS transactions can be reversed. Status: %', v_original.status;
    END IF;

    -- Insert reversal transaction (sender/receiver swapped)
    INSERT INTO payment_transactions (
        transaction_ref,
        idempotency_key,
        sender_account_id,
        receiver_account_id,
        worker_id,
        contractor_id,
        contract_id,
        project_id,
        amount_paise,
        payment_source,
        status,
        notes,
        initiated_by
    ) VALUES (
        p_reversal_ref,
        p_reversal_idempotency_key,
        v_original.receiver_account_id,  -- reversed: worker sends back
        v_original.sender_account_id,    -- reversed: contractor receives back
        v_original.worker_id,
        v_original.contractor_id,
        v_original.contract_id,
        v_original.project_id,
        v_original.amount_paise,
        v_original.payment_source,
        'PROCESSING',
        'REVERSAL of ' || v_original.transaction_ref || '. Reason: ' || COALESCE(p_reason, 'Not specified'),
        p_initiated_by
    )
    RETURNING * INTO v_reversal;

    -- Running balances
    v_sender_bal   := get_wallet_balance(v_original.receiver_account_id);
    v_receiver_bal := get_wallet_balance(v_original.sender_account_id);

    -- DEBIT the receiver (worker) — taking back the amount
    INSERT INTO ledger_entries (transaction_id, account_id, direction, amount_paise, balance_after_paise, description)
    VALUES (v_reversal.id, v_original.receiver_account_id, 'DEBIT', v_original.amount_paise,
            v_sender_bal - v_original.amount_paise, 'Reversal debit: ' || p_reversal_ref);

    -- CREDIT the sender (contractor) — returning the amount
    INSERT INTO ledger_entries (transaction_id, account_id, direction, amount_paise, balance_after_paise, description)
    VALUES (v_reversal.id, v_original.sender_account_id, 'CREDIT', v_original.amount_paise,
            v_receiver_bal + v_original.amount_paise, 'Reversal credit: ' || p_reversal_ref);

    -- Mark reversal as SUCCESS
    UPDATE payment_transactions SET status = 'SUCCESS', updated_at = NOW()
    WHERE id = v_reversal.id
    RETURNING * INTO v_reversal;

    -- Mark original transaction as REVERSED
    UPDATE payment_transactions SET status = 'REVERSED', updated_at = NOW()
    WHERE id = p_original_transaction_id;

    RETURN row_to_json(v_reversal)::JSONB;

EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$$;

-- 12. ROW LEVEL SECURITY -------------------------------------------------

ALTER TABLE wallet_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE earnings_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_confirmations   ENABLE ROW LEVEL SECURITY;

-- Wallet Accounts: visible to the account owner or admin
CREATE POLICY wallet_accounts_read ON wallet_accounts
    FOR SELECT USING (
        (account_type = 'WORKER'     AND owner_id = get_worker_id(auth.uid()))
        OR (account_type = 'CONTRACTOR' AND owner_id = get_contractor_id(auth.uid()))
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );

-- Payment Transactions: visible to the involved contractor, worker, or admin
CREATE POLICY payment_transactions_read ON payment_transactions
    FOR SELECT USING (
        worker_id     = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

-- Ledger Entries: visible only through the payment transaction visibility
CREATE POLICY ledger_entries_read ON ledger_entries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM payment_transactions pt
            WHERE pt.id = ledger_entries.transaction_id
              AND (
                  pt.worker_id     = get_worker_id(auth.uid())
                  OR pt.contractor_id = get_contractor_id(auth.uid())
                  OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
              )
        )
    );

-- Earnings Snapshots: visible to the worker, their contractor, or admin
CREATE POLICY earnings_snapshots_read ON earnings_snapshots
    FOR SELECT USING (
        worker_id     = get_worker_id(auth.uid())
        OR contractor_id = get_contractor_id(auth.uid())
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION')
    );

-- Payment Confirmations: visible to the worker or the contractor of the payment
CREATE POLICY payment_confirmations_read ON payment_confirmations
    FOR SELECT USING (
        worker_id = get_worker_id(auth.uid())
        OR EXISTS (
            SELECT 1 FROM payment_transactions pt
            WHERE pt.id = payment_confirmations.transaction_id
              AND pt.contractor_id = get_contractor_id(auth.uid())
        )
        OR get_user_role(auth.uid()) IN ('ADMIN', 'INSTITUTIONAL_USER')
    );
