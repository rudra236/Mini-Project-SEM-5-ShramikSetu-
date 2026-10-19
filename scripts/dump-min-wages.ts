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
  const rows = runSql(`
    SELECT id, state, skill_category, zone, daily_rate_paise, effective_from, source_name, source_url, verified
    FROM minimum_wages
    ORDER BY state, skill_category, zone, effective_from DESC;
  `).replace(/\r/g, '').split('\n').filter(Boolean).map(line => {
    const [id, state, skill_category, zone, daily_rate_paise, effective_from, source_name, source_url, verified] = line.split('|');
    return { id, state, skill_category, zone, daily_rate_paise: parseInt(daily_rate_paise, 10), effective_from, source_name, source_url, verified: verified === 't' };
  });

  fs.writeFileSync('scratch/min_wages_all.json', JSON.stringify(rows, null, 2), 'utf8');
  console.log('Saved scratch/min_wages_all.json with', rows.length, 'rows');
}

main().catch(console.error);
