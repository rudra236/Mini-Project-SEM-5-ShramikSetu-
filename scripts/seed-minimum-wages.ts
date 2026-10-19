/**
 * STATUTORY MINIMUM WAGES SEED SCRIPT
 * Reads data/minimum_wages.csv and loads official government rates
 * into both Supabase public.minimum_wages table and the local store (.registered_minimum_wages.json).
 *
 * Usage: npx tsx scripts/seed-minimum-wages.ts
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Load .env.local if running standalone outside Next.js
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}

import { createAdminClient } from '../src/lib/supabase/admin';

export interface MinimumWageRecord {
  id: string;
  state: string;
  skill_category: string;
  zone: string;
  daily_rate_paise: number;
  effective_from: string;
  source_name: string;
  source_url: string;
  verified: boolean;
  // Compat fields
  skill_tier: string;
  region: string;
  effective_date: string;
  minimum_wage_paise: number;
  source_citation: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export function loadMinimumWagesFromCSV(): MinimumWageRecord[] {
  const csvPath = path.resolve(process.cwd(), 'data/minimum_wages.csv');
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found at ${csvPath}`);
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error('CSV file has no data rows');
  }

  const header = lines[0].split(',').map((h) => h.trim());
  const records: MinimumWageRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    // Match CSV columns (handling basic commas)
    const cols = row.split(',').map((c) => c.trim());
    if (cols.length < 8) continue;

    const [
      state,
      skill_category,
      zone,
      daily_rate_paise_str,
      effective_from,
      source_name,
      source_url,
      verified_str,
    ] = cols;

    const daily_rate_paise = parseInt(daily_rate_paise_str, 10);
    const verified = verified_str.toLowerCase() === 'true';

    // Deterministic UUID based on state, skill, zone, and effective_from
    const hash = crypto
      .createHash('sha256')
      .update(`${state}_${skill_category}_${zone}_${effective_from}`)
      .digest('hex');
    const deterministicId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;

    records.push({
      id: deterministicId,
      state,
      skill_category: skill_category.toUpperCase(),
      zone,
      daily_rate_paise,
      effective_from,
      source_name,
      source_url,
      verified,
      // Compatibility mappings
      skill_tier: skill_category.toUpperCase(),
      region: `${state} - ${zone}`,
      effective_date: effective_from,
      minimum_wage_paise: daily_rate_paise,
      source_citation: source_name,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
  }

  return records;
}

export async function seedMinimumWages() {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU STATUTORY MINIMUM WAGES SEEDER            ');
  console.log('============================================================\n');

  const records = loadMinimumWagesFromCSV();
  console.log(`Parsed ${records.length} statutory minimum wage entries from data/minimum_wages.csv.`);

  // 1. Clean up obsolete local fallback if present
  const localFilePath = path.resolve(process.cwd(), '.registered_minimum_wages.json');
  if (fs.existsSync(localFilePath)) {
    fs.unlinkSync(localFilePath);
    console.log(`✓ Deleted deprecated local registry file: ${path.basename(localFilePath)}`);
  }

  // 2. Direct upsert into real Supabase / PostgreSQL database
  const admin = createAdminClient();
  console.log('Admin client URL:', (admin as any).supabaseUrl);
  const res = await admin.from('minimum_wages').upsert(records as any, {
    onConflict: 'id',
  });
  console.log('Supabase res status:', res.status, 'statusText:', res.statusText, 'error:', res.error);
  const { error } = res;

  if (error) {
    console.error('Supabase error props:', Object.getOwnPropertyNames(error));
    console.error('Supabase error:', error);
    throw new Error(`[PostgreSQL] Failed to upsert statutory minimum wages: ${(error as any).message || (error as any).details || String(error)}`);
  }
  console.log(`✓ Synchronized ${records.length} records into public.minimum_wages database table.`);

  console.log('\nSummary of Statutory Minimum Wages loaded:');
  console.table(
    records.map((r) => ({
      State: r.state,
      Zone: r.zone,
      Skill: r.skill_category,
      'Daily Rate': `₹${r.daily_rate_paise / 100}`,
      'Effective From': r.effective_from,
      Verified: r.verified ? '✓ Official' : '⚠️ Unverified',
    }))
  );
  console.log('\n✓ Minimum wage seeding completed successfully!\n');
}

if (require.main === module || process.argv[1]?.includes('seed-minimum-wages')) {
  seedMinimumWages().catch((err) => {
    console.error('Failed to seed minimum wages:', err);
    process.exit(1);
  });
}
