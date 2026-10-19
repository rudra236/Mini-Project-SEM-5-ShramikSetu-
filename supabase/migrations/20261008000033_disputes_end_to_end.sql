-- Migration: 20261008000033_disputes_end_to_end.sql
-- Description: End-to-end Disputes system with server-computed amounts, responses, messages, evidence, and status history

-- 1. Create Enums
DO $$ BEGIN
    CREATE TYPE dispute_category AS ENUM (
        'short_payment',
        'unpaid_wages',
        'attendance_not_recorded',
        'unlawful_deduction',
        'unsafe_conditions',
        'other'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispute_status AS ENUM (
        'open',
        'responded',
        'resolved',
        'escalated',
        'withdrawn'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispute_response_type AS ENUM (
        'accept_and_pay',
        'deduction_claimed',
        'reject'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE dispute_deduction_reason AS ENUM (
        'late_arrival',
        'incomplete_work',
        'advance_recovery',
        'other'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 2. Update existing rows so they satisfy minimum description length
UPDATE public.disputes 
SET description = description || ' - Verified dispute record description' 
WHERE length(description) < 20;

-- 3. Add new columns to disputes table if not present
ALTER TABLE public.disputes
    ADD COLUMN IF NOT EXISTS reference TEXT,
    ADD COLUMN IF NOT EXISTS period_from DATE,
    ADD COLUMN IF NOT EXISTS period_to DATE,
    ADD COLUMN IF NOT EXISTS earned_paise BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS paid_paise BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS shortfall_paise BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claimed_paise BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS claimed_justification TEXT DEFAULT NULL;

-- Backfill reference and period fields on existing rows
WITH numbered AS (
    SELECT id, 'SS-D-2026-' || LPAD(row_number() OVER (ORDER BY created_at)::text, 6, '0') AS gen_ref
    FROM public.disputes
)
UPDATE public.disputes d
SET reference = COALESCE(d.reference, d.dispute_ref, n.gen_ref),
    dispute_ref = COALESCE(d.dispute_ref, d.reference, n.gen_ref),
    period_from = COALESCE(d.period_from, (d.created_at - interval '7 days')::date),
    period_to = COALESCE(d.period_to, d.created_at::date),
    earned_paise = COALESCE(d.earned_paise, d.amount_claimed_paise, 0),
    paid_paise = COALESCE(d.paid_paise, 0),
    shortfall_paise = COALESCE(d.shortfall_paise, d.amount_claimed_paise, 0),
    claimed_paise = COALESCE(d.claimed_paise, d.amount_claimed_paise, 0)
FROM numbered n
WHERE d.id = n.id;

-- Ensure reference is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_disputes_reference_unique ON public.disputes (reference);

-- Convert category and status columns
ALTER TABLE public.disputes ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.disputes ALTER COLUMN status DROP DEFAULT;

ALTER TABLE public.disputes ALTER COLUMN category TYPE TEXT;
ALTER TABLE public.disputes ALTER COLUMN status TYPE TEXT;

UPDATE public.disputes 
SET category = CASE 
    WHEN category IN ('WAGE', 'MISSING_PAYMENT') THEN 'unpaid_wages'
    WHEN category IN ('PAYMENT', 'PARTIAL_PAYMENT') THEN 'short_payment'
    WHEN category = 'ATTENDANCE' THEN 'attendance_not_recorded'
    WHEN category = 'short_payment' THEN 'short_payment'
    WHEN category = 'unpaid_wages' THEN 'unpaid_wages'
    WHEN category = 'attendance_not_recorded' THEN 'attendance_not_recorded'
    WHEN category = 'unlawful_deduction' THEN 'unlawful_deduction'
    WHEN category = 'unsafe_conditions' THEN 'unsafe_conditions'
    ELSE 'other'
END;

UPDATE public.disputes 
SET status = CASE 
    WHEN status IN ('OPEN', 'open') THEN 'open'
    WHEN status IN ('RESOLVED', 'resolved', 'CLOSED', 'settled') THEN 'resolved'
    WHEN status IN ('REJECTED', 'UNDER_REVIEW', 'responded', 'WAITING_FOR_INFORMATION') THEN 'responded'
    WHEN status IN ('ESCALATED', 'escalated') THEN 'escalated'
    WHEN status IN ('WITHDRAWN', 'withdrawn') THEN 'withdrawn'
    ELSE 'open'
END;

ALTER TABLE public.disputes 
    ALTER COLUMN category TYPE dispute_category USING (category::dispute_category);

ALTER TABLE public.disputes 
    ALTER COLUMN status TYPE dispute_status USING (status::dispute_status);

ALTER TABLE public.disputes ALTER COLUMN status SET DEFAULT 'open'::dispute_status;

-- Set NOT NULL constraints
ALTER TABLE public.disputes 
    ALTER COLUMN reference SET NOT NULL,
    ALTER COLUMN period_from SET NOT NULL,
    ALTER COLUMN period_to SET NOT NULL,
    ALTER COLUMN earned_paise SET NOT NULL,
    ALTER COLUMN paid_paise SET NOT NULL,
    ALTER COLUMN shortfall_paise SET NOT NULL,
    ALTER COLUMN claimed_paise SET NOT NULL;

-- Constraints
ALTER TABLE public.disputes
    DROP CONSTRAINT IF EXISTS chk_dispute_period,
    ADD CONSTRAINT chk_dispute_period CHECK (period_to >= period_from);

ALTER TABLE public.disputes
    DROP CONSTRAINT IF EXISTS chk_dispute_amounts_non_negative,
    ADD CONSTRAINT chk_dispute_amounts_non_negative CHECK (
        earned_paise >= 0 AND 
        paid_paise >= 0 AND 
        shortfall_paise >= 0 AND 
        claimed_paise >= 0
    );

ALTER TABLE public.disputes
    DROP CONSTRAINT IF EXISTS chk_dispute_claimed_shortfall,
    ADD CONSTRAINT chk_dispute_claimed_shortfall CHECK (
        claimed_paise <= shortfall_paise OR (claimed_justification IS NOT NULL AND length(trim(claimed_justification)) > 0)
    );

ALTER TABLE public.disputes
    DROP CONSTRAINT IF EXISTS chk_dispute_description_length,
    ADD CONSTRAINT chk_dispute_description_length CHECK (
        length(description) >= 20 AND length(description) <= 2000
    );

-- 4. Create dispute_responses Table
CREATE TABLE IF NOT EXISTS public.dispute_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES public.contractors(id) ON DELETE CASCADE,
    type dispute_response_type NOT NULL,
    deduction_reason dispute_deduction_reason NULL,
    deduction_amount_paise BIGINT NULL DEFAULT 0,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_deduction_amount_non_negative CHECK (deduction_amount_paise IS NULL OR deduction_amount_paise >= 0)
);

CREATE INDEX IF NOT EXISTS idx_dispute_responses_dispute ON public.dispute_responses (dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_responses_contractor ON public.dispute_responses (contractor_id);

-- 5. Create dispute_messages Table
CREATE TABLE IF NOT EXISTS public.dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    sender_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL CHECK (sender_role IN ('WORKER', 'CONTRACTOR', 'ADMIN', 'INSTITUTIONAL_USER')),
    message TEXT NOT NULL CHECK (length(trim(message)) > 0 AND length(message) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_messages_dispute ON public.dispute_messages (dispute_id, created_at ASC);

-- 6. Create dispute_evidence Table
CREATE TABLE IF NOT EXISTS public.dispute_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    mime TEXT NOT NULL,
    size BIGINT NOT NULL CHECK (size > 0 AND size <= 5242880),
    sha256 TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON public.dispute_evidence (dispute_id);

-- 7. Create dispute_status_history Table
CREATE TABLE IF NOT EXISTS public.dispute_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
    from_status TEXT NULL,
    to_status TEXT NOT NULL,
    actor UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    actor_role TEXT NULL,
    note TEXT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispute_status_history_dispute ON public.dispute_status_history (dispute_id, at ASC);

-- 8. Add dispute_id to ledger_entries and payment_transactions
ALTER TABLE public.ledger_entries
    ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES public.disputes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ledger_entries_dispute ON public.ledger_entries (dispute_id);

ALTER TABLE public.payment_transactions
    ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES public.disputes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_dispute ON public.payment_transactions (dispute_id);

-- 9. Update create_payment_with_ledger to support dispute_id and auto-resolution
CREATE OR REPLACE FUNCTION public.create_payment_with_ledger(
    p_transaction_ref text,
    p_idempotency_key text,
    p_sender_account_id uuid,
    p_receiver_account_id uuid,
    p_worker_id uuid,
    p_contractor_id uuid,
    p_contract_id uuid,
    p_project_id uuid,
    p_amount_paise bigint,
    p_payment_source payment_source,
    p_notes text,
    p_initiated_by uuid,
    p_dispute_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_txn               payment_transactions;
    v_sender_balance    BIGINT;
    v_receiver_balance  BIGINT;
    v_debit_balance     BIGINT;
    v_credit_balance    BIGINT;
    v_total_paid        BIGINT;
    v_claimed_paise     BIGINT;
    v_prev_status       TEXT;
BEGIN
    IF p_amount_paise <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be a positive integer, got %', p_amount_paise;
    END IF;

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
        initiated_by,
        dispute_id
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
        p_initiated_by,
        p_dispute_id
    )
    RETURNING * INTO v_txn;

    v_sender_balance   := get_wallet_balance(p_sender_account_id);
    v_receiver_balance := get_wallet_balance(p_receiver_account_id);

    v_debit_balance  := v_sender_balance   - p_amount_paise;
    v_credit_balance := v_receiver_balance + p_amount_paise;

    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        direction,
        amount_paise,
        balance_after_paise,
        description,
        dispute_id,
        contract_id,
        project_id,
        ref_type
    ) VALUES (
        v_txn.id,
        p_sender_account_id,
        'DEBIT',
        p_amount_paise,
        v_debit_balance,
        'Payment sent: ' || p_transaction_ref,
        p_dispute_id,
        p_contract_id,
        p_project_id,
        'PAYMENT_DISBURSEMENT'
    );

    INSERT INTO ledger_entries (
        transaction_id,
        account_id,
        direction,
        amount_paise,
        balance_after_paise,
        description,
        dispute_id,
        contract_id,
        project_id,
        ref_type
    ) VALUES (
        v_txn.id,
        p_receiver_account_id,
        'CREDIT',
        p_amount_paise,
        v_credit_balance,
        'Payment received: ' || p_transaction_ref,
        p_dispute_id,
        p_contract_id,
        p_project_id,
        'PAYMENT_DISBURSEMENT'
    );

    UPDATE payment_transactions
    SET status = 'SUCCESS', updated_at = NOW()
    WHERE id = v_txn.id
    RETURNING * INTO v_txn;

    IF p_dispute_id IS NOT NULL THEN
        SELECT claimed_paise, status::text INTO v_claimed_paise, v_prev_status FROM disputes WHERE id = p_dispute_id;
        SELECT COALESCE(SUM(amount_paise), 0) INTO v_total_paid 
        FROM payment_transactions 
        WHERE dispute_id = p_dispute_id AND status = 'SUCCESS';

        IF v_total_paid >= v_claimed_paise THEN
            UPDATE disputes
            SET status = 'resolved', is_settled = TRUE, settled_at = NOW(), updated_at = NOW()
            WHERE id = p_dispute_id AND status != 'resolved';

            INSERT INTO dispute_status_history (
                dispute_id, from_status, to_status, actor, actor_role, note, at
            ) VALUES (
                p_dispute_id, v_prev_status, 'resolved', p_initiated_by, 'CONTRACTOR', 
                'Resolution payment linked to dispute covering claimed amount. Dispute resolved.',
                NOW()
            );
        END IF;
    END IF;

    RETURN row_to_json(v_txn)::JSONB;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'IDEMPOTENCY_VIOLATION: A payment with idempotency_key or transaction_ref already exists.';
    WHEN OTHERS THEN
        RAISE;
END;
$function$;

