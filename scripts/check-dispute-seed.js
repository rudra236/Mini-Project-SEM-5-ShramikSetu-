const { execFileSync } = require('child_process');
const out = execFileSync('C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe', [
  '-U', 'postgres', '-d', 'shramiksetu', '-t', '-A', '-F', '|', '-c',
  "SELECT id, reference, dispute_ref, status, worker_id, contractor_id, contract_id, claimed_paise, earned_paise, paid_paise, shortfall_paise FROM disputes LIMIT 5;"
], { env: { ...process.env, PGPASSWORD: 'rudra' }, encoding: 'utf8' });
console.log(out);
