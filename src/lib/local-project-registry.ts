/**
 * LOCAL PROJECT REGISTRY
 *
 * File-based project + worksite + contract store for dev/offline mode.
 * Used when SUPABASE_SERVICE_ROLE_KEY is a placeholder/dev key.
 * Mirrors the pattern of the user registry in unified-auth.ts.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const REGISTRY_FILE = path.join(process.cwd(), '.registered_projects.json');

export interface LocalProject {
  id: string;
  contractor_id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface LocalWorksite {
  id: string;
  project_id: string;
  name: string;
  latitude: number;
  longitude: number;
  allowed_radius_meters: number;
  address: string;
  city: string;
  state: string;
  pincode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocalContract {
  id: string;
  project_id: string;
  worksite_id: string;
  contractor_id: string;
  worker_id: string;
  worker_user_id?: string;
  work_type: string;
  daily_wage: number; // in paise
  expected_working_hours: number;
  payment_frequency: string;
  start_date: string;
  end_date: string | null;
  status: string;
  end_reason?: string | null;
  ended_by?: string | null;
  unresolved_dues_paise?: number;
  dues_confirmed?: boolean;
  min_wage_override_acknowledged?: boolean;
  min_wage_applicable_paise?: number;
  audit_trail?: any[];
  workers?: {
    id?: string;
    full_name?: string;
    internal_worker_id?: string;
    skill_category?: string;
    user_id?: string;
    occupation?: string;
  };
  contractors?: {
    id?: string;
    company_name?: string;
    full_name?: string;
    internal_contractor_id?: string;
  };
  projects?: {
    id?: string;
    name?: string;
    description?: string | null;
  };
  created_at: string;
  updated_at: string;
}

export interface LocalAttendanceEvent {
  id: string;
  worker_id: string;
  contractor_id?: string;
  project_id: string;
  worksite_id?: string;
  date: string;
  punch_type: string;
  status: string;
  attendance_method: 'qr' | 'otp';
  calculated_distance_meters?: number;
  created_at: string;
  projects?: { name: string; code?: string };
  worksites?: { name: string };
  workers?: { full_name?: string; internal_worker_id?: string; skill_category?: string };
}

export interface LocalActiveToken {
  projectId: string;
  projectName?: string;
  worksiteId?: string;
  shortCode: string;
  token: string;
  expiresAt: string;
  ttlSeconds: number;
}

interface ProjectRegistry {
  projects: LocalProject[];
  worksites: LocalWorksite[];
  contracts: LocalContract[];
  attendance?: LocalAttendanceEvent[];
  activeTokens?: Record<string, LocalActiveToken>;
}

function loadRegistry(): ProjectRegistry {
  try {
    if (fs.existsSync(REGISTRY_FILE)) {
      const raw = fs.readFileSync(REGISTRY_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        projects: parsed.projects || [],
        worksites: parsed.worksites || [],
        contracts: parsed.contracts || [],
        attendance: parsed.attendance || [],
        activeTokens: parsed.activeTokens || {},
      };
    }
  } catch {
    // Start fresh if corrupt
  }
  return { projects: [], worksites: [], contracts: [], attendance: [], activeTokens: {} };
}

function saveRegistry(registry: ProjectRegistry): void {
  try {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LocalProjectRegistry] Failed to save:', err);
  }
}

export function isDevMode(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return key.includes('local_dev') || key.includes('placeholder') || !key.startsWith('eyJ');
}

export function createLocalProject(
  contractorId: string,
  data: {
    name: string;
    description?: string | null;
    startDate: string;
    endDate?: string | null;
  }
): LocalProject {
  const registry = loadRegistry();
  const now = new Date().toISOString();
  const project: LocalProject = {
    id: randomUUID(),
    contractor_id: contractorId,
    name: data.name,
    description: data.description || null,
    start_date: data.startDate,
    end_date: data.endDate || null,
    status: 'ACTIVE',
    created_at: now,
    updated_at: now,
  };
  registry.projects.push(project);
  saveRegistry(registry);
  return project;
}

export function createLocalWorksite(
  projectId: string,
  data: {
    name: string;
    latitude: number;
    longitude: number;
    allowedRadiusMeters: number;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string | null;
  }
): LocalWorksite {
  const registry = loadRegistry();
  const now = new Date().toISOString();
  const worksite: LocalWorksite = {
    id: randomUUID(),
    project_id: projectId,
    name: data.name,
    latitude: data.latitude,
    longitude: data.longitude,
    allowed_radius_meters: data.allowedRadiusMeters,
    address: data.address || 'Address pending',
    city: data.city || 'City pending',
    state: data.state || 'State pending',
    pincode: data.pincode || null,
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  registry.worksites.push(worksite);
  saveRegistry(registry);
  return worksite;
}

export function listLocalProjects(contractorId?: string): (LocalProject & { worksites: LocalWorksite[] })[] {
  const registry = loadRegistry();
  const cid = contractorId?.toLowerCase();
  const projects = cid
    ? registry.projects.filter((p) => {
        const pcid = p.contractor_id?.toLowerCase();
        if (pcid === cid) return true;
        if (
          (cid === '22222222-2222-2222-2222-222222222201' || cid === '11111111-1111-1111-1111-111111111100') &&
          (pcid === '22222222-2222-2222-2222-222222222201' || pcid === '11111111-1111-1111-1111-111111111100')
        ) {
          return true;
        }
        return false;
      })
    : registry.projects;

  return projects.map((p) => ({
    ...p,
    worksites: registry.worksites.filter((w) => w.project_id === p.id),
  }));
}

export function getLocalProject(
  projectId: string
): (LocalProject & { worksites: LocalWorksite[] }) | null {
  const registry = loadRegistry();
  const project = registry.projects.find((p) => p.id === projectId);
  if (!project) return null;
  return {
    ...project,
    worksites: registry.worksites.filter((w) => w.project_id === project.id),
  };
}

export function createLocalContract(
  data: {
    projectId: string;
    worksiteId: string;
    contractorId: string;
    workerId: string;
    workerUserId?: string;
    workType: string;
    dailyWageRupees: number;
    expectedWorkingHours: number;
    paymentFrequency: string;
    startDate: string;
    endDate?: string | null;
    workerName?: string;
    workerInternalId?: string;
    workerSkillCategory?: string;
    minWageOverrideAcknowledged?: boolean;
    minWageApplicablePaise?: number;
  }
): LocalContract {
  const registry = loadRegistry();
  const now = new Date().toISOString();

  // Enforce: No duplicate active assignment of one worker on the same project
  const duplicate = registry.contracts.find(
    (c) =>
      c.project_id === data.projectId &&
      (c.worker_id === data.workerId ||
        (data.workerUserId && (c.worker_id === data.workerUserId || c.worker_user_id === data.workerUserId)) ||
        (data.workerInternalId && c.workers?.internal_worker_id?.toLowerCase() === data.workerInternalId.toLowerCase())) &&
      ['ACTIVE', 'OFFERED', 'ACCEPTED', 'PENDING_ACCEPTANCE'].includes(c.status)
  );

  if (duplicate) {
    const err = new Error('Worker already has an active contract on this project.');
    (err as any).code = 'DUPLICATE_ACTIVE_ASSIGNMENT';
    throw err;
  }

  const project = registry.projects.find((p) => p.id === data.projectId);

  const contract: LocalContract = {
    id: randomUUID(),
    project_id: data.projectId,
    worksite_id: data.worksiteId,
    contractor_id: data.contractorId,
    worker_id: data.workerId,
    worker_user_id: data.workerUserId,
    work_type: data.workType,
    daily_wage: Math.round(data.dailyWageRupees * 100), // store as paise
    expected_working_hours: data.expectedWorkingHours,
    payment_frequency: data.paymentFrequency,
    start_date: data.startDate,
    end_date: data.endDate || null,
    status: 'ACTIVE',
    min_wage_override_acknowledged: data.minWageOverrideAcknowledged || false,
    min_wage_applicable_paise: data.minWageApplicablePaise,
    workers: {
      id: data.workerId,
      user_id: data.workerUserId,
      full_name: data.workerName,
      internal_worker_id: data.workerInternalId,
      skill_category: data.workerSkillCategory,
    },
    contractors: {
      id: data.contractorId,
      company_name: 'Registered Contractor',
    },
    projects: {
      id: data.projectId,
      name: project?.name || 'Site Project',
      description: project?.description || null,
    },
    audit_trail: [
      {
        action: 'ASSIGNMENT_CREATED',
        actorId: data.contractorId,
        timestamp: now,
        workType: data.workType,
        dailyWagePaise: Math.round(data.dailyWageRupees * 100),
        startDate: data.startDate,
        overrideAcknowledged: data.minWageOverrideAcknowledged || false,
      },
    ],
    created_at: now,
    updated_at: now,
  };
  registry.contracts.push(contract);
  saveRegistry(registry);
  return contract;
}

export function terminateLocalContract(
  contractId: string,
  data: {
    reason: string;
    endedBy: string;
    endDate?: string;
    confirmOutstandingDues?: boolean;
  }
): { success: boolean; contract?: LocalContract; unresolvedDuesPaise?: number; error?: string } {
  const registry = loadRegistry();
  const contract = registry.contracts.find((c) => c.id === contractId);
  if (!contract) {
    return { success: false, error: 'CONTRACT_NOT_FOUND' };
  }

  // Calculate unresolved wage dues from attendance records on this contract/project
  const attendances = (registry.attendance || []).filter(
    (a) =>
      a.project_id === contract.project_id &&
      (a.worker_id === contract.worker_id || a.worker_id === contract.worker_user_id) &&
      a.status !== 'REJECTED'
  );

  const wagePaise = contract.daily_wage || 60638;
  const shiftCount = attendances.length;
  const unresolvedDuesPaise = shiftCount > 0 ? shiftCount * wagePaise : 0;

  if (unresolvedDuesPaise > 0 && !data.confirmOutstandingDues) {
    return {
      success: false,
      error: 'UNRESOLVED_DUES_CONFIRMATION_REQUIRED',
      unresolvedDuesPaise,
    };
  }

  const now = new Date().toISOString();
  contract.status = 'COMPLETED';
  contract.end_date = data.endDate || now.split('T')[0];
  contract.end_reason = data.reason;
  contract.ended_by = data.endedBy;
  contract.unresolved_dues_paise = unresolvedDuesPaise;
  contract.dues_confirmed = !!data.confirmOutstandingDues;
  contract.updated_at = now;

  if (!contract.audit_trail) contract.audit_trail = [];
  contract.audit_trail.push({
    action: 'ASSIGNMENT_ENDED',
    actorId: data.endedBy,
    timestamp: now,
    reason: data.reason,
    unresolvedDuesPaise,
    duesConfirmed: !!data.confirmOutstandingDues,
  });

  saveRegistry(registry);
  return { success: true, contract, unresolvedDuesPaise };
}

export function listLocalContracts(opts?: {
  contractorId?: string;
  workerId?: string;
  projectId?: string;
}): LocalContract[] {
  const registry = loadRegistry();
  let contracts = registry.contracts;

  if (opts?.contractorId) {
    contracts = contracts.filter((c) => c.contractor_id === opts.contractorId);
  }

  if (opts?.workerId) {
    const wid = opts.workerId.toLowerCase();
    contracts = contracts.filter(
      (c) =>
        c.worker_id?.toLowerCase() === wid ||
        c.worker_user_id?.toLowerCase() === wid ||
        c.workers?.id?.toLowerCase() === wid ||
        c.workers?.user_id?.toLowerCase() === wid ||
        c.workers?.internal_worker_id?.toLowerCase() === wid
    );
  }

  if (opts?.projectId) {
    contracts = contracts.filter((c) => c.project_id === opts.projectId);
  }

  // Populate projects and contractors metadata if missing
  return contracts.map((c) => {
    const proj = registry.projects.find((p) => p.id === c.project_id);
    return {
      ...c,
      projects: c.projects || {
        id: c.project_id,
        name: proj?.name || 'Site Project',
        description: proj?.description || null,
      },
    };
  });
}

/**
 * Look up a registered worker by their login ID (SS-W-XXXX-XXXXXX), phone, or name.
 * Returns both profileId and userId for robust relation mapping.
 */
export function lookupLocalWorkerByLoginId(identifier: string): {
  userId: string;
  profileId: string;
  loginId: string;
  fullName: string;
  occupation?: string;
  skillCategory?: string;
} | null {
  try {
    const key = identifier.toLowerCase().trim();

    // Check demo accounts
    if (key === 'ss-w-2026-000001' || key === 'ramesh' || key === 'ramesh kumar') {
      return {
        userId: '11111111-1111-1111-1111-111111111101',
        profileId: '33333333-3333-3333-3333-333333333301',
        loginId: 'SS-W-2026-000001',
        fullName: 'Ramesh Kumar',
        occupation: 'Lead Tile Mason',
        skillCategory: 'SKILLED',
      };
    }
    if (key === 'ss-w-2026-000002' || key === 'sunita' || key === 'sunita devi') {
      return {
        userId: '11111111-1111-1111-1111-111111111110',
        profileId: '33333333-3333-3333-3333-333333333302',
        loginId: 'SS-W-2026-000002',
        fullName: 'Sunita Devi',
        occupation: 'Bar Bender & Steel Worker',
        skillCategory: 'UNSKILLED',
      };
    }

    const usersFile = path.join(process.cwd(), '.registered_users.json');
    if (fs.existsSync(usersFile)) {
      const data = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
      const direct = data[key];
      if (direct) {
        const uId = direct.user?.id || direct.profile?.user_id || randomUUID();
        const pId = direct.profile?.id || direct.profile?.user_id || uId;
        return {
          userId: uId,
          profileId: pId,
          loginId: direct.user?.login_id || direct.profile?.internal_worker_id || identifier.toUpperCase(),
          fullName: direct.profile?.full_name || direct.user?.full_name || identifier,
          occupation: direct.profile?.occupation,
          skillCategory: direct.profile?.skill_category,
        };
      }

      for (const [k, val] of Object.entries(data as Record<string, any>)) {
        if (
          k.toLowerCase() === key ||
          val.user?.login_id?.toLowerCase() === key ||
          val.profile?.internal_worker_id?.toLowerCase() === key ||
          val.user?.id?.toLowerCase() === key ||
          val.profile?.id?.toLowerCase() === key ||
          val.profile?.full_name?.toLowerCase().includes(key) ||
          val.user?.phone === key
        ) {
          const uId = val.user?.id || val.profile?.user_id || randomUUID();
          const pId = val.profile?.id || val.profile?.user_id || uId;
          return {
            userId: uId,
            profileId: pId,
            loginId: val.user?.login_id || val.profile?.internal_worker_id || identifier.toUpperCase(),
            fullName: val.profile?.full_name || val.user?.full_name || identifier,
            occupation: val.profile?.occupation,
            skillCategory: val.profile?.skill_category,
          };
        }
      }
    }

    // Graceful fallback for new worker IDs in dev mode
    const fallbackUid = randomUUID();
    const fallbackPid = randomUUID();
    return {
      userId: fallbackUid,
      profileId: fallbackPid,
      loginId: identifier.toUpperCase().trim(),
      fullName: `Worker (${identifier.toUpperCase().trim()})`,
      occupation: undefined,
      skillCategory: 'SKILLED',
    };
  } catch {
    const fallbackUid = randomUUID();
    const fallbackPid = randomUUID();
    return {
      userId: fallbackUid,
      profileId: fallbackPid,
      loginId: identifier.toUpperCase().trim(),
      fullName: `Worker (${identifier.toUpperCase().trim()})`,
      occupation: undefined,
      skillCategory: 'SKILLED',
    };
  }
}

/**
 * Save an active supervisor/contractor gate token for dev mode.
 */
export function setLocalActiveToken(data: LocalActiveToken): void {
  const registry = loadRegistry();
  if (!registry.activeTokens) registry.activeTokens = {};
  registry.activeTokens[data.projectId] = data;
  // Also store under "default" as most recent token
  registry.activeTokens['latest'] = data;
  saveRegistry(registry);
}

/**
 * Get active gate token for a project or the most recently generated one.
 */
export function getLocalActiveToken(projectId?: string): LocalActiveToken | null {
  const registry = loadRegistry();
  const tokens = registry.activeTokens || {};
  if (projectId && tokens[projectId]) {
    const t = tokens[projectId];
    if (new Date(t.expiresAt).getTime() > Date.now()) return t;
  }
  if (tokens['latest']) {
    const t = tokens['latest'];
    if (new Date(t.expiresAt).getTime() > Date.now()) return t;
  }
  // Find any unexpired token
  for (const t of Object.values(tokens)) {
    if (new Date(t.expiresAt).getTime() > Date.now()) return t;
  }
  return null;
}

/**
 * Look up active token by 6-digit short code.
 */
export function findActiveTokenByShortCode(shortCode: string): LocalActiveToken | null {
  const registry = loadRegistry();
  const tokens = registry.activeTokens || {};
  const cleaned = shortCode.trim();
  for (const t of Object.values(tokens)) {
    if (t.shortCode === cleaned && new Date(t.expiresAt).getTime() > Date.now()) {
      return t;
    }
  }
  return null;
}

/**
 * Record an attendance punch event for local dev mode.
 */
export function recordLocalAttendance(data: {
  workerId: string;
  projectId?: string;
  worksiteId?: string;
  manualCode?: string;
  qrToken?: string;
  punchType?: string;
  date?: string;
  calculatedDistanceMeters?: number;
}): { attendanceEvent: LocalAttendanceEvent; isAlreadyMarked: boolean } {
  const registry = loadRegistry();
  if (!registry.attendance) registry.attendance = [];

  const today = data.date || new Date().toISOString().split('T')[0];
  const method: 'qr' | 'otp' = data.qrToken ? 'qr' : 'otp';

  // Check if worker already has a punch for today
  const existing = registry.attendance.find(
    (a) => a.worker_id === data.workerId && a.date === today && a.punch_type === (data.punchType || 'IN')
  );
  if (existing) {
    return { attendanceEvent: existing, isAlreadyMarked: true };
  }

  // Determine project
  let targetProject: (LocalProject & { worksites: LocalWorksite[] }) | null = null;
  if (data.projectId) {
    targetProject = getLocalProject(data.projectId);
  }
  if (!targetProject) {
    // Check if worker has an active contract
    const contract = registry.contracts.find((c) => c.worker_id === data.workerId && c.status === 'ACTIVE');
    if (contract) {
      targetProject = getLocalProject(contract.project_id);
    }
  }
  if (!targetProject && registry.projects.length > 0) {
    targetProject = getLocalProject(registry.projects[0].id);
  }

  const projName = targetProject?.name || 'Active Construction Site';
  const projId = targetProject?.id || 'dev-project';
  const contractorId = targetProject?.contractor_id || 'dev-contractor';
  const worksite = targetProject?.worksites?.[0];
  const worksiteId = data.worksiteId || worksite?.id || 'dev-worksite';
  const worksiteName = worksite?.name || 'Main Gate';

  // Worker display info
  const workerContracts = registry.contracts.find((c) => c.worker_id === data.workerId);
  const workerInfo = {
    full_name: workerContracts?.workers?.full_name || 'Worker',
    internal_worker_id: workerContracts?.workers?.internal_worker_id,
    skill_category: workerContracts?.workers?.skill_category || 'SKILLED',
  };

  const newEvent: LocalAttendanceEvent = {
    id: randomUUID(),
    worker_id: data.workerId,
    contractor_id: contractorId,
    project_id: projId,
    worksite_id: worksiteId,
    date: today,
    punch_type: data.punchType || 'IN',
    status: 'VERIFIED',
    attendance_method: method,
    calculated_distance_meters: data.calculatedDistanceMeters || 12,
    created_at: new Date().toISOString(),
    projects: { name: projName, code: projId.slice(0, 8).toUpperCase() },
    worksites: { name: worksiteName },
    workers: workerInfo,
  };

  registry.attendance.push(newEvent);
  saveRegistry(registry);

  return { attendanceEvent: newEvent, isAlreadyMarked: false };
}

/**
 * List local attendance events with optional filters.
 */
export function listLocalAttendance(opts?: {
  workerId?: string;
  contractorId?: string;
  projectId?: string;
}): LocalAttendanceEvent[] {
  const registry = loadRegistry();
  let events = registry.attendance || [];
  if (opts?.workerId) {
    events = events.filter((e) => e.worker_id === opts.workerId);
  }
  if (opts?.contractorId) {
    events = events.filter((e) => e.contractor_id === opts.contractorId);
  }
  if (opts?.projectId) {
    events = events.filter((e) => e.project_id === opts.projectId);
  }
  return [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
