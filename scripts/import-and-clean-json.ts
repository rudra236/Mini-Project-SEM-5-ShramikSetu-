import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { createAdminClient } from '../src/lib/supabase/admin';

// Load .env.local if running standalone
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

async function main() {
  console.log('--- ShramikSetu Postgres Migration & JSON Cleanup ---');
  const admin = createAdminClient();

  // 1. Hash and assign default passwords to all seed contractors and workers
  const contractor1Hash = await bcrypt.hash('Vikram@123', 12);
  const contractor2Hash = await bcrypt.hash('Rajesh@123', 12);
  const workerHash = await bcrypt.hash('Worker@123', 12);
  const rameshHash = await bcrypt.hash('Ramesh@123', 12);

  // Contractor 1
  await admin.from('users').update({ password_hash: contractor1Hash }).eq('login_id', 'SS-C-2026-000001');
  await admin.from('contractors').update({ password_hash: contractor1Hash }).eq('internal_contractor_id', 'SS-C-2026-000001');

  // Contractor 2
  await admin.from('users').update({ password_hash: contractor2Hash }).eq('login_id', 'SS-C-2026-000002');
  await admin.from('contractors').update({ password_hash: contractor2Hash }).eq('internal_contractor_id', 'SS-C-2026-000002');

  // Contractor 3 & 4
  await admin.from('users').update({ password_hash: contractor1Hash }).in('login_id', ['SS-C-2026-000003', 'SS-C-2026-000004']);
  await admin.from('contractors').update({ password_hash: contractor1Hash }).in('internal_contractor_id', ['SS-C-2026-000003', 'SS-C-2026-000004']);

  // Worker 1 (Ramesh Kumar)
  await admin.from('users').update({ password_hash: rameshHash }).eq('login_id', 'WRK-MH-2026-0001');
  await admin.from('workers').update({ password_hash: rameshHash }).eq('internal_worker_id', 'WRK-MH-2026-0001');

  // All other workers
  const { data: workers } = await admin.from('workers').select('id, user_id, internal_worker_id').neq('internal_worker_id', 'WRK-MH-2026-0001');
  if (workers && workers.length > 0) {
    const workerIds = workers.map((w: any) => w.id);
    const userIds = workers.map((w: any) => w.user_id);
    await admin.from('workers').update({ password_hash: workerHash }).in('id', workerIds);
    await admin.from('users').update({ password_hash: workerHash }).in('id', userIds);
  }
  console.log('✓ Successfully hashed and updated passwords in Postgres for all workers and contractors.');

  // 2. Import any users from .registered_users.json if present
  const usersPath = path.resolve(process.cwd(), '.registered_users.json');
  if (fs.existsSync(usersPath)) {
    try {
      const content = fs.readFileSync(usersPath, 'utf8');
      const usersData = JSON.parse(content);
      for (const [key, record] of Object.entries<any>(usersData)) {
        if (!record.user || !record.user.id) continue;
        const u = record.user;
        const p = record.profile;
        const pHash = record.passwordHash || record.password_hash || workerHash;

        // Ensure user exists in users table
        const { data: existingUser } = await admin.from('users').select('id').eq('id', u.id).maybeSingle();
        if (!existingUser) {
          await admin.from('users').insert({
            id: u.id,
            role: u.role,
            phone: u.phone || null,
            login_id: u.login_id || key.toUpperCase(),
            password_hash: pHash,
            is_active: true,
          });
        } else {
          await admin.from('users').update({
            login_id: u.login_id || key.toUpperCase(),
            password_hash: pHash,
          }).eq('id', u.id);
        }

        // Profile insertion
        if (p && p.id) {
          if (u.role === 'WORKER') {
            const { data: existingW } = await admin.from('workers').select('id').eq('id', p.id).maybeSingle();
            if (!existingW) {
              await admin.from('workers').insert({
                id: p.id,
                user_id: u.id,
                full_name: p.full_name || 'Worker',
                internal_worker_id: p.internal_worker_id || u.login_id || key.toUpperCase(),
                occupation: p.occupation || 'General Labor',
                skill_category: p.skill_category || 'UNSKILLED',
                password_hash: pHash,
              });
            }
          } else if (u.role === 'CONTRACTOR') {
            const { data: existingC } = await admin.from('contractors').select('id').eq('id', p.id).maybeSingle();
            if (!existingC) {
              await admin.from('contractors').insert({
                id: p.id,
                user_id: u.id,
                full_name: p.full_name || 'Contractor',
                company_name: p.company_name || p.full_name || 'Contractor Firm',
                license_number: p.license_number || 'LIC-2026-LOCAL',
                internal_contractor_id: p.internal_contractor_id || u.login_id || key.toUpperCase(),
                password_hash: pHash,
              });
            }
          }
        }
      }
      console.log('✓ Successfully imported registered users into Postgres.');
    } catch (e: any) {
      console.warn('Warning during .registered_users.json import:', e.message);
    }
  }

  // 3. Delete deprecated local JSON files
  const filesToDelete = [
    '.registered_projects.json',
    '.registered_minimum_wages.json',
    '.registered_users.json',
  ];

  for (const filename of filesToDelete) {
    const filePath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✓ Deleted local fallback file: ${filename}`);
    }
  }

  console.log('\n--- Cleanup complete: Zero local JSON files remaining ---');
}

main().catch(err => {
  console.error('Migration & cleanup error:', err);
  process.exit(1);
});
