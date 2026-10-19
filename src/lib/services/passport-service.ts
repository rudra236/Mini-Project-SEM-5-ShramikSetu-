/**
 * SHRAMIKSETU PHASE 9 — PASSPORT SERVICE
 *
 * Implements:
 *   - Employment History aggregation from authoritative backend records
 *   - Employment Timeline built from real DB events (no hardcoded entries)
 *   - Job Completion Statement generation with settlement status guard
 *   - Benefit Passport PDF (server-side, pdfkit)
 *
 * SETTLEMENT INVARIANT:
 *   outstanding_paise > 0  → settlement_status = OUTSTANDING_PAYMENT
 *   outstanding_paise = 0  → settlement_status = SETTLED
 *
 * PDF DISCLAIMER:
 *   The generated PDF is a "ShramikSetu Digital Employment Record".
 *   It is NOT a government-approved document or KYC certificate.
 */

import { createHash, randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditEvent, recordAuditLog } from './audit-service';
import { getContractReconciliation } from './reconciliation-service';
import { getWorkerFinancialSummary } from './financial-summary-service';
import { getLatestLedgerHash } from './ledger-service';
import { rupeesToPaise, paiseToRupees, paiseToRupeeDisplay } from '@/types/payment.types';
import type { SettlementStatusEnum, JobCompletionStatementRow, IssuedCredentialRow } from '@/types/database.types';

// ─── Error Class ───────────────────────────────────────────────────────────────

export class PassportServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode = 400, reasonCode = 'PASSPORT_SERVICE_ERROR') {
    super(message);
    this.name = 'PassportServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

// ─── Interfaces ────────────────────────────────────────────────────────────────

export interface EmploymentHistoryEntry {
  employmentRelationshipId: string;
  contractId: string;
  contractCode: string;
  contractorId: string;
  contractorName: string;
  contractorCompany: string;
  projectId: string;
  projectName: string;
  workType: string;
  startDate: string;
  endDate: string | null;
  acceptanceDate: string;
  dailyWagePaise: number;
  dailyWageRupees: number;
  verifiedWorkdays: number;
  totalEarnedPaise: number;
  totalEarnedRupees: number;
  totalPaidPaise: number;
  totalPaidRupees: number;
  outstandingPaise: number;
  outstandingRupees: number;
  totalDisputes: number;
  openDisputes: number;
  resolvedDisputes: number;
  employmentStatus: string;
  contractStatus: string;
  completionStatement: JobCompletionStatementRow | null;
}

export type TimelineEventType =
  | 'CONTRACT_CREATED'
  | 'WORKER_ACCEPTED'
  | 'EMPLOYMENT_ACTIVATED'
  | 'ATTENDANCE'
  | 'ATTENDANCE_CONFIRMATION'
  | 'EARNINGS'
  | 'PAYMENT'
  | 'PAYMENT_CONFIRMATION'
  | 'DISPUTE'
  | 'RESOLUTION'
  | 'JOB_COMPLETION';

export interface TimelineEvent {
  eventType: TimelineEventType;
  timestamp: string;
  summary: string;
  entityId: string;
  metadata: Record<string, any>;
}

export interface JobCompletionStatementParams {
  employmentRelationshipId: string;
  contractId: string;
  generatedByUserId: string;
}

export interface SharingConsent {
  shareEarnings: boolean;
  shareDisputes: boolean;
  shareEmployerNames: boolean;
  shareGpsMetrics: boolean;
}

export const DEFAULT_SHARING_CONSENT: SharingConsent = {
  shareEarnings: true,
  shareDisputes: true,
  shareEmployerNames: true,
  shareGpsMetrics: true,
};

export interface CanonicalPassportSnapshot {
  workerId: string;
  fullName: string;
  internalWorkerId: string;
  skillCategory: string;
  occupation: string;
  totalVerifiedWorkdays: number;
  totalEarnedPaise: number;
  totalPaidPaise: number;
  outstandingPaise: number;
  gpsValidityPercent: number;
  employerRelationshipsCount: number;
  disputesResolvedInFavourCount: number;
  issuedAt: string;
}

export interface IssuedCredential {
  id: string;
  credentialRef: string;
  workerId: string;
  snapshotPayload: CanonicalPassportSnapshot;
  ledgerHashAtIssuance: string;
  credentialHash: string;
  sharingConsent: SharingConsent;
  issuedAt: string;
  revokedAt?: string | null;
}

export interface PublicCredentialVerificationResult {
  status: 'VERIFIED' | 'TAMPERED' | 'NOT_FOUND';
  isValid: boolean;
  credentialRef: string;
  workerNameMasked?: string;
  skillCategory?: string;
  occupation?: string;
  totalVerifiedWorkdays?: number;
  gpsValidityPercent?: number;
  employerRelationshipsCount?: number;
  disputesResolvedInFavourCount?: number;
  totalEarnedRupees?: number | null;
  sharingConsent?: SharingConsent;
  issuedAt?: string;
  ledgerHashAtIssuance?: string;
  credentialHash?: string;
  tamperReason?: string;
  guarantees: {
    ledgerChained: boolean;
    tamperEvident: boolean;
    guaranteedStatements: string[];
    nonGuaranteedDisclaimers: string[];
  };
}

export interface BenefitPassportData {
  workerId: string;
  workerName: string;
  internalWorkerId: string;
  occupation: string;
  skillCategory: string;
  passportGeneratedAt: string;
  totalEmployments: number;
  totalVerifiedWorkdays: number;
  totalEarnedPaise: number;
  totalEarnedRupees: number;
  totalPaidPaise: number;
  totalPaidRupees: number;
  totalOutstandingPaise: number;
  totalOutstandingRupees: number;
  employmentHistory: EmploymentHistoryEntry[];
  completionStatements: JobCompletionStatementRow[];
  gpsValidityPercent?: number;
  disputesResolvedInFavourCount?: number;
  disputesTotalCount?: number;
  credentialRef?: string | null;
  credentialHash?: string | null;
  ledgerHashAtIssuance?: string | null;
  sharingConsent?: SharingConsent;
}

// ─── Employment History ────────────────────────────────────────────────────────

/**
 * Aggregates the full employment history for a worker from authoritative backend records.
 * Sources: employment_relationships, work_contracts, contractors, projects,
 *          contract_acceptances, attendance_events, payment_transactions, disputes.
 */
export async function getEmploymentHistory(workerId: string): Promise<EmploymentHistoryEntry[]> {
  const adminClient = createAdminClient();

  // 1. All employment relationships for this worker
  const { data: relationships, error: relErr } = await adminClient
    .from('employment_relationships')
    .select('*')
    .eq('worker_id', workerId)
    .order('start_date', { ascending: false });

  if (relErr) {
    throw new PassportServiceError(
      `Failed to fetch employment relationships: ${relErr.message}`,
      500,
      'FETCH_RELATIONSHIPS_FAILED'
    );
  }

  if (!relationships || relationships.length === 0) {
    return [];
  }

  // 2. Build each entry in parallel
  const entries = await Promise.all(
    relationships.map(async (rel: any): Promise<EmploymentHistoryEntry> => {
      // Contract
      const { data: contract } = await adminClient
        .from('work_contracts')
        .select('*')
        .eq('id', rel.contract_id)
        .single();

      // Contractor
      const { data: contractor } = await adminClient
        .from('contractors')
        .select('id, full_name, company_name')
        .eq('id', rel.contractor_id)
        .single();

      // Project
      const { data: project } = await adminClient
        .from('projects')
        .select('id, name')
        .eq('id', rel.project_id)
        .single();

      // Acceptance date (from contract_acceptances where response=ACCEPTED)
      const { data: acceptance } = await adminClient
        .from('contract_acceptances')
        .select('responded_at')
        .eq('contract_id', rel.contract_id)
        .eq('worker_id', workerId)
        .eq('response', 'ACCEPTED')
        .order('responded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Reconciliation (earnings, payments, outstanding)
      let recon: Awaited<ReturnType<typeof getContractReconciliation>>;
      try {
        recon = await getContractReconciliation({ contractId: rel.contract_id });
      } catch {
        // If reconciliation fails (e.g., no attendance data), use zeroes
        const dailyWage = contract?.daily_wage ?? 0;
        const dailyWagePaise = rupeesToPaise(dailyWage);
        recon = {
          contractId: rel.contract_id,
          workerId,
          contractorId: rel.contractor_id,
          projectId: rel.project_id,
          verifiedDaysCount: 0,
          dailyWagePaise,
          totalEarnedPaise: 0,
          totalPaidPaise: 0,
          outstandingPaise: 0,
          totalEarnedRupees: 0,
          totalPaidRupees: 0,
          outstandingRupees: 0,
        };
      }

      // Dispute counts
      const { data: allDisputes } = await adminClient
        .from('disputes')
        .select('id, status')
        .eq('contract_id', rel.contract_id);

      const totalDisputes = allDisputes?.length ?? 0;
      const openDisputes = allDisputes?.filter(
        (d: { status: string }) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(d.status)
      ).length ?? 0;
      const resolvedDisputes = allDisputes?.filter(
        (d: { status: string }) => ['RESOLVED', 'CLOSED'].includes(d.status)
      ).length ?? 0;

      // Completion statement (if exists)
      const { data: completionStatement } = await adminClient
        .from('job_completion_statements')
        .select('*')
        .eq('employment_relationship_id', rel.id)
        .maybeSingle();

      const dailyWagePaise = recon.dailyWagePaise;

      return {
        employmentRelationshipId: rel.id,
        contractId: rel.contract_id,
        contractCode: contract?.contract_code ?? '',
        contractorId: rel.contractor_id,
        contractorName: contractor?.full_name ?? '',
        contractorCompany: contractor?.company_name ?? '',
        projectId: rel.project_id,
        projectName: project?.name ?? '',
        workType: contract?.work_type ?? '',
        startDate: rel.start_date,
        endDate: rel.end_date ?? null,
        acceptanceDate: acceptance?.responded_at ?? rel.acceptance_timestamp,
        dailyWagePaise,
        dailyWageRupees: paiseToRupees(dailyWagePaise),
        verifiedWorkdays: recon.verifiedDaysCount,
        totalEarnedPaise: recon.totalEarnedPaise,
        totalEarnedRupees: recon.totalEarnedRupees,
        totalPaidPaise: recon.totalPaidPaise,
        totalPaidRupees: recon.totalPaidRupees,
        outstandingPaise: recon.outstandingPaise,
        outstandingRupees: recon.outstandingRupees,
        totalDisputes,
        openDisputes,
        resolvedDisputes,
        employmentStatus: rel.status,
        contractStatus: contract?.status ?? '',
        completionStatement: completionStatement ?? null,
      };
    })
  );

  return entries;
}

// ─── Employment Timeline ───────────────────────────────────────────────────────

/**
 * Builds a chronological employment timeline for a specific contract.
 * ALL events are sourced from real database records. Nothing is hardcoded.
 *
 * Event types emitted (in chronological order when sorted):
 *   CONTRACT_CREATED, WORKER_ACCEPTED, EMPLOYMENT_ACTIVATED,
 *   ATTENDANCE, ATTENDANCE_CONFIRMATION, EARNINGS,
 *   PAYMENT, PAYMENT_CONFIRMATION, DISPUTE, RESOLUTION, JOB_COMPLETION
 */
export async function buildEmploymentTimeline(
  contractId: string,
  workerId: string
): Promise<TimelineEvent[]> {
  const adminClient = createAdminClient();
  const events: TimelineEvent[] = [];

  // ── 1. CONTRACT_CREATED ──
  const { data: contract } = await adminClient
    .from('work_contracts')
    .select('id, contract_code, work_type, daily_wage, status, created_at, contractor_id, project_id')
    .eq('id', contractId)
    .maybeSingle();

  if (contract) {
    events.push({
      eventType: 'CONTRACT_CREATED',
      timestamp: contract.created_at,
      summary: `Contract ${contract.contract_code} created for ${contract.work_type}`,
      entityId: contract.id,
      metadata: {
        contractCode: contract.contract_code,
        workType: contract.work_type,
        dailyWageRupees: contract.daily_wage,
      },
    });
  }

  // ── 2. WORKER_ACCEPTED ──
  const { data: acceptances } = await adminClient
    .from('contract_acceptances')
    .select('id, response, responded_at, rejection_reason')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .order('responded_at', { ascending: true });

  for (const acc of acceptances ?? []) {
    if (acc.response === 'ACCEPTED') {
      events.push({
        eventType: 'WORKER_ACCEPTED',
        timestamp: acc.responded_at,
        summary: 'Worker accepted the contract',
        entityId: acc.id,
        metadata: { response: acc.response },
      });
    }
  }

  // ── 3. EMPLOYMENT_ACTIVATED ──
  const { data: empRel } = await adminClient
    .from('employment_relationships')
    .select('id, status, acceptance_timestamp, start_date, end_date')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .maybeSingle();

  if (empRel) {
    events.push({
      eventType: 'EMPLOYMENT_ACTIVATED',
      timestamp: empRel.acceptance_timestamp,
      summary: `Employment activated — status: ${empRel.status}`,
      entityId: empRel.id,
      metadata: { status: empRel.status, startDate: empRel.start_date },
    });
  }

  // ── 4. ATTENDANCE ──
  const { data: attendanceEvents } = await adminClient
    .from('attendance_events')
    .select('id, date, status, created_at')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .order('date', { ascending: true });

  for (const att of attendanceEvents ?? []) {
    const timestamp = att.created_at || (att.date ? `${att.date}T08:00:00.000Z` : new Date().toISOString());
    events.push({
      eventType: 'ATTENDANCE',
      timestamp,
      summary: `Attendance recorded for ${att.date} — ${att.status}`,
      entityId: att.id,
      metadata: { date: att.date, status: att.status },
    });
  }

  // ── 5. ATTENDANCE_CONFIRMATION ──
  const { data: confirmations } = await adminClient
    .from('worker_confirmations')
    .select('id, is_confirmed, discrepancy_reason, confirmed_at, summary_id')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .order('confirmed_at', { ascending: true });

  for (const conf of confirmations ?? []) {
    events.push({
      eventType: 'ATTENDANCE_CONFIRMATION',
      timestamp: conf.confirmed_at,
      summary: conf.is_confirmed
        ? 'Worker confirmed attendance summary'
        : `Worker flagged attendance discrepancy: ${conf.discrepancy_reason ?? 'unspecified'}`,
      entityId: conf.id,
      metadata: { isConfirmed: conf.is_confirmed, discrepancyReason: conf.discrepancy_reason },
    });
  }

  // ── 6. EARNINGS ──
  const { data: earningsSnapshots } = await adminClient
    .from('earnings_snapshots')
    .select('id, period_start, period_end, verified_days_count, daily_wage_paise, total_earned_paise, computed_at')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .order('computed_at', { ascending: true });

  for (const es of earningsSnapshots ?? []) {
    events.push({
      eventType: 'EARNINGS',
      timestamp: es.computed_at,
      summary: `Earnings computed: ${es.verified_days_count} days × ${paiseToRupeeDisplay(es.daily_wage_paise)} = ${paiseToRupeeDisplay(es.total_earned_paise)}`,
      entityId: es.id,
      metadata: {
        periodStart: es.period_start,
        periodEnd: es.period_end,
        verifiedDays: es.verified_days_count,
        totalEarnedPaise: es.total_earned_paise,
      },
    });
  }

  // ── 7. PAYMENT ──
  const { data: payments } = await adminClient
    .from('payment_transactions')
    .select('id, transaction_ref, amount_paise, payment_source, status, created_at')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .order('created_at', { ascending: true });

  for (const pmt of payments ?? []) {
    events.push({
      eventType: 'PAYMENT',
      timestamp: pmt.created_at,
      summary: `Payment ${pmt.transaction_ref} — ${paiseToRupeeDisplay(pmt.amount_paise)} via ${pmt.payment_source} [${pmt.status}]`,
      entityId: pmt.id,
      metadata: {
        transactionRef: pmt.transaction_ref,
        amountPaise: pmt.amount_paise,
        paymentSource: pmt.payment_source,
        status: pmt.status,
      },
    });
  }

  // ── 8. PAYMENT_CONFIRMATION ──
  // Join via payment_transactions for this contract
  const paymentIds = (payments ?? []).map((p: { id: string }) => p.id);
  if (paymentIds.length > 0) {
    const { data: payConfirmations } = await adminClient
      .from('payment_confirmations')
      .select('id, transaction_id, is_confirmed, dispute_reason, confirmed_at')
      .in('transaction_id', paymentIds)
      .order('confirmed_at', { ascending: true });

    for (const pc of payConfirmations ?? []) {
      events.push({
        eventType: 'PAYMENT_CONFIRMATION',
        timestamp: pc.confirmed_at,
        summary: pc.is_confirmed
          ? 'Worker confirmed payment received'
          : `Worker disputed payment: ${pc.dispute_reason ?? 'unspecified'}`,
        entityId: pc.id,
        metadata: {
          transactionId: pc.transaction_id,
          isConfirmed: pc.is_confirmed,
          disputeReason: pc.dispute_reason,
        },
      });
    }
  }

  // ── 9. DISPUTE ──
  const { data: disputes } = await adminClient
    .from('disputes')
    .select('id, dispute_ref, category, status, priority, created_at')
    .eq('contract_id', contractId)
    .eq('worker_id', workerId)
    .order('created_at', { ascending: true });

  const disputeIds = (disputes ?? []).map((d: { id: string }) => d.id);

  for (const d of disputes ?? []) {
    events.push({
      eventType: 'DISPUTE',
      timestamp: d.created_at,
      summary: `Dispute ${d.dispute_ref} raised — category: ${d.category}, priority: ${d.priority}`,
      entityId: d.id,
      metadata: { disputeRef: d.dispute_ref, category: d.category, status: d.status },
    });
  }

  // ── 10. RESOLUTION ──
  if (disputeIds.length > 0) {
    const { data: resolutions } = await adminClient
      .from('dispute_resolutions')
      .select('id, dispute_id, decision, reason, resolved_at')
      .in('dispute_id', disputeIds)
      .order('resolved_at', { ascending: true });

    for (const res of resolutions ?? []) {
      events.push({
        eventType: 'RESOLUTION',
        timestamp: res.resolved_at,
        summary: `Dispute resolved — decision: ${res.decision}. ${res.reason}`,
        entityId: res.id,
        metadata: { disputeId: res.dispute_id, decision: res.decision },
      });
    }
  }

  // ── 11. JOB_COMPLETION ──
  const { data: completionStatement } = await adminClient
    .from('job_completion_statements')
    .select('*')
    .eq('contract_id', contractId)
    .maybeSingle();

  if (completionStatement) {
    const timestamp = completionStatement.generated_at || new Date().toISOString();
    events.push({
      eventType: 'JOB_COMPLETION',
      timestamp,
      summary: `Employment ended — settlement: ${completionStatement.settlement_status}. Earned: ${paiseToRupeeDisplay(completionStatement.total_earned_paise)}, Paid: ${paiseToRupeeDisplay(completionStatement.total_paid_paise)}, Outstanding: ${paiseToRupeeDisplay(completionStatement.outstanding_paise)}`,
      entityId: completionStatement.id,
      metadata: {
        settlementStatus: completionStatement.settlement_status,
        verifiedWorkdays: completionStatement.verified_workdays,
        totalEarnedPaise: completionStatement.total_earned_paise,
        totalPaidPaise: completionStatement.total_paid_paise,
        outstandingPaise: completionStatement.outstanding_paise,
      },
    });
  }

  // Sort all events chronologically
  events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return events;
}

// ─── Job Completion Statement ──────────────────────────────────────────────────

/**
 * Generates an immutable Job Completion Statement when employment ends.
 *
 * SETTLEMENT INVARIANT (enforced here — cannot be bypassed):
 *   outstanding_paise > 0  → settlement_status = OUTSTANDING_PAYMENT
 *   outstanding_paise <= 0 → settlement_status = SETTLED
 */
export async function generateJobCompletionStatement(
  params: JobCompletionStatementParams
): Promise<JobCompletionStatementRow> {
  const adminClient = createAdminClient();

  // 1. Fetch employment relationship
  const { data: empRel, error: empErr } = await adminClient
    .from('employment_relationships')
    .select('*')
    .eq('id', params.employmentRelationshipId)
    .single();

  if (empErr || !empRel) {
    throw new PassportServiceError('Employment relationship not found.', 404, 'EMPLOYMENT_NOT_FOUND');
  }

  if (empRel.contract_id !== params.contractId) {
    throw new PassportServiceError(
      'Contract ID does not match employment relationship.',
      400,
      'CONTRACT_MISMATCH'
    );
  }

  // Guard: only one statement per employment relationship
  const { data: existing } = await adminClient
    .from('job_completion_statements')
    .select('id')
    .eq('employment_relationship_id', params.employmentRelationshipId)
    .maybeSingle();

  if (existing) {
    throw new PassportServiceError(
      'A Job Completion Statement already exists for this employment relationship.',
      409,
      'STATEMENT_ALREADY_EXISTS'
    );
  }

  // 2. Fetch contract
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', params.contractId)
    .single();

  if (contractErr || !contract) {
    throw new PassportServiceError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  // 3. Reconciliation — authoritative financial figures
  const recon = await getContractReconciliation({ contractId: params.contractId });

  // 4. Dispute counts
  const { data: allDisputes } = await adminClient
    .from('disputes')
    .select('id, status')
    .eq('contract_id', params.contractId);

  const totalDisputes = allDisputes?.length ?? 0;
  const openDisputes = allDisputes?.filter(
    (d: { status: string }) => !['RESOLVED', 'REJECTED', 'CLOSED'].includes(d.status)
  ).length ?? 0;
  const resolvedDisputes = allDisputes?.filter(
    (d: { status: string }) => ['RESOLVED', 'CLOSED'].includes(d.status)
  ).length ?? 0;

  // 5. Acceptance date
  const { data: acceptance } = await adminClient
    .from('contract_acceptances')
    .select('responded_at')
    .eq('contract_id', params.contractId)
    .eq('worker_id', empRel.worker_id)
    .eq('response', 'ACCEPTED')
    .order('responded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const acceptanceDate = acceptance?.responded_at ?? empRel.acceptance_timestamp;

  // 6. Determine settlement status — CORE INVARIANT
  const settlementStatus: SettlementStatusEnum =
    recon.outstandingPaise > 0 ? 'OUTSTANDING_PAYMENT' : 'SETTLED';

  // 7. Insert immutable statement
  const { data: statement, error: insertErr } = await adminClient
    .from('job_completion_statements')
    .insert({
      employment_relationship_id: params.employmentRelationshipId,
      contract_id: params.contractId,
      worker_id: empRel.worker_id,
      contractor_id: empRel.contractor_id,
      project_id: empRel.project_id,
      work_type: contract.work_type,
      contract_period_start: contract.start_date,
      contract_period_end: contract.end_date ?? null,
      acceptance_date: acceptanceDate,
      daily_wage_paise: recon.dailyWagePaise,
      verified_workdays: recon.verifiedDaysCount,
      total_earned_paise: recon.totalEarnedPaise,
      total_paid_paise: recon.totalPaidPaise,
      outstanding_paise: recon.outstandingPaise,
      total_disputes: totalDisputes,
      open_disputes: openDisputes,
      resolved_disputes: resolvedDisputes,
      settlement_status: settlementStatus,
      generated_at: new Date().toISOString(),
      generated_by: params.generatedByUserId,
    })
    .select()
    .single();

  if (insertErr || !statement) {
    throw new PassportServiceError(
      `Failed to create Job Completion Statement: ${insertErr?.message}`,
      500,
      'STATEMENT_INSERT_FAILED'
    );
  }

  // 8. Append-only audit event
  await recordAuditEvent({
    actorId: params.generatedByUserId,
    action: 'job_completed',
    entityType: 'job_completion_statements',
    entityId: statement.id,
    payload: {
      contractId: params.contractId,
      workerId: empRel.worker_id,
      contractorId: empRel.contractor_id,
      settlementStatus,
      outstandingPaise: recon.outstandingPaise,
      totalEarnedPaise: recon.totalEarnedPaise,
      totalPaidPaise: recon.totalPaidPaise,
    },
  });

  return statement;
}

// ─── Cryptographic Verifiable Work Record Functions ─────────────────────────────

/**
 * Masks a worker's full name for public privacy-safe display:
 * "Ramesh Kumar" -> "R. Kumar"
 * "Sunita Sharma" -> "S. Sharma"
 * "Ramesh" -> "R."
 */
export function maskWorkerName(fullName: string): string {
  if (!fullName || typeof fullName !== 'string') return 'Worker Record';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return `${parts[0].charAt(0).toUpperCase()}.`;
  }
  const firstInitial = parts[0].charAt(0).toUpperCase();
  const lastName = parts[parts.length - 1];
  return `${firstInitial}. ${lastName}`;
}

/**
 * Deterministic JSON serialization: recursively sorts keys alphabetically.
 */
export function canonicalizeJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes SHA-256 hash of canonical snapshot concatenated with latest ledger hash.
 */
export function computePassportCredentialHash(
  snapshot: CanonicalPassportSnapshot,
  ledgerHash: string
): string {
  const canonicalString = canonicalizeJson(snapshot);
  return createHash('sha256').update(`${canonicalString}|${ledgerHash}`).digest('hex');
}

/**
 * Generates a unique, real certificate reference per issuance (e.g. WR-20260928-8F2B14).
 * Never returns 'NEW'.
 */
export function generateCredentialRef(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const randomHex = randomBytes(3).toString('hex').toUpperCase();
  return `WR-${yyyy}${mm}${dd}-${randomHex}`;
}

/**
 * Computes GPS validity percentage from attendance events.
 */
export async function getWorkerGpsValidityStats(workerId: string): Promise<{
  totalPunches: number;
  validGpsPunches: number;
  gpsValidityPercent: number;
}> {
  const adminClient = createAdminClient();
  const { data: attendanceEvents } = await adminClient
    .from('attendance_events')
    .select('calculated_distance_meters, allowed_radius_meters, status')
    .eq('worker_id', workerId);

  const events = attendanceEvents || [];
  const totalPunches = events.length;
  if (totalPunches === 0) {
    return {
      totalPunches: 0,
      validGpsPunches: 0,
      gpsValidityPercent: 100,
    };
  }

  const validGpsPunches = events.filter((e: any) => {
    if (e.status === 'VERIFIED') return true;
    if (typeof e.calculated_distance_meters === 'number' && typeof e.allowed_radius_meters === 'number') {
      return e.calculated_distance_meters <= e.allowed_radius_meters;
    }
    return false;
  }).length;

  const gpsValidityPercent = Math.round((validGpsPunches / totalPunches) * 100);

  return {
    totalPunches,
    validGpsPunches,
    gpsValidityPercent,
  };
}

/**
 * Computes dispute statistics (including resolved-in-favour count) from disputes table.
 */
export async function getWorkerDisputeStats(workerId: string): Promise<{
  totalDisputes: number;
  resolvedInFavourCount: number;
  dismissedCount: number;
  openCount: number;
}> {
  const adminClient = createAdminClient();
  const { data: disputes } = await adminClient
    .from('disputes')
    .select('status, ruling_decision')
    .eq('worker_id', workerId);

  const list = disputes || [];
  const totalDisputes = list.length;
  const resolvedInFavourCount = list.filter(
    (d: any) =>
      d.status === 'RESOLVED' &&
      (d.ruling_decision === 'ORDER_PAYMENT' || d.ruling_decision === 'PARTIAL_SETTLEMENT')
  ).length;
  const dismissedCount = list.filter(
    (d: any) => d.status === 'RESOLVED' && d.ruling_decision === 'DISMISS'
  ).length;
  const openCount = list.filter(
    (d: any) => d.status === 'OPEN' || d.status === 'UNDER_REVIEW'
  ).length;

  return {
    totalDisputes,
    resolvedInFavourCount,
    dismissedCount,
    openCount,
  };
}

/**
 * Issues a new cryptographically verifiable work record credential.
 */
export async function issueWorkRecordCredential(
  workerId: string,
  consent?: Partial<SharingConsent>
): Promise<IssuedCredential> {
  const adminClient = createAdminClient();

  const { data: worker, error: workerErr } = await adminClient
    .from('workers')
    .select('id, full_name, internal_worker_id, occupation, skill_category')
    .eq('id', workerId)
    .single();

  if (workerErr || !worker) {
    throw new PassportServiceError('Worker not found.', 404, 'WORKER_NOT_FOUND');
  }

  const [financialSummary, gpsStats, disputeStats, employmentHistory, latestLedgerHash] = await Promise.all([
    getWorkerFinancialSummary(workerId),
    getWorkerGpsValidityStats(workerId),
    getWorkerDisputeStats(workerId),
    getEmploymentHistory(workerId),
    getLatestLedgerHash(),
  ]);

  const issuedAt = new Date().toISOString();
  const credentialRef = generateCredentialRef();
  const effectiveConsent: SharingConsent = {
    ...DEFAULT_SHARING_CONSENT,
    ...(consent || {}),
  };

  const snapshot: CanonicalPassportSnapshot = {
    workerId: worker.id,
    fullName: worker.full_name,
    internalWorkerId: worker.internal_worker_id,
    skillCategory: worker.skill_category || 'GENERAL',
    occupation: worker.occupation || 'General Labour',
    totalVerifiedWorkdays: financialSummary.verifiedDaysCount,
    totalEarnedPaise: financialSummary.totalEarnedPaise,
    totalPaidPaise: financialSummary.totalPaidPaise,
    outstandingPaise: financialSummary.outstandingPaise,
    gpsValidityPercent: gpsStats.gpsValidityPercent,
    employerRelationshipsCount: employmentHistory.length,
    disputesResolvedInFavourCount: disputeStats.resolvedInFavourCount,
    issuedAt,
  };

  const credentialHash = computePassportCredentialHash(snapshot, latestLedgerHash);

  const { data: row, error: insertErr } = await adminClient
    .from('issued_credentials')
    .insert({
      credential_ref: credentialRef,
      worker_id: worker.id,
      snapshot_payload: snapshot as any,
      ledger_hash_at_issuance: latestLedgerHash,
      credential_hash: credentialHash,
      sharing_consent: effectiveConsent as any,
      issued_at: issuedAt,
    })
    .select()
    .single();

  if (insertErr || !row) {
    throw new PassportServiceError(`Failed to issue credential: ${insertErr?.message || 'Database error'}`, 500);
  }

  await recordAuditLog({
    actor: worker.id,
    action: 'WORK_RECORD_CREDENTIAL_ISSUED',
    before: null,
    after: {
      credentialRef,
      credentialHash,
      ledgerHashAtIssuance: latestLedgerHash,
      sharingConsent: effectiveConsent,
    },
    entityType: 'issued_credentials',
    entityId: row.id,
  });

  return {
    id: row.id,
    credentialRef: row.credential_ref,
    workerId: row.worker_id,
    snapshotPayload: row.snapshot_payload as CanonicalPassportSnapshot,
    ledgerHashAtIssuance: row.ledger_hash_at_issuance,
    credentialHash: row.credential_hash,
    sharingConsent: row.sharing_consent as SharingConsent,
    issuedAt: row.issued_at,
    revokedAt: row.revoked_at,
  };
}

/**
 * Returns latest issued credential for worker, or null if none issued yet.
 */
export async function getLatestIssuedCredential(workerId: string): Promise<IssuedCredential | null> {
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('issued_credentials')
    .select('*')
    .eq('worker_id', workerId)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  return {
    id: data.id,
    credentialRef: data.credential_ref,
    workerId: data.worker_id,
    snapshotPayload: data.snapshot_payload as CanonicalPassportSnapshot,
    ledgerHashAtIssuance: data.ledger_hash_at_issuance,
    credentialHash: data.credential_hash,
    sharingConsent: (data.sharing_consent || DEFAULT_SHARING_CONSENT) as SharingConsent,
    issuedAt: data.issued_at,
    revokedAt: data.revoked_at,
  };
}

/**
 * Returns latest issued credential for worker, or issues a fresh one if none exists.
 */
export async function getOrIssueLatestCredential(
  workerId: string,
  consent?: Partial<SharingConsent>
): Promise<IssuedCredential> {
  const existing = await getLatestIssuedCredential(workerId);
  if (existing) {
    if (consent && Object.keys(consent).length > 0) {
      return await issueWorkRecordCredential(workerId, consent);
    }
    return existing;
  }
  return await issueWorkRecordCredential(workerId, consent);
}

/**
 * Public unauthenticated third-party verification by certificate reference.
 * Returns privacy-safe details (masked name initial) and validates cryptographic hash against ledger anchor.
 */
export async function verifyCredentialByRef(
  credentialRef: string
): Promise<PublicCredentialVerificationResult> {
  const adminClient = createAdminClient();
  const { data: cred, error } = await adminClient
    .from('issued_credentials')
    .select('*')
    .eq('credential_ref', credentialRef)
    .maybeSingle();

  const guarantees = {
    ledgerChained: true,
    tamperEvident: true,
    guaranteedStatements: [
      'Shift attendance and GPS presence validation match the immutable ledger state at time of issuance.',
      'Double-entry wage ledger hash is chained: historical transactions cannot be silently reordered or mutated.',
      'Dispute arbitration rulings are officially recorded by authorized adjudicators.',
    ],
    nonGuaranteedDisclaimers: [
      'Not a government-issued document or identity passport under the Passports Act, 1967.',
      'Validates historical state up to the recorded issue timestamp; shifts worked after issuance require credential refresh.',
      'Does not certify unrecorded cash payments or informal transactions outside platform contracts.',
    ],
  };

  if (error || !cred) {
    return {
      status: 'NOT_FOUND',
      isValid: false,
      credentialRef,
      tamperReason: 'Certificate reference was not found in the ShramikSetu registry.',
      guarantees,
    };
  }

  const snapshot = cred.snapshot_payload as CanonicalPassportSnapshot;
  const ledgerHashAtIssuance = cred.ledger_hash_at_issuance;
  const storedCredentialHash = cred.credential_hash;
  const sharingConsent = (cred.sharing_consent || DEFAULT_SHARING_CONSENT) as SharingConsent;

  // Recompute hash against canonical snapshot + ledger hash
  const recomputedHash = computePassportCredentialHash(snapshot, ledgerHashAtIssuance);

  if (recomputedHash !== storedCredentialHash) {
    return {
      status: 'TAMPERED',
      isValid: false,
      credentialRef,
      tamperReason: 'Cryptographic hash mismatch. Stored record or snapshot data has been altered after issuance.',
      issuedAt: cred.issued_at,
      ledgerHashAtIssuance,
      credentialHash: storedCredentialHash,
      guarantees,
    };
  }

  return {
    status: 'VERIFIED',
    isValid: true,
    credentialRef,
    workerNameMasked: maskWorkerName(snapshot.fullName),
    skillCategory: snapshot.skillCategory,
    occupation: snapshot.occupation,
    totalVerifiedWorkdays: snapshot.totalVerifiedWorkdays,
    gpsValidityPercent: snapshot.gpsValidityPercent,
    employerRelationshipsCount: snapshot.employerRelationshipsCount,
    disputesResolvedInFavourCount: snapshot.disputesResolvedInFavourCount,
    totalEarnedRupees: sharingConsent.shareEarnings ? paiseToRupees(snapshot.totalEarnedPaise) : null,
    sharingConsent,
    issuedAt: cred.issued_at,
    ledgerHashAtIssuance,
    credentialHash: storedCredentialHash,
    guarantees,
  };
}

// ─── Benefit Passport Data ─────────────────────────────────────────────────────

/**
 * Assembles the full Benefit Passport data object for a worker.
 * This is the authoritative source for both JSON API and PDF generation.
 */
export async function getBenefitPassportData(workerId: string): Promise<BenefitPassportData> {
  const adminClient = createAdminClient();

  // Worker profile
  const { data: worker, error: workerErr } = await adminClient
    .from('workers')
    .select('*')
    .eq('id', workerId)
    .single();

  if (workerErr || !worker) {
    throw new PassportServiceError('Worker not found.', 404, 'WORKER_NOT_FOUND');
  }

  // Employment history
  const employmentHistory = await getEmploymentHistory(workerId);

  // All completion statements
  const { data: completionStatements } = await adminClient
    .from('job_completion_statements')
    .select('*')
    .eq('worker_id', workerId)
    .order('generated_at', { ascending: false });

  // Authoritative financial totals from single source of truth view
  const summary = await getWorkerFinancialSummary(workerId);
  const totalVerifiedWorkdays = summary.verifiedDaysCount;
  const totalEarnedPaise = summary.totalEarnedPaise;
  const totalPaidPaise = summary.totalPaidPaise;
  const totalOutstandingPaise = summary.outstandingPaise;

  // Additional credential metrics
  const [gpsStats, disputeStats, latestCred] = await Promise.all([
    getWorkerGpsValidityStats(workerId),
    getWorkerDisputeStats(workerId),
    getLatestIssuedCredential(workerId).catch(() => null),
  ]);

  return {
    workerId: worker.id,
    workerName: worker.full_name,
    internalWorkerId: worker.internal_worker_id,
    occupation: worker.occupation,
    skillCategory: worker.skill_category,
    passportGeneratedAt: new Date().toISOString(),
    totalEmployments: employmentHistory.length,
    totalVerifiedWorkdays,
    totalEarnedPaise,
    totalEarnedRupees: paiseToRupees(totalEarnedPaise),
    totalPaidPaise,
    totalPaidRupees: paiseToRupees(totalPaidPaise),
    totalOutstandingPaise,
    totalOutstandingRupees: paiseToRupees(totalOutstandingPaise),
    employmentHistory,
    completionStatements: completionStatements ?? [],
    gpsValidityPercent: gpsStats.gpsValidityPercent,
    disputesResolvedInFavourCount: disputeStats.resolvedInFavourCount,
    disputesTotalCount: disputeStats.totalDisputes,
    credentialRef: latestCred?.credentialRef || null,
    credentialHash: latestCred?.credentialHash || null,
    ledgerHashAtIssuance: latestCred?.ledgerHashAtIssuance || null,
    sharingConsent: latestCred?.sharingConsent || DEFAULT_SHARING_CONSENT,
  };
}

// ─── PDF Generation ────────────────────────────────────────────────────────────

/**
 * Generates the ShramikSetu Verified Work Record PDF server-side using pdfkit.
 *
 * IMPORTANT STATUTORY DISCLAIMER:
 * This document is a "ShramikSetu Verified Work Record".
 * It is NOT a government-issued document or KYC certificate.
 *
 * Bilingual: English + Hindi/Marathi annotations.
 * Includes cryptographic verification block with QR code linking to /verify/[ref].
 */
export async function generatePassportPdf(
  workerId: string,
  options?: { credentialRef?: string; consent?: Partial<SharingConsent> }
): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;

  // Retrieve or issue credential
  let credential: IssuedCredential;
  if (options?.credentialRef) {
    const credRes = await verifyCredentialByRef(options.credentialRef);
    if (credRes.isValid) {
      const adminClient = createAdminClient();
      const { data: dbCred } = await adminClient
        .from('issued_credentials')
        .select('*')
        .eq('credential_ref', options.credentialRef)
        .single();
      credential = {
        id: dbCred.id,
        credentialRef: dbCred.credential_ref,
        workerId: dbCred.worker_id,
        snapshotPayload: dbCred.snapshot_payload as CanonicalPassportSnapshot,
        ledgerHashAtIssuance: dbCred.ledger_hash_at_issuance,
        credentialHash: dbCred.credential_hash,
        sharingConsent: dbCred.sharing_consent as SharingConsent,
        issuedAt: dbCred.issued_at,
        revokedAt: dbCred.revoked_at,
      };
    } else {
      credential = await getOrIssueLatestCredential(workerId, options?.consent);
    }
  } else {
    credential = await getOrIssueLatestCredential(workerId, options?.consent);
  }

  const passport = await getBenefitPassportData(workerId);
  const consent: SharingConsent = {
    ...(credential.sharingConsent || DEFAULT_SHARING_CONSENT),
    ...(options?.consent || {}),
  };
  const snapshot = credential.snapshotPayload;

  // QR Code URL for public verification
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.shramiksetu.in';
  const verifyUrl = `${baseUrl}/verify/${credential.credentialRef}`;
  const qrBuffer = await QRCode.toBuffer(verifyUrl, {
    width: 120,
    margin: 1,
    color: { dark: '#111827', light: '#FFFFFF' },
  });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Header Banner ──
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1E3A8A')
      .text('ShramikSetu Verified Work Record', { align: 'center' });

    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#374151')
      .text('श्रमिक सेतु सत्यापित कार्य विवरण · STATUTORY WAGE & ATTENDANCE LEDGER', { align: 'center' });

    doc.moveDown(0.3);

    // ── Visible Legal Disclaimer Box ──
    const disclaimerY = doc.y;
    doc.rect(40, disclaimerY, 515, 30).fillAndStroke('#FEF3C7', '#D97706');
    doc
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor('#92400E')
      .text(
        'NOT A GOVERNMENT-ISSUED DOCUMENT · यह कोई सरकारी दस्तावेज नहीं है',
        50,
        disclaimerY + 6,
        { align: 'center', width: 495 }
      )
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        'Issued under ShramikSetu digital wage ledger integrity verification. Verifies shift attendance and double-entry disbursements.',
        50,
        disclaimerY + 18,
        { align: 'center', width: 495 }
      );

    doc.y = disclaimerY + 38;
    doc.moveDown(0.3);

    // ── Reference Strip ──
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(`Certificate Ref: ${credential.credentialRef}`, 40, doc.y, { continued: true })
      .font('Helvetica')
      .fillColor('#6B7280')
      .text(`  |  Issue Date: ${new Date(credential.issuedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}  |  Status: VERIFIED RECORD`);

    doc.moveDown(0.3);
    drawHorizontalRule(doc);

    // ── Worker Profile (Two Columns) ──
    doc.moveDown(0.4);
    const colY = doc.y;

    // Left Column: Identity
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('WORKER PROFILE · कामगार विवरण', 40, colY);

    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica');

    const profileLines: [string, string][] = [
      ['Full Name · नाम', passport.workerName],
      ['Worker ID · पहचान संख्या', passport.internalWorkerId],
      ['Skill Category · कौशल श्रेणी', passport.skillCategory],
      ['Designated Occupation · पद', passport.occupation],
    ];

    for (const [label, val] of profileLines) {
      doc
        .fillColor('#4B5563')
        .text(`${label}: `, 40, doc.y, { continued: true })
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(val)
        .font('Helvetica');
    }

    // Right Column: Service & Arbitration Metrics
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('VERIFIED SERVICE METRICS · सेवा विवरण', 300, colY);

    doc.y = colY + 16;
    doc.fontSize(9).font('Helvetica');

    const metricsLines: [string, string][] = [
      ['Verified Shifts · कार्य दिवस', String(snapshot.totalVerifiedWorkdays)],
      ['GPS Geofence Validity · जीपीएस दर', `${snapshot.gpsValidityPercent}%`],
      ['Employer Relationships · नियोक्ता', String(snapshot.employerRelationshipsCount)],
      ['Disputes In Worker Favour · हल विवाद', `${snapshot.disputesResolvedInFavourCount} of ${passport.disputesTotalCount ?? snapshot.disputesResolvedInFavourCount}`],
    ];

    if (consent.shareEarnings) {
      metricsLines.push(['Lifetime Verified Earned · कुल आय', paiseToRupeeDisplay(snapshot.totalEarnedPaise)]);
      metricsLines.push(['Disbursed Payments · कुल भुगतान', paiseToRupeeDisplay(snapshot.totalPaidPaise)]);
    } else {
      metricsLines.push(['Earnings · मजदूरी', '[REDACTED BY WORKER PRIVACY CONSENT]']);
    }

    for (const [label, val] of metricsLines) {
      doc
        .fillColor('#4B5563')
        .text(`${label}: `, 300, doc.y, { continued: true })
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(val)
        .font('Helvetica');
    }

    doc.y = Math.max(doc.y, colY + 95);
    doc.moveDown(0.4);
    drawHorizontalRule(doc);

    // ── Audited Employment History ──
    doc.moveDown(0.4);
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('AUDITED EMPLOYMENT RELATIONSHIPS · प्रमाणित नियोक्ता संबंध');

    doc.moveDown(0.3);

    if (passport.employmentHistory.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#6B7280').text('No audited employment relationships on record yet.');
    } else {
      const entriesToShow = passport.employmentHistory.slice(0, 3);
      for (let i = 0; i < entriesToShow.length; i++) {
        const entry = entriesToShow[i];
        const employerTitle = consent.shareEmployerNames
          ? `${entry.contractorCompany || entry.contractorName} — ${entry.projectName}`
          : `Employer #${entry.contractorId.slice(0, 8)} — Project #${entry.projectId.slice(0, 8)}`;

        doc
          .fontSize(9.5)
          .font('Helvetica-Bold')
          .fillColor('#1E3A8A')
          .text(`${i + 1}. ${employerTitle}`);

        doc.fontSize(8.5).font('Helvetica').fillColor('#374151');
        const periodStr = `${entry.startDate} → ${entry.endDate || 'Active'}`;
        const wageInfo = consent.shareEarnings ? `  |  Daily Wage: ${paiseToRupeeDisplay(entry.dailyWagePaise)}` : '';
        doc.text(`   Role: ${entry.workType}  |  Period: ${periodStr}  |  Shifts: ${entry.verifiedWorkdays}${wageInfo}`);
        doc.moveDown(0.2);
      }
    }

    doc.moveDown(0.4);
    drawHorizontalRule(doc);

    // ── Tamper-Evident Verification & Chaining Section with QR Code ──
    doc.moveDown(0.4);
    const certBoxY = doc.y;

    // Draw container box
    doc.rect(40, certBoxY, 515, 125).fillAndStroke('#F9FAFB', '#D1D5DB');

    // Embed QR Code on the Left
    doc.image(qrBuffer, 52, certBoxY + 12, { width: 95, height: 95 });

    // Details on Right of QR Code
    const textLeft = 160;
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .fillColor('#065F46')
      .text('CRYPTOGRAPHIC VERIFICATION SEAL · डिजिटल प्रमाणन मुहर', textLeft, certBoxY + 10);

    doc.moveDown(0.2);
    doc.fontSize(7.5).font('Helvetica').fillColor('#374151');
    doc.text(`Scan QR or visit: ${verifyUrl}`, textLeft, doc.y, { width: 380 });
    doc.text(`Ledger Hash Chain Anchor: ${credential.ledgerHashAtIssuance.slice(0, 36)}...`, textLeft, doc.y, { width: 380 });
    doc.text(`Credential SHA-256 Hash: ${credential.credentialHash.slice(0, 36)}...`, textLeft, doc.y, { width: 380 });

    doc.moveDown(0.3);
    doc.fontSize(7).font('Helvetica-Bold').fillColor('#111827');
    doc.text('Guaranteed: Shift count, GPS gate validation, and double-entry wage ledger consistency at issuance timestamp.', textLeft, doc.y, { width: 380 });
    doc.font('Helvetica').fillColor('#6B7280');
    doc.text('Not Guaranteed: Not an official KYC/ID document. Off-platform unrecorded transactions are excluded.', textLeft, doc.y, { width: 380 });

    // ── Visible Legal Footer ──
    doc.y = certBoxY + 135;
    doc
      .fontSize(7.5)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text(
        'ShramikSetu Verified Work Record | Not a government-issued document | Cryptographically verified against double-entry wage ledger',
        40,
        doc.y,
        { align: 'center', width: 515 }
      );

    doc.end();
  });
}


// ─── Helpers ───────────────────────────────────────────────────────────────────

function drawHorizontalRule(doc: InstanceType<typeof import('pdfkit')>) {
  doc
    .strokeColor('#333333')
    .lineWidth(0.5)
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke()
    .lineWidth(1)
    .strokeColor('#000000');
}
