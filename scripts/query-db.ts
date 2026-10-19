import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PSQL_PATH = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const DB_NAME = process.env.DB_NAME || 'shramiksetu';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASS = process.env.PGPASSWORD || 'rudra';

export function runSql(query: string): string {
  try {
    const out = execFileSync(
      PSQL_PATH,
      ['-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-F', '|', '-c', query],
      {
        env: { ...process.env, PGPASSWORD: DB_PASS },
        encoding: 'utf8',
      }
    );
    return out.trim();
  } catch (err: any) {
    throw new Error(`SQL execution error: ${err.message}\nQuery: ${query}`);
  }
}

async function main() {
  const mode = process.argv[2] || 'all';

  if (mode === 'versions' || mode === 'all') {
    console.log('=== PACKAGE VERSIONS ===');
    const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    const pkgs = [
      'next', 'react', 'react-dom', '@supabase/supabase-js', '@supabase/ssr',
      'bcryptjs', 'html5-qrcode', 'jsqr', 'pdf-parse', 'pdfkit', 'qrcode',
      'zod', 'playwright-core', '@playwright/test', 'chromium-bidi',
      'tailwindcss', 'typescript', 'vitest', '@fontsource/noto-sans',
      '@fontsource/noto-sans-devanagari'
    ];
    for (const p of pkgs) {
      const ver = lock.packages?.['node_modules/' + p]?.version || lock.dependencies?.[p]?.version;
      console.log(`${p}: ${ver}`);
    }
  }

  if (mode === 'min_wages' || mode === 'all') {
    console.log('\n=== MINIMUM WAGES ROWS ===');
    const minWages = runSql(`
      SELECT *
      FROM minimum_wages 
      ORDER BY state, skill_category, effective_from DESC;
    `);
    console.log(minWages);

    console.log('\n=== MINIMUM WAGE RULES ROWS ===');
    const rules = runSql(`
      SELECT id, state, skill_category, basic_paise, vda_paise, total_paise, effective_from, source_name, verified 
      FROM minimum_wage_rules 
      ORDER BY state, skill_category;
    `);
    console.log(rules);
  }

  if (mode === 'samples' || mode === 'all') {
    console.log('\n=== CONTRACT SAMPLES ===');
    console.log(runSql(`
      SELECT id, contract_ref, worker_id, contractor_id, project_id, daily_wage, status, work_type, start_date, end_date
      FROM work_contracts 
      ORDER BY created_at DESC 
      LIMIT 5;
    `));

    console.log('\n=== ATTENDANCE SAMPLES ===');
    console.log(runSql(`
      SELECT id, worker_id, contract_id, project_id, attendance_date, status, punch_in_time, punch_out_time, wage_amount, verified_at
      FROM attendance_events 
      ORDER BY created_at DESC 
      LIMIT 5;
    `));

    console.log('\n=== LEDGER ENTRIES SAMPLES ===');
    console.log(runSql(`
      SELECT id, entry_ref, worker_id, contractor_id, contract_id, entry_type, amount_paise, status, previous_entry_hash, entry_hash
      FROM ledger_entries 
      ORDER BY created_at DESC 
      LIMIT 10;
    `));

    console.log('\n=== WALLET ACCOUNTS SAMPLES ===');
    console.log(runSql(`
      SELECT id, worker_id, balance_paise, escrow_hold_paise, currency, status
      FROM wallet_accounts 
      LIMIT 5;
    `));

    console.log('\n=== DISPUTES SAMPLES ===');
    console.log(runSql(`
      SELECT id, dispute_ref, contract_id, worker_id, contractor_id, disputed_amount, status, reason, created_at
      FROM disputes 
      ORDER BY created_at DESC 
      LIMIT 5;
    `));

    console.log('\n=== DISPUTE CALCULATIONS (RESOLVED OR ACTIVE) ===');
    console.log(runSql(`
      SELECT d.id, d.dispute_ref, d.disputed_amount, d.claimed_amount_paise, d.shortfall_paise, d.earned_amount_paise, d.paid_amount_paise, d.attendance_days_count, d.status
      FROM disputes d
      LIMIT 5;
    `));
  }
}

main().catch(console.error);
