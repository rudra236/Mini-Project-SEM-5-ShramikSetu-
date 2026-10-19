import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { postDisputeMessage, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * GET & POST /api/disputes/[id]/messages
 * Message thread for dispute participants.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;

    const adminClient = createAdminClient();
    const { data: dispute, error: dispErr } = await adminClient
      .from('disputes')
      .select('id, worker_id, contractor_id')
      .eq('id', disputeId)
      .maybeSingle();

    if (dispErr || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Authorization check
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== dispute.worker_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile || authCtx.contractorProfile.id !== dispute.contractor_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (authCtx.user.role !== 'ADMIN' && authCtx.user.role !== 'INSTITUTIONAL_USER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: messages, error: msgErr } = await adminClient
      .from('dispute_messages')
      .select('*')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true });

    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, messages: messages || [] }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[GET /api/disputes/[id]/messages] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;

    const adminClient = createAdminClient();
    const { data: dispute, error: dispErr } = await adminClient
      .from('disputes')
      .select('id, worker_id, contractor_id')
      .eq('id', disputeId)
      .maybeSingle();

    if (dispErr || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Participant authorization check
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== dispute.worker_id) {
        return NextResponse.json({ error: 'Forbidden: You cannot post messages to this dispute.' }, { status: 403 });
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile || authCtx.contractorProfile.id !== dispute.contractor_id) {
        return NextResponse.json({ error: 'Forbidden: You cannot post messages to this dispute.' }, { status: 403 });
      }
    } else if (authCtx.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const messageText = body.message;

    if (!messageText || typeof messageText !== 'string' || !messageText.trim()) {
      return NextResponse.json({ error: 'message text is required' }, { status: 400 });
    }

    const msg = await postDisputeMessage({
      disputeId,
      senderUserId: authCtx.user.id,
      senderRole: authCtx.user.role,
      message: messageText.trim(),
    });

    return NextResponse.json({ success: true, message: msg }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message, code: err.reasonCode }, { status: err.statusCode });
    }
    console.error('[POST /api/disputes/[id]/messages] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
