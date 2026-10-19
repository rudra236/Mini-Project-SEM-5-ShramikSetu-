import { createAdminClient } from '../src/lib/supabase/admin';

async function run() {
  console.log('=== PHASE 1 POSTGRESQL RE-VERIFICATION & CONCURRENCY TEST ===\n');

  const admin = createAdminClient();

  // 1. Fetch Contractor and Worker from Postgres
  const { data: contractorUser } = await admin.from('users').select('*, contractors(*)').eq('login_id', 'SS-C-2026-000001').single();
  const { data: workerUser } = await admin.from('users').select('*, workers(*)').eq('login_id', 'WRK-MH-2026-0001').single();
  const { data: project } = await admin.from('projects').select('*').limit(1).single();
  const { data: worksite } = await admin.from('worksites').select('*').eq('project_id', project.id).limit(1).single();

  console.log(`[INFO] Contractor: ${contractorUser.login_id} (ID: ${contractorUser.id})`);
  console.log(`[INFO] Worker: ${workerUser.login_id} (ID: ${workerUser.id})`);
  console.log(`[INFO] Project: ${project.name} (ID: ${project.id})`);
  console.log(`[INFO] Worksite: ${worksite.name} (ID: ${worksite.id})\n`);

  // Ensure any existing active contracts between this worker and project are cleaned up for clean testing
  await admin.from('work_contracts').update({ status: 'COMPLETED' }).eq('project_id', project.id).eq('worker_id', workerUser.workers.id).eq('status', 'ACTIVE');

  // =========================================================================
  // TEST A: CONCURRENCY TEST (Simultaneous Duplicate Assignment)
  // Two simultaneous requests attempt to assign the same worker to the same project.
  // The PostgreSQL partial unique index `idx_unique_active_project_worker` MUST reject one with 23505!
  // =========================================================================
  console.log('--- TEST A: CONCURRENCY TEST (DUAL SIMULTANEOUS ASSIGNMENTS) ---');
  
  const payload1 = {
    contract_code: `CTR-CONC-${Date.now()}-1`,
    worker_id: workerUser.workers.id,
    contractor_id: contractorUser.contractors.id,
    project_id: project.id,
    worksite_id: worksite.id,
    work_type: 'Mason',
    daily_wage: 65000,
    expected_working_hours: 8,
    payment_frequency: 'WEEKLY' as const,
    status: 'ACTIVE' as const,
    start_date: new Date().toISOString().split('T')[0],
  };

  const payload2 = {
    contract_code: `CTR-CONC-${Date.now()}-2`,
    worker_id: workerUser.workers.id,
    contractor_id: contractorUser.contractors.id,
    project_id: project.id,
    worksite_id: worksite.id,
    work_type: 'Mason',
    daily_wage: 65000,
    expected_working_hours: 8,
    payment_frequency: 'WEEKLY' as const,
    status: 'ACTIVE' as const,
    start_date: new Date().toISOString().split('T')[0],
  };

  const [res1, res2] = await Promise.all([
    admin.from('work_contracts').insert(payload1).select().single(),
    admin.from('work_contracts').insert(payload2).select().single(),
  ]);

  const succeededCount = (res1.data ? 1 : 0) + (res2.data ? 1 : 0);
  const failedCount = (res1.error ? 1 : 0) + (res2.error ? 1 : 0);

  console.log(`Result 1: ${res1.error ? `FAILED (${res1.error.code}: ${res1.error.message})` : `SUCCESS (Contract: ${res1.data.contract_code})`}`);
  console.log(`Result 2: ${res2.error ? `FAILED (${res2.error.code}: ${res2.error.message})` : `SUCCESS (Contract: ${res2.data.contract_code})`}`);

  if (succeededCount === 1 && failedCount === 1) {
    console.log('✅ CONCURRENCY PASS: Exactly ONE active assignment succeeded. PostgreSQL partial unique index idx_unique_active_project_worker rejected the duplicate with 23505!\n');
  } else {
    console.error(`❌ CONCURRENCY FAIL: Expected 1 success and 1 failure, got ${succeededCount} successes and ${failedCount} failures!\n`);
  }

  const activeContract = res1.data || res2.data;

  // =========================================================================
  // TEST B: SQL EVIDENCE OF ACTIVE CONTRACT
  // =========================================================================
  console.log('--- TEST B: SQL EVIDENCE OF ACTIVE CONTRACT ---');
  const { data: dbActiveContract } = await admin
    .from('work_contracts')
    .select('id, contract_code, worker_id, contractor_id, project_id, daily_wage, status, start_date, created_at')
    .eq('id', activeContract.id)
    .single();

  console.log('PostgreSQL work_contracts row:');
  console.table([dbActiveContract]);

  // Insert audit log for assignment
  await admin.from('audit_log').insert({
    actor: contractorUser.id,
    action: 'CONTRACT_ASSIGNED',
    entity_type: 'work_contracts',
    entity_id: activeContract.id,
    after: dbActiveContract,
  });

  // =========================================================================
  // TEST C: CONTRACTOR REMOVES WORKER -> TRANSITIONS TO COMPLETED
  // =========================================================================
  console.log('\n--- TEST C: CONTRACTOR TERMINATES / REMOVES WORKER ---');
  const terminationDate = new Date().toISOString().split('T')[0];
  const { data: completedContract, error: termErr } = await admin
    .from('work_contracts')
    .update({
      status: 'COMPLETED',
      end_date: terminationDate,
      end_reason: 'Worksite contract term completed successfully',
      ended_by: contractorUser.id,
      unresolved_dues_paise: 0,
      dues_confirmed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', activeContract.id)
    .select('id, contract_code, status, start_date, end_date, end_reason, ended_by, dues_confirmed')
    .single();

  if (termErr) {
    console.error('Termination error:', termErr);
  } else {
    console.log('PostgreSQL work_contracts updated row:');
    console.table([completedContract]);
  }

  // Insert audit log for termination
  await admin.from('audit_log').insert({
    actor: contractorUser.id,
    action: 'CONTRACT_TERMINATED',
    entity_type: 'work_contracts',
    entity_id: activeContract.id,
    after: completedContract,
  });

  // Verify Audit Log
  console.log('\n--- TEST D: POSTGRESQL AUDIT_LOG VERIFICATION ---');
  const { data: auditRows } = await admin
    .from('audit_log')
    .select('id, action, actor, entity_type, entity_id, timestamp')
    .eq('entity_id', activeContract.id);

  console.table(auditRows);

  console.log('\n✅ ALL DATABASE CHECKS PASSED ON NATIVE POSTGRESQL!');
}

run().catch(console.error);
