import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getDisputeDetails, DisputeServiceError } from '@/lib/services/dispute-service';
import { getComplaintReportsForDispute } from '@/lib/services/complaint-report-service';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;

    if (!disputeId) {
      return NextResponse.json({ error: 'Dispute ID is required' }, { status: 400 });
    }

    const details = await getDisputeDetails(disputeId);
    if (!details || !details.dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Auth check: worker must own dispute, or admin
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== details.dispute.worker_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else if (authCtx.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const reports = await getComplaintReportsForDispute(disputeId);

    return NextResponse.json({
      success: true,
      reports,
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
