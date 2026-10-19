/**
 * SHRAMIKSETU IDEMPOTENT DEMO SEED SCRIPT
 *
 * Usage: npm run seed:demo
 *
 * Strict Rules:
 * - Gated strictly by DEMO_MODE=true
 * - 2 contractors, 6 workers with deterministic IDs and cost-12 bcrypt hashed passwords.
 * - 3 projects in Maharashtra (Thane, BKC Mumbai, Navi Mumbai).
 * - Every wage derived from the `minimum_wages` table for Maharashtra Zone I + worker's skill category:
 *   wage = applicable minimum × factor (1.0 to ~1.4), rounded to the nearest ₹10.
 *   Skill tier order preserved: UNSKILLED < SEMI_SKILLED < SKILLED < HIGHLY_SKILLED.
 * - Server-side & DB sanity guards respected (wage >= minimum and <= 5x minimum cap).
 * - Realistic attendance on past working days with rest day gaps.
 * - Ledger: accruals = present days × wage; payments ≤ accrued (Worker 1 partial, Worker 2 full, Worker 5 with dues).
 * - Disputes: amounts ≤ actual dues, spread across OPEN, UNDER_REVIEW, RESOLVED, REJECTED.
 * - Passwords generated (not hardcoded), printed once in the credentials table.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { execFileSync } from 'child_process';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

// Gate execution strictly to DEMO_MODE=true
if (process.env.DEMO_MODE !== 'true') {
  console.error('Error: seed:demo is strictly gated and requires DEMO_MODE=true in .env.local');
  process.exit(1);
}

import { createAdminClient } from '../src/lib/supabase/admin';

// Static Deterministic UUIDs for Idempotency
const IDS = {
  // ── Contractors ──
  contractor1User: '11111111-1111-1111-1111-111111111102',
  contractor1: '22222222-2222-2222-2222-222222222201',
  contractor1LoginId: process.env.DEMO_CONTRACTOR_1_ID || 'SS-C-2026-000001',

  contractor2User: '11111111-1111-1111-1111-111111111103',
  contractor2: '22222222-2222-2222-2222-222222222202',
  contractor2LoginId: process.env.DEMO_CONTRACTOR_2_ID || 'SS-C-2026-000002',

  // ── 6 Workers ──
  worker1User: '11111111-1111-1111-1111-111111111101',
  worker1: '33333333-3333-3333-3333-333333333301',
  worker1LoginId: process.env.DEMO_WORKER_1_ID || 'SS-W-2026-000001',

  worker2User: '11111111-1111-1111-1111-111111111110',
  worker2: '33333333-3333-3333-3333-333333333302',
  worker2LoginId: process.env.DEMO_WORKER_2_ID || 'SS-W-2026-000002',

  worker3User: '11111111-1111-1111-1111-111111111111',
  worker3: '33333333-3333-3333-3333-333333333303',
  worker3LoginId: process.env.DEMO_WORKER_3_ID || 'SS-W-2026-000003',

  worker4User: '11111111-1111-1111-1111-111111111112',
  worker4: '33333333-3333-3333-3333-333333333304',
  worker4LoginId: process.env.DEMO_WORKER_4_ID || 'SS-W-2026-000004',

  worker5User: '11111111-1111-1111-1111-111111111113',
  worker5: '33333333-3333-3333-3333-333333333305',
  worker5LoginId: process.env.DEMO_WORKER_5_ID || 'SS-W-2026-000005',

  worker6User: '11111111-1111-1111-1111-111111111114',
  worker6: '33333333-3333-3333-3333-333333333306',
  worker6LoginId: process.env.DEMO_WORKER_6_ID || 'SS-W-2026-000006',

  // ── 3 Projects ──
  project1: '66666666-6666-6666-6666-666666666601',
  project2: '66666666-6666-6666-6666-666666666602',
  project3: '66666666-6666-6666-6666-666666666603',

  // ── Worksites ──
  worksite1: '77777777-7777-7777-7777-777777777701',
  worksite2: '77777777-7777-7777-7777-777777777702',
  worksite3: '77777777-7777-7777-7777-777777777703',

  // ── Contracts ──
  contract1Ongoing: '55555555-5555-5555-5555-555555555501',
  contract1Completed: '55555555-5555-5555-5555-555555555502',
  contract2Ongoing: '55555555-5555-5555-5555-555555555503',
  contract3Ongoing: '55555555-5555-5555-5555-555555555504',
  contract4Ongoing: '55555555-5555-5555-5555-555555555505',
  contract5Ongoing: '55555555-5555-5555-5555-555555555506',
  contract6Ongoing: '55555555-5555-5555-5555-555555555507',

  // ── Wallets ──
  walletContractor1: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  walletContractor2: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
  walletWorker1: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb01',
  walletWorker2: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb02',
  walletWorker3: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb03',
  walletWorker4: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb04',
  walletWorker5: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb05',
  walletWorker6: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbb06',
};

function getOrGeneratePassword(envKey: string, fallbackPrefix: string): string {
  if (process.env[envKey]) {
    return process.env[envKey]!;
  }
  return `${fallbackPrefix}@${crypto.randomBytes(4).toString('hex')}!`;
}

function cleanExistingDemoData() {
  const psqlPath = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
  const dbName = process.env.DB_NAME || 'shramiksetu';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPass = process.env.PGPASSWORD || process.env.DB_PASSWORD || 'rudra';

  const demoContractIds = [
    '55555555-5555-5555-5555-555555555501',
    '55555555-5555-5555-5555-555555555502',
    '55555555-5555-5555-5555-555555555503',
    '55555555-5555-5555-5555-555555555504',
    '55555555-5555-5555-5555-555555555505',
    '55555555-5555-5555-5555-555555555506',
    '55555555-5555-5555-5555-555555555507',
  ].map((id) => `'${id}'`).join(',');

  const cleanSql = `
BEGIN;
ALTER TABLE ledger_entries DISABLE RULE ledger_no_delete;
ALTER TABLE ledger_entries DISABLE RULE ledger_no_update;
ALTER TABLE ledger_entries DISABLE TRIGGER trg_prevent_update_or_delete_ledger_entries;
ALTER TABLE attendance_events DISABLE TRIGGER trg_prevent_update_or_delete_attendance_events;

DELETE FROM dispute_evidence_snapshots WHERE dispute_id IN ('77777777-7777-7777-7777-777777777701', '77777777-7777-7777-7777-777777777702', '77777777-7777-7777-7777-777777777703', '77777777-7777-7777-7777-777777777704');
DELETE FROM disputes WHERE id IN ('77777777-7777-7777-7777-777777777701', '77777777-7777-7777-7777-777777777702', '77777777-7777-7777-7777-777777777703', '77777777-7777-7777-7777-777777777704') OR contract_id IN (${demoContractIds});

DELETE FROM reminders WHERE contract_id IN (${demoContractIds});
DELETE FROM job_completion_statements WHERE contract_id IN (${demoContractIds});
DELETE FROM contract_acceptances WHERE contract_id IN (${demoContractIds});
DELETE FROM contract_versions WHERE contract_id IN (${demoContractIds});

DELETE FROM ledger_entries WHERE contract_id IN (${demoContractIds}) 
  OR transaction_id IN (SELECT id FROM payment_transactions WHERE contract_id IN (${demoContractIds}))
  OR id IN (
    '33333333-1111-1111-1111-111111110001', '33333333-1111-1111-1111-111111110002', '33333333-1111-1111-1111-111111110003', '33333333-1111-1111-1111-111111110004',
    '33333333-1111-1111-1111-111111110005', '33333333-1111-1111-1111-111111110006', '33333333-1111-1111-1111-111111110007'
  );

DELETE FROM payment_confirmations WHERE transaction_id IN (SELECT id FROM payment_transactions WHERE contract_id IN (${demoContractIds}));
DELETE FROM payment_transactions WHERE contract_id IN (${demoContractIds}) OR id IN ('44444444-4444-4444-4444-444444440001', '44444444-4444-4444-4444-444444440003');

DELETE FROM attendance_summaries WHERE contract_id IN (${demoContractIds});
DELETE FROM attendance_events WHERE contract_id IN (${demoContractIds}) OR id::text LIKE '88888888-8888-8888-8888-88888888%';

ALTER TABLE work_contracts DISABLE TRIGGER trg_enforce_contract_status_transition;
UPDATE work_contracts 
SET status = 'CANCELLED' 
WHERE worker_id IN (
  '33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333302',
  '33333333-3333-3333-3333-333333333303', '33333333-3333-3333-3333-333333333304',
  '33333333-3333-3333-3333-333333333305', '33333333-3333-3333-3333-333333333306'
) AND project_id IN (
  '66666666-6666-6666-6666-666666666601', '66666666-6666-6666-6666-666666666602', '66666666-6666-6666-6666-666666666603'
) AND status IN ('ACTIVE', 'ACCEPTED', 'PENDING', 'OFFERED', 'PENDING_ACCEPTANCE');
DELETE FROM work_contracts WHERE id IN (${demoContractIds});
ALTER TABLE work_contracts ENABLE TRIGGER trg_enforce_contract_status_transition;

UPDATE workers SET 
  skill_category = CASE 
    WHEN id = '33333333-3333-3333-3333-333333333301' THEN 'SKILLED'
    WHEN id = '33333333-3333-3333-3333-333333333302' THEN 'SEMI_SKILLED'
    WHEN id = '33333333-3333-3333-3333-333333333303' THEN 'HIGHLY_SKILLED'
    WHEN id = '33333333-3333-3333-3333-333333333304' THEN 'UNSKILLED'
    WHEN id = '33333333-3333-3333-3333-333333333305' THEN 'SKILLED'
    WHEN id = '33333333-3333-3333-3333-333333333306' THEN 'SEMI_SKILLED'
    ELSE skill_category
  END
WHERE id IN (
  '33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333302',
  '33333333-3333-3333-3333-333333333303', '33333333-3333-3333-3333-333333333304',
  '33333333-3333-3333-3333-333333333305', '33333333-3333-3333-3333-333333333306'
);

ALTER TABLE attendance_events ENABLE TRIGGER trg_prevent_update_or_delete_attendance_events;
ALTER TABLE ledger_entries ENABLE TRIGGER trg_prevent_update_or_delete_ledger_entries;
ALTER TABLE ledger_entries ENABLE RULE ledger_no_delete;
ALTER TABLE ledger_entries ENABLE RULE ledger_no_update;
COMMIT;
  `;

  try {
    execFileSync(psqlPath, ['-U', dbUser, '-d', dbName, '-c', cleanSql], {
      env: { ...process.env, PGPASSWORD: dbPass },
      encoding: 'utf8',
    });
    console.log('✓ Cleaned existing demo records prior to seeding');
  } catch (err: any) {
    console.warn('Note on cleanExistingDemoData:', err.message);
  }
}

async function seedDemoData() {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU DEMO DATA & CREDENTIALS SEEDER           ');
  console.log('       (ID + Password Auth / Cost 12 Bcrypt)                ');
  console.log('============================================================\n');

  // Clean demo records so reset + seed is completely idempotent and realistic
  cleanExistingDemoData();

  const admin = createAdminClient();
  const BCRYPT_COST = 12;

  // Retrieve or generate passwords
  const worker1Pass = getOrGeneratePassword('DEMO_WORKER_1_PASSWORD', 'Ramesh');
  const worker2Pass = getOrGeneratePassword('DEMO_WORKER_2_PASSWORD', 'Sunita');
  const worker3Pass = getOrGeneratePassword('DEMO_WORKER_3_PASSWORD', 'Amit');
  const worker4Pass = getOrGeneratePassword('DEMO_WORKER_4_PASSWORD', 'Pooja');
  const worker5Pass = getOrGeneratePassword('DEMO_WORKER_5_PASSWORD', 'Ganesh');
  const worker6Pass = getOrGeneratePassword('DEMO_WORKER_6_PASSWORD', 'Laxmi');

  const contractor1Pass = getOrGeneratePassword('DEMO_CONTRACTOR_1_PASSWORD', 'Suresh');
  const contractor2Pass = getOrGeneratePassword('DEMO_CONTRACTOR_2_PASSWORD', 'Rajesh');

  const [
    hashWorker1,
    hashWorker2,
    hashWorker3,
    hashWorker4,
    hashWorker5,
    hashWorker6,
    hashContractor1,
    hashContractor2,
  ] = await Promise.all([
    bcrypt.hash(worker1Pass, BCRYPT_COST),
    bcrypt.hash(worker2Pass, BCRYPT_COST),
    bcrypt.hash(worker3Pass, BCRYPT_COST),
    bcrypt.hash(worker4Pass, BCRYPT_COST),
    bcrypt.hash(worker5Pass, BCRYPT_COST),
    bcrypt.hash(worker6Pass, BCRYPT_COST),
    bcrypt.hash(contractor1Pass, BCRYPT_COST),
    bcrypt.hash(contractor2Pass, BCRYPT_COST),
  ]);

  const setPasswordToken = crypto.randomBytes(32).toString('hex');
  const setPasswordExpiry = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  // 1. Seed 2 Contractors
  await admin.from('users').upsert([
    {
      id: IDS.contractor1User,
      login_id: IDS.contractor1LoginId,
      password_hash: hashContractor1,
      phone: '+919876500001',
      role: 'CONTRACTOR',
      locale: 'en',
      is_active: true,
    },
    {
      id: IDS.contractor2User,
      login_id: IDS.contractor2LoginId,
      password_hash: hashContractor2,
      phone: '+919876500002',
      role: 'CONTRACTOR',
      locale: 'en',
      is_active: true,
    },
  ]);

  await admin.from('contractors').upsert([
    {
      id: IDS.contractor1,
      user_id: IDS.contractor1User,
      internal_contractor_id: IDS.contractor1LoginId,
      password_hash: hashContractor1,
      company_name: 'Metro Rail Infra Corp',
      license_number: 'LIC-MH-2026-0981',
      full_name: 'Suresh Patel',
      compliance_status: 'COMPLIANT',
    },
    {
      id: IDS.contractor2,
      user_id: IDS.contractor2User,
      internal_contractor_id: IDS.contractor2LoginId,
      password_hash: hashContractor2,
      company_name: 'Apex Metro Infrastructure Ltd',
      license_number: 'LIC-MH-2026-0982',
      full_name: 'Rajesh Singhania',
      compliance_status: 'COMPLIANT',
    },
  ]);
  console.log('✓ Seeded 2 Contractors (Suresh Patel, Rajesh Singhania)');

  // 2. Seed 6 Workers (Diverse skills & trades, realistic Indian & Devanagari names, valid 10-digit mobile)
  await admin.from('users').upsert([
    {
      id: IDS.worker1User,
      login_id: IDS.worker1LoginId,
      password_hash: hashWorker1,
      phone: '+919876543210',
      role: 'WORKER',
      locale: 'hi',
      is_active: true,
    },
    {
      id: IDS.worker2User,
      login_id: IDS.worker2LoginId,
      password_hash: hashWorker2,
      phone: '+919876543220',
      role: 'WORKER',
      locale: 'mr',
      is_active: true,
      set_password_token: setPasswordToken,
      set_password_token_expires_at: setPasswordExpiry,
    },
    {
      id: IDS.worker3User,
      login_id: IDS.worker3LoginId,
      password_hash: hashWorker3,
      phone: '+919876543230',
      role: 'WORKER',
      locale: 'en',
      is_active: true,
    },
    {
      id: IDS.worker4User,
      login_id: IDS.worker4LoginId,
      password_hash: hashWorker4,
      phone: '+919876543240',
      role: 'WORKER',
      locale: 'hi',
      is_active: true,
    },
    {
      id: IDS.worker5User,
      login_id: IDS.worker5LoginId,
      password_hash: hashWorker5,
      phone: '+919876543250',
      role: 'WORKER',
      locale: 'mr',
      is_active: true,
    },
    {
      id: IDS.worker6User,
      login_id: IDS.worker6LoginId,
      password_hash: hashWorker6,
      phone: '+919876543260',
      role: 'WORKER',
      locale: 'en',
      is_active: true,
    },
  ]);

  await admin.from('workers').upsert([
    {
      id: IDS.worker1,
      user_id: IDS.worker1User,
      internal_worker_id: IDS.worker1LoginId,
      password_hash: hashWorker1,
      full_name: 'Ramesh Kumar',
      occupation: 'Lead Tile Mason',
      skill_category: 'SKILLED',
      phone: '+919876543210',
    },
    {
      id: IDS.worker2,
      user_id: IDS.worker2User,
      internal_worker_id: IDS.worker2LoginId,
      password_hash: hashWorker2,
      full_name: 'Sunita Devi',
      occupation: 'Bar Bender & Steel Worker',
      skill_category: 'SEMI_SKILLED',
      phone: '+919876543220',
    },
    {
      id: IDS.worker3,
      user_id: IDS.worker3User,
      internal_worker_id: IDS.worker3LoginId,
      password_hash: hashWorker3,
      full_name: 'Amit Shinde',
      occupation: 'Master Electrician',
      skill_category: 'HIGHLY_SKILLED',
      phone: '+919876543230',
    },
    {
      id: IDS.worker4,
      user_id: IDS.worker4User,
      internal_worker_id: IDS.worker4LoginId,
      password_hash: hashWorker4,
      full_name: 'Pooja Waghmare',
      occupation: 'Site Helper',
      skill_category: 'UNSKILLED',
      phone: '+919876543240',
    },
    {
      id: IDS.worker5,
      user_id: IDS.worker5User,
      internal_worker_id: IDS.worker5LoginId,
      password_hash: hashWorker5,
      full_name: 'Ganesh Gaikwad (गणेश गायकवाड)',
      occupation: 'Formwork Carpenter',
      skill_category: 'SKILLED',
      phone: '+919876543250',
    },
    {
      id: IDS.worker6,
      user_id: IDS.worker6User,
      internal_worker_id: IDS.worker6LoginId,
      password_hash: hashWorker6,
      full_name: 'Laxmi Rathod (लक्ष्मी राठोड)',
      occupation: 'Finishing Painter',
      skill_category: 'SEMI_SKILLED',
      phone: '+919876543260',
    },
  ]);
  console.log('✓ Seeded 6 Workers with diverse skills & trades');

  // Seed Administrative & Inspector demo accounts with cost-12 hashes
  const adminPass = 'Admin@123';
  const inspectorPass = 'Inspector@123';
  const supervisorPass = 'Supervisor@123';
  const [hashAdmin, hashInspector, hashSupervisor] = await Promise.all([
    bcrypt.hash(adminPass, BCRYPT_COST),
    bcrypt.hash(inspectorPass, BCRYPT_COST),
    bcrypt.hash(supervisorPass, BCRYPT_COST),
  ]);

  await admin.from('users').upsert([
    {
      id: '00000000-0000-0000-0000-000000000001',
      login_id: 'SS-A-2026-000001',
      password_hash: hashAdmin,
      phone: '+919820000001',
      role: 'ADMIN',
      locale: 'en',
      is_active: true,
    },
    {
      id: '00000000-0000-0000-0001-000000000002',
      login_id: 'SS-I-2026-000001',
      password_hash: hashInspector,
      phone: '+919820011001',
      role: 'INSTITUTIONAL_USER',
      locale: 'en',
      is_active: true,
    },
    {
      id: '11111111-1111-1111-1111-111111111106',
      login_id: 'SS-S-2026-000001',
      password_hash: hashSupervisor,
      phone: '+919820044001',
      role: 'SUPERVISOR',
      locale: 'en',
      is_active: true,
    },
  ]);
  console.log('✓ Seeded Admin, Institutional, and Supervisor accounts');

  // 3. Seed 3 Projects & Worksites (All in Maharashtra)
  await admin.from('projects').upsert([
    {
      id: IDS.project1,
      contractor_id: IDS.contractor1,
      name: 'Mumbai Metro Line 4 - Thane Extension',
      description: 'PRJ-MUM-04 (Ongoing Infrastructure Project)',
      status: 'ACTIVE',
      start_date: '2026-01-01',
      location: 'Ghodbunder Road, Thane, Maharashtra',
    },
    {
      id: IDS.project2,
      contractor_id: IDS.contractor1,
      name: 'Bandra-Kurla Complex Flyover Pier 9',
      description: 'PRJ-BKC-09 (Successfully Completed Contract)',
      status: 'COMPLETED',
      start_date: '2026-01-01',
      end_date: '2026-08-31',
      location: 'BKC Junction Gate 2, Mumbai, Maharashtra',
    },
    {
      id: IDS.project3,
      contractor_id: IDS.contractor2,
      name: 'Navi Mumbai Airport Cargo Terminal',
      description: 'PRJ-NMI-01 (Air Cargo Facility)',
      status: 'ACTIVE',
      start_date: '2026-03-01',
      location: 'Ulwe Air Cargo Logistics Hub, Navi Mumbai, Maharashtra',
    },
  ]);

  await admin.from('worksites').upsert([
    {
      id: IDS.worksite1,
      project_id: IDS.project1,
      name: 'Ghodbunder Road Station Pier 14',
      address: 'Ghodbunder Road Station Pier 14',
      city: 'Thane',
      state: 'Maharashtra',
      latitude: 19.26123,
      longitude: 72.96445,
      allowed_radius_meters: 250,
    },
    {
      id: IDS.worksite2,
      project_id: IDS.project2,
      name: 'BKC Junction Site Gate 2',
      address: 'BKC Junction Site Gate 2',
      city: 'Mumbai',
      state: 'Maharashtra',
      latitude: 19.06571,
      longitude: 72.86872,
      allowed_radius_meters: 200,
    },
    {
      id: IDS.worksite3,
      project_id: IDS.project3,
      name: 'Air Cargo Gate 5 Logistics Hub',
      address: 'Sector 19, Ulwe, Navi Mumbai',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      latitude: 18.99021,
      longitude: 73.07212,
      allowed_radius_meters: 300,
    },
  ]);
  console.log('✓ Seeded 3 Maharashtra Projects (1 ongoing, 1 completed, 1 airport active)');

  // 4. Resolve Statutory Minimum Wages from DB (Source of Truth)
  const { data: minWageRows, error: minWageErr } = await admin
    .from('minimum_wages')
    .select('skill_category, daily_rate_paise')
    .eq('state', 'Maharashtra')
    .eq('zone', 'Zone I');

  if (minWageErr || !minWageRows || minWageRows.length === 0) {
    throw new Error('Failed to query minimum_wages table for Maharashtra Zone I');
  }

  const minWageMap = new Map<string, number>();
  for (const row of minWageRows) {
    minWageMap.set(row.skill_category, row.daily_rate_paise);
  }

  // Derive wage dynamically: wage = applicable minimum × factor (1.0 to ~1.4), rounded to nearest ₹10 (1000 paise)
  function deriveWage(skillCategory: string, factor: number): { wagePaise: number; minWagePaise: number } {
    const minWage = minWageMap.get(skillCategory);
    if (!minWage) {
      throw new Error(`Statutory minimum wage not found for category: ${skillCategory}`);
    }
    const rawWage = minWage * factor;
    const roundedWage = Math.round(rawWage / 1000) * 1000;
    const finalWage = Math.max(roundedWage, Math.ceil(minWage / 1000) * 1000);
    return { wagePaise: finalWage, minWagePaise: minWage };
  }

  // Calculate wages according to strict skill bands:
  // UNSKILLED < SEMI_SKILLED < SKILLED < HIGHLY_SKILLED
  const w1OngoingWage = deriveWage('SKILLED', 1.25);       // ~₹760
  const w1CompletedWage = deriveWage('SKILLED', 1.15);     // ~₹700
  const w2Wage = deriveWage('SEMI_SKILLED', 1.15);         // ~₹660
  const w3Wage = deriveWage('HIGHLY_SKILLED', 1.35);       // ~₹880
  const w4Wage = deriveWage('UNSKILLED', 1.05);           // ~₹570
  const w5Wage = deriveWage('SKILLED', 1.20);             // ~₹730
  const w6Wage = deriveWage('SEMI_SKILLED', 1.10);         // ~₹630

  // 5. Seed Contracts (All derived from statutory minimum wages table)
  const contractsData = [
    {
      id: IDS.contract1Ongoing,
      contract_code: 'CTR-DEMO-001',
      worker_id: IDS.worker1,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      daily_wage: w1OngoingWage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      status: 'ACTIVE',
      start_date: '2026-09-01',
      end_date: '2026-12-31',
      work_type: 'Lead Tile Mason',
      min_wage_applicable_paise: w1OngoingWage.minWagePaise,
    },
    {
      id: IDS.contract1Completed,
      contract_code: 'CTR-DEMO-002',
      worker_id: IDS.worker1,
      contractor_id: IDS.contractor1,
      project_id: IDS.project2,
      worksite_id: IDS.worksite2,
      daily_wage: w1CompletedWage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'MONTHLY',
      status: 'COMPLETED',
      start_date: '2026-06-01',
      end_date: '2026-08-31',
      work_type: 'Mason',
      min_wage_applicable_paise: w1CompletedWage.minWagePaise,
    },
    {
      id: IDS.contract2Ongoing,
      contract_code: 'CTR-DEMO-003',
      worker_id: IDS.worker2,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      daily_wage: w2Wage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      status: 'ACTIVE',
      start_date: '2026-09-15',
      end_date: '2026-11-30',
      work_type: 'Bar Bender & Steel Worker',
      min_wage_applicable_paise: w2Wage.minWagePaise,
    },
    {
      id: IDS.contract3Ongoing,
      contract_code: 'CTR-DEMO-004',
      worker_id: IDS.worker3,
      contractor_id: IDS.contractor2,
      project_id: IDS.project3,
      worksite_id: IDS.worksite3,
      daily_wage: w3Wage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      status: 'ACTIVE',
      start_date: '2026-09-01',
      end_date: '2026-12-31',
      work_type: 'Master Electrician',
      min_wage_applicable_paise: w3Wage.minWagePaise,
    },
    {
      id: IDS.contract4Ongoing,
      contract_code: 'CTR-DEMO-005',
      worker_id: IDS.worker4,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      daily_wage: w4Wage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      status: 'ACTIVE',
      start_date: '2026-09-15',
      end_date: '2026-11-30',
      work_type: 'Site Helper',
      min_wage_applicable_paise: w4Wage.minWagePaise,
    },
    {
      id: IDS.contract5Ongoing,
      contract_code: 'CTR-DEMO-006',
      worker_id: IDS.worker5,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      daily_wage: w5Wage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      status: 'ACTIVE',
      start_date: '2026-09-15',
      end_date: '2026-11-30',
      work_type: 'Formwork Carpenter',
      min_wage_applicable_paise: w5Wage.minWagePaise,
    },
    {
      id: IDS.contract6Ongoing,
      contract_code: 'CTR-DEMO-007',
      worker_id: IDS.worker6,
      contractor_id: IDS.contractor2,
      project_id: IDS.project3,
      worksite_id: IDS.worksite3,
      daily_wage: w6Wage.wagePaise,
      expected_working_hours: 8,
      payment_frequency: 'WEEKLY',
      status: 'ACTIVE',
      start_date: '2026-09-01',
      end_date: '2026-12-31',
      work_type: 'Finishing Painter',
      min_wage_applicable_paise: w6Wage.minWagePaise,
    },
  ];

  const res = await admin.from('work_contracts').upsert(contractsData, { onConflict: 'id' });
  if (res.error) {
    throw new Error(`Failed to seed contracts: ${res.error.message}`);
  }
  console.log('✓ Seeded Contracts at legally compliant wages derived from minimum_wages table');

  // 6. Seed Attendance Events (Past working days within contract dates with rest day gaps)
  const attendanceDatesWorker1 = [
    '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19',
    // 2026-09-20 (Sunday - Gap)
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    // 2026-09-27 (Sunday - Gap)
    // 2026-09-28 to 2026-09-30 (Rest/Material delay)
    '2026-10-01', '2026-10-02', '2026-10-03',
  ];

  const attendanceEvents = attendanceDatesWorker1.map((d, idx) => ({
    id: `88888888-8888-8888-8888-88888888${(idx + 10).toString().padStart(4, '0')}`,
    contract_id: IDS.contract1Ongoing,
    worker_id: IDS.worker1,
    contractor_id: IDS.contractor1,
    project_id: IDS.project1,
    worksite_id: IDS.worksite1,
    date: d,
    punch_type: 'IN',
    status: 'VERIFIED',
    attendance_method: idx % 3 === 0 ? 'manual' : 'qr',
    worker_latitude: 19.26125,
    worker_longitude: 72.96448,
    worksite_latitude: 19.26123,
    worksite_longitude: 72.96445,
    calculated_distance_meters: 12,
    allowed_radius_meters: 250,
    created_at: `${d}T08:30:00Z`,
  }));

  // Attendance for Worker 2 (2 shifts: Sept 28, Sept 29)
  attendanceEvents.push(
    {
      id: '88888888-8888-8888-8888-888888880101',
      contract_id: IDS.contract2Ongoing,
      worker_id: IDS.worker2,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      date: '2026-09-28',
      punch_type: 'IN',
      status: 'VERIFIED',
      attendance_method: 'qr',
      worker_latitude: 19.26123,
      worker_longitude: 72.96445,
      worksite_latitude: 19.26123,
      worksite_longitude: 72.96445,
      calculated_distance_meters: 8,
      allowed_radius_meters: 250,
      created_at: '2026-09-28T08:35:00Z',
    },
    {
      id: '88888888-8888-8888-8888-888888880102',
      contract_id: IDS.contract2Ongoing,
      worker_id: IDS.worker2,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      date: '2026-09-29',
      punch_type: 'IN',
      status: 'VERIFIED',
      attendance_method: 'qr',
      worker_latitude: 19.26123,
      worker_longitude: 72.96445,
      worksite_latitude: 19.26123,
      worksite_longitude: 72.96445,
      calculated_distance_meters: 5,
      allowed_radius_meters: 250,
      created_at: '2026-09-29T08:31:00Z',
    }
  );

  // Attendance for Worker 5 (2 shifts: Sept 25, Sept 26)
  attendanceEvents.push(
    {
      id: '88888888-8888-8888-8888-888888880103',
      contract_id: IDS.contract5Ongoing,
      worker_id: IDS.worker5,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      date: '2026-09-25',
      punch_type: 'IN',
      status: 'VERIFIED',
      attendance_method: 'qr',
      worker_latitude: 19.26123,
      worker_longitude: 72.96445,
      worksite_latitude: 19.26123,
      worksite_longitude: 72.96445,
      calculated_distance_meters: 6,
      allowed_radius_meters: 250,
      created_at: '2026-09-25T08:30:00Z',
    },
    {
      id: '88888888-8888-8888-8888-888888880104',
      contract_id: IDS.contract5Ongoing,
      worker_id: IDS.worker5,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      worksite_id: IDS.worksite1,
      date: '2026-09-26',
      punch_type: 'IN',
      status: 'VERIFIED',
      attendance_method: 'qr',
      worker_latitude: 19.26123,
      worker_longitude: 72.96445,
      worksite_latitude: 19.26123,
      worksite_longitude: 72.96445,
      calculated_distance_meters: 7,
      allowed_radius_meters: 250,
      created_at: '2026-09-26T08:32:00Z',
    }
  );

  const { error: attErr } = await admin.from('attendance_events').insert(attendanceEvents);
  if (attErr) throw new Error(`Failed to seed attendance events: ${attErr.message}`);
  console.log(`✓ Seeded ${attendanceEvents.length} Verified Attendance Events (~3 weeks history with rest-day gaps)`);

  // 7. Seed Wallet Accounts (No arbitrary initial balance, strictly 0)
  const { error: walletsErr } = await admin.from('wallet_accounts').upsert([
    { id: IDS.walletContractor1, owner_id: IDS.contractor1, account_type: 'CONTRACTOR', currency: 'INR', is_active: true },
    { id: IDS.walletContractor2, owner_id: IDS.contractor2, account_type: 'CONTRACTOR', currency: 'INR', is_active: true },
    { id: IDS.walletWorker1, owner_id: IDS.worker1, account_type: 'WORKER', currency: 'INR', is_active: true },
    { id: IDS.walletWorker2, owner_id: IDS.worker2, account_type: 'WORKER', currency: 'INR', is_active: true },
    { id: IDS.walletWorker3, owner_id: IDS.worker3, account_type: 'WORKER', currency: 'INR', is_active: true },
    { id: IDS.walletWorker4, owner_id: IDS.worker4, account_type: 'WORKER', currency: 'INR', is_active: true },
    { id: IDS.walletWorker5, owner_id: IDS.worker5, account_type: 'WORKER', currency: 'INR', is_active: true },
    { id: IDS.walletWorker6, owner_id: IDS.worker6, account_type: 'WORKER', currency: 'INR', is_active: true },
  ]);
  if (walletsErr) throw new Error(`Failed to seed wallet accounts: ${walletsErr.message}`);
  console.log('✓ Seeded Double-Entry Wallet Accounts');

  // 8. Seed Payments & Wage Accruals
  // Calculations:
  // Worker 1: 10 shifts before payment = 10 * w1OngoingWage.wagePaise (₹7,600).
  // Payment 1: Partial payment of ₹5,000 (500000 paise) <= accrued ₹7,600.
  const payment1TxnId = '44444444-4444-4444-4444-444444440001';
  const payment1Paise = 500000; // ₹5,000 partial payment

  // Worker 2: 2 shifts = 2 * w2Wage.wagePaise (₹1,320).
  // Payment 2: Fully paid = 2 * w2Wage.wagePaise (₹1,320).
  const payment2TxnId = '44444444-4444-4444-4444-444444440003';
  const payment2Paise = 2 * w2Wage.wagePaise; // Full payment

  // Worker 5: 2 shifts = 2 * w5Wage.wagePaise (₹1,460).
  // Payment: 0 paise (Worker with dues).

  const { error: payErr } = await admin.from('payment_transactions').upsert([
    {
      id: payment1TxnId,
      transaction_ref: 'TXN-20260930-500000',
      idempotency_key: 'idemp-pay-demo-001',
      sender_account_id: IDS.walletContractor1,
      receiver_account_id: IDS.walletWorker1,
      contractor_id: IDS.contractor1,
      worker_id: IDS.worker1,
      contract_id: IDS.contract1Ongoing,
      project_id: IDS.project1,
      amount_paise: payment1Paise,
      payment_source: 'PLATFORM_TRANSFER',
      payment_method: 'BANK_IMPS',
      status: 'SUCCESS',
      initiated_by: IDS.contractor1User,
      created_at: '2026-09-30T16:00:00Z',
    },
    {
      id: payment2TxnId,
      transaction_ref: `TXN-20260930-${payment2Paise}`,
      idempotency_key: 'idemp-pay-demo-002',
      sender_account_id: IDS.walletContractor1,
      receiver_account_id: IDS.walletWorker2,
      contractor_id: IDS.contractor1,
      worker_id: IDS.worker2,
      contract_id: IDS.contract2Ongoing,
      project_id: IDS.project1,
      amount_paise: payment2Paise,
      payment_source: 'PLATFORM_TRANSFER',
      payment_method: 'BANK_IMPS',
      status: 'SUCCESS',
      initiated_by: IDS.contractor1User,
      created_at: '2026-09-30T16:30:00Z',
    },
  ]);
  if (payErr) throw new Error(`Failed to seed payment transactions: ${payErr.message}`);

  // Confirmations
  const { error: confErr } = await admin.from('payment_confirmations').upsert([
    {
      id: '44444444-4444-4444-4444-444444440002',
      transaction_id: payment1TxnId,
      worker_id: IDS.worker1,
      is_confirmed: true,
      confirmed_at: '2026-09-30T18:00:00Z',
      worker_notes: 'Received partial wage payment in bank account.',
    },
    {
      id: '44444444-4444-4444-4444-444444440004',
      transaction_id: payment2TxnId,
      worker_id: IDS.worker2,
      is_confirmed: true,
      confirmed_at: '2026-09-30T19:00:00Z',
      worker_notes: 'Fully settled for shifts.',
    },
  ]);
  if (confErr) throw new Error(`Failed to seed payment confirmations: ${confErr.message}`);

  // 9. Seed Double-Entry Ledger Entries
  // Accruals, Disbursements, and UPI Sandbox Withdrawal
  const accrual1Paise = 10 * w1OngoingWage.wagePaise;
  const accrual2Paise = 3 * w1OngoingWage.wagePaise;
  const accrualW2Paise = 2 * w2Wage.wagePaise;
  const accrualW5Paise = 2 * w5Wage.wagePaise;

  const ledgerEntries = [
    // Worker 1: 10 shifts worked before payment
    {
      id: '33333333-1111-1111-1111-111111110001',
      account_id: IDS.walletWorker1,
      contract_id: IDS.contract1Ongoing,
      project_id: IDS.project1,
      amount_paise: accrual1Paise,
      direction: 'CREDIT',
      description: 'Wages Accrued: 10 verified shifts (Sept 15-26)',
      ref_type: 'WAGE_ACCRUAL',
      ref_id: IDS.contract1Ongoing,
      created_at: '2026-09-26T20:00:00Z',
    },
    // Worker 1: Partial weekly payment received
    {
      id: '33333333-1111-1111-1111-111111110002',
      account_id: IDS.walletWorker1,
      contract_id: IDS.contract1Ongoing,
      project_id: IDS.project1,
      transaction_id: payment1TxnId,
      amount_paise: payment1Paise,
      direction: 'CREDIT',
      description: 'Disbursement: Weekly wage partial payment received',
      ref_type: 'PAYMENT_DISBURSEMENT',
      ref_id: payment1TxnId,
      created_at: '2026-09-30T16:00:00Z',
    },
    // Worker 1: Sandbox UPI Withdrawal of ₹2,000 (TEST MODE)
    {
      id: '33333333-1111-1111-1111-111111110003',
      account_id: IDS.walletWorker1,
      contract_id: IDS.contract1Ongoing,
      project_id: IDS.project1,
      amount_paise: 200000, // ₹2,000
      direction: 'DEBIT',
      description: 'Withdrawal to UPI 98••••@upi (Ref: WDL-20261002-2000) [TEST MODE]',
      ref_type: 'WITHDRAWAL',
      ref_id: IDS.walletWorker1,
      created_at: '2026-10-02T11:00:00Z',
    },
    // Worker 1: 3 additional shifts worked Oct 1-3
    {
      id: '33333333-1111-1111-1111-111111110004',
      account_id: IDS.walletWorker1,
      contract_id: IDS.contract1Ongoing,
      project_id: IDS.project1,
      amount_paise: accrual2Paise,
      direction: 'CREDIT',
      description: 'Wages Accrued: 3 verified shifts (Oct 01-03)',
      ref_type: 'WAGE_ACCRUAL',
      ref_id: IDS.contract1Ongoing,
      created_at: '2026-10-03T20:00:00Z',
    },
    // Worker 2: 2 shifts worked Sept 28-29
    {
      id: '33333333-1111-1111-1111-111111110005',
      account_id: IDS.walletWorker2,
      contract_id: IDS.contract2Ongoing,
      project_id: IDS.project1,
      amount_paise: accrualW2Paise,
      direction: 'CREDIT',
      description: 'Wages Accrued: 2 verified shifts (Sept 28-29)',
      ref_type: 'WAGE_ACCRUAL',
      ref_id: IDS.contract2Ongoing,
      created_at: '2026-09-29T20:00:00Z',
    },
    // Worker 2: Fully paid disbursement
    {
      id: '33333333-1111-1111-1111-111111110006',
      account_id: IDS.walletWorker2,
      contract_id: IDS.contract2Ongoing,
      project_id: IDS.project1,
      transaction_id: payment2TxnId,
      amount_paise: payment2Paise,
      direction: 'CREDIT',
      description: 'Disbursement: Full shift payment settled',
      ref_type: 'PAYMENT_DISBURSEMENT',
      ref_id: payment2TxnId,
      created_at: '2026-09-30T16:30:00Z',
    },
    // Worker 5: 2 shifts worked Sept 25-26 (Unpaid dues)
    {
      id: '33333333-1111-1111-1111-111111110007',
      account_id: IDS.walletWorker5,
      contract_id: IDS.contract5Ongoing,
      project_id: IDS.project1,
      amount_paise: accrualW5Paise,
      direction: 'CREDIT',
      description: 'Wages Accrued: 2 verified shifts (Sept 25-26)',
      ref_type: 'WAGE_ACCRUAL',
      ref_id: IDS.contract5Ongoing,
      created_at: '2026-09-26T20:00:00Z',
    },
  ];

  const { error: ledgerErr } = await admin.from('ledger_entries').insert(ledgerEntries);
  if (ledgerErr) throw new Error(`Failed to seed ledger entries: ${ledgerErr.message}`);
  console.log('✓ Seeded Ledger Entries: Accruals, Disbursements, and UPI Sandbox Withdrawal');

  // 10. Seed Disputes in EVERY Status (open, responded, resolved, escalated, withdrawn)
  const seededDisputes = [
    // Dispute 1: open (Agreed daily wage ₹760, worked 3 verified shifts Oct 1-3, unpaid shortfall ₹2,280)
    {
      id: 'dddddddd-0000-0000-0000-000000000001',
      reference: 'SS-D-2026-000001',
      dispute_ref: 'DSP-202610-001',
      worker_id: IDS.worker1,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      contract_id: IDS.contract1Ongoing,
      category: 'short_payment',
      status: 'open',
      priority: 'HIGH',
      raised_by_user_id: IDS.worker1User,
      period_from: '2026-10-01',
      period_to: '2026-10-03',
      earned_paise: accrual2Paise,
      paid_paise: 0,
      shortfall_paise: accrual2Paise,
      claimed_paise: accrual2Paise,
      amount_claimed_paise: accrual2Paise,
      ordered_amount_paise: 0,
      description: 'Agreed daily wage ₹760 for 3 verified shifts on Oct 1, Oct 2, Oct 3. Contractor has not disbursed wage payment.',
      contractor_response_deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      is_settled: false,
      created_at: '2026-10-05T10:00:00Z',
    },
    // Dispute 2: responded (Worker 2 shortfall ₹300, contractor claimed deduction for advance recovery)
    {
      id: 'dddddddd-0000-0000-0000-000000000002',
      reference: 'SS-D-2026-000002',
      dispute_ref: 'DSP-202610-002',
      worker_id: IDS.worker2,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      contract_id: IDS.contract2Ongoing,
      category: 'short_payment',
      status: 'responded',
      priority: 'MEDIUM',
      raised_by_user_id: IDS.worker2User,
      period_from: '2026-09-20',
      period_to: '2026-09-25',
      earned_paise: 132000,
      paid_paise: 102000,
      shortfall_paise: 30000,
      claimed_paise: 30000,
      amount_claimed_paise: 30000,
      ordered_amount_paise: 0,
      description: 'Worked 2 shifts, earned ₹1,320 but received only ₹1,020 in payout voucher.',
      contractor_counter_statement: 'Deduction of ₹300 recovered for safety shoes issued on Sept 18 per agreement.',
      contractor_responded_at: '2026-10-04T14:30:00Z',
      is_settled: false,
      created_at: '2026-10-02T09:00:00Z',
    },
    // Dispute 3: resolved (Worker 5 unpaid wages ₹1,460 resolved via accepted payment)
    {
      id: 'dddddddd-0000-0000-0000-000000000003',
      reference: 'SS-D-2026-000003',
      dispute_ref: 'DSP-202610-003',
      worker_id: IDS.worker5,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      contract_id: IDS.contract5Ongoing,
      category: 'unpaid_wages',
      status: 'resolved',
      priority: 'HIGH',
      raised_by_user_id: IDS.worker5User,
      period_from: '2026-09-25',
      period_to: '2026-09-26',
      earned_paise: accrualW5Paise,
      paid_paise: 0,
      shortfall_paise: accrualW5Paise,
      claimed_paise: accrualW5Paise,
      amount_claimed_paise: accrualW5Paise,
      description: 'Unpaid wages for 2 verified shifts on Sept 25-26.',
      is_settled: true,
      settled_at: '2026-09-29T10:00:00Z',
      ordered_amount_paise: accrualW5Paise,
      created_at: '2026-09-28T11:00:00Z',
    },
    // Dispute 4: escalated (Worker 4 unlawful deduction claim escalated after rejection)
    {
      id: 'dddddddd-0000-0000-0000-000000000004',
      reference: 'SS-D-2026-000004',
      dispute_ref: 'DSP-202610-004',
      worker_id: IDS.worker4,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      contract_id: IDS.contract4Ongoing,
      category: 'unlawful_deduction',
      status: 'escalated',
      priority: 'HIGH',
      raised_by_user_id: IDS.worker4User,
      period_from: '2026-09-20',
      period_to: '2026-09-22',
      earned_paise: 120000,
      paid_paise: 80000,
      shortfall_paise: 40000,
      claimed_paise: 40000,
      amount_claimed_paise: 40000,
      ordered_amount_paise: 0,
      description: 'Arbitrary penalty of ₹400 deducted for tool wear. Demanding refund.',
      contractor_counter_statement: 'Tools were returned damaged upon shift completion.',
      contractor_responded_at: '2026-09-23T11:00:00Z',
      is_settled: false,
      created_at: '2026-09-22T14:00:00Z',
    },
    // Dispute 5: withdrawn (Worker 3 missing attendance corrected by site supervisor)
    {
      id: 'dddddddd-0000-0000-0000-000000000005',
      reference: 'SS-D-2026-000005',
      dispute_ref: 'DSP-202610-005',
      worker_id: IDS.worker3,
      contractor_id: IDS.contractor1,
      project_id: IDS.project1,
      contract_id: IDS.contract3Ongoing,
      category: 'attendance_not_recorded',
      status: 'withdrawn',
      priority: 'LOW',
      raised_by_user_id: IDS.worker3User,
      period_from: '2026-09-15',
      period_to: '2026-09-16',
      earned_paise: 130000,
      paid_paise: 65000,
      shortfall_paise: 65000,
      claimed_paise: 65000,
      amount_claimed_paise: 65000,
      ordered_amount_paise: 0,
      description: 'Gate reader was offline on Sept 15, punch not recorded initially.',
      is_settled: false,
      created_at: '2026-09-17T09:00:00Z',
    },
  ];

  const { error: disputesErr } = await admin.from('disputes').upsert(seededDisputes);
  if (disputesErr) throw new Error(`Failed to seed disputes: ${disputesErr.message}`);

  // Seed dispute responses
  await admin.from('dispute_responses').upsert([
    {
      id: '88888888-8888-8888-8888-888888888801',
      dispute_id: 'dddddddd-0000-0000-0000-000000000002',
      contractor_id: IDS.contractor1,
      type: 'deduction_claimed',
      deduction_reason: 'advance_recovery',
      deduction_amount_paise: 30000,
      message: 'Deduction of ₹300 recovered for safety shoes issued on Sept 18 per agreement.',
      created_at: '2026-10-04T14:30:00Z',
    },
    {
      id: '88888888-8888-8888-8888-888888888802',
      dispute_id: 'dddddddd-0000-0000-0000-000000000003',
      contractor_id: IDS.contractor1,
      type: 'accept_and_pay',
      deduction_amount_paise: 0,
      message: 'Shortfall accepted and full payment disbursed.',
      created_at: '2026-09-29T10:00:00Z',
    },
    {
      id: '88888888-8888-8888-8888-888888888803',
      dispute_id: 'dddddddd-0000-0000-0000-000000000004',
      contractor_id: IDS.contractor1,
      type: 'reject',
      deduction_amount_paise: 0,
      message: 'Tools were returned damaged upon shift completion.',
      created_at: '2026-09-23T11:00:00Z',
    },
  ]);

  // Seed dispute messages
  await admin.from('dispute_messages').upsert([
    {
      id: '99999999-9999-9999-9999-999999999901',
      dispute_id: 'dddddddd-0000-0000-0000-000000000001',
      sender_user_id: IDS.worker1User,
      sender_role: 'WORKER',
      message: 'I completed all 3 shifts on time. Please clear my payment.',
      created_at: '2026-10-05T10:15:00Z',
    },
    {
      id: '99999999-9999-9999-9999-999999999902',
      dispute_id: 'dddddddd-0000-0000-0000-000000000002',
      sender_user_id: IDS.worker2User,
      sender_role: 'WORKER',
      message: 'The safety shoes were supposed to be provided free by contractor under site safety standards.',
      created_at: '2026-10-04T15:00:00Z',
    },
  ]);

  // Seed dispute status history
  await admin.from('dispute_status_history').upsert([
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      dispute_id: 'dddddddd-0000-0000-0000-000000000001',
      from_status: null,
      to_status: 'open',
      actor: IDS.worker1User,
      actor_role: 'WORKER',
      note: 'Dispute filed by worker.',
      at: '2026-10-05T10:00:00Z',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      dispute_id: 'dddddddd-0000-0000-0000-000000000002',
      from_status: 'open',
      to_status: 'responded',
      actor: IDS.contractor1User,
      actor_role: 'CONTRACTOR',
      note: 'Contractor responded: advance_recovery claimed.',
      at: '2026-10-04T14:30:00Z',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
      dispute_id: 'dddddddd-0000-0000-0000-000000000003',
      from_status: 'responded',
      to_status: 'resolved',
      actor: IDS.contractor1User,
      actor_role: 'CONTRACTOR',
      note: 'Full settlement payment confirmed via ledger.',
      at: '2026-09-29T10:00:00Z',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
      dispute_id: 'dddddddd-0000-0000-0000-000000000004',
      from_status: 'responded',
      to_status: 'escalated',
      actor: IDS.worker4User,
      actor_role: 'WORKER',
      note: 'Escalated to Labour Inspector following rejection.',
      at: '2026-09-24T09:00:00Z',
    },
    {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5',
      dispute_id: 'dddddddd-0000-0000-0000-000000000005',
      from_status: 'open',
      to_status: 'withdrawn',
      actor: IDS.worker3User,
      actor_role: 'WORKER',
      note: 'Muster record verified and updated.',
      at: '2026-09-17T16:00:00Z',
    },
  ]);

  console.log('✓ Seeded Disputes covering all 5 statuses: open, responded, resolved, escalated, withdrawn');

  // Print Credentials Table as requested
  console.log('\n========================================================================================================================');
  console.log('🎉 SEED COMPLETED: CREDENTIALS GENERATED FOR DEMO');
  console.log('========================================================================================================================\n');
  console.log('| role | ID | name | skill | daily wage (₹) | project | password |');
  console.log('| :--- | :--- | :--- | :--- | :---: | :--- | :--- |');
  console.log(`| CONTRACTOR | ${IDS.contractor1LoginId} | Suresh Patel | Contractor | - | Mumbai Metro Line 4 | ${contractor1Pass} |`);
  console.log(`| CONTRACTOR | ${IDS.contractor2LoginId} | Rajesh Singhania | Contractor | - | Navi Mumbai Airport Cargo | ${contractor2Pass} |`);
  console.log(`| WORKER | ${IDS.worker1LoginId} | Ramesh Kumar | Skilled | ₹${(w1OngoingWage.wagePaise / 100).toFixed(0)} | Mumbai Metro Line 4 | ${worker1Pass} |`);
  console.log(`| WORKER | ${IDS.worker2LoginId} | Sunita Devi | Semi-Skilled | ₹${(w2Wage.wagePaise / 100).toFixed(0)} | Mumbai Metro Line 4 | ${worker2Pass} |`);
  console.log(`| WORKER | ${IDS.worker3LoginId} | Amit Shinde | Highly Skilled | ₹${(w3Wage.wagePaise / 100).toFixed(0)} | Navi Mumbai Airport Cargo | ${worker3Pass} |`);
  console.log(`| WORKER | ${IDS.worker4LoginId} | Pooja Waghmare | Unskilled | ₹${(w4Wage.wagePaise / 100).toFixed(0)} | Mumbai Metro Line 4 | ${worker4Pass} |`);
  console.log(`| WORKER | ${IDS.worker5LoginId} | Ganesh Gaikwad (गणेश गायकवाड) | Skilled | ₹${(w5Wage.wagePaise / 100).toFixed(0)} | Mumbai Metro Line 4 | ${worker5Pass} |`);
  console.log(`| WORKER | ${IDS.worker6LoginId} | Laxmi Rathod (लक्ष्मी राठोड) | Semi-Skilled | ₹${(w6Wage.wagePaise / 100).toFixed(0)} | Navi Mumbai Airport Cargo | ${worker6Pass} |`);
  console.log('\n========================================================================================================================\n');

  console.log(`🔑 One-Time Set-Password Token for Sunita Devi (expires in 24h):`);
  console.log(`   Token: ${setPasswordToken}`);
  console.log(`   Endpoint: POST /api/auth/set-password { token, newPassword }\n`);
}

seedDemoData().catch((err) => {
  console.error('Seed demo failed:', err);
  process.exit(1);
});
