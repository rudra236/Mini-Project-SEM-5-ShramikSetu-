import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { checkAndFlagMissedDisputeDeadlines, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * POST /api/disputes/check-deadlines
 * Scans disputes for expired payment order deadlines and flags contractors as NON_COMPLIANT.
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await checkAndFlagMissedDisputeDeadlines();

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/disputes/check-deadlines] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
