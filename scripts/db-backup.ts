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

const PG_DUMP_PATH = process.env.PG_DUMP_PATH || 'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe';
const DB_NAME = process.env.DB_NAME || 'shramiksetu';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = process.env.DB_PORT || '5432';
const DB_PASS = process.env.PGPASSWORD || process.env.DB_PASSWORD || 'rudra';

async function runBackup() {
  console.log('\n============================================================');
  console.log('       SHRAMIKSETU POSTGRESQL DATABASE BACKUP SCRIPT        ');
  console.log('       (pg_dump Snapshot of Single Source of Truth)         ');
  console.log('============================================================\n');

  const backupsDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const backupFileName = `shramiksetu_backup_${timestamp}.sql`;
  const backupFilePath = path.join(backupsDir, backupFileName);

  console.log(`Connecting to: ${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME}`);
  console.log(`Destination:   ${backupFilePath}\n`);

  const startTime = Date.now();

  try {
    execFileSync(
      PG_DUMP_PATH,
      [
        '-h', DB_HOST,
        '-p', DB_PORT,
        '-U', DB_USER,
        '-d', DB_NAME,
        '--format=plain',
        '--no-owner',
        '--no-privileges',
        '-f', backupFilePath,
      ],
      {
        env: { ...process.env, PGPASSWORD: DB_PASS },
        stdio: 'inherit',
      }
    );

    const elapsedMs = Date.now() - startTime;

    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Backup file was not created: ${backupFilePath}`);
    }

    const stats = fs.statSync(backupFilePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('\n============================================================');
    console.log('✓ DATABASE BACKUP COMPLETED SUCCESSFULLY');
    console.log('============================================================');
    console.log(`- File Name:      ${backupFileName}`);
    console.log(`- File Path:      ${backupFilePath}`);
    console.log(`- File Size:      ${sizeKB} KB (${sizeMB} MB)`);
    console.log(`- Elapsed Time:   ${elapsedMs} ms`);
    console.log(`- Database:       ${DB_NAME}`);
    console.log(`- Source of Truth: PostgreSQL 17\n`);

    process.exit(0);
  } catch (err: any) {
    console.error('\n✗ DATABASE BACKUP FAILED:', err.message);
    process.exit(1);
  }
}

runBackup();
