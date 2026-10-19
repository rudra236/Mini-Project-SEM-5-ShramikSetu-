import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getWorkerWalletTimeline } from '@/lib/services/ledger-service';

export async function GET(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const workerIdParam = searchParams.get('workerId');

    let targetWorkerId = workerIdParam;
    if (!targetWorkerId && authCtx.workerProfile) {
      targetWorkerId = authCtx.workerProfile.id;
    }

    if (!targetWorkerId) {
      return NextResponse.json(
        { error: 'workerId parameter or authenticated worker profile is required' },
        { status: 400 }
      );
    }

    if (
      authCtx.user.role === 'WORKER' &&
      authCtx.workerProfile &&
      authCtx.workerProfile.id !== targetWorkerId
    ) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only view your own wallet summary.' },
        { status: 403 }
      );
    }

    const data = await getWorkerWalletTimeline(targetWorkerId);
    return NextResponse.json({ success: true, ...data }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: error.message || 'Failed to fetch wallet summary' }, { status: 500 });
  }
}
