import { createAdminClient } from '@/lib/supabase/admin';
import { logSensitiveOperation } from '@/lib/auth/audit';
import type { Database } from '@/types/database.types';

export interface CreateAttendanceSummaryParams {
  creatorUserId: string;
  contractId: string;
  startDate: string;
  endDate: string;
  recordedDaysCount: number;
  notes?: string;
}

export interface WorkerConfirmationResponseParams {
  workerUserId: string;
  summaryId: string;
  isConfirmed: boolean;
  discrepancyReason?: 'WORKED_MORE_DAYS' | 'WORKED_FEWER_DAYS' | 'MISSING_ATTENDANCE' | 'INCORRECT_ATTENDANCE';
  workerClaimedDaysCount?: number;
  comments?: string;
}

export class ConfirmationServiceError extends Error {
  public statusCode: number;
  public reasonCode: string;

  constructor(message: string, statusCode: number = 400, reasonCode: string = 'CONFIRMATION_FAILED') {
    super(message);
    this.name = 'ConfirmationServiceError';
    this.statusCode = statusCode;
    this.reasonCode = reasonCode;
  }
}

/**
 * Creates an attendance summary for a work contract period (Contractor / System action).
 */
export async function createAttendanceSummary(params: CreateAttendanceSummaryParams) {
  const adminClient = createAdminClient();

  // Validate contract exists
  const { data: contract, error: contractErr } = await adminClient
    .from('work_contracts')
    .select('*')
    .eq('id', params.contractId)
    .maybeSingle();

  if (contractErr || !contract) {
    throw new ConfirmationServiceError('Work contract not found.', 404, 'CONTRACT_NOT_FOUND');
  }

  // Insert summary
  const { data: summary, error: insertErr } = await adminClient
    .from('attendance_summaries')
    .insert({
      contract_id: contract.id,
      worker_id: contract.worker_id,
      contractor_id: contract.contractor_id,
      project_id: contract.project_id,
      start_date: params.startDate,
      end_date: params.endDate,
      recorded_days_count: params.recordedDaysCount,
      status: 'PENDING_CONFIRMATION',
      notes: params.notes || null,
      created_by: params.creatorUserId,
    })
    .select()
    .single();

  if (insertErr || !summary) {
    throw new ConfirmationServiceError(`Failed to create attendance summary: ${insertErr?.message}`, 500, 'SUMMARY_CREATION_FAILED');
  }

  await logSensitiveOperation({
    actorId: params.creatorUserId,
    action: 'ATTENDANCE_SUMMARY_CREATED',
    entityType: 'attendance_summaries',
    entityId: summary.id,
    afterState: summary,
  });

  return summary;
}

/**
 * Worker responds to attendance summary (YES / NO confirmation or dispute report).
 */
export async function respondWorkerConfirmation(params: WorkerConfirmationResponseParams) {
  const adminClient = createAdminClient();

  // 1. Fetch authenticated worker profile
  const { data: worker, error: workerErr } = await adminClient
    .from('workers')
    .select('*')
    .eq('user_id', params.workerUserId)
    .maybeSingle();

  if (workerErr || !worker) {
    throw new ConfirmationServiceError('Worker profile not found for authenticated user.', 403, 'UNAUTHORIZED_WORKER');
  }

  // 2. Fetch target summary
  const { data: summary, error: summaryErr } = await adminClient
    .from('attendance_summaries')
    .select('*')
    .eq('id', params.summaryId)
    .maybeSingle();

  if (summaryErr || !summary) {
    throw new ConfirmationServiceError('Attendance summary not found.', 404, 'SUMMARY_NOT_FOUND');
  }

  // 3. UNAUTHORIZED CHECK: Verify worker is the contract worker
  if (summary.worker_id !== worker.id) {
    throw new ConfirmationServiceError('Unauthorized: Only the assigned worker can confirm or reject this summary.', 403, 'UNAUTHORIZED_CONFIRMATION');
  }

  // 4. Check if confirmation already exists for this summary
  const { data: existingConfirmation } = await adminClient
    .from('worker_confirmations')
    .select('*')
    .eq('summary_id', summary.id)
    .maybeSingle();

  if (existingConfirmation) {
    throw new ConfirmationServiceError('Attendance summary has already been responded to.', 409, 'ALREADY_RESPONDED');
  }

  // 5. YES (CONFIRMED) FLOW
  if (params.isConfirmed) {
    const { data: confirmation, error: confErr } = await adminClient
      .from('worker_confirmations')
      .insert({
        summary_id: summary.id,
        worker_id: worker.id,
        contract_id: summary.contract_id,
        is_confirmed: true,
        discrepancy_reason: null,
        worker_claimed_days_count: summary.recorded_days_count,
        comments: params.comments || 'Confirmed by worker',
      })
      .select()
      .single();

    if (confErr || !confirmation) {
      throw new ConfirmationServiceError(`Failed to record worker confirmation: ${confErr?.message}`, 500, 'CONFIRMATION_RECORD_FAILED');
    }

    // Update summary status
    await adminClient
      .from('attendance_summaries')
      .update({ status: 'CONFIRMED' })
      .eq('id', summary.id);

    await logSensitiveOperation({
      actorId: params.workerUserId,
      action: 'WORKER_ATTENDANCE_CONFIRMED',
      entityType: 'worker_confirmations',
      entityId: confirmation.id,
      afterState: confirmation,
    });

    return {
      status: 'CONFIRMED',
      confirmation,
      summaryId: summary.id,
      message: 'Worker successfully confirmed attendance summary.',
    };
  }

  // 6. NO (REJECTED / DISCREPANCY) FLOW
  if (!params.discrepancyReason) {
    throw new ConfirmationServiceError('A valid discrepancy reason is required when rejecting attendance summary.', 400, 'MISSING_REASON');
  }

  const { data: confirmation, error: confErr } = await adminClient
    .from('worker_confirmations')
    .insert({
      summary_id: summary.id,
      worker_id: worker.id,
      contract_id: summary.contract_id,
      is_confirmed: false,
      discrepancy_reason: params.discrepancyReason,
      worker_claimed_days_count: params.workerClaimedDaysCount !== undefined ? params.workerClaimedDaysCount : null,
      comments: params.comments || 'Disputed by worker',
    })
    .select()
    .single();

  if (confErr || !confirmation) {
    throw new ConfirmationServiceError(`Failed to record worker rejection: ${confErr?.message}`, 500, 'REJECTION_RECORD_FAILED');
  }

  // Create dispute-ready discrepancy record without overwriting original attendance rows
  const eventUuid = `summary-discrepancy-${summary.id}-${Date.now()}`;
  const { data: discrepancy } = await adminClient
    .from('attendance_discrepancies')
    .insert({
      event_uuid: eventUuid,
      worker_id: worker.id,
      contract_id: summary.contract_id,
      project_id: summary.project_id,
      date: summary.end_date,
      conflict_type: 'SUMMARY_DISCREPANCY_REPORTED',
      worker_claim: {
        discrepancyReason: params.discrepancyReason,
        workerClaimedDaysCount: params.workerClaimedDaysCount,
        comments: params.comments,
      },
      contractor_record: {
        recordedDaysCount: summary.recorded_days_count,
        startDate: summary.start_date,
        endDate: summary.end_date,
      },
      status: 'OPEN',
      resolution_notes: `Worker rejected contractor summary of ${summary.recorded_days_count} days with reason: ${params.discrepancyReason}.`,
    })
    .select()
    .single();

  // Update summary status to DISPUTED
  await adminClient
    .from('attendance_summaries')
    .update({ status: 'DISPUTED' })
    .eq('id', summary.id);

  await logSensitiveOperation({
    actorId: params.workerUserId,
    action: 'WORKER_ATTENDANCE_DISPUTED',
    entityType: 'worker_confirmations',
    entityId: confirmation.id,
    afterState: { confirmation, discrepancy },
  });

  return {
    status: 'DISPUTED',
    confirmation,
    discrepancy,
    summaryId: summary.id,
    message: 'Worker rejected attendance summary. Dispute-ready discrepancy record created.',
  };
}
