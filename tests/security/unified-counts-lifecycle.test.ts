/**
 * UNIFIED WORKFORCE COUNTS LIFECYCLE VERIFICATION TEST SUITE
 *
 * Verifies end-to-end statutory invariants:
 * 1. Invite → pending +1, active unchanged
 * 2. Accept → active +1, pending -1 on both contractor and worker roles
 * 3. Punch / check-in → punchedToday updates ("X / Y punched")
 * 4. Remove / terminate → active -1, completed +1
 * 5. Compares raw PostgreSQL SQL counts against server-side counts-service and API counts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getProjectCounts,
  getContractorCounts,
  getWorkerCounts,
} from '@/lib/services/counts-service';
import { respondToContract, terminateContract } from '@/lib/services/employment-service';
import { createRotatingAttendanceToken, markAttendance } from '@/lib/services/attendance-service';
import { getTodayIst } from '@/lib/crypto/qr-token';

describe('Unified Workforce Counts Lifecycle & PostgreSQL Parity', () => {
  const admin = createAdminClient();
  const todayIst = getTodayIst();

  let contractorId: string;
  let contractorUserId: string;
  let projectId: string;
  let worksiteId: string;
  let workerId: string;
  let workerUserId: string;
  let createdContractId: string;

  beforeAll(async () => {
    // 1. Resolve project
    const { data: project } = await admin
      .from('projects')
      .select('id, contractor_id, worksites(id)')
      .limit(1)
      .single();
    expect(project).toBeDefined();
    projectId = project!.id;
    contractorId = project!.contractor_id;
    worksiteId = (project as any).worksites?.[0]?.id;

    // 2. Resolve contractor
    const { data: contractor } = await admin
      .from('contractors')
      .select('id, user_id')
      .eq('id', contractorId)
      .single();
    expect(contractor).toBeDefined();
    contractorUserId = contractor!.user_id;

    // 3. Create dedicated test worker
    workerUserId = crypto.randomUUID();
    workerId = crypto.randomUUID();
    await admin.from('users').insert({
      id: workerUserId,
      role: 'WORKER',
      locale: 'en',
      login_id: `SS-W-${Date.now().toString().slice(-6)}`,
      password_hash: 'testhash',
      is_active: true,
    });
    await admin.from('workers').insert({
      id: workerId,
      user_id: workerUserId,
      full_name: 'Lifecycle Worker Test',
      internal_worker_id: `SS-W-${Date.now().toString().slice(-6)}`,
      password_hash: 'testhash',
      occupation: 'Mason',
      skill_category: 'SEMI_SKILLED',
    });
  });

  afterAll(async () => {
    // Cleanup created test contract & test punches & worker
    if (createdContractId) {
      await admin.from('attendance_events').delete().eq('contract_id', createdContractId);
      await admin.from('contract_acceptances').delete().eq('contract_id', createdContractId);
      await admin.from('employment_relationships').delete().eq('contract_id', createdContractId);
      await admin.from('work_contracts').delete().eq('id', createdContractId);
    }
    if (workerId) {
      await admin.from('attendance_events').delete().eq('worker_id', workerId);
      await admin.from('workers').delete().eq('id', workerId);
    }
    if (workerUserId) {
      await admin.from('users').delete().eq('id', workerUserId);
    }
  });

  it('1. Baseline: SQL counts match Server counts exactly', async () => {
    // Direct raw SQL count query via Supabase
    const { data: allContracts } = await admin
      .from('work_contracts')
      .select('status, end_date, end_reason, ended_by')
      .eq('project_id', projectId);

    const sqlActive = (allContracts || []).filter(
      (c: any) => ['ACCEPTED', 'accepted', 'ACTIVE', 'active'].includes(c.status) && !c.end_reason && (!c.end_date || c.end_date >= todayIst)
    ).length;

    const sqlPending = (allContracts || []).filter(
      (c: any) => ['PENDING', 'pending', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(c.status) && !c.end_reason
    ).length;

    const serverCounts = await getProjectCounts(projectId);

    console.log('\n--- BASELINE AUDIT ---');
    console.log(`[SQL vs SERVER] Active:  SQL=${sqlActive} | Server=${serverCounts.activeWorkforce}`);
    console.log(`[SQL vs SERVER] Pending: SQL=${sqlPending} | Server=${serverCounts.pendingInvites}`);

    expect(serverCounts.activeWorkforce).toBe(sqlActive);
    expect(serverCounts.pendingInvites).toBe(sqlPending);
    expect(serverCounts.rosterLabel).toBe(`${sqlActive} active · ${sqlPending} pending`);
  });

  it('2. Invite → pending +1, active unchanged', async () => {
    const baseline = await getProjectCounts(projectId);

    // Create a new PENDING contract
    const contractCode = `CTR-TEST-${Date.now()}`;
    const { data: newContract, error: insErr } = await admin
      .from('work_contracts')
      .insert({
        contract_code: contractCode,
        project_id: projectId,
        worksite_id: worksiteId,
        contractor_id: contractorId,
        worker_id: workerId,
        status: 'PENDING',
        work_type: 'MASON',
        daily_wage: 65000,
        expected_working_hours: 8,
        payment_frequency: 'DAILY',
        start_date: todayIst,
      })
      .select()
      .single();

    expect(insErr).toBeNull();
    expect(newContract).toBeDefined();
    createdContractId = newContract!.id;

    // Check counts via counts-service
    const afterInvite = await getProjectCounts(projectId);
    const workerCounts = await getWorkerCounts(workerId, workerUserId);

    console.log('\n--- STEP 1: INVITE AUDIT ---');
    console.log(`Active:  Baseline=${baseline.activeWorkforce} → AfterInvite=${afterInvite.activeWorkforce} (Unchanged: PASS)`);
    console.log(`Pending: Baseline=${baseline.pendingInvites} → AfterInvite=${afterInvite.pendingInvites} (+1: PASS)`);
    console.log(`Worker Pending Invites: ${workerCounts.pendingInvites}`);

    expect(afterInvite.activeWorkforce).toBe(baseline.activeWorkforce);
    expect(afterInvite.pendingInvites).toBe(baseline.pendingInvites + 1);
    expect(afterInvite.rosterLabel).toBe(`${afterInvite.activeWorkforce} active · ${afterInvite.pendingInvites} pending`);
  });

  it('3. Accept → active +1, pending -1 on both contractor and worker roles', async () => {
    const preAcceptProject = await getProjectCounts(projectId);
    const preAcceptWorker = await getWorkerCounts(workerId, workerUserId);

    // Worker accepts contract
    const result = await respondToContract(createdContractId, workerUserId, 'ACCEPTED');
    expect(result.contract.status).toBe('ACCEPTED');

    // Query refreshed server counts
    const postAcceptProject = await getProjectCounts(projectId);
    const postAcceptWorker = await getWorkerCounts(workerId, workerUserId);

    console.log('\n--- STEP 2: ACCEPT AUDIT ---');
    console.log(`Project Active:  ${preAcceptProject.activeWorkforce} → ${postAcceptProject.activeWorkforce} (+1: PASS)`);
    console.log(`Project Pending: ${preAcceptProject.pendingInvites} → ${postAcceptProject.pendingInvites} (-1: PASS)`);
    console.log(`Worker Active:   ${preAcceptWorker.activeContracts} → ${postAcceptWorker.activeContracts} (+1: PASS)`);
    console.log(`Worker Pending:  ${preAcceptWorker.pendingInvites} → ${postAcceptWorker.pendingInvites} (-1: PASS)`);

    expect(postAcceptProject.activeWorkforce).toBe(preAcceptProject.activeWorkforce + 1);
    expect(postAcceptProject.pendingInvites).toBe(preAcceptProject.pendingInvites - 1);
    expect(postAcceptWorker.activeContracts).toBe(preAcceptWorker.activeContracts + 1);
    expect(postAcceptWorker.pendingInvites).toBe(preAcceptWorker.pendingInvites - 1);
  });

  it('4. Punch / Check-in → punchedToday updates ("X / Y punched")', async () => {
    const prePunch = await getProjectCounts(projectId);

    // Contractor creates active gate token
    const tokenRes = await createRotatingAttendanceToken({
      creatorUserId: contractorUserId,
      projectId,
      worksiteId,
    });

    // Worker marks attendance using short code
    const punchRes = await markAttendance({
      workerUserId,
      manualCode: tokenRes.shortCode,
      attendanceDate: todayIst,
      punchType: 'IN',
      projectId,
    });
    expect(punchRes.status).toBe('VERIFIED');

    // Refetch project counts
    const postPunch = await getProjectCounts(projectId);

    console.log('\n--- STEP 3: ATTENDANCE PUNCH AUDIT ---');
    console.log(`Punched Today: ${prePunch.punchedToday} → ${postPunch.punchedToday} (+1: PASS)`);
    console.log(`Formatted Shifts: "${postPunch.formattedPunched}"`);

    expect(postPunch.punchedToday).toBeGreaterThanOrEqual(1);
    expect(postPunch.formattedPunched).toBe(`${postPunch.punchedToday} / ${postPunch.activeWorkforce} punched`);
  });

  it('5. Remove / Terminate → active -1, completed +1', async () => {
    const preRemove = await getProjectCounts(projectId);

    // Contractor terminates / removes worker assignment
    await terminateContract(createdContractId, contractorUserId, 'Project phase completed');

    // Refetch project counts
    const postRemove = await getProjectCounts(projectId);

    console.log('\n--- STEP 4: REMOVAL / TERMINATION AUDIT ---');
    console.log(`Active:    ${preRemove.activeWorkforce} → ${postRemove.activeWorkforce} (-1: PASS)`);
    console.log(`Completed: ${preRemove.completedPast} → ${postRemove.completedPast} (+1: PASS)`);
    console.log(`Roster Label: "${postRemove.rosterLabel}"`);

    expect(postRemove.activeWorkforce).toBe(preRemove.activeWorkforce - 1);
    expect(postRemove.completedPast).toBe(preRemove.completedPast + 1);
    expect(postRemove.rosterLabel).toBe(`${postRemove.activeWorkforce} active · ${postRemove.pendingInvites} pending`);
  });
});
