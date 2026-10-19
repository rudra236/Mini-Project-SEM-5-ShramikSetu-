import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getDisputeDetails, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * GET /api/disputes/[id]
 * Fetch dispute details with strict server-side authorization.
 * Worker sees only their own disputes.
 * Contractor sees only disputes on their own projects/contracts.
 * Any other worker or contractor gets 403 Forbidden.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();

    const disputeId = params.id;
    if (!disputeId) {
      return NextResponse.json({ error: 'Dispute ID path parameter is required' }, { status: 400 });
    }

    const details = await getDisputeDetails(disputeId);

    // Strict authorization checks
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || details.dispute.worker_id !== authCtx.workerProfile.id) {
        return NextResponse.json(
          { error: 'Forbidden: You are not authorized to view this dispute.' },
          { status: 403 }
        );
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile || details.dispute.contractor_id !== authCtx.contractorProfile.id) {
        return NextResponse.json(
          { error: 'Forbidden: You are not authorized to view this dispute.' },
          { status: 403 }
        );
      }
    } else if (authCtx.user.role !== 'ADMIN' && authCtx.user.role !== 'INSTITUTIONAL_USER') {
      return NextResponse.json(
        { error: 'Forbidden: Unauthorized role for dispute access.' },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true, ...details }, { status: 200 });
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
    console.error('[GET /api/disputes/[id]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
