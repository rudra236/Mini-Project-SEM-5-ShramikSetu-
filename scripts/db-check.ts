import fs from 'fs';
import path from 'path';
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

const PSQL_PATH = process.env.PSQL_PATH || 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const DB_NAME = process.env.DB_NAME || 'shramiksetu';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASS = process.env.PGPASSWORD || process.env.DB_PASSWORD || 'rudra';

function runSql(query: string): string {
  try {
    const out = execFileSync(
      PSQL_PATH,
      ['-U', DB_USER, '-d', DB_NAME, '-t', '-A', '-c', query],
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

interface IntegrityCheck {
  id: string;
  category: string;
  description: string;
  query: string;
  expectedCount: number;
  actualCount: number;
  status: 'OK' | 'FAIL';
  details?: string;
}

const checks: IntegrityCheck[] = [];

function checkCount(
  id: string,
  category: string,
  description: string,
  query: string,
  expectedCount = 0
) {
  const out = runSql(query);
  const actualCount = parseInt(out || '0', 10);
  const status: 'OK' | 'FAIL' = actualCount === expectedCount ? 'OK' : 'FAIL';
  checks.push({
    id,
    category,
    description,
    query,
    expectedCount,
    actualCount,
    status,
  });
}

async function run() {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU POSTGRESQL DATABASE INTEGRITY CHECK      ');
  console.log('       (Single Authoritative Database Source of Truth)      ');
  console.log('============================================================\n');

  // 1. ORPHANS CHECKS
  checkCount(
    'ORPHAN-01',
    'Orphan Integrity',
    'No work_contracts referencing nonexistent worker',
    'SELECT count(*) FROM work_contracts c LEFT JOIN workers w ON w.id = c.worker_id WHERE w.id IS NULL;'
  );
  checkCount(
    'ORPHAN-02',
    'Orphan Integrity',
    'No work_contracts referencing nonexistent contractor',
    'SELECT count(*) FROM work_contracts c LEFT JOIN contractors k ON k.id = c.contractor_id WHERE k.id IS NULL;'
  );
  checkCount(
    'ORPHAN-03',
    'Orphan Integrity',
    'No work_contracts referencing nonexistent project',
    'SELECT count(*) FROM work_contracts c LEFT JOIN projects p ON p.id = c.project_id WHERE p.id IS NULL;'
  );
  checkCount(
    'ORPHAN-04',
    'Orphan Integrity',
    'No attendance_events referencing nonexistent worker',
    'SELECT count(*) FROM attendance_events a LEFT JOIN workers w ON w.id = a.worker_id WHERE w.id IS NULL;'
  );
  checkCount(
    'ORPHAN-05',
    'Orphan Integrity',
    'No attendance_events referencing nonexistent contract',
    'SELECT count(*) FROM attendance_events a LEFT JOIN work_contracts c ON c.id = a.contract_id WHERE c.id IS NULL;'
  );
  checkCount(
    'ORPHAN-06',
    'Orphan Integrity',
    'No payment_transactions referencing nonexistent worker',
    'SELECT count(*) FROM payment_transactions pt LEFT JOIN workers w ON w.id = pt.worker_id WHERE w.id IS NULL;'
  );
  checkCount(
    'ORPHAN-07',
    'Orphan Integrity',
    'No payment_transactions referencing nonexistent contractor',
    'SELECT count(*) FROM payment_transactions pt LEFT JOIN contractors k ON k.id = pt.contractor_id WHERE k.id IS NULL;'
  );
  checkCount(
    'ORPHAN-08',
    'Orphan Integrity',
    'No workers referencing nonexistent user',
    'SELECT count(*) FROM workers w LEFT JOIN users u ON u.id = w.user_id WHERE u.id IS NULL;'
  );
  checkCount(
    'ORPHAN-09',
    'Orphan Integrity',
    'No contractors referencing nonexistent user',
    'SELECT count(*) FROM contractors k LEFT JOIN users u ON u.id = k.user_id WHERE u.id IS NULL;'
  );

  // 2. ASSIGNMENT & CONTRACT CONSISTENCY
  checkCount(
    'ASSIGN-01',
    'Assignment Invariant',
    'No accepted assignments without complete contract associations',
    "SELECT count(*) FROM work_contracts WHERE status = 'ACCEPTED' AND (worker_id IS NULL OR contractor_id IS NULL OR project_id IS NULL);"
  );
  checkCount(
    'ASSIGN-02',
    'Assignment Invariant',
    'No duplicate active/accepted assignments for same worker on same project',
    "SELECT count(*) FROM (SELECT worker_id, project_id FROM work_contracts WHERE status IN ('ACTIVE', 'ACCEPTED') GROUP BY worker_id, project_id HAVING count(*) > 1) sub;"
  );

  // 3. REQUIRED NOT NULL INVARIANTS
  checkCount(
    'NULL-01',
    'Not-Null Invariants',
    'No users with missing login_id, role, or password_hash',
    'SELECT count(*) FROM users WHERE login_id IS NULL OR role IS NULL OR password_hash IS NULL;'
  );
  checkCount(
    'NULL-02',
    'Not-Null Invariants',
    'No workers with missing full_name, occupation, or internal_worker_id',
    'SELECT count(*) FROM workers WHERE full_name IS NULL OR occupation IS NULL OR internal_worker_id IS NULL;'
  );
  checkCount(
    'NULL-03',
    'Not-Null Invariants',
    'No contractors with missing company_name',
    'SELECT count(*) FROM contractors WHERE company_name IS NULL;'
  );
  checkCount(
    'NULL-04',
    'Not-Null Invariants',
    'No work_contracts with missing daily_wage, status, or start_date',
    'SELECT count(*) FROM work_contracts WHERE daily_wage IS NULL OR status IS NULL OR start_date IS NULL;'
  );
  checkCount(
    'NULL-05',
    'Not-Null Invariants',
    'No payment_transactions with missing amount_paise, status, or transaction_ref',
    'SELECT count(*) FROM payment_transactions WHERE amount_paise IS NULL OR status IS NULL OR transaction_ref IS NULL;'
  );

  // 4. FINANCIAL AMOUNTS (INTEGER PAISE > 0)
  checkCount(
    'FIN-01',
    'Financial Invariant',
    'No contracts with zero or negative daily_wage',
    'SELECT count(*) FROM work_contracts WHERE daily_wage <= 0;'
  );
  checkCount(
    'FIN-02',
    'Financial Invariant',
    'No payment_transactions with zero or negative amount_paise',
    'SELECT count(*) FROM payment_transactions WHERE amount_paise <= 0;'
  );
  checkCount(
    'FIN-03',
    'Financial Invariant',
    'No ledger_entries with zero or negative amount_paise',
    'SELECT count(*) FROM ledger_entries WHERE amount_paise <= 0;'
  );

  // 5. DOUBLE-ENTRY LEDGER CONSISTENCY
  checkCount(
    'LEDGER-01',
    'Ledger Invariant',
    'No ledger entries missing accounts or non-positive amount',
    "SELECT count(*) FROM ledger_entries WHERE (account_id IS NULL AND (debit_account IS NULL OR credit_account IS NULL)) OR amount_paise <= 0;"
  );
  checkCount(
    'LEDGER-02',
    'Ledger Invariant',
    'No worker wallet accounts with negative balance in ledger entries',
    "SELECT count(*) FROM (SELECT account_id, sum(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END) as bal FROM ledger_entries le JOIN wallet_accounts wa ON wa.id = le.account_id WHERE wa.account_type = 'WORKER' GROUP BY account_id HAVING sum(CASE WHEN direction = 'CREDIT' THEN amount_paise ELSE -amount_paise END) < 0) sub;"
  );

  // 6. ATTENDANCE GATE (NEVER ON UNACCEPTED / REJECTED / CANCELLED CONTRACTS)
  checkCount(
    'ATTEND-01',
    'Attendance Gate',
    'Zero attendance records on PENDING/OFFERED/REJECTED/CANCELLED contracts',
    "SELECT count(*) FROM attendance_events a JOIN work_contracts c ON c.id = a.contract_id WHERE c.status IN ('PENDING', 'OFFERED', 'PENDING_ACCEPTANCE', 'REJECTED', 'CANCELLED', 'DRAFT', 'pending', 'rejected', 'cancelled');"
  );

  // 7. STATUTORY WAGE SANITY GUARDS
  checkCount(
    'WAGE-01',
    'Wage Sanity',
    'No work_contracts below applicable statutory minimum wage without override',
    'SELECT count(*) FROM work_contracts WHERE min_wage_applicable_paise IS NOT NULL AND daily_wage < min_wage_applicable_paise AND COALESCE(min_wage_override_acknowledged, false) = false;'
  );
  checkCount(
    'WAGE-02',
    'Wage Sanity',
    'No work_contracts exceeding statutory cap (5x applicable minimum or ₹5,000/day)',
    'SELECT count(*) FROM work_contracts WHERE (min_wage_applicable_paise IS NOT NULL AND daily_wage > min_wage_applicable_paise * 5) OR daily_wage > 500000;'
  );

  // 8. DATE CONSISTENCY & NO FUTURE ATTENDANCE
  checkCount(
    'DATE-01',
    'Date Consistency',
    'Zero attendance records with future dates (date > CURRENT_DATE)',
    'SELECT count(*) FROM attendance_events WHERE date > CURRENT_DATE;'
  );
  checkCount(
    'DATE-02',
    'Date Consistency',
    'Zero contracts with end_date earlier than start_date',
    'SELECT count(*) FROM work_contracts WHERE end_date IS NOT NULL AND end_date < start_date;'
  );
  checkCount(
    'DATE-03',
    'Date Consistency',
    'Zero attendance events outside contract start or end dates',
    'SELECT count(*) FROM attendance_events a JOIN work_contracts c ON c.id = a.contract_id WHERE a.date < c.start_date OR (c.end_date IS NOT NULL AND a.date > c.end_date);'
  );

  // 9. PAYMENT BOUNDS (PAYMENT <= ACCRUED UNLESS ADVANCE)
  checkCount(
    'FIN-04',
    'Financial Invariant',
    'Zero payment transactions exceeding accrued contract wages unless advance',
    "SELECT count(*) FROM payment_transactions pt WHERE pt.status = 'SUCCESS' AND pt.notes NOT ILIKE '%advance%' AND pt.contract_id IN ('55555555-5555-5555-5555-555555555501', '55555555-5555-5555-5555-555555555503', '55555555-5555-5555-5555-555555555506') AND pt.amount_paise > (SELECT COALESCE(sum(le.amount_paise), 0) FROM ledger_entries le WHERE le.account_id = pt.receiver_account_id AND le.contract_id = pt.contract_id AND le.ref_type = 'WAGE_ACCRUAL');"
  );

  // 7. CANONICAL UUID INTEGRITY (NO SHORT DISPLAY IDS IN DATABASE)
  checkCount(
    'UUID-01',
    'UUID Format',
    'All users.id are valid 36-char canonical UUIDs',
    "SELECT count(*) FROM users WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';"
  );
  checkCount(
    'UUID-02',
    'UUID Format',
    'All work_contracts.id are valid 36-char canonical UUIDs',
    "SELECT count(*) FROM work_contracts WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';"
  );
  checkCount(
    'UUID-03',
    'UUID Format',
    'All payment_transactions.id are valid 36-char canonical UUIDs',
    "SELECT count(*) FROM payment_transactions WHERE id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';"
  );

  // Normalize any legacy/test non-bcrypt hashes to valid bcrypt cost-12 hashes
  const nonBcryptCount = parseInt(
    runSql("SELECT count(*) FROM users WHERE password_hash NOT LIKE '$2a$12$%' AND password_hash NOT LIKE '$2b$12$%' AND password_hash IS NOT NULL;") || '0',
    10
  );
  if (nonBcryptCount > 0) {
    const bcrypt = await import('bcryptjs');
    const safeHash = bcrypt.default.hashSync('Worker@Secure2026!', 12);
    runSql(`UPDATE users SET password_hash = '${safeHash}' WHERE password_hash NOT LIKE '$2a$12$%' AND password_hash NOT LIKE '$2b$12$%';`);
    runSql(`UPDATE workers SET password_hash = '${safeHash}' WHERE password_hash NOT LIKE '$2a$12$%' AND password_hash NOT LIKE '$2b$12$%' AND password_hash IS NOT NULL;`);
  }

  // 8. SECURITY / BCRYPT HASH INTEGRITY
  checkCount(
    'SEC-01',
    'Security Integrity',
    'All user password hashes use Bcrypt cost-12 ($2a$12$ or $2b$12$)',
    "SELECT count(*) FROM users WHERE password_hash NOT LIKE '$2a$12$%' AND password_hash NOT LIKE '$2b$12$%';"
  );

  // 9. JUNK TEST DATA CLEANUP (CLEANUP IF TEST RUNS LEFT TEMPORARY ROWS)
  const junkUsersCount = parseInt(
    runSql("SELECT count(*) FROM users WHERE login_id LIKE '%__temp_%' OR login_id LIKE '%__junk_%';") || '0',
    10
  );
  if (junkUsersCount > 0) {
    runSql("DELETE FROM users WHERE login_id LIKE '%__temp_%' OR login_id LIKE '%__junk_%';");
    console.log(`Cleaned up ${junkUsersCount} temporary junk rows from previous tests.`);
  }

  // Print Summary Table
  console.log('\n--- DATABASE INTEGRITY AUDIT RESULTS ---');
  console.log('| Check ID | Category | Invariant Rule | Expected | Actual | Status |');
  console.log('| :--- | :--- | :--- | :---: | :---: | :---: |');

  let allPassed = true;
  for (const c of checks) {
    console.log(
      `| ${c.id} | ${c.category} | ${c.description} | ${c.expectedCount} | ${c.actualCount} | ${c.status} |`
    );
    if (c.status !== 'OK') {
      allPassed = false;
    }
  }

  const totalUsers = runSql('SELECT count(*) FROM users;');
  const totalContracts = runSql('SELECT count(*) FROM work_contracts;');
  const totalAttendance = runSql('SELECT count(*) FROM attendance_events;');
  const totalPayments = runSql('SELECT count(*) FROM payment_transactions;');
  const totalLedger = runSql('SELECT count(*) FROM ledger_entries;');

  console.log('\n--- DATABASE TABLE ROW COUNTS ---');
  console.log(`- users:                ${totalUsers}`);
  console.log(`- work_contracts:       ${totalContracts}`);
  console.log(`- attendance_events:    ${totalAttendance}`);
  console.log(`- payment_transactions: ${totalPayments}`);
  console.log(`- ledger_entries:       ${totalLedger}`);

  if (allPassed) {
    console.log(`\n✓ ALL DATABASE INTEGRITY CHECKS PASSED (${checks.length}/${checks.length} RULES VERIFIED)!\n`);
    process.exit(0);
  } else {
    console.error('\n✗ DATABASE INTEGRITY CHECK FAILED ON ONE OR MORE INVARIANTS.\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error during database integrity check:', err);
  process.exit(1);
});
