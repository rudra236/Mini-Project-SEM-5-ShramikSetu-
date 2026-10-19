import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireProjectAccess, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { logSensitiveOperation } from '@/lib/auth/audit';
import { recordWageAccrual } from '@/lib/services/ledger-service';
import { z } from 'zod';

/**
 * GET: List fraud review queue items for a project
 * POST: Resolve a flagged attendance event
 */

const resolveSchema = z.object({
  reviewItemId: z.string().uuid().optional(),
  attendanceEventId: z.string().uuid().optional(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().optional(),
}).refine((data) => data.reviewItemId || data.attendanceEventId, {
  message: 'Either reviewItemId or attendanceEventId is required.',
});

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'SUPERVISOR', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (projectId) {
      await requireProjectAccess(projectId);
    }

    const adminClient = createAdminClient();
    let query = adminClient
      .from('fraud_review_queue')
      .select(`
        *,
        attendance_events(*),
        workers(id, full_name, internal_worker_id)
      `)
      .order('created_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    // Only show pending by default
    const showAll = searchParams.get('showAll') === 'true';
    if (!showAll) {
      query = query.is('review_decision', null);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json(
        { error: { code: 'QUERY_FAILED', message: error.message } },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, reviewItems: data || [] });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'SUPERVISOR', 'ADMIN']);
    const body = await req.json();
    const parsed = resolveSchema.parse(body);

    const adminClient = createAdminClient();

    let reviewItem: any = null;
    let attendanceEvent: any = null;

    if (parsed.reviewItemId) {
      const { data: item, error: fetchErr } = await adminClient
        .from('fraud_review_queue')
        .select('*')
        .eq('id', parsed.reviewItemId)
        .single();

      if (fetchErr || !item) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Review item not found.' } },
          { status: 404 }
        );
      }
      reviewItem = item;
    } else if (parsed.attendanceEventId) {
      const { data: att, error: attErr } = await adminClient
        .from('attendance_events')
        .select('*')
        .eq('id', parsed.attendanceEventId)
        .single();

      if (attErr || !att) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: 'Attendance event not found.' } },
          { status: 404 }
        );
      }
      attendanceEvent = att;

      const { data: item } = await adminClient
        .from('fraud_review_queue')
        .select('*')
        .eq('attendance_event_id', parsed.attendanceEventId)
        .maybeSingle();

      reviewItem = item;
    }

    const targetProjectId = reviewItem?.project_id || attendanceEvent?.project_id;
    const targetAttendanceEventId = reviewItem?.attendance_event_id || attendanceEvent?.id;

    // Verify project access
    await requireProjectAccess(targetProjectId);

    // Update review item if it exists
    let updatedReviewItem: any = null;
    if (reviewItem) {
      const { data: updated, error: updateErr } = await adminClient
        .from('fraud_review_queue')
        .update({
          reviewed_by: authCtx.user.id,
          reviewed_at: new Date().toISOString(),
          review_decision: parsed.decision,
          review_notes: parsed.notes || null,
        })
        .eq('id', reviewItem.id)
        .select()
        .single();

      if (updateErr) {
        return NextResponse.json(
          { error: { code: 'UPDATE_FAILED', message: updateErr.message } },
          { status: 400 }
        );
      }
      updatedReviewItem = updated;
    }

    // Update attendance event status & review_status
    const newAttendanceStatus = parsed.decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED';
    if (targetAttendanceEventId) {
      await adminClient
        .from('attendance_events')
        .update({
          review_status: parsed.decision,
          status: newAttendanceStatus,
        })
        .eq('id', targetAttendanceEventId);

      // If approved, record wage accrual in double-entry ledger
      if (parsed.decision === 'APPROVED') {
        const { data: att } = await adminClient
          .from('attendance_events')
          .select('*, work_contracts(id, worker_id, contractor_id, daily_wage)')
          .eq('id', targetAttendanceEventId)
          .maybeSingle();

        if (att && att.work_contracts) {
          await recordWageAccrual({
            attendanceEventId: att.id,
            contractId: att.work_contracts.id,
            workerId: att.work_contracts.worker_id,
            contractorId: att.work_contracts.contractor_id,
            amountPaise: att.work_contracts.daily_wage,
            date: att.date,
          }).catch((err: any) => console.warn('Accrual on review warning:', err?.message));
        }
      }
    }

    await logSensitiveOperation({
      actorId: authCtx.user.id,
      action: `ATTENDANCE_REVIEW_${parsed.decision}`,
      entityType: reviewItem ? 'fraud_review_queue' : 'attendance_events',
      entityId: reviewItem?.id || targetAttendanceEventId,
      afterState: {
        decision: parsed.decision,
        attendanceEventId: targetAttendanceEventId,
        notes: parsed.notes,
      },
    });

    return NextResponse.json({
      success: true,
      reviewItem: updatedReviewItem,
      attendanceStatus: newAttendanceStatus,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: error.message } },
      { status: 500 }
    );
  }
}
