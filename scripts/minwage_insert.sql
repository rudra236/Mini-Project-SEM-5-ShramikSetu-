
-- 5. SEED ALL 24 STATUTORY GOVERNMENT MINIMUM WAGE RATES
DELETE FROM public.minimum_wages WHERE source_url IS NULL OR source_url = '';

INSERT INTO public.minimum_wages (
  id, state, skill_category, zone, daily_rate_paise, effective_from,
  source_name, source_url, verified, skill_tier, region, effective_date,
  minimum_wage_paise, source_citation, is_active
) VALUES
  ('2f1d3730-1f90-4c95-a9fd-63ca8f1c2025', 'Maharashtra', 'UNSKILLED', 'Zone I', 54442, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'UNSKILLED', 'Maharashtra - Zone I', '2026-07-01', 54442, 'Office of the Labour Commissioner Maharashtra', true),
  ('085988b0-2f43-4f72-a5c2-b4a6123c32b1', 'Maharashtra', 'SEMI_SKILLED', 'Zone I', 57654, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'SEMI_SKILLED', 'Maharashtra - Zone I', '2026-07-01', 57654, 'Office of the Labour Commissioner Maharashtra', true),
  ('964601ba-d886-45e5-abbe-7469fd4f161b', 'Maharashtra', 'SKILLED', 'Zone I', 60638, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'SKILLED', 'Maharashtra - Zone I', '2026-07-01', 60638, 'Office of the Labour Commissioner Maharashtra', true),
  ('f6d34fd9-15d2-457b-a23a-cb3bd344c1d1', 'Maharashtra', 'HIGHLY_SKILLED', 'Zone I', 65000, '2026-07-01', 'Office of the Labour Commissioner Maharashtra (Estimated Tier)', 'https://mahakamgar.maharashtra.gov.in/', false, 'HIGHLY_SKILLED', 'Maharashtra - Zone I', '2026-07-01', 65000, 'Office of the Labour Commissioner Maharashtra (Estimated Tier)', true),
  ('bca4d2e4-4cd8-49d0-a6a1-0b9cb0426e90', 'Maharashtra', 'UNSKILLED', 'Zone II', 52150, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'UNSKILLED', 'Maharashtra - Zone II', '2026-07-01', 52150, 'Office of the Labour Commissioner Maharashtra', true),
  ('f2c1745c-4a71-4335-abad-adcae306e0ad', 'Maharashtra', 'SEMI_SKILLED', 'Zone II', 55362, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'SEMI_SKILLED', 'Maharashtra - Zone II', '2026-07-01', 55362, 'Office of the Labour Commissioner Maharashtra', true),
  ('1057e9d1-8419-4797-a09e-4111ea853a90', 'Maharashtra', 'SKILLED', 'Zone II', 58346, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'SKILLED', 'Maharashtra - Zone II', '2026-07-01', 58346, 'Office of the Labour Commissioner Maharashtra', true),
  ('6f9206c5-40d2-4478-af5e-3181ea099acb', 'Maharashtra', 'HIGHLY_SKILLED', 'Zone II', 62000, '2026-07-01', 'Office of the Labour Commissioner Maharashtra (Estimated Tier)', 'https://mahakamgar.maharashtra.gov.in/', false, 'HIGHLY_SKILLED', 'Maharashtra - Zone II', '2026-07-01', 62000, 'Office of the Labour Commissioner Maharashtra (Estimated Tier)', true),
  ('2580925d-548e-47f3-a01b-82ffc4b4814d', 'Maharashtra', 'UNSKILLED', 'Zone III', 49854, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'UNSKILLED', 'Maharashtra - Zone III', '2026-07-01', 49854, 'Office of the Labour Commissioner Maharashtra', true),
  ('728233e1-9f2b-4cb8-afb3-041456480541', 'Maharashtra', 'SEMI_SKILLED', 'Zone III', 53069, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'SEMI_SKILLED', 'Maharashtra - Zone III', '2026-07-01', 53069, 'Office of the Labour Commissioner Maharashtra', true),
  ('7fa71acd-0c19-497a-a552-d6070888b87a', 'Maharashtra', 'SKILLED', 'Zone III', 56054, '2026-07-01', 'Office of the Labour Commissioner Maharashtra', 'https://mahakamgar.maharashtra.gov.in/', true, 'SKILLED', 'Maharashtra - Zone III', '2026-07-01', 56054, 'Office of the Labour Commissioner Maharashtra', true),
  ('7c5cfc52-d23c-4cf5-ab47-315f7bfbc2ce', 'Maharashtra', 'HIGHLY_SKILLED', 'Zone III', 60000, '2026-07-01', 'Office of the Labour Commissioner Maharashtra (Estimated Tier)', 'https://mahakamgar.maharashtra.gov.in/', false, 'HIGHLY_SKILLED', 'Maharashtra - Zone III', '2026-07-01', 60000, 'Office of the Labour Commissioner Maharashtra (Estimated Tier)', true),
  ('eb9d8292-8e89-45b6-ab45-4cfdea55a570', 'Central Sphere', 'UNSKILLED', 'Area A', 84000, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'UNSKILLED', 'Central Sphere - Area A', '2026-10-01', 84000, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('e056e1ae-7f0b-4b3e-a434-a74d1560c5fa', 'Central Sphere', 'SEMI_SKILLED', 'Area A', 93300, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'SEMI_SKILLED', 'Central Sphere - Area A', '2026-10-01', 93300, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('15d791c9-38c9-41c7-abba-26d647eee1e3', 'Central Sphere', 'SKILLED', 'Area A', 111100, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'SKILLED', 'Central Sphere - Area A', '2026-10-01', 111100, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('78b4893a-4685-4d1b-adee-c38a3680f4ae', 'Central Sphere', 'HIGHLY_SKILLED', 'Area A', 111100, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'HIGHLY_SKILLED', 'Central Sphere - Area A', '2026-10-01', 111100, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('1ceea6b4-085e-4e22-ad23-a88e3d42c651', 'Central Sphere', 'UNSKILLED', 'Area B', 70400, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'UNSKILLED', 'Central Sphere - Area B', '2026-10-01', 70400, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('d94aa8c5-81c7-4799-a7c2-aff7e5c8786f', 'Central Sphere', 'SEMI_SKILLED', 'Area B', 79400, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'SEMI_SKILLED', 'Central Sphere - Area B', '2026-10-01', 79400, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('4195bfb1-1731-4866-a850-5f3b2c3dde00', 'Central Sphere', 'SKILLED', 'Area B', 102400, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'SKILLED', 'Central Sphere - Area B', '2026-10-01', 102400, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('2187ab96-6c65-45b2-a983-79161e2b0105', 'Central Sphere', 'HIGHLY_SKILLED', 'Area B', 102400, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'HIGHLY_SKILLED', 'Central Sphere - Area B', '2026-10-01', 102400, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('c1b10710-101c-4a26-a022-7a9a4d538600', 'Central Sphere', 'UNSKILLED', 'Area C', 56500, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'UNSKILLED', 'Central Sphere - Area C', '2026-10-01', 56500, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('76796581-c188-4c06-a7b9-612cde37d32d', 'Central Sphere', 'SEMI_SKILLED', 'Area C', 66100, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'SEMI_SKILLED', 'Central Sphere - Area C', '2026-10-01', 66100, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('72c57fbf-ac15-4a33-a5b2-9d092108f26e', 'Central Sphere', 'SKILLED', 'Area C', 79400, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'SKILLED', 'Central Sphere - Area C', '2026-10-01', 79400, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true),
  ('4f01bfff-cc6c-4de9-ac82-37da926a53b1', 'Central Sphere', 'HIGHLY_SKILLED', 'Area C', 93300, '2026-10-01', 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', 'https://clc.gov.in/', true, 'HIGHLY_SKILLED', 'Central Sphere - Area C', '2026-10-01', 93300, 'Chief Labour Commissioner (Central) Ministry of Labour & Employment', true)
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
