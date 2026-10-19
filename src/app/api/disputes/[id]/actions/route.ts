import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  withdrawDispute,
  escalateDispute,
  confirmDisputeResolution,
  DisputeServiceError,
} from '@/lib/services/dispute-service';

/**
 * POST /api/disputes/[id]/actions
 * Worker actions on disputes:
 * - action = 'withdraw'
 * - action = 'escalate'
 * - action = 'confirm_resolution'
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;

    if (!disputeId) {
      return NextResponse.json({ error: 'Dispute ID is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: dispute, error: dispErr } = await adminClient
      .from('disputes')
      .select('id, worker_id, status')
      .eq('id', disputeId)
      .maybeSingle();

    if (dispErr || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Strict worker authorization check
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== dispute.worker_id) {
        return NextResponse.json(
          { error: 'Forbidden: You can only perform actions on your own disputes.' },
          { status: 403 }
        );
      }
    } else if (authCtx.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Worker role required for dispute actions.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const action = body.action;

    let updatedDispute: any;

    if (action === 'withdraw') {
      updatedDispute = await withdrawDispute({
        disputeId,
        workerUserId: authCtx.user.id,
        reason: body.reason,
      });
    } else if (action === 'escalate') {
      updatedDispute = await escalateDispute({
        disputeId,
        workerUserId: authCtx.user.id,
        reason: body.reason,
      });
    } else if (action === 'confirm_resolution') {
      updatedDispute = await confirmDisputeResolution({
        disputeId,
        workerUserId: authCtx.user.id,
        notes: body.notes,
      });
    } else {
      return NextResponse.json(
        { error: `Invalid action '${action}'. Allowed: withdraw, escalate, confirm_resolution.` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, dispute: updatedDispute }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof DisputeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/disputes/[id]/actions] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
