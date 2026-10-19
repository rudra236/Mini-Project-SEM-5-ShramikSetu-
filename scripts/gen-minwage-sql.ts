import { loadMinimumWagesFromCSV } from './seed-minimum-wages';
import fs from 'fs';

const recs = loadMinimumWagesFromCSV();
const values = recs
  .map(
    (r) =>
      `  ('${r.id}', '${r.state}', '${r.skill_category}', '${r.zone}', ${r.daily_rate_paise}, '${r.effective_from}', '${r.source_name.replace(/'/g, "''")}', '${r.source_url}', ${r.verified}, '${r.skill_tier}', '${r.region}', '${r.effective_date}', ${r.minimum_wage_paise}, '${r.source_citation.replace(/'/g, "''")}', true)`
  )
  .join(',\n');

const sql = `
-- 5. SEED ALL 24 STATUTORY GOVERNMENT MINIMUM WAGE RATES
DELETE FROM public.minimum_wages WHERE source_url IS NULL OR source_url = '';

INSERT INTO public.minimum_wages (
  id, state, skill_category, zone, daily_rate_paise, effective_from,
  source_name, source_url, verified, skill_tier, region, effective_date,
  minimum_wage_paise, source_citation, is_active
) VALUES
${values}
ON CONFLICT (id) DO UPDATE SET
  state = EXCLUDED.state,
  skill_category = EXCLUDED.skill_category,
  zone = EXCLUDED.zone,
  daily_rate_paise = EXCLUDED.daily_rate_paise,
  effective_from = EXCLUDED.effective_from,
  source_name = EXCLUDED.source_name,
  source_url = EXCLUDED.source_url,
  verified = EXCLUDED.verified,
  skill_tier = EXCLUDED.skill_tier,
  region = EXCLUDED.region,
  effective_date = EXCLUDED.effective_date,
  minimum_wage_paise = EXCLUDED.minimum_wage_paise,
  source_citation = EXCLUDED.source_citation,
  updated_at = NOW();
`;

fs.writeFileSync('scripts/minwage_insert.sql', sql, 'utf8');
console.log('Generated scripts/minwage_insert.sql successfully');
