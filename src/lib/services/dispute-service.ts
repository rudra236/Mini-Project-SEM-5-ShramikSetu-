import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditEvent, recordAuditLog } from './audit-service';
import { recordDisputeReversalEntry } from './ledger-service';
import { NotificationService } from './notification-service';
import { rupeesToPaise, paiseToRupees } from '@/types/payment.types';
import type {
  DisputeCategoryEnum,
  DisputeStatusEnum,
  DisputePriorityEnum,
  DisputeRow,
  DisputeEvidenceSnapshotRow,
  DisputeResolutionRow,
  DisputeResponseRecord,
  DisputeMessageRecord,
  DisputeEvidenceRecord,
  DisputeStatusHistoryRecord,
  UserRole,
} from '@/types/database.types';

// ─── Error Class ──────────────────────────────────────────────────────────────

export class DisputeServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'DISPUTE_SERVICE_ERROR') {
    super(message);
    this.name = 'DisputeServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CalculateDisputeAmountsParams {
  contractId: string;
  periodFrom: string; // 'YYYY-MM-DD'
  periodTo: string;   // 'YYYY-MM-DD'
}

export interface CalculatedDisputeAmounts {
  contractId: string;
  periodFrom: string;
  periodTo: string;
  dailyWagePaise: number;
  verifiedAttendanceDaysCount: number;
  earnedPaise: number;
  paidPaise: number;
  shortfallPaise: number;
}

export interface CreateDisputeParams {
  workerId: string;
  contractorId?: string;
  projectId?: string;
  contractId: string;
  category: DisputeCategoryEnum;
  periodFrom?: string;
  periodTo?: string;
  description: string;
  priority?: DisputePriorityEnum;
  raisedByUserId: string;
  claimedPaise?: number;
  amountClaimedPaise?: number;
  claimedJustification?: string | null;
  evidencePhotoUrl?: string | null;
  evidenceVoiceUrl?: string | null;
  voiceTranscription?: string | null;
  linkedAttendanceEventIds?: string[];
  linkedLedgerEntryIds?: string[];
}

export interface AutomatedDisputeAnalysis {
  category: DisputeCategoryEnum;
  dailyWagePaise: number;
  dailyWageRupees: number;
  verifiedAttendanceDaysCount: number;
  totalEarnedPaise: number;
  totalEarnedRupees: number;
  totalPaidPaise: number;
  totalPaidRupees: number;
  outstandingPaise: number;
  outstandingRupees: number;
  discrepancyType: string;
  hasDiscrepancy: boolean;
  analysisSummary: string;
  recommendedAction: string;
  analyzedAt: string;
}

export interface CreateDisputeResult {
  dispute: DisputeRow;
  evidenceSnapshot: any;
  automatedAnalysis: any;
}

export interface ContractorDisputeResponseParams {
  disputeId: string;
  contractorUserId: string;
  type: 'accept_and_pay' | 'deduction_claimed' | 'reject';
  deductionReason?: 'late_arrival' | 'incomplete_work' | 'advance_recovery' | 'other';
  deductionAmountPaise?: number;
  message: string;
}

export interface IssueInspectorRulingParams {
  disputeId: string;
  rulingDecision: 'DISMISS' | 'ORDER_PAYMENT' | 'PARTIAL_SETTLEMENT';
  reason: string;
  resolutionNotes?: string;
  orderedAmountPaise?: number;
  deadlineDays?: number;
  reviewerUserId: string;
  reviewerRole: UserRole;
}

export interface ResolveDisputeParams {
  disputeId: string;
  decision: 'RESOLVED' | 'REJECTED';
  reason: string;
  resolutionNotes?: string;
  reviewerUserId: string;
  reviewerRole: UserRole;
}

// ─── Rate Limiter (In-Memory) ─────────────────────────────────────────────────

const recentDisputeCreations = new Map<string, number[]>();
const recentMessages = new Map<string, number[]>();

function checkRateLimit(map: Map<string, number[]>, key: string, maxCount: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (map.get(key) || []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxCount) {
    return false;
  }
  timestamps.push(now);
  map.set(key, timestamps);
  return true;
}

// ─── Storage & Signed URL Helpers ─────────────────────────────────────────────

const PRIVATE_STORAGE_DIR = path.resolve(process.cwd(), 'private_storage', 'disputes');
const SIGNING_SECRET = process.env.STORAGE_SIGNING_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'shramiksetu-private-storage-key';

export function createSignedEvidenceToken(evidenceId: string, disputeId: string, expiresInSeconds = 900): { token: string; expires: number } {
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${evidenceId}:${disputeId}:${expires}`;
  const hmac = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  return { token: hmac, expires };
}

export function verifySignedEvidenceToken(evidenceId: string, disputeId: string, expires: number, token: string): boolean {
  if (Math.floor(Date.now() / 1000) > expires) return false;
  const payload = `${evidenceId}:${disputeId}:${expires}`;
  const expectedHmac = crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expectedHmac));
  } catch {
    return false;
  }
}

// ─── Reference Generator ───────────────────────────────────────────────────────

/**
 * Generates SS-D-YYYY-XXXXXX reference with collision retry
 */
export async function generateDisputeReference(): Promise<string> {
  const adminClient = createAdminClient();
  const year = new Date().getFullYear();
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  for (let attempt = 0; attempt < 10; attempt++) {
    let randCode = '';
    for (let i = 0; i < 6; i++) {
      randCode += chars[Math.floor(Math.random() * chars.length)];
    }
    const ref = `SS-D-${year}-${randCode}`;

    const { data: existing } = await adminClient
      .from('disputes')
      .select('id')
      .or(`reference.eq.${ref},dispute_ref.eq.${ref}`)
      .maybeSingle();

    if (!existing) {
      return ref;
    }
  }

  // Fallback with timestamp slice
  return `SS-D-${year}-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

// ─── Financial Calculation Engine ─────────────────────────────────────────────

/**
 * Server-side computation of earned_paise, paid_paise, and shortfall_paise for a contract and period.
 * Attendance: count of verified attendance events * daily_wage_paise.
 * Ledger/Payments: sum of confirmed payment transactions in the period.
 * Shortfall: Math.max(0, earned - paid).
 */
export async function calculateDisputeAmounts(params: CalculateDisputeAmountsParams): Promise<CalculatedDisputeAmounts> {
  const adminClient = createAdminClient();

  if (!params.periodFrom || !params.periodTo) {
    throw new DisputeServiceError('periodFrom and periodTo dates are required.', 400, 'INVALID_PERIOD');
  }

  if (params.periodTo < params.periodFrom) {
    throw new DisputeServiceError('periodTo date cannot be earlier than periodFrom date.', 400, 'INVALID_PERIOD_ORDER');
  }

  // 1. Fetch contract
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new DisputeServiceError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  let dailyWagePaise = 0;
  if ((contract as any).daily_wage_paise) {
    dailyWagePaise = Number((contract as any).daily_wage_paise);
  } else if (contract.daily_wage) {
    const rawVal = Number(contract.daily_wage);
    dailyWagePaise = rawVal >= 10000 ? rawVal : rupeesToPaise(rawVal);
  }

  // 2. Fetch verified attendance events in the period
  const { data: attendanceEvents, error: attErr } = await adminClient
    .from('attendance_events')
    .select('id, date, status')
    .eq('contract_id', params.contractId)
    .gte('date', params.periodFrom)
    .lte('date', params.periodTo);

  if (attErr) {
    throw new DisputeServiceError(`Failed to fetch attendance records: ${attErr.message}`, 500);
  }

  const verifiedAttendanceEvents = (attendanceEvents || []).filter((a: any) => a.status === 'VERIFIED');
  const verifiedAttendanceDaysCount = verifiedAttendanceEvents.length;
  const earnedPaise = verifiedAttendanceDaysCount * dailyWagePaise;

  // 3. Fetch confirmed ledger payment transactions in the period
  const { data: payments, error: payErr } = await adminClient
    .from('payment_transactions')
    .select('id, amount_paise, status, created_at, claimed_at')
    .eq('contract_id', params.contractId)
    .in('status', ['SUCCESS', 'PAID_CLAIMED', 'WORKER_CONFIRMED']);

  if (payErr) {
    throw new DisputeServiceError(`Failed to fetch payment records: ${payErr.message}`, 500);
  }

  // Filter payments falling within the period date range
  const filteredPayments = (payments || []).filter((p: any) => {
    const rawDate = p.claimed_at || p.created_at;
    if (!rawDate) return false;
    const pDate = new Date(rawDate).toISOString().slice(0, 10);
    return pDate >= params.periodFrom && pDate <= params.periodTo;
  });

  const paidPaise = filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amount_paise || 0), 0);
  const shortfallPaise = Math.max(0, earnedPaise - paidPaise);

  return {
    contractId: params.contractId,
    periodFrom: params.periodFrom,
    periodTo: params.periodTo,
    dailyWagePaise,
    verifiedAttendanceDaysCount,
    earnedPaise,
    paidPaise,
    shortfallPaise,
  };
}

// ─── Single Source of Truth Count Query ──────────────────────────────────────

export async function getOpenDisputesCount(filters?: {
  contractorId?: string;
  projectId?: string;
}): Promise<number> {
  const adminClient = createAdminClient();
  let query = adminClient
    .from('disputes')
    .select('id, status', { count: 'exact' });

  if (filters?.contractorId) {
    query = query.eq('contractor_id', filters.contractorId);
  }
  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId);
  }

  const { data, error } = await query;
  if (error) {
    throw new DisputeServiceError(`Failed to fetch open disputes count: ${error.message}`);
  }

  const openStatuses = new Set(['open', 'responded', 'OPEN', 'UNDER_REVIEW', 'WAITING_FOR_INFORMATION']);
  const matched = (data || []).filter((d: any) => openStatuses.has(d.status));
  return matched.length;
}

// ─── Create Dispute ───────────────────────────────────────────────────────────

/**
 * Creates a dispute strictly computed server-side:
 * - Rejects if contract is not owned by worker or not accepted/ended.
 * - Computes earned, paid, shortfall from attendance & ledger.
 * - Client-sent amounts are ignored.
 * - Rejects if shortfall = 0 for payment-type categories.
 * - Blocks duplicate active disputes with overlapping period.
 * - Enforces claimed <= shortfall unless justified.
 * - Appends dispute_status_history.
 * - Sends notification to contractor.
 */
export async function createDispute(params: CreateDisputeParams): Promise<CreateDisputeResult> {
  const adminClient = createAdminClient();

  // Rate limit: max 50 disputes per minute per user
  if (!checkRateLimit(recentDisputeCreations, params.raisedByUserId, 50, 60_000)) {
    throw new DisputeServiceError('Too many disputes filed. Please wait a minute before lodging another dispute.', 429, 'RATE_LIMIT_EXCEEDED');
  }

  // 1. Description validation (20-2000 chars, UTF-8, Devanagari ok)
  const trimmedDescription = (params.description || '').trim();
  if (trimmedDescription.length < 20 || trimmedDescription.length > 2000) {
    throw new DisputeServiceError(
      'Dispute description must be between 20 and 2000 characters.',
      400,
      'INVALID_DESCRIPTION_LENGTH'
    );
  }

  // 2. Fetch contract & verify ownership & status
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new DisputeServiceError('Work contract not found for dispute.', 404, 'CONTRACT_NOT_FOUND');
  }

  if (contract.worker_id !== params.workerId) {
    throw new DisputeServiceError('Forbidden: Worker does not own this contract.', 403, 'FORBIDDEN_CONTRACT');
  }

  const contractStatusUpper = String(contract.status).toUpperCase();
  const eligibleStatuses = ['ACCEPTED', 'ACTIVE', 'COMPLETED', 'TERMINATED', 'DISPUTED'];
  if (!eligibleStatuses.includes(contractStatusUpper)) {
    throw new DisputeServiceError(
      `Disputes can only be raised for accepted or ended contracts (status: ${contract.status}). Pending or rejected invitations cannot have disputes.`,
      400,
      'CONTRACT_NOT_ELIGIBLE'
    );
  }

  const contractorId = contract.contractor_id;
  const projectId = contract.project_id;

  // 3. Normalize category
  let categoryStr = String(params.category).toLowerCase();
  const validCategories = ['short_payment', 'unpaid_wages', 'attendance_not_recorded', 'unlawful_deduction', 'unsafe_conditions', 'other'];
  if (categoryStr === 'wage' || categoryStr === 'missing_payment') categoryStr = 'unpaid_wages';
  else if (categoryStr === 'payment' || categoryStr === 'partial_payment') categoryStr = 'short_payment';
  else if (categoryStr === 'attendance') categoryStr = 'attendance_not_recorded';
  else if (categoryStr === 'contract_terms' || categoryStr === 'contract_amendment') categoryStr = 'other';

  if (!validCategories.includes(categoryStr)) {
    categoryStr = 'other';
  }

  const effectivePeriodTo = params.periodTo || new Date().toISOString().slice(0, 10);
  const effectivePeriodFrom = params.periodFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  // 4. Compute amounts SERVER-SIDE (client-sent amounts are ignored)
  const amounts = await calculateDisputeAmounts({
    contractId: params.contractId,
    periodFrom: effectivePeriodFrom,
    periodTo: effectivePeriodTo,
  });

  const isPaymentCategory = categoryStr === 'short_payment' || categoryStr === 'unpaid_wages';
  if (isPaymentCategory && amounts.shortfallPaise === 0) {
    throw new DisputeServiceError(
      `No wage shortfall exists for the selected period (Earned: ₹${paiseToRupees(amounts.earnedPaise)}, Paid: ₹${paiseToRupees(amounts.paidPaise)}, Shortfall: ₹0).`,
      400,
      'ZERO_SHORTFALL'
    );
  }

  // 5. Duplicate check: same contract + category + overlapping period while open
  const { data: activeDisputes, error: activeErr } = await adminClient
    .from('disputes')
    .select('id, reference, dispute_ref, period_from, period_to, status')
    .eq('contract_id', params.contractId)
    .eq('category', categoryStr as any)
    .in('status', ['open', 'responded']);

  if (activeErr) {
    throw new DisputeServiceError(`Failed to check existing disputes: ${activeErr.message}`, 500);
  }

  for (const existing of activeDisputes || []) {
    const exFrom = existing.period_from;
    const exTo = existing.period_to;
    if (exFrom && exTo) {
      const overlaps = effectivePeriodFrom <= exTo && effectivePeriodTo >= exFrom;
      if (overlaps) {
        throw new DisputeServiceError(
          `An active dispute already exists for this contract and category in the overlapping period (${exFrom} to ${exTo}, Ref: ${existing.reference || existing.dispute_ref}).`,
          409,
          'DUPLICATE_DISPUTE'
        );
      }
    }
  }

  // 6. Claimed amount validation
  // Claimed paise defaults to shortfall. If client specifies higher, justification is mandatory.
  const rawClaimedPaise = params.claimedPaise !== undefined ? params.claimedPaise : params.amountClaimedPaise;
  let claimedPaise = typeof rawClaimedPaise === 'number' && Number.isInteger(rawClaimedPaise) && rawClaimedPaise >= 0
    ? rawClaimedPaise
    : amounts.shortfallPaise;

  // In non-shortfall situations (e.g. unlawful deduction or unsafe conditions), if shortfall is 0, claimed amount can be positive if justified
  if (claimedPaise > amounts.shortfallPaise) {
    const justification = (params.claimedJustification || '').trim();
    if (!justification) {
      throw new DisputeServiceError(
        `Claimed amount (₹${paiseToRupees(claimedPaise)}) exceeds calculated shortfall (₹${paiseToRupees(amounts.shortfallPaise)}). A written justification is required.`,
        400,
        'JUSTIFICATION_REQUIRED'
      );
    }
  }

  // 7. Generate Reference
  const reference = await generateDisputeReference();

  // 8. Insert dispute row
  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .insert({
      reference,
      dispute_ref: reference,
      worker_id: params.workerId,
      contractor_id: contractorId,
      project_id: projectId,
      contract_id: params.contractId,
      category: categoryStr as any,
      period_from: params.periodFrom,
      period_to: params.periodTo,
      description: trimmedDescription,
      earned_paise: amounts.earnedPaise,
      paid_paise: amounts.paidPaise,
      shortfall_paise: amounts.shortfallPaise,
      claimed_paise: claimedPaise,
      claimed_justification: params.claimedJustification ? params.claimedJustification.trim() : null,
      amount_claimed_paise: claimedPaise,
      status: 'open' as any,
      priority: params.priority || 'MEDIUM',
      raised_by_user_id: params.raisedByUserId,
      evidence_photo_url: params.evidencePhotoUrl || null,
      evidence_voice_url: params.evidenceVoiceUrl || null,
      voice_transcription: params.voiceTranscription || null,
      linked_attendance_event_ids: params.linkedAttendanceEventIds || [],
      linked_ledger_entry_ids: params.linkedLedgerEntryIds || [],
    })
    .select()
    .single();

  if (dispErr || !dispute) {
    throw new DisputeServiceError(`Failed to create dispute: ${dispErr?.message}`, 500, 'DISPUTE_CREATION_FAILED');
  }

  // 9. Append to dispute_status_history
  await adminClient
    .from('dispute_status_history')
    .insert({
      dispute_id: dispute.id,
      from_status: null,
      to_status: 'open',
      actor: params.raisedByUserId,
      actor_role: 'WORKER',
      note: 'Dispute filed by worker.',
    });

  // 10. Update contract status to DISPUTED if active
  if (contractStatusUpper === 'ACTIVE' || contractStatusUpper === 'ACCEPTED') {
    await adminClient
      .from('work_contracts')
      .update({ status: 'DISPUTED' })
      .eq('id', params.contractId);
  }

  // 11. Notify contractor
  try {
    const { data: contractorRow } = await adminClient
      .from('contractors')
      .select('user_id')
      .eq('id', contractorId)
      .maybeSingle();

    if (contractorRow?.user_id) {
      await NotificationService.createNotification({
        userId: contractorRow.user_id,
        role: 'CONTRACTOR',
        type: 'CONTRACTOR_DISPUTE',
        title: `New Dispute Filed: ${reference}`,
        message: `Worker raised a dispute claiming ₹${paiseToRupees(claimedPaise)} for period ${params.periodFrom} to ${params.periodTo}.`,
        payload: {
          disputeId: dispute.id,
          reference,
          contractId: params.contractId,
          claimedPaise,
        },
      });
    }
  } catch {
    // Non-blocking notification
  }

  return {
    dispute,
    evidenceSnapshot: null as any,
    automatedAnalysis: null as any,
  };
}

// ─── Contractor Response ──────────────────────────────────────────────────────

export async function respondToDispute(params: ContractorDisputeResponseParams): Promise<{
  dispute: DisputeRow;
  response: DisputeResponseRecord;
}> {
  const adminClient = createAdminClient();

  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .select('*')
    .eq('id', params.disputeId)
    .maybeSingle();

  if (dispErr || !dispute) {
    throw new DisputeServiceError('Dispute not found.', 404, 'DISPUTE_NOT_FOUND');
  }

  // Status check: must be open or responded. Terminal states rejected.
  const currentStatus = String(dispute.status).toLowerCase();
  if (currentStatus === 'resolved' || currentStatus === 'withdrawn') {
    throw new DisputeServiceError(
      `Cannot respond to dispute with status '${dispute.status}'.`,
      400,
      'INVALID_DISPUTE_STATE'
    );
  }

  // Validate type
  const validTypes = ['accept_and_pay', 'deduction_claimed', 'reject'];
  if (!validTypes.includes(params.type)) {
    throw new DisputeServiceError(`Invalid response type '${params.type}'. Must be accept_and_pay, deduction_claimed, or reject.`, 400);
  }

  // Validate deduction params
  let deductionAmountPaise = 0;
  if (params.type === 'deduction_claimed') {
    const validReasons = ['late_arrival', 'incomplete_work', 'advance_recovery', 'other'];
    if (!params.deductionReason || !validReasons.includes(params.deductionReason)) {
      throw new DisputeServiceError('Valid deductionReason is required when claiming deduction.', 400);
    }
    deductionAmountPaise = Math.max(0, Math.floor(params.deductionAmountPaise || 0));
  }

  const trimmedMessage = (params.message || '').trim();
  if (!trimmedMessage) {
    throw new DisputeServiceError('A response message is required.', 400);
  }

  // 1. Insert response record
  const { data: responseRecord, error: respErr } = await adminClient
    .from('dispute_responses')
    .insert({
      dispute_id: dispute.id,
      contractor_id: dispute.contractor_id,
      type: params.type as any,
      deduction_reason: params.deductionReason ? (params.deductionReason as any) : null,
      deduction_amount_paise: deductionAmountPaise,
      message: trimmedMessage,
    })
    .select()
    .single();

  if (respErr || !responseRecord) {
    throw new DisputeServiceError(`Failed to save contractor response: ${respErr?.message}`, 500);
  }

  // 2. Advance dispute status to responded
  const newStatus: DisputeStatusEnum = 'responded';
  const { data: updatedDispute, error: updateErr } = await adminClient
    .from('disputes')
    .update({
      status: newStatus as any,
      contractor_counter_statement: trimmedMessage,
      contractor_responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dispute.id)
    .select()
    .single();

  if (updateErr || !updatedDispute) {
    throw new DisputeServiceError(`Failed to update dispute status: ${updateErr?.message}`, 500);
  }

  // 3. Write dispute_status_history
  await adminClient
    .from('dispute_status_history')
    .insert({
      dispute_id: dispute.id,
      from_status: currentStatus,
      to_status: 'responded',
      actor: params.contractorUserId,
      actor_role: 'CONTRACTOR',
      note: `Contractor responded with '${params.type}': ${trimmedMessage}`,
    });

  // 4. If accept_and_pay, link to payment settlement
  let finalDispute = updatedDispute;
  if (params.type === 'accept_and_pay') {
    try {
      const { initiatePayment } = await import('./payment-service');
      const settleAmount = Math.max(
        0,
        Math.floor(dispute.claimed_paise || dispute.amount_claimed_paise || 0)
      );
      if (
        settleAmount > 0 &&
        dispute.contract_id &&
        dispute.worker_id &&
        dispute.contractor_id &&
        dispute.project_id
      ) {
        await initiatePayment({
          initiatorUserId: params.contractorUserId,
          contractId: dispute.contract_id,
          workerId: dispute.worker_id,
          contractorId: dispute.contractor_id,
          projectId: dispute.project_id,
          amountPaise: settleAmount,
          idempotencyKey: `dispute-settle-${dispute.id}-${Date.now()}`,
          disputeId: dispute.id,
          paymentSource: 'PLATFORM_TRANSFER',
          paymentMethod: 'UPI_SIMULATED',
          notes: `Settlement for dispute ${dispute.reference || dispute.dispute_ref}`,
        });

        // Re-fetch dispute to get the auto-resolved status and settlement ledger entry ID
        const { data: refreshed } = await adminClient
          .from('disputes')
          .select('*')
          .eq('id', dispute.id)
          .maybeSingle();

        if (refreshed) {
          finalDispute = refreshed;
        }
      }
    } catch (payErr: any) {
      console.error('[respondToDispute] Auto-payment initiation error:', payErr);
    }
  }

  // 5. Notify worker
  try {
    const { data: workerRow } = await adminClient
      .from('workers')
      .select('user_id')
      .eq('id', dispute.worker_id)
      .maybeSingle();

    if (workerRow?.user_id) {
      await NotificationService.createNotification({
        userId: workerRow.user_id,
        role: 'WORKER',
        type: 'DISPUTE_RESOLUTION',
        title: `Contractor Responded: ${dispute.reference || dispute.dispute_ref}`,
        message: `Contractor responded to your dispute (${params.type.replace(/_/g, ' ')}).`,
        payload: {
          disputeId: dispute.id,
          responseType: params.type,
          message: trimmedMessage,
        },
      });
    }
  } catch {
    // Non-blocking notification
  }

  return { dispute: finalDispute, response: responseRecord };
}

// ─── Worker Actions: Withdraw, Escalate, Confirm Resolution ────────────────────

export async function withdrawDispute(params: {
  disputeId: string;
  workerUserId: string;
  reason?: string;
}): Promise<DisputeRow> {
  const adminClient = createAdminClient();

  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .select('*')
    .eq('id', params.disputeId)
    .maybeSingle();

  if (dispErr || !dispute) {
    throw new DisputeServiceError('Dispute not found.', 404, 'DISPUTE_NOT_FOUND');
  }

  const currentStatus = String(dispute.status).toLowerCase();
  if (currentStatus === 'resolved' || currentStatus === 'withdrawn') {
    throw new DisputeServiceError(`Cannot withdraw a dispute that is already '${dispute.status}'.`, 400);
  }

  const { data: updated, error: updateErr } = await adminClient
    .from('disputes')
    .update({
      status: 'withdrawn' as any,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dispute.id)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new DisputeServiceError(`Failed to withdraw dispute: ${updateErr?.message}`, 500);
  }

  await adminClient
    .from('dispute_status_history')
    .insert({
      dispute_id: dispute.id,
      from_status: currentStatus,
      to_status: 'withdrawn',
      actor: params.workerUserId,
      actor_role: 'WORKER',
      note: params.reason?.trim() || 'Dispute withdrawn by worker.',
    });

  // Notify contractor
  try {
    const { data: contractorRow } = await adminClient
      .from('contractors')
      .select('user_id')
      .eq('id', dispute.contractor_id)
      .maybeSingle();

    if (contractorRow?.user_id) {
      await NotificationService.createNotification({
        userId: contractorRow.user_id,
        role: 'CONTRACTOR',
        type: 'CONTRACTOR_DISPUTE',
        title: `Dispute Withdrawn: ${dispute.reference || dispute.dispute_ref}`,
        message: 'The worker has formally withdrawn this dispute.',
        payload: { disputeId: dispute.id },
      });
    }
  } catch {
    // Non-blocking
  }

  return updated;
}

export async function escalateDispute(params: {
  disputeId: string;
  workerUserId: string;
  reason?: string;
}): Promise<DisputeRow> {
  const adminClient = createAdminClient();

  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .select('*')
    .eq('id', params.disputeId)
    .maybeSingle();

  if (dispErr || !dispute) {
    throw new DisputeServiceError('Dispute not found.', 404, 'DISPUTE_NOT_FOUND');
  }

  const currentStatus = String(dispute.status).toLowerCase();
  if (currentStatus !== 'responded' && currentStatus !== 'under_review') {
    throw new DisputeServiceError(
      `Dispute can only be escalated after a contractor response (current status: '${dispute.status}').`,
      400
    );
  }

  const { data: updated, error: updateErr } = await adminClient
    .from('disputes')
    .update({
      status: 'escalated' as any,
      updated_at: new Date().toISOString(),
    })
    .eq('id', dispute.id)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new DisputeServiceError(`Failed to escalate dispute: ${updateErr?.message}`, 500);
  }

  await adminClient
    .from('dispute_status_history')
    .insert({
      dispute_id: dispute.id,
      from_status: currentStatus,
      to_status: 'escalated',
      actor: params.workerUserId,
      actor_role: 'WORKER',
      note: params.reason?.trim() || 'Dispute escalated to Labour Inspector by worker.',
    });

  // Notify contractor
  try {
    const { data: contractorRow } = await adminClient
      .from('contractors')
      .select('user_id')
      .eq('id', dispute.contractor_id)
      .maybeSingle();

    if (contractorRow?.user_id) {
      await NotificationService.createNotification({
        userId: contractorRow.user_id,
        role: 'CONTRACTOR',
        type: 'CONTRACTOR_DISPUTE',
        title: `Dispute Escalated: ${dispute.reference || dispute.dispute_ref}`,
        message: 'The worker has escalated this unresolved dispute for Labour Inspection.',
        payload: { disputeId: dispute.id },
      });
    }
  } catch {
    // Non-blocking
  }

  return updated;
}

export async function confirmDisputeResolution(params: {
  disputeId: string;
  workerUserId: string;
  notes?: string;
}): Promise<DisputeRow> {
  const adminClient = createAdminClient();

  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .select('*')
    .eq('id', params.disputeId)
    .maybeSingle();

  if (dispErr || !dispute) {
    throw new DisputeServiceError('Dispute not found.', 404, 'DISPUTE_NOT_FOUND');
  }

  const currentStatus = String(dispute.status).toLowerCase();
  if (currentStatus === 'withdrawn') {
    throw new DisputeServiceError('Cannot resolve a withdrawn dispute.', 400);
  }

  const { data: updated, error: updateErr } = await adminClient
    .from('disputes')
    .update({
      status: 'resolved' as any,
      is_settled: true,
      settled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dispute.id)
    .select()
    .single();

  if (updateErr || !updated) {
    throw new DisputeServiceError(`Failed to resolve dispute: ${updateErr?.message}`, 500);
  }

  await adminClient
    .from('dispute_status_history')
    .insert({
      dispute_id: dispute.id,
      from_status: currentStatus,
      to_status: 'resolved',
      actor: params.workerUserId,
      actor_role: 'WORKER',
      note: params.notes?.trim() || 'Worker confirmed full dispute resolution.',
    });

  return updated;
}

// ─── Dispute Messages ─────────────────────────────────────────────────────────

export async function postDisputeMessage(params: {
  disputeId: string;
  senderUserId: string;
  senderRole: string;
  message: string;
}): Promise<DisputeMessageRecord> {
  const adminClient = createAdminClient();

  // Rate limit: max 20 messages per minute per user
  if (!checkRateLimit(recentMessages, params.senderUserId, 20, 60_000)) {
    throw new DisputeServiceError('Rate limit exceeded for messages. Please wait a minute.', 429);
  }

  const trimmed = (params.message || '').trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new DisputeServiceError('Message must be between 1 and 2000 characters.', 400);
  }

  const { data: dispute } = await adminClient
    .from('disputes')
    .select('id, worker_id, contractor_id, reference, dispute_ref')
    .eq('id', params.disputeId)
    .maybeSingle();

  if (!dispute) {
    throw new DisputeServiceError('Dispute not found.', 404);
  }

  const { data: msg, error: msgErr } = await adminClient
    .from('dispute_messages')
    .insert({
      dispute_id: params.disputeId,
      sender_user_id: params.senderUserId,
      sender_role: params.senderRole,
      message: trimmed,
    })
    .select()
    .single();

  if (msgErr || !msg) {
    throw new DisputeServiceError(`Failed to save message: ${msgErr?.message}`, 500);
  }

  // Notify counterparty
  try {
    const isWorker = params.senderRole === 'WORKER';
    const counterpartyTarget = isWorker ? dispute.contractor_id : dispute.worker_id;
    const targetTable = isWorker ? 'contractors' : 'workers';
    const targetRole = isWorker ? 'CONTRACTOR' : 'WORKER';
    const notifType = isWorker ? 'CONTRACTOR_DISPUTE' : 'DISPUTE_RESOLUTION';

    const { data: recipient } = await adminClient
      .from(targetTable)
      .select('user_id')
      .eq('id', counterpartyTarget)
      .maybeSingle();

    if (recipient?.user_id) {
      await NotificationService.createNotification({
        userId: recipient.user_id,
        role: targetRole as any,
        type: notifType as any,
        title: `New Message on Dispute ${dispute.reference || dispute.dispute_ref}`,
        message: `${params.senderRole}: ${trimmed.slice(0, 100)}`,
        payload: { disputeId: dispute.id },
      });
    }
  } catch {
    // Non-blocking
  }

  return msg;
}

// ─── Evidence Upload & Verification ───────────────────────────────────────────

export function validateMagicBytes(buffer: Buffer): { isValid: boolean; detectedMime: string } {
  if (buffer.length < 4) return { isValid: false, detectedMime: '' };

  // PDF: %PDF (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return { isValid: true, detectedMime: 'application/pdf' };
  }

  // PNG: 0x89 0x50 0x4E 0x47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { isValid: true, detectedMime: 'image/png' };
  }

  // JPEG: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { isValid: true, detectedMime: 'image/jpeg' };
  }

  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { isValid: true, detectedMime: 'image/webp' };
  }

  return { isValid: false, detectedMime: '' };
}

export async function uploadDisputeEvidence(params: {
  disputeId: string;
  userId: string;
  fileBuffer: Buffer;
  fileName: string;
}): Promise<DisputeEvidenceRecord & { signedUrl: string }> {
  const adminClient = createAdminClient();

  // 1. Max 5 MB check
  const MAX_SIZE = 5 * 1024 * 1024;
  if (params.fileBuffer.length > MAX_SIZE) {
    throw new DisputeServiceError('File size exceeds maximum allowed limit of 5 MB.', 400, 'FILE_TOO_LARGE');
  }

  // 2. Validate magic bytes (strictly image or PDF)
  const magicValidation = validateMagicBytes(params.fileBuffer);
  if (!magicValidation.isValid) {
    throw new DisputeServiceError(
      'Invalid file content. Only PDF documents and image files (PNG, JPEG, WebP) are accepted.',
      400,
      'INVALID_FILE_TYPE'
    );
  }

  // 3. Check existing evidence count (max 5 files per dispute)
  const { data: existingList } = await adminClient
    .from('dispute_evidence')
    .select('id')
    .eq('dispute_id', params.disputeId);

  if ((existingList || []).length >= 5) {
    throw new DisputeServiceError('Maximum of 5 evidence files allowed per dispute.', 400, 'MAX_EVIDENCE_REACHED');
  }

  // 4. Compute SHA-256
  const sha256 = crypto.createHash('sha256').update(params.fileBuffer).digest('hex');

  // 5. Store file in private storage
  const disputeDir = path.join(PRIVATE_STORAGE_DIR, params.disputeId);
  if (!fs.existsSync(disputeDir)) {
    fs.mkdirSync(disputeDir, { recursive: true });
  }

  const safeName = `${Date.now()}_${params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const filePath = path.join(disputeDir, safeName);
  fs.writeFileSync(filePath, params.fileBuffer);

  // 6. Insert record into database
  const { data: evidence, error: evErr } = await adminClient
    .from('dispute_evidence')
    .insert({
      dispute_id: params.disputeId,
      uploaded_by: params.userId,
      file_path: filePath,
      mime: magicValidation.detectedMime,
      size: params.fileBuffer.length,
      sha256,
    })
    .select()
    .single();

  if (evErr || !evidence) {
    throw new DisputeServiceError(`Failed to save evidence record: ${evErr?.message}`, 500);
  }

  // 7. Generate signed URL
  const { token, expires } = createSignedEvidenceToken(evidence.id, params.disputeId);
  const signedUrl = `/api/disputes/${params.disputeId}/evidence/${evidence.id}?token=${token}&expires=${expires}`;

  return {
    ...evidence,
    signedUrl,
  };
}

// ─── Dispute Detail View ──────────────────────────────────────────────────────

export async function getDisputeDetails(disputeId: string) {
  const adminClient = createAdminClient();

  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .select('*')
    .eq('id', disputeId)
    .maybeSingle();

  if (dispErr || !dispute) {
    throw new DisputeServiceError('Dispute not found.', 404, 'DISPUTE_NOT_FOUND');
  }

  const [
    responsesRes,
    messagesRes,
    evidenceRes,
    statusHistoryRes,
    workerRes,
    contractorRes,
    projectRes,
    contractRes,
    linkedPaymentsRes,
  ] = await Promise.all([
    adminClient.from('dispute_responses').select('*').eq('dispute_id', disputeId).order('created_at', { ascending: false }),
    adminClient.from('dispute_messages').select('*').eq('dispute_id', disputeId).order('created_at', { ascending: true }),
    adminClient.from('dispute_evidence').select('*').eq('dispute_id', disputeId).order('created_at', { ascending: true }),
    adminClient.from('dispute_status_history').select('*').eq('dispute_id', disputeId).order('at', { ascending: true }),
    adminClient.from('workers').select('id, full_name, occupation, skill_category').eq('id', dispute.worker_id).maybeSingle(),
    adminClient.from('contractors').select('id, company_name, full_name, license_number, compliance_status').eq('id', dispute.contractor_id).maybeSingle(),
    adminClient.from('projects').select('id, name, location').eq('id', dispute.project_id).maybeSingle(),
    adminClient.from('work_contracts').select('*').eq('id', dispute.contract_id).maybeSingle(),
    adminClient.from('payment_transactions').select('*').eq('dispute_id', disputeId),
  ]);

  // Enrich evidence with short-lived signed URLs
  const enrichedEvidence = (evidenceRes.data || []).map((ev: any) => {
    const { token, expires } = createSignedEvidenceToken(ev.id, disputeId);
    return {
      ...ev,
      signedUrl: `/api/disputes/${disputeId}/evidence/${ev.id}?token=${token}&expires=${expires}`,
    };
  });

  return {
    dispute,
    responses: responsesRes.data || [],
    messages: messagesRes.data || [],
    evidence: enrichedEvidence,
    statusHistory: statusHistoryRes.data || [],
    worker: workerRes.data || null,
    contractor: contractorRes.data || null,
    project: projectRes.data || null,
    contract: contractRes.data || null,
    linkedPayments: linkedPaymentsRes.data || [],
    evidenceSnapshot: null as any,
    resolutions: [] as any[],
  };
}

// ─── Legacy Inspector Ruling & Resolution Compatibility ──────────────────────

export async function submitContractorCounterStatement(params: {
  disputeId: string;
  counterStatement: string;
  evidenceUrl?: string | null;
  contractorUserId: string;
}) {
  return respondToDispute({
    disputeId: params.disputeId,
    contractorUserId: params.contractorUserId,
    type: 'deduction_claimed',
    message: params.counterStatement,
  }).then((r) => r.dispute);
}

export async function issueInspectorRuling(params: IssueInspectorRulingParams) {
  const adminClient = createAdminClient();

  const { data: dispute, error: dispErr } = await adminClient
    .from('disputes')
    .select('*')
    .eq('id', params.disputeId)
    .maybeSingle();

  if (dispErr || !dispute) {
    throw new DisputeServiceError('Dispute record not found.', 404);
  }

  const resolvedAt = new Date().toISOString();
  const decisionText = params.rulingDecision === 'DISMISS' ? 'REJECTED' : 'RESOLVED';
  let orderedAmountPaise = 0;
  let createdLedgerEntry: any = null;

  if (params.rulingDecision === 'ORDER_PAYMENT' || params.rulingDecision === 'PARTIAL_SETTLEMENT') {
    orderedAmountPaise = params.orderedAmountPaise && params.orderedAmountPaise > 0
      ? Math.floor(params.orderedAmountPaise)
      : Math.floor(dispute.claimed_paise || dispute.amount_claimed_paise || 0);

    if (orderedAmountPaise > 0) {
      createdLedgerEntry = await recordDisputeReversalEntry({
        disputeId: dispute.id,
        contractId: dispute.contract_id,
        workerId: dispute.worker_id,
        contractorId: dispute.contractor_id,
        projectId: dispute.project_id,
        amountPaise: orderedAmountPaise,
        description: `Arbitration tribunal order for dispute ${dispute.reference || dispute.dispute_ref}: ₹${paiseToRupees(orderedAmountPaise)}`,
        actorId: params.reviewerUserId,
      });
    }
  }

  const { data: resolution } = await adminClient
    .from('dispute_resolutions')
    .insert({
      dispute_id: params.disputeId,
      decision: decisionText,
      reason: params.reason.trim(),
      resolution_notes: params.resolutionNotes ? params.resolutionNotes.trim() : null,
      reviewer_user_id: params.reviewerUserId,
      resolved_at: resolvedAt,
    })
    .select()
    .single();

  const { data: updatedDispute } = await adminClient
    .from('disputes')
    .update({
      status: 'resolved' as any,
      ruling_decision: params.rulingDecision,
      ruling_reason: params.reason.trim(),
      ordered_amount_paise: orderedAmountPaise,
      settlement_ledger_entry_id: createdLedgerEntry?.id || null,
      is_settled: true,
      settled_at: resolvedAt,
      updated_at: resolvedAt,
    })
    .eq('id', params.disputeId)
    .select()
    .single();

  return {
    dispute: updatedDispute!,
    resolution: resolution!,
    ledgerEntry: createdLedgerEntry,
  };
}

export async function resolveDispute(params: ResolveDisputeParams) {
  const rulingDecision = params.decision === 'RESOLVED' ? 'ORDER_PAYMENT' : 'DISMISS';
  return issueInspectorRuling({
    disputeId: params.disputeId,
    rulingDecision,
    reason: params.reason,
    resolutionNotes: params.resolutionNotes,
    reviewerUserId: params.reviewerUserId,
    reviewerRole: params.reviewerRole,
  });
}

export async function checkAndFlagMissedDisputeDeadlines(): Promise<{
  flaggedCount: number;
  flaggedDisputeIds: string[];
}> {
  const adminClient = createAdminClient();
  const now = new Date().toISOString();
  const { data: overdueDisputes } = await adminClient
    .from('disputes')
    .select('id, contractor_id')
    .eq('is_deadline_missed', false)
    .eq('is_settled', false)
    .lt('order_payment_deadline', now);

  const flaggedDisputeIds: string[] = [];
  for (const d of overdueDisputes || []) {
    flaggedDisputeIds.push(d.id);
    await adminClient
      .from('disputes')
      .update({ is_deadline_missed: true })
      .eq('id', d.id);

    if (d.contractor_id) {
      await adminClient
        .from('contractors')
        .update({ compliance_status: 'NON_COMPLIANT' })
        .eq('id', d.contractor_id);
    }
  }

  return { flaggedCount: flaggedDisputeIds.length, flaggedDisputeIds };
}
