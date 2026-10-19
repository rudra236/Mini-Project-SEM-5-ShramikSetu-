/**
 * SHRAMIKSETU UNIFIED SERVER-SIDE COUNTS ENGINE
 *
 * Single Source of Truth for all workforce, contract, attendance, and notification counts.
 * Strictly adheres to statutory definitions:
 * - Active workforce = accepted and not ended (status IN ('ACCEPTED', 'ACTIVE') and ended_at/end_reason IS NULL and (end_date IS NULL or end_date >= todayIst))
 * - Pending invites = pending (status IN ('PENDING', 'OFFERED', 'PENDING_ACCEPTANCE'))
 * - Completed/past = ended (status IN ('COMPLETED', 'TERMINATED', 'ENDED') or ended_by/end_reason set, excluding rejected/cancelled)
 * - Rejected/cancelled = rejected or cancelled (shown separately in history)
 * - Today's shifts = "X / Y punched" (distinct active workers with check-in today IST / active workforce)
 *
 * Frontend NEVER computes or counts client-side; only displays server-provided counts.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { getTodayIst } from '@/lib/crypto/qr-token';

export interface ProjectCounts {
  projectId: string;
  activeWorkforce: number;
  pendingInvites: number;
  completedPast: number;
  rejectedCancelled: number;
  punchedToday: number;
  totalActive: number;
  formattedPunched: string;
  rosterLabel: string;
}

export interface ContractorCounts {
  contractorId: string;
  activeWorkforce: number;
  pendingInvites: number;
  completedPast: number;
  rejectedCancelled: number;
  punchedToday: number;
  formattedPunched: string;
  projectCounts: Record<string, ProjectCounts>;
}

export interface WorkerCounts {
  workerId: string;
  activeContracts: number;
  pendingInvites: number;
  completedPast: number;
  rejectedCancelled: number;
  checkedInToday: boolean;
  todayPunchedCount: number;
  activeContractId: string | null;
  unreadNotifications: number;
}

/**
 * Normalizes and checks contract state according to canonical definitions.
 */
export function classifyContract(contract: any, todayIst: string): 'ACTIVE' | 'PENDING' | 'COMPLETED' | 'REJECTED_OR_CANCELLED' {
  const status = String(contract.status || '').toUpperCase();
  const isExplicitlyEnded = Boolean(contract.end_reason || contract.ended_by);
  const isPastEndDate = contract.end_date && String(contract.end_date).slice(0, 10) < todayIst;

  if (['REJECTED', 'CANCELLED'].includes(status)) {
    return 'REJECTED_OR_CANCELLED';
  }

  if (['COMPLETED', 'TERMINATED', 'ENDED'].includes(status) || isExplicitlyEnded || isPastEndDate) {
    return 'COMPLETED';
  }

  if (['PENDING', 'OFFERED', 'PENDING_ACCEPTANCE'].includes(status)) {
    return 'PENDING';
  }

  if (['ACCEPTED', 'ACTIVE'].includes(status)) {
    return 'ACTIVE';
  }

  return 'COMPLETED';
}

/**
 * 1. PROJECT SCOPE: Calculates canonical counts for a specific project.
 */
export async function getProjectCounts(projectId: string): Promise<ProjectCounts> {
  const adminClient = createAdminClient();
  const todayIst = getTodayIst();

  // Fetch all contracts for this project
  const { data: contracts, error: cErr } = await adminClient
    .from('work_contracts')
    .select('id, worker_id, status, start_date, end_date, end_reason, ended_by')
    .eq('project_id', projectId);

  if (cErr) {
    console.error(`[COUNTS_SERVICE] Failed to query contracts for project ${projectId}:`, cErr);
    throw new Error(`Failed to query project contracts: ${cErr.message}`);
  }

  let activeWorkforce = 0;
  let pendingInvites = 0;
  let completedPast = 0;
  let rejectedCancelled = 0;
  const activeWorkerIds = new Set<string>();

  (contracts || []).forEach((c: any) => {
    const classification = classifyContract(c, todayIst);
    if (classification === 'ACTIVE') {
      activeWorkforce++;
      if (c.worker_id) activeWorkerIds.add(c.worker_id);
    } else if (classification === 'PENDING') {
      pendingInvites++;
    } else if (classification === 'COMPLETED') {
      completedPast++;
    } else if (classification === 'REJECTED_OR_CANCELLED') {
      rejectedCancelled++;
    }
  });

  // Query distinct active workers who have checked in today IST
  const { data: punches, error: pErr } = await adminClient
    .from('attendance_events')
    .select('worker_id, status, date, created_at')
    .eq('project_id', projectId)
    .neq('status', 'REJECTED');

  if (pErr) {
    console.error(`[COUNTS_SERVICE] Failed to query attendance for project ${projectId}:`, pErr);
  }

  const punchedWorkerIds = new Set<string>();
  (punches || []).forEach((p: any) => {
    const punchDate = p.date || (p.created_at ? p.created_at.slice(0, 10) : '');
    if (punchDate === todayIst && activeWorkerIds.has(p.worker_id)) {
      punchedWorkerIds.add(p.worker_id);
    }
  });

  const punchedToday = punchedWorkerIds.size;
  const formattedPunched = `${punchedToday} / ${activeWorkforce} punched`;
  const rosterLabel = `${activeWorkforce} active · ${pendingInvites} pending`;

  return {
    projectId,
    activeWorkforce,
    pendingInvites,
    completedPast,
    rejectedCancelled,
    punchedToday,
    totalActive: activeWorkforce,
    formattedPunched,
    rosterLabel,
  };
}

/**
 * 2. CONTRACTOR SCOPE: Calculates canonical counts across all contractor's projects.
 */
export async function getContractorCounts(contractorId: string): Promise<ContractorCounts> {
  const adminClient = createAdminClient();
  const todayIst = getTodayIst();

  // Fetch all projects for contractor
  const { data: projects, error: prErr } = await adminClient
    .from('projects')
    .select('id')
    .eq('contractor_id', contractorId);

  if (prErr) {
    console.error(`[COUNTS_SERVICE] Failed to query projects for contractor ${contractorId}:`, prErr);
    throw new Error(`Failed to query contractor projects: ${prErr.message}`);
  }

  const projectIds = (projects || []).map((p: any) => p.id);
  const projectCounts: Record<string, ProjectCounts> = {};

  if (projectIds.length === 0) {
    return {
      contractorId,
      activeWorkforce: 0,
      pendingInvites: 0,
      completedPast: 0,
      rejectedCancelled: 0,
      punchedToday: 0,
      formattedPunched: '0 / 0 punched',
      projectCounts: {},
    };
  }

  // Fetch all contracts for contractor
  const { data: contracts, error: cErr } = await adminClient
    .from('work_contracts')
    .select('id, project_id, worker_id, status, start_date, end_date, end_reason, ended_by')
    .in('project_id', projectIds);

  if (cErr) {
    console.error(`[COUNTS_SERVICE] Failed to query contracts for contractor ${contractorId}:`, cErr);
    throw new Error(`Failed to query contractor contracts: ${cErr.message}`);
  }

  // Group contracts by project
  const contractsByProject = new Map<string, any[]>();
  projectIds.forEach((pid: string) => contractsByProject.set(pid, []));
  (contracts || []).forEach((c: any) => {
    const list = contractsByProject.get(c.project_id) || [];
    list.push(c);
    contractsByProject.set(c.project_id, list);
  });

  // Fetch attendance punches for today IST across all contractor projects
  const { data: punches, error: pErr } = await adminClient
    .from('attendance_events')
    .select('worker_id, project_id, status, date, created_at')
    .in('project_id', projectIds)
    .neq('status', 'REJECTED');

  if (pErr) {
    console.error(`[COUNTS_SERVICE] Failed to query attendance for contractor ${contractorId}:`, pErr);
  }

  let totalActiveWorkforce = 0;
  let totalPendingInvites = 0;
  let totalCompletedPast = 0;
  let totalRejectedCancelled = 0;
  const allActiveWorkerIds = new Set<string>();
  const totalPunchedWorkerIds = new Set<string>();

  for (const pid of projectIds) {
    const pContracts = contractsByProject.get(pid) || [];
    let pActive = 0;
    let pPending = 0;
    let pCompleted = 0;
    let pRejected = 0;
    const pActiveWorkerIds = new Set<string>();

    pContracts.forEach((c: any) => {
      const cls = classifyContract(c, todayIst);
      if (cls === 'ACTIVE') {
        pActive++;
        if (c.worker_id) {
          pActiveWorkerIds.add(c.worker_id);
          allActiveWorkerIds.add(c.worker_id);
        }
      } else if (cls === 'PENDING') {
        pPending++;
      } else if (cls === 'COMPLETED') {
        pCompleted++;
      } else if (cls === 'REJECTED_OR_CANCELLED') {
        pRejected++;
      }
    });

    const pPunchedWorkers = new Set<string>();
    (punches || []).forEach((p: any) => {
      if (p.project_id === pid) {
        const punchDate = p.date || (p.created_at ? p.created_at.slice(0, 10) : '');
        if (punchDate === todayIst && pActiveWorkerIds.has(p.worker_id)) {
          pPunchedWorkers.add(p.worker_id);
          totalPunchedWorkerIds.add(p.worker_id);
        }
      }
    });

    const pCounts: ProjectCounts = {
      projectId: pid,
      activeWorkforce: pActive,
      pendingInvites: pPending,
      completedPast: pCompleted,
      rejectedCancelled: pRejected,
      punchedToday: pPunchedWorkers.size,
      totalActive: pActive,
      formattedPunched: `${pPunchedWorkers.size} / ${pActive} punched`,
      rosterLabel: `${pActive} active · ${pPending} pending`,
    };

    projectCounts[pid] = pCounts;
    totalActiveWorkforce += pActive;
    totalPendingInvites += pPending;
    totalCompletedPast += pCompleted;
    totalRejectedCancelled += pRejected;
  }

  return {
    contractorId,
    activeWorkforce: totalActiveWorkforce,
    pendingInvites: totalPendingInvites,
    completedPast: totalCompletedPast,
    rejectedCancelled: totalRejectedCancelled,
    punchedToday: totalPunchedWorkerIds.size,
    formattedPunched: `${totalPunchedWorkerIds.size} / ${totalActiveWorkforce} punched`,
    projectCounts,
  };
}

/**
 * 3. WORKER SCOPE: Calculates canonical counts for a specific worker.
 */
export async function getWorkerCounts(workerId: string, userId?: string): Promise<WorkerCounts> {
  const adminClient = createAdminClient();
  const todayIst = getTodayIst();

  // Fetch contracts for worker
  const { data: contracts, error: cErr } = await adminClient
    .from('work_contracts')
    .select('id, project_id, status, start_date, end_date, end_reason, ended_by')
    .eq('worker_id', workerId)
    .order('created_at', { ascending: false });

  if (cErr) {
    console.error(`[COUNTS_SERVICE] Failed to query contracts for worker ${workerId}:`, cErr);
    throw new Error(`Failed to query worker contracts: ${cErr.message}`);
  }

  let activeContracts = 0;
  let pendingInvites = 0;
  let completedPast = 0;
  let rejectedCancelled = 0;
  let activeContractId: string | null = null;

  (contracts || []).forEach((c: any) => {
    const cls = classifyContract(c, todayIst);
    if (cls === 'ACTIVE') {
      activeContracts++;
      if (!activeContractId) activeContractId = c.id;
    } else if (cls === 'PENDING') {
      pendingInvites++;
    } else if (cls === 'COMPLETED') {
      completedPast++;
    } else if (cls === 'REJECTED_OR_CANCELLED') {
      rejectedCancelled++;
    }
  });

  // Fetch today's attendance for this worker
  const { data: punches, error: pErr } = await adminClient
    .from('attendance_events')
    .select('id, date, created_at, status')
    .eq('worker_id', workerId)
    .neq('status', 'REJECTED');

  if (pErr) {
    console.error(`[COUNTS_SERVICE] Failed to query attendance for worker ${workerId}:`, pErr);
  }

  const todayPunches = (punches || []).filter((p: any) => {
    const pDate = p.date || (p.created_at ? p.created_at.slice(0, 10) : '');
    return pDate === todayIst;
  });

  const checkedInToday = todayPunches.length > 0;
  const todayPunchedCount = todayPunches.length;

  // Unread notifications
  let unreadNotifications = 0;
  if (userId) {
    const { count } = await adminClient
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    unreadNotifications = count || 0;
  }

  return {
    workerId,
    activeContracts,
    pendingInvites,
    completedPast,
    rejectedCancelled,
    checkedInToday,
    todayPunchedCount,
    activeContractId,
    unreadNotifications,
  };
}

/**
 * 4. NOTIFICATION / UNREAD COUNT SCOPE
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    console.error(`[COUNTS_SERVICE] Failed to query unread notifications for user ${userId}:`, error);
    return 0;
  }
  return count || 0;
}
