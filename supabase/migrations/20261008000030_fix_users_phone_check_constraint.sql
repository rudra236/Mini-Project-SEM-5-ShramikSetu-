-- ============================================================================
-- SHRAMIKSETU DATABASE MIGRATION - PHONE CONSTRAINT FIX & AUTH USER SYNC
-- Fixes check constraint regex, allows nullable phone, and auto-syncs auth.users
-- ============================================================================

-- 1. Make phone nullable on public.users so users can enroll without mandatory phone
ALTER TABLE public.users ALTER COLUMN phone DROP NOT NULL;

-- 2. Drop legacy flawed check constraints
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_phone_format_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_format_check;

-- 3. Add proper check constraints supporting optional phone or valid Indian mobile (+91, 91, or 10-digit 6-9)
ALTER TABLE public.users ADD CONSTRAINT users_phone_format_check 
    CHECK (phone IS NULL OR phone ~ '^\+?(91)?[6-9][0-9]{9}$');

ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_format_check 
    CHECK (phone IS NULL OR phone ~ '^\+?(91)?[6-9][0-9]{9}$');

-- 4. Trigger to automatically bridge public.users -> auth.users to satisfy users_id_fkey
CREATE OR REPLACE FUNCTION public.handle_before_user_insert()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO auth.users (
        id, 
        phone, 
        email, 
        raw_user_meta_data, 
        created_at, 
        updated_at, 
        instance_id, 
        aud, 
        role
    )
    VALUES (
        NEW.id,
        NEW.phone,
        NEW.email,
        jsonb_build_object('role', NEW.role, 'login_id', NEW.login_id),
        NOW(),
        NOW(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated'
    )
    ON CONFLICT (id) DO UPDATE
    SET phone = EXCLUDED.phone,
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_auth_user ON public.users;
CREATE TRIGGER trg_ensure_auth_user
BEFORE INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_before_user_insert();
