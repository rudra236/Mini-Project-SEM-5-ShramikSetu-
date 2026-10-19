-- ============================================================================
-- SHRAMIKSETU DATABASE FOUNDATION - PHASE 1
-- Migration 002: Projects, Worksites & Supervisor Assignments
-- ============================================================================

-- 1. PROJECT STATUS ENUM
CREATE TYPE project_status AS ENUM (
    'DRAFT',
    'ACTIVE',
    'COMPLETED',
    'SUSPENDED',
    'CANCELLED'
);

-- 2. PROJECTS TABLE
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    status project_status NOT NULL DEFAULT 'ACTIVE',
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT projects_name_check CHECK (length(trim(name)) > 0),
    CONSTRAINT projects_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

-- 3. WORKSITES TABLE
CREATE TABLE worksites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    latitude NUMERIC(10, 8) NOT NULL,
    longitude NUMERIC(11, 8) NOT NULL,
    allowed_radius_meters NUMERIC(8, 2) NOT NULL DEFAULT 100.00,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT worksites_name_check CHECK (length(trim(name)) > 0),
    CONSTRAINT worksites_lat_check CHECK (latitude BETWEEN -90.0 AND 90.0),
    CONSTRAINT worksites_lng_check CHECK (longitude BETWEEN -180.0 AND 180.0),
    CONSTRAINT worksites_radius_check CHECK (allowed_radius_meters > 0)
);

-- 4. SUPERVISOR PROJECT ASSIGNMENTS TABLE
CREATE TABLE supervisor_project_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supervisor_id UUID NOT NULL REFERENCES supervisors(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT supervisor_project_unique UNIQUE (supervisor_id, project_id)
);
