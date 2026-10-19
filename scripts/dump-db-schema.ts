import { execFileSync } from 'child_process';
import fs from 'fs';

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
    return `ERROR: ${err.message}`;
  }
}

async function main() {
  const tables = runSql(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' 
    ORDER BY table_name;
  `).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);

  const fullSchema: any = {};

  for (const t of tables) {
    const cols = runSql(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = '${t}' 
      ORDER BY ordinal_position;
    `).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [column_name, data_type, is_nullable, column_default] = line.split('|');
      return { column_name, data_type, is_nullable, column_default: column_default || null };
    });

    const pks = runSql(`
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = '${t}';
    `).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);

    const fks = runSql(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = '${t}';
    `).replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [col, fTable, fCol] = line.split('|');
      return { column: col, foreign_table: fTable, foreign_column: fCol };
    });

    const countRaw = runSql(`SELECT count(*) FROM "${t}";`);
    const rowCount = parseInt(countRaw.replace(/\r/g, '').trim(), 10) || 0;

    fullSchema[t] = {
      columns: cols,
      primaryKey: pks,
      foreignKeys: fks,
      rowCount,
    };
  }

  fs.writeFileSync('scratch/full_db_schema.json', JSON.stringify(fullSchema, null, 2), 'utf8');
  console.log('Saved scratch/full_db_schema.json with', Object.keys(fullSchema).length, 'tables');

  // Also dump sample calculations and real rows
  const samples = {
    minimum_wages: runSql(`SELECT id, state, skill_category, zone, daily_rate_paise, effective_from, source_name, source_url, verified FROM minimum_wages;`),
    minimum_wage_rules: runSql(`SELECT * FROM minimum_wage_rules;`),
    work_contracts: runSql(`SELECT id, contract_ref, worker_id, contractor_id, project_id, daily_wage, status, work_type, start_date, end_date FROM work_contracts ORDER BY created_at DESC LIMIT 5;`),
    attendance_events: runSql(`SELECT id, worker_id, contract_id, project_id, attendance_date, status, punch_in_time, punch_out_time, wage_amount, verified_at FROM attendance_events ORDER BY created_at DESC LIMIT 5;`),
    ledger_entries: runSql(`SELECT id, entry_ref, worker_id, contractor_id, contract_id, entry_type, amount_paise, status, previous_entry_hash, entry_hash FROM ledger_entries ORDER BY created_at DESC LIMIT 10;`),
    wallet_accounts: runSql(`SELECT id, worker_id, balance_paise, escrow_hold_paise, currency, status FROM wallet_accounts;`),
    payment_transactions: runSql(`SELECT id, tx_ref, contract_id, worker_id, contractor_id, amount_paise, status, payment_type FROM payment_transactions LIMIT 5;`),
    disputes: runSql(`SELECT id, dispute_ref, contract_id, worker_id, contractor_id, disputed_amount, status, reason, claimed_amount_paise, shortfall_paise, earned_amount_paise, paid_amount_paise, attendance_days_count FROM disputes LIMIT 5;`),
    complaint_reports: runSql(`SELECT id, report_ref, dispute_id, version, language, recipient_type, recipient_name, content_hash, sha256, file_path, ledger_hash FROM complaint_reports LIMIT 5;`),
    users: runSql(`SELECT id, login_id, role, phone, full_name, is_active FROM users ORDER BY created_at DESC LIMIT 10;`),
    workers: runSql(`SELECT id, user_id, internal_worker_id, full_name, occupation, skill_category, is_verified FROM workers LIMIT 10;`),
    contractors: runSql(`SELECT id, user_id, contractor_ref, company_name, gst_number FROM contractors LIMIT 5;`),
    projects: runSql(`SELECT id, project_ref, contractor_id, name, state, status FROM projects LIMIT 5;`),
  };

  fs.writeFileSync('scratch/real_data_samples.json', JSON.stringify(samples, null, 2), 'utf8');
  console.log('Saved scratch/real_data_samples.json successfully');
}

main().catch(console.error);
