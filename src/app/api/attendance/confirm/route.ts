import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { respondWorkerConfirmation, ConfirmationServiceError } from '@/lib/services/confirmation-service';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['WORKER', 'ADMIN']);
    const body = await req.json();

    if (!body.summaryId || body.isConfirmed === undefined) {
      return NextResponse.json(
        { error: { code: 'INVALID_PAYLOAD', message: 'summaryId and isConfirmed (boolean) are required.' } },
        { status: 400 }
      );
    }

    const result = await respondWorkerConfirmation({
      workerUserId: authCtx.user.id,
      summaryId: body.summaryId,
      isConfirmed: Boolean(body.isConfirmed),
      discrepancyReason: body.discrepancyReason,
      workerClaimedDaysCount: body.workerClaimedDaysCount !== undefined ? Number(body.workerClaimedDaysCount) : undefined,
      comments: body.comments,
    });

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    if (error instanceof ConfirmationServiceError) {
      return NextResponse.json({ error: { code: error.reasonCode, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message || 'Failed to record worker attendance response.' } }, { status: 500 });
  }
}
