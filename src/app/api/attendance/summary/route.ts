import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAttendanceSummary, ConfirmationServiceError } from '@/lib/services/confirmation-service';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'SUPERVISOR', 'ADMIN']);
    const body = await req.json();

    if (!body.contractId || !body.startDate || !body.endDate || body.recordedDaysCount === undefined) {
      return NextResponse.json(
        { error: { code: 'INVALID_PAYLOAD', message: 'contractId, startDate, endDate, and recordedDaysCount are required.' } },
        { status: 400 }
      );
    }

    const summary = await createAttendanceSummary({
      creatorUserId: authCtx.user.id,
      contractId: body.contractId,
      startDate: body.startDate,
      endDate: body.endDate,
      recordedDaysCount: Number(body.recordedDaysCount),
      notes: body.notes,
    });

    return NextResponse.json({ success: true, summary }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    if (error instanceof ConfirmationServiceError) {
      return NextResponse.json({ error: { code: error.reasonCode, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message || 'Failed to create attendance summary.' } }, { status: 500 });
  }
}
