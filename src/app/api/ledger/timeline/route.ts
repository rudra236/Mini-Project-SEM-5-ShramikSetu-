import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getWorkerWalletTimeline } from '@/lib/services/ledger-service';

export async function GET(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const workerIdParam = searchParams.get('workerId');

    // ── Dev-mode: Supabase not available, return empty timeline ──
    const isLocalDev = process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('local_dev');
    if (isLocalDev) {
      return NextResponse.json(
        {
          success: true,
          financialSummary: {
            totalEarnedPaise: 0,
            totalPaidPaise: 0,
            outstandingPaise: 0,
            verifiedDaysCount: 0,
          },
          timeline: [],
          pendingClaims: [],
        },
        { status: 200 }
      );
    }

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

    // Worker can only view their own wallet timeline unless ADMIN or INSTITUTIONAL_USER
    if (
      authCtx.user.role === 'WORKER' &&
      authCtx.workerProfile &&
      authCtx.workerProfile.id !== targetWorkerId
    ) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only view your own wage ledger timeline.' },
        { status: 403 }
      );
    }

    const data = await getWorkerWalletTimeline(targetWorkerId);

    return NextResponse.json({ success: true, ...data }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: error.message || 'Failed to fetch wallet timeline' }, { status: 500 });
  }
}
