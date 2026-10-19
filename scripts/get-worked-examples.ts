import { runSql } from './query-db';
import fs from 'fs';

async function main() {
  const result: any = {};

  result.contracts = runSql(`
    SELECT id, worker_id, contractor_id, project_id, daily_wage, status, work_type, start_date, end_date
    FROM work_contracts 
    LIMIT 3;
  `);

  result.attendance = runSql(`
    SELECT id, worker_id, contract_id, project_id, status, created_at, verified_at
    FROM attendance_events 
    LIMIT 3;
  `);

  result.ledger = runSql(`
    SELECT id, entry_type, amount_paise, from_account_id, to_account_id, status, created_at, entry_hash
    FROM ledger_entries 
    LIMIT 5;
  `);

  result.disputes = runSql(`
    SELECT id, dispute_ref, claimed_amount_paise, shortfall_paise, earned_amount_paise, paid_amount_paise, attendance_days_count, status, created_at
    FROM disputes 
    LIMIT 3;
  `);

  result.wallet = runSql(`
    SELECT id, owner_id, balance_paise, escrow_hold_paise, currency, is_active
    FROM wallet_accounts 
    LIMIT 3;
  `);

  result.minimum_wages = runSql(`
    SELECT id, state, skill_category, zone, daily_rate_paise, effective_from, source_name, source_url, verified
    FROM minimum_wages
    ORDER BY state, skill_category, zone;
  `);

  result.minimum_wage_rules = runSql(`
    SELECT * FROM minimum_wage_rules LIMIT 5;
  `);

  result.contract_acceptances = runSql(`
    SELECT * FROM contract_acceptances LIMIT 3;
  `);

  result.attendance_tokens = runSql(`
    SELECT id, project_id, token_hash, expires_at, created_at FROM attendance_tokens LIMIT 3;
  `);

  result.counts = {
    workers: runSql(`SELECT count(*) FROM workers;`),
    contractors: runSql(`SELECT count(*) FROM contractors;`),
    projects: runSql(`SELECT count(*) FROM projects;`),
    contracts: runSql(`SELECT count(*) FROM work_contracts;`),
    attendance: runSql(`SELECT count(*) FROM attendance_events;`),
    ledger: runSql(`SELECT count(*) FROM ledger_entries;`),
    disputes: runSql(`SELECT count(*) FROM disputes;`),
    complaint_reports: runSql(`SELECT count(*) FROM complaint_reports;`),
    minimum_wages: runSql(`SELECT count(*) FROM minimum_wages;`),
  };

  fs.writeFileSync('scratch/worked_examples.json', JSON.stringify(result, null, 2), 'utf8');
  console.log('Saved scratch/worked_examples.json');
}

main().catch(console.error);
