import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSensitiveOperation } from '@/lib/auth/audit';
import { generateBilingualContractPdf } from './contract-pdf-service';
import { NotificationService } from './notification-service';
import type { Database, SkillCategoryEnum } from '@/types/database.types';

type ContractStatus = Database['public']['Enums']['contract_status'];
type AcceptanceStatus = Database['public']['Enums']['acceptance_status'];

// ─── State Machine Transition Matrix ──────────────────────────────────────────

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING', 'OFFERED', 'PENDING_ACCEPTANCE', 'REJECTED', 'TERMINATED', 'CANCELLED'],
  OFFERED: ['ACCEPTED', 'REJECTED', 'TERMINATED', 'CANCELLED'],
  PENDING_ACCEPTANCE: ['ACCEPTED', 'REJECTED', 'TERMINATED', 'ACTIVE', 'CANCELLED'],
  PENDING: ['ACCEPTED', 'ACTIVE', 'REJECTED', 'CANCELLED', 'TERMINATED'],
  pending: ['ACCEPTED', 'ACTIVE', 'REJECTED', 'CANCELLED', 'TERMINATED'],
  ACCEPTED: ['ACTIVE', 'COMPLETED', 'ENDED', 'TERMINATED', 'DISPUTED', 'CANCELLED'],
  accepted: ['ACTIVE', 'COMPLETED', 'ENDED', 'TERMINATED', 'DISPUTED', 'CANCELLED'],
  ACTIVE: ['ACCEPTED', 'COMPLETED', 'ENDED', 'TERMINATED', 'DISPUTED', 'CANCELLED'],
  COMPLETED: [],
  TERMINATED: [],
  REJECTED: [],
  rejected: [],
  CANCELLED: [],
  cancelled: [],
  ENDED: [],
  ended: [],
  DISPUTED: ['ACTIVE', 'ACCEPTED', 'COMPLETED', 'ENDED', 'TERMINATED'],
};

/**
 * Validates whether a proposed contract status transition is legal.
 * Throws an error with code 'ILLEGAL_CONTRACT_TRANSITION' if prohibited.
 */
export function validateContractStatusTransition(
  currentStatus: string,
  nextStatus: string
): void {
  const cur = (currentStatus || '').toUpperCase();
  const nxt = (nextStatus || '').toUpperCase();
  if (cur === nxt) return;

  const allowed = VALID_STATUS_TRANSITIONS[cur] || [];
  if (!allowed.includes(nxt)) {
    const err = new Error(
      `ILLEGAL_CONTRACT_TRANSITION: Invalid status transition from '${currentStatus}' to '${nextStatus}'`
    );
    (err as any).code = 'ILLEGAL_CONTRACT_TRANSITION';
    (err as any).statusCode = 400;
    throw err;
  }
}

// ─── Minimum Wage Verification ────────────────────────────────────────────────

export interface ApplicableMinimumWageResult {
  minimumWagePaise: number;
  sourceCitation: string;
  skillTier: string;
  region: string;
  effectiveDate: string;
}

/**
 * Query admin-editable minimum_wages table for applicable legal benchmark.
 * Fallbacks to minimum_wage_rules for backwards compatibility.
 */
export async function getApplicableMinimumWage(params: {
  skillTier: SkillCategoryEnum;
  region: string;
  date?: string;
}): Promise<ApplicableMinimumWageResult | null> {
  const adminClient = createAdminClient();
  const targetDate = params.date || new Date().toISOString().slice(0, 10);

  // 1. Check public.minimum_wages table first
  let wageQuery = adminClient
    .from('minimum_wages')
    .select('*')
    .eq('skill_tier', params.skillTier)
    .eq('is_active', true);

  if (typeof (wageQuery as any).lte === 'function') {
    wageQuery = (wageQuery as any).lte('effective_date', targetDate);
  }
  if (typeof (wageQuery as any).order === 'function') {
    wageQuery = (wageQuery as any).order('effective_date', { ascending: false });
  }

  const { data: wages } = await wageQuery;

  if (wages && wages.length > 0) {
    const match =
      wages.find(
        (w: any) =>
          w.region.toLowerCase().includes(params.region.toLowerCase()) ||
          params.region.toLowerCase().includes(w.region.toLowerCase())
      ) || wages[0];

    if (match) {
      return {
        minimumWagePaise: Number(match.minimum_wage_paise),
        sourceCitation: match.source_citation,
        skillTier: match.skill_tier,
        region: match.region,
        effectiveDate: match.effective_date,
      };
    }
  }

  // 2. Fallback to minimum_wage_rules table
  let rulesQuery = adminClient
    .from('minimum_wage_rules')
    .select('*')
    .eq('skill_level', params.skillTier)
    .eq('is_active', true);

  if (typeof (rulesQuery as any).lte === 'function') {
    rulesQuery = (rulesQuery as any).lte('effective_from', targetDate);
  }
  if (typeof (rulesQuery as any).order === 'function') {
    rulesQuery = (rulesQuery as any).order('effective_from', { ascending: false });
  }

  const { data: rules } = await rulesQuery;

  if (rules && rules.length > 0) {
    const match =
      rules.find(
        (r: any) =>
          (r.district && params.region.toLowerCase().includes(r.district.toLowerCase())) ||
          params.region.toLowerCase().includes(r.state.toLowerCase())
      ) || rules[0];

    if (match) {
      return {
        minimumWagePaise: Number(match.minimum_amount_paise),
        sourceCitation: match.source_reference,
        skillTier: match.skill_level,
        region: match.district || match.state,
        effectiveDate: match.effective_from,
      };
    }
  }

  return null;
}

// ─── Worker Profile Management ────────────────────────────────────────────────

export async function updateWorkerProfile(
  workerId: string,
  actorUserId: string,
  updates: {
    fullName?: string;
    occupation?: string;
    skillCategory?: SkillCategoryEnum;
    emergencyContact?: string | null;
    profilePhotoUrl?: string | null;
  }
) {
  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from('workers')
    .select('*')
    .eq('id', workerId)
    .single();

  if (fetchErr || !existing) {
    throw new Error('Worker profile not found');
  }

  const payload: Partial<Database['public']['Tables']['workers']['Update']> = {};
  if (updates.fullName !== undefined) payload.full_name = updates.fullName;
  if (updates.occupation !== undefined) payload.occupation = updates.occupation;
  if (updates.skillCategory !== undefined) payload.skill_category = updates.skillCategory;
  if (updates.emergencyContact !== undefined) payload.emergency_contact = updates.emergencyContact;
  if (updates.profilePhotoUrl !== undefined) payload.profile_photo_url = updates.profilePhotoUrl;

  const { data: updated, error: updateErr } = await adminClient
    .from('workers')
    .update(payload)
    .eq('id', workerId)
    .select()
    .single();

  if (updateErr) {
    throw new Error(`Failed to update worker profile: ${updateErr.message}`);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'WORKER_PROFILE_UPDATED',
    entityType: 'workers',
    entityId: workerId,
    beforeState: existing,
    afterState: updated,
  });

  return updated;
}

export async function createWorksite(
  actorUserId: string,
  params: {
    projectId: string;
    name: string;
    latitude: number;
    longitude: number;
    allowedRadiusMeters: number;
    address: string;
    city: string;
    state: string;
    pincode?: string | null;
  }
) {
  if (params.latitude < -90 || params.latitude > 90) {
    throw new Error('Invalid latitude. Must be between -90 and 90 degrees.');
  }
  if (params.longitude < -180 || params.longitude > 180) {
    throw new Error('Invalid longitude. Must be between -180 and 180 degrees.');
  }
  if (params.allowedRadiusMeters <= 0) {
    throw new Error('Allowed radius must be greater than 0 meters.');
  }

  const adminClient = createAdminClient();

  const { data: worksite, error } = await adminClient
    .from('worksites')
    .insert({
      project_id: params.projectId,
      name: params.name,
      latitude: params.latitude,
      longitude: params.longitude,
      allowed_radius_meters: params.allowedRadiusMeters,
      address: params.address,
      city: params.city,
      state: params.state,
      pincode: params.pincode || null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create worksite: ${error.message}`);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'WORKSITE_CREATED',
    entityType: 'worksites',
    entityId: worksite.id,
    afterState: worksite,
  });

  return worksite;
}

// ─── Contract Lifecycle & State Machine ───────────────────────────────────────

/**
 * SERVICE: Create Digital Work Contract with:
 *  - Worker resolution by Phone or ID
 *  - Server-side Minimum Wage Check (Blocks or flags underpayment)
 *  - Cryptographic Terms Hash (SHA-256)
 *  - State Machine initial status: 'DRAFT' or 'OFFERED'
 */
export async function createWorkContract(
  actorUserId: string,
  params: {
    workerId?: string;
    workerPhone?: string;
    contractorId: string;
    projectId: string;
    worksiteId: string;
    workType: string;
    dailyWage: number; // in integer paise (or raw rupees normalized)
    expectedWorkingHours?: number;
    paymentFrequency?: Database['public']['Enums']['payment_frequency'];
    startDate: string;
    endDate?: string | null;
    terms?: Record<string, any>;
    initialStatus?: 'DRAFT' | 'OFFERED' | 'PENDING_ACCEPTANCE' | 'ACTIVE';
    blockBelowMinimum?: boolean;
  }
) {
  const adminClient = createAdminClient();

  // 1. Resolve Worker (by phone or ID)
  let resolvedWorkerId = params.workerId;
  let workerSkillCategory: SkillCategoryEnum = 'UNSKILLED';

  if (!resolvedWorkerId && params.workerPhone) {
    const cleanPhone = params.workerPhone.replace(/[^\d+]/g, '');
    const { data: userRec } = await adminClient
      .from('users')
      .select('id, phone')
      .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone.replace('+91', '')}`)
      .maybeSingle();

    if (userRec) {
      const { data: wRec } = await adminClient
        .from('workers')
        .select('id, skill_category')
        .eq('user_id', userRec.id)
        .maybeSingle();

      if (wRec) {
        resolvedWorkerId = wRec.id;
        workerSkillCategory = wRec.skill_category;
      }
    }
  } else if (resolvedWorkerId) {
    const { data: wRec } = await adminClient
      .from('workers')
      .select('id, skill_category')
      .eq('id', resolvedWorkerId)
      .maybeSingle();

    if (wRec) {
      workerSkillCategory = wRec.skill_category;
    }
  }

  if (!resolvedWorkerId) {
    throw new Error(
      params.workerPhone
        ? `Worker with phone '${params.workerPhone}' not found.`
        : 'Worker ID or valid worker phone is required.'
    );
  }

  // 2. Resolve Worksites / Region for statutory check
  const { data: worksite } = await adminClient
    .from('worksites')
    .select('id, city, state')
    .eq('id', params.worksiteId)
    .maybeSingle();

  const region = worksite?.city || worksite?.state || 'Mumbai Suburban';

  // 3. Normalize Wage to Integer Paise
  const dailyWagePaise =
    params.dailyWage < 10000 ? Math.round(params.dailyWage * 100) : Math.round(params.dailyWage);

  // 4. Server-Side Minimum Wage Verification
  const minWageBenchmark = await getApplicableMinimumWage({
    skillTier: workerSkillCategory,
    region,
    date: params.startDate,
  });

  const shouldBlock = params.blockBelowMinimum !== false;
  if (minWageBenchmark && dailyWagePaise < minWageBenchmark.minimumWagePaise) {
    const shortfallRupees = (minWageBenchmark.minimumWagePaise - dailyWagePaise) / 100;
    const msg =
      `Statutory minimum wage violation: Offered daily wage of ₹${dailyWagePaise / 100} ` +
      `is below the statutory benchmark of ₹${minWageBenchmark.minimumWagePaise / 100} ` +
      `for ${minWageBenchmark.skillTier} workers in ${minWageBenchmark.region} ` +
      `(Shortfall: ₹${shortfallRupees}) as per ${minWageBenchmark.sourceCitation}. Contract blocked.`;

    if (shouldBlock) {
      const err = new Error(msg);
      (err as any).code = 'MINIMUM_WAGE_VIOLATION';
      (err as any).statusCode = 422;
      (err as any).benchmark = minWageBenchmark;
      throw err;
    }
  }

  const contractCode = `CTR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  const status: ContractStatus = params.initialStatus || 'OFFERED';

  // 5. Cryptographic Terms Hash
  const termsPayload = {
    contractCode,
    workerId: resolvedWorkerId,
    contractorId: params.contractorId,
    projectId: params.projectId,
    worksiteId: params.worksiteId,
    workType: params.workType,
    dailyWage: dailyWagePaise,
    expectedWorkingHours: params.expectedWorkingHours || 8.0,
    paymentFrequency: params.paymentFrequency || 'DAILY',
    startDate: params.startDate,
    endDate: params.endDate || null,
    terms: params.terms || {},
  };
  const termsHash = crypto.createHash('sha256').update(JSON.stringify(termsPayload)).digest('hex');

  // 6. Insert Work Contract
  const { data: contract, error } = await adminClient
    .from('work_contracts')
    .insert({
      contract_code: contractCode,
      worker_id: resolvedWorkerId,
      contractor_id: params.contractorId,
      project_id: params.projectId,
      worksite_id: params.worksiteId,
      work_type: params.workType,
      daily_wage: dailyWagePaise,
      expected_working_hours: params.expectedWorkingHours || 8.0,
      payment_frequency: params.paymentFrequency || 'DAILY',
      start_date: params.startDate,
      end_date: params.endDate || null,
      status,
      terms_hash: termsHash,
      current_version_number: 1,
    })
    .select()
    .single();

  if (error || !contract) {
    throw new Error(`Contract creation failed: ${error?.message}`);
  }

  // 7. Insert Initial Contract Version Snapshot (Version 1)
  const { data: version, error: versionErr } = await adminClient
    .from('contract_versions')
    .insert({
      contract_id: contract.id,
      version_number: 1,
      daily_wage: dailyWagePaise,
      expected_working_hours: contract.expected_working_hours,
      payment_frequency: contract.payment_frequency,
      work_type: contract.work_type,
      effective_date: contract.start_date,
      change_reason: 'Initial contract creation',
      terms_snapshot: termsPayload,
      created_by: actorUserId,
    })
    .select()
    .single();

  if (versionErr) {
    console.error('Failed to insert initial contract version snapshot:', versionErr.message);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'CONTRACT_CREATED',
    entityType: 'work_contracts',
    entityId: contract.id,
    afterState: contract,
  });

  return { contract, version, termsHash };
}

/**
 * SERVICE: Offer Contract (DRAFT -> OFFERED).
 */
export async function offerContract(contractId: string, actorUserId: string) {
  const adminClient = createAdminClient();

  const { data: contract, error: fetchErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (fetchErr || !contract) {
    throw new Error('Contract not found');
  }

  validateContractStatusTransition(contract.status, 'OFFERED');

  const { data: updated, error } = await adminClient
    .from('work_contracts')
    .update({ status: 'OFFERED' })
    .eq('id', contractId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to offer contract: ${error.message}`);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'CONTRACT_OFFERED',
    entityType: 'work_contracts',
    entityId: contractId,
    beforeState: { status: contract.status },
    afterState: { status: updated.status },
  });

  return updated;
}

export async function submitContract(contractId: string, actorUserId: string) {
  return offerContract(contractId, actorUserId);
}

/**
 * SERVICE: Create Contract Version (Immutable Versioning).
 */
export async function createContractVersion(
  contractId: string,
  actorUserId: string,
  updates: {
    dailyWage?: number;
    expectedWorkingHours?: number;
    paymentFrequency?: Database['public']['Enums']['payment_frequency'];
    workType?: string;
    effectiveDate: string;
    changeReason: string;
  }
) {
  const adminClient = createAdminClient();

  const { data: contract, error: fetchErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (fetchErr || !contract) {
    throw new Error('Contract not found');
  }

  const nextVersionNumber = contract.current_version_number + 1;
  const newWage = updates.dailyWage ?? contract.daily_wage;
  const newHours = updates.expectedWorkingHours ?? contract.expected_working_hours;
  const newFreq = updates.paymentFrequency ?? contract.payment_frequency;
  const newType = updates.workType ?? contract.work_type;

  const { data: versionRow, error: versionErr } = await adminClient
    .from('contract_versions')
    .insert({
      contract_id: contract.id,
      version_number: nextVersionNumber,
      daily_wage: newWage,
      expected_working_hours: newHours,
      payment_frequency: newFreq,
      work_type: newType,
      effective_date: updates.effectiveDate,
      change_reason: updates.changeReason,
      terms_snapshot: {
        previousTerms: {
          dailyWage: contract.daily_wage,
          expectedWorkingHours: contract.expected_working_hours,
          paymentFrequency: contract.payment_frequency,
          workType: contract.work_type,
        },
        newTerms: {
          dailyWage: newWage,
          expectedWorkingHours: newHours,
          paymentFrequency: newFreq,
          workType: newType,
        },
      },
      created_by: actorUserId,
    })
    .select()
    .single();

  if (versionErr || !versionRow) {
    throw new Error(`Failed to create contract version: ${versionErr?.message}`);
  }

  // Re-requires worker acceptance for term modifications
  const { data: updatedContract, error: contractErr } = await adminClient
    .from('work_contracts')
    .update({
      daily_wage: newWage,
      expected_working_hours: newHours,
      payment_frequency: newFreq,
      work_type: newType,
      current_version_number: nextVersionNumber,
      status: 'OFFERED',
    })
    .eq('id', contractId)
    .select()
    .single();

  if (contractErr) {
    throw new Error(`Failed to update contract version metadata: ${contractErr.message}`);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'CONTRACT_MODIFIED_NEW_VERSION',
    entityType: 'contract_versions',
    entityId: versionRow.id,
    beforeState: contract,
    afterState: updatedContract,
  });

  return { contract: updatedContract, version: versionRow };
}

/**
 * SERVICE: Worker Contract Response (OFFERED -> ACCEPTED / REJECTED).
 *
 * Exact Audit Evidentiary Trail:
 *  - Timestamp (ISO)
 *  - IP Hash (SHA-256)
 *  - Device Info
 *  - Cryptographic Terms Hash (SHA-256)
 *  - Contract Bilingual PDF Generation
 */
export async function respondToContract(
  contractId: string,
  workerUserId: string,
  response: AcceptanceStatus,
  metadata?: {
    rejectionReason?: string;
    ipAddress?: string;
    userAgent?: string;
  }
) {
  const adminClient = createAdminClient();

  // 1. Fetch worker profile
  const { data: worker, error: workerErr } = await adminClient
    .from('workers')
    .select('*')
    .eq('user_id', workerUserId)
    .single();

  if (workerErr || !worker) {
    throw new Error('Worker profile not found for authenticated user');
  }

  // 2. Fetch contract
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (contractErr || !contract) {
    throw new Error('Work contract not found');
  }

  if (contract.worker_id !== worker.id) {
    throw new Error('Unauthorized: Worker cannot respond to another worker contract.');
  }

  // Idempotency: if already in the target status, return existing record
  const currentUpper = String(contract.status).toUpperCase();
  if (response === 'ACCEPTED' && (currentUpper === 'ACCEPTED' || currentUpper === 'ACTIVE')) {
    return { contract, acceptance: null, employmentRelationship: null };
  }
  if (response === 'REJECTED' && currentUpper === 'REJECTED') {
    return { contract, acceptance: null, employmentRelationship: null };
  }

  // Check state machine transition
  const nextStatus = response === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED';
  validateContractStatusTransition(contract.status, nextStatus);

  // Fetch or resolve active contract version ID
  let { data: versionRow } = await adminClient
    .from('contract_versions')
    .select('*')
    .eq('contract_id', contract.id)
    .eq('version_number', contract.current_version_number)
    .maybeSingle();

  if (!versionRow) {
    const { data: newVer } = await adminClient
      .from('contract_versions')
      .insert({
        contract_id: contract.id,
        version_number: contract.current_version_number,
        daily_wage: contract.daily_wage,
        expected_working_hours: contract.expected_working_hours,
        payment_frequency: contract.payment_frequency,
        work_type: contract.work_type,
        effective_date: contract.start_date,
        change_reason: 'Version snapshot at worker response time',
        created_by: workerUserId,
      })
      .select()
      .single();
    versionRow = newVer;
  }

  const versionId = versionRow?.id || '00000000-0000-0000-0000-000000000000';

  // 3. Compute Tamper-Evident Evidence Hashes
  const ipHash = crypto
    .createHash('sha256')
    .update(metadata?.ipAddress || '127.0.0.1')
    .digest('hex');

  const deviceInfo = metadata?.userAgent || 'Standard Browser Client';

  const termsPayload = {
    contractId: contract.id,
    dailyWage: contract.daily_wage,
    expectedWorkingHours: contract.expected_working_hours,
    paymentFrequency: contract.payment_frequency,
    workType: contract.work_type,
    startDate: contract.start_date,
    endDate: contract.end_date,
    contractorId: contract.contractor_id,
    workerId: contract.worker_id,
  };
  const termsHash =
    contract.terms_hash ||
    crypto.createHash('sha256').update(JSON.stringify(termsPayload)).digest('hex');

  // 4. Record Acceptance
  const { data: acceptance, error: acceptErr } = await adminClient
    .from('contract_acceptances')
    .insert({
      contract_id: contract.id,
      contract_version_id: versionId,
      worker_id: worker.id,
      response,
      rejection_reason: metadata?.rejectionReason || null,
      ip_address: metadata?.ipAddress || null,
      user_agent: metadata?.userAgent || null,
      ip_hash: ipHash,
      device_info: deviceInfo,
      terms_hash: termsHash,
      contract_pdf_url: `/api/contracts/${contract.id}/pdf`,
    })
    .select()
    .single();

  if (acceptErr) {
    throw new Error(`Failed to record contract response: ${acceptErr.message}`);
  }

  const respondedAt = new Date().toISOString();

  // Contractor profile for notification
  const { data: contractorRow } = await adminClient
    .from('contractors')
    .select('user_id')
    .eq('id', contract.contractor_id)
    .maybeSingle();

  if (response === 'REJECTED') {
    const { data: rejectedContract } = await adminClient
      .from('work_contracts')
      .update({
        status: 'REJECTED',
        responded_at: respondedAt,
        rejection_reason: metadata?.rejectionReason || null,
      })
      .eq('id', contract.id)
      .select('*, projects(*)')
      .single();

    await logSensitiveOperation({
      actorId: workerUserId,
      action: 'CONTRACT_REJECTED',
      entityType: 'work_contracts',
      entityId: contract.id,
      afterState: { rejectionReason: metadata?.rejectionReason },
    });

    if (contractorRow?.user_id) {
      const pName = (rejectedContract as any)?.projects?.name || 'Project';
      await NotificationService.createNotification({
        userId: contractorRow.user_id,
        role: 'CONTRACTOR',
        type: 'ASSIGNMENT_REJECTED',
        title: 'Worker Declined Assignment',
        message: `${worker.full_name || 'Worker'} declined the assignment for ${pName}.${metadata?.rejectionReason ? ` Reason: ${metadata.rejectionReason}` : ''}`,
        titleKey: 'notifications.assignment_rejected_title',
        bodyKey: 'notifications.assignment_rejected_body',
        payload: {
          contractId: contract.id,
          projectId: contract.project_id,
          workerId: worker.id,
          workerName: worker.full_name,
          reason: metadata?.rejectionReason || null,
        },
      }).catch(() => {});
    }

    return { contract: rejectedContract, acceptance, employmentRelationship: null };
  }

  // 5. Response is ACCEPTED -> Update status to 'ACCEPTED'
  const { data: acceptedContract, error: acceptContractErr } = await adminClient
    .from('work_contracts')
    .update({
      status: 'ACCEPTED',
      responded_at: respondedAt,
      terms_hash: termsHash,
      contract_pdf_url: `/api/contracts/${contract.id}/pdf`,
    })
    .eq('id', contract.id)
    .select('*, projects(*)')
    .single();

  if (acceptContractErr || !acceptedContract) {
    throw new Error(`Failed to record contract acceptance: ${acceptContractErr?.message}`);
  }

  await logSensitiveOperation({
    actorId: workerUserId,
    action: 'CONTRACT_ACCEPTED',
    entityType: 'work_contracts',
    entityId: contract.id,
    afterState: acceptedContract,
  });

  if (contractorRow?.user_id) {
    const pName = (acceptedContract as any)?.projects?.name || 'Project';
    await NotificationService.createNotification({
      userId: contractorRow.user_id,
      role: 'CONTRACTOR',
      type: 'ASSIGNMENT_ACCEPTED',
      title: 'Worker Accepted Assignment',
      message: `${worker.full_name || 'Worker'} accepted the assignment for ${pName}.`,
      titleKey: 'notifications.assignment_accepted_title',
      bodyKey: 'notifications.assignment_accepted_body',
      payload: {
        contractId: contract.id,
        projectId: contract.project_id,
        workerId: worker.id,
        workerName: worker.full_name,
      },
    }).catch(() => {});
  }

  return { contract: acceptedContract, acceptance, employmentRelationship: null };
}

/**
 * SERVICE: Activate Contract (ACCEPTED -> ACTIVE).
 * Activates contract and creates or confirms ACTIVE employment_relationships.
 */
export async function activateContract(contractId: string, actorUserId: string) {
  const adminClient = createAdminClient();

  const { data: contract, error: fetchErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (fetchErr || !contract) {
    throw new Error('Contract not found');
  }

  validateContractStatusTransition(contract.status, 'ACTIVE');

  // Transition to ACTIVE
  const { data: activeContract, error: activateErr } = await adminClient
    .from('work_contracts')
    .update({ status: 'ACTIVE' })
    .eq('id', contractId)
    .select()
    .single();

  if (activateErr || !activeContract) {
    throw new Error(`Failed to activate contract: ${activateErr?.message}`);
  }

  // Fetch acceptance row
  const { data: acceptance } = await adminClient
    .from('contract_acceptances')
    .select('*')
    .eq('contract_id', contractId)
    .eq('response', 'ACCEPTED')
    .order('responded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Create or update employment relationship
  const { data: existingRel } = await adminClient
    .from('employment_relationships')
    .select('id')
    .eq('contract_id', contractId)
    .maybeSingle();

  let employmentRelationship = existingRel;
  if (!existingRel) {
    const { data: newRel, error: empErr } = await adminClient
      .from('employment_relationships')
      .insert({
        worker_id: contract.worker_id,
        contractor_id: contract.contractor_id,
        project_id: contract.project_id,
        contract_id: contract.id,
        contract_version_id: acceptance?.contract_version_id || '00000000-0000-0000-0000-000000000000',
        acceptance_id: acceptance?.id || '00000000-0000-0000-0000-000000000000',
        status: 'ACTIVE',
        acceptance_timestamp: acceptance?.responded_at || new Date().toISOString(),
        start_date: contract.start_date,
        end_date: contract.end_date,
      })
      .select()
      .single();

    if (empErr) {
      throw new Error(`Failed to establish employment relationship: ${empErr.message}`);
    }
    employmentRelationship = newRel;
  } else {
    await adminClient
      .from('employment_relationships')
      .update({ status: 'ACTIVE' })
      .eq('id', existingRel.id);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'EMPLOYMENT_ACTIVATED',
    entityType: 'employment_relationships',
    entityId: employmentRelationship?.id || contractId,
    afterState: { contractStatus: 'ACTIVE' },
  });

  return { contract: activeContract, employmentRelationship };
}

/**
 * SERVICE: Complete Contract (ACTIVE -> COMPLETED).
 */
export async function completeContract(contractId: string, actorUserId: string) {
  const adminClient = createAdminClient();

  const { data: contract, error: fetchErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (fetchErr || !contract) {
    throw new Error('Contract not found');
  }

  validateContractStatusTransition(contract.status, 'COMPLETED');

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: completedContract, error: compErr } = await adminClient
    .from('work_contracts')
    .update({
      status: 'COMPLETED',
      end_date: contract.end_date || todayStr,
    })
    .eq('id', contractId)
    .select()
    .single();

  if (compErr || !completedContract) {
    throw new Error(`Failed to complete contract: ${compErr?.message}`);
  }

  await adminClient
    .from('employment_relationships')
    .update({ status: 'COMPLETED', end_date: contract.end_date || todayStr })
    .eq('contract_id', contractId);

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'CONTRACT_COMPLETED',
    entityType: 'work_contracts',
    entityId: contractId,
    afterState: completedContract,
  });

  return completedContract;
}

/**
 * SERVICE: Terminate Contract (ACTIVE / OFFERED -> TERMINATED).
 */
export async function terminateContract(
  contractId: string,
  actorUserId: string,
  reason = 'Terminated by contractor or administrator'
) {
  const adminClient = createAdminClient();

  const { data: contract, error: fetchErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (fetchErr || !contract) {
    throw new Error('Contract not found');
  }

  validateContractStatusTransition(contract.status, 'TERMINATED');

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: terminatedContract, error: termErr } = await adminClient
    .from('work_contracts')
    .update({
      status: 'TERMINATED',
      end_date: contract.end_date || todayStr,
    })
    .eq('id', contractId)
    .select()
    .single();

  if (termErr || !terminatedContract) {
    throw new Error(`Failed to terminate contract: ${termErr?.message}`);
  }

  await adminClient
    .from('employment_relationships')
    .update({ status: 'TERMINATED', end_date: contract.end_date || todayStr })
    .eq('contract_id', contractId);

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'CONTRACT_TERMINATED',
    entityType: 'work_contracts',
    entityId: contractId,
    afterState: { status: 'TERMINATED', reason },
  });

  return terminatedContract;
}

/**
 * SERVICE: Cancel Assignment Invitation (PENDING -> CANCELLED).
 * Only the contractor who issued the invitation or an administrator can cancel.
 */
export async function cancelAssignment(contractId: string, actorUserId: string) {
  const adminClient = createAdminClient();

  const { data: contractor } = await adminClient
    .from('contractors')
    .select('id')
    .eq('user_id', actorUserId)
    .maybeSingle();

  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('*, workers(*), projects(*)')
    .eq('id', contractId)
    .single();

  if (contractErr || !contract) {
    throw new Error('Work contract not found');
  }

  if (contractor && contract.contractor_id !== contractor.id) {
    throw new Error('Unauthorized: Only the contractor who issued this assignment can cancel it.');
  }

  const currentUpper = String(contract.status).toUpperCase();
  // Idempotency: if already cancelled, return existing
  if (currentUpper === 'CANCELLED') {
    return { contract };
  }

  if (currentUpper !== 'PENDING' && currentUpper !== 'OFFERED' && currentUpper !== 'PENDING_ACCEPTANCE') {
    throw new Error(`Cannot cancel assignment: current status is '${contract.status}'. Only pending invitations can be cancelled.`);
  }

  const respondedAt = new Date().toISOString();
  const { data: updatedContract, error: updateErr } = await adminClient
    .from('work_contracts')
    .update({
      status: 'CANCELLED',
      responded_at: respondedAt,
    })
    .eq('id', contract.id)
    .select('*, workers(*), projects(*)')
    .single();

  if (updateErr || !updatedContract) {
    throw new Error(`Failed to cancel assignment: ${updateErr?.message}`);
  }

  await logSensitiveOperation({
    actorId: actorUserId,
    action: 'CONTRACT_CANCELLED',
    entityType: 'work_contracts',
    entityId: contract.id,
    afterState: updatedContract,
  });

  if (contract.workers?.user_id) {
    const projectName = contract.projects?.name || 'Project';
    await NotificationService.createNotification({
      userId: contract.workers.user_id,
      role: 'WORKER',
      type: 'ASSIGNMENT_CANCELLED',
      title: 'Assignment Invite Cancelled',
      message: `The assignment invitation for ${projectName} has been cancelled by the contractor.`,
      titleKey: 'notifications.assignment_cancelled_title',
      bodyKey: 'notifications.assignment_cancelled_body',
      payload: {
        contractId: contract.id,
        projectId: contract.project_id,
      },
    }).catch(() => {});
  }

  return { contract: updatedContract };
}

