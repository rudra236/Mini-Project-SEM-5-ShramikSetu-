-- Migration: 20260920000016_convert_daily_wage_to_paise_bigint.sql
-- Description: Converts daily_wage in work_contracts and contract_versions from NUMERIC(10,2) (Rupees) to BIGINT (Paise).

-- 1. Update work_contracts: multiply existing daily_wage by 100 and alter type to BIGINT
ALTER TABLE work_contracts 
  ALTER COLUMN daily_wage TYPE BIGINT USING ROUND(daily_wage * 100)::BIGINT;

-- 2. Update contract_versions: multiply existing daily_wage by 100 and alter type to BIGINT
ALTER TABLE contract_versions 
  ALTER COLUMN daily_wage TYPE BIGINT USING ROUND(daily_wage * 100)::BIGINT;

-- Add schema column documentation
COMMENT ON COLUMN work_contracts.daily_wage IS 'Daily wage rate in Paise (1 Rupee = 100 Paise)';
COMMENT ON COLUMN contract_versions.daily_wage IS 'Daily wage rate in Paise (1 Rupee = 100 Paise)';
