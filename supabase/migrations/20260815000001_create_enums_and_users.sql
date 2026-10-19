-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 1
-- Migration 001: Enums, Core Users & Profiles
-- ============================================================================

-- 1. ENUMS DEFINITIONS
CREATE TYPE user_role AS ENUM (
    'WORKER',
    'CONTRACTOR',
    'SUPERVISOR',
    'LABOUR_ORGANIZATION',
    'INSTITUTIONAL_USER',
    'ADMIN'
);

CREATE TYPE org_type_enum AS ENUM (
    'CONTRACTOR_FIRM',
    'LABOUR_UNION',
    'GOVERNMENT_BODY',
    'INSPECTORATE',
    'NGO'
);

CREATE TYPE skill_category_enum AS ENUM (
    'UNSKILLED',
    'SEMI_SKILLED',
    'SKILLED',
    'HIGHLY_SKILLED'
);

-- 2. USERS TABLE (Tied safely to Supabase Auth auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone TEXT NOT NULL UNIQUE,
    email TEXT,
    role user_role NOT NULL,
    locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en', 'hi', 'mr')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_phone_format_check CHECK (length(trim(phone)) >= 10)
);

-- 3. ORGANIZATIONS TABLE
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    org_type org_type_enum NOT NULL,
    registration_number TEXT UNIQUE,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. WORKERS PROFILE TABLE
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    internal_worker_id TEXT NOT NULL UNIQUE,
    occupation TEXT NOT NULL,
    skill_category skill_category_enum NOT NULL DEFAULT 'UNSKILLED',
    profile_photo_url TEXT,
    emergency_contact TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workers_full_name_check CHECK (length(trim(full_name)) > 0),
    CONSTRAINT workers_internal_id_check CHECK (length(trim(internal_worker_id)) > 0)
);

-- 5. CONTRACTORS PROFILE TABLE
CREATE TABLE contractors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    license_number TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT contractors_full_name_check CHECK (length(trim(full_name)) > 0),
    CONSTRAINT contractors_company_name_check CHECK (length(trim(company_name)) > 0)
);

-- 6. SUPERVISORS PROFILE TABLE
CREATE TABLE supervisors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    badge_number TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT supervisors_full_name_check CHECK (length(trim(full_name)) > 0)
);

-- 7. INSTITUTIONAL USERS TABLE
CREATE TABLE institutional_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    official_designation TEXT NOT NULL,
    jurisdiction_region TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inst_users_full_name_check CHECK (length(trim(full_name)) > 0),
    CONSTRAINT inst_users_designation_check CHECK (length(trim(official_designation)) > 0)
);
