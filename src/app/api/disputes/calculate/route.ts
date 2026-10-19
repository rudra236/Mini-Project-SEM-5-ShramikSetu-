import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { calculateDisputeAmounts, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * GET /api/disputes/calculate?contractId=...&periodFrom=...&periodTo=...
 * Live read-only summary card: "Earned ₹X · Paid ₹Y · Shortfall ₹Z"
 * Server computes strictly from verified attendance and ledger payments in the period.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuthenticatedUser();

    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const periodFrom = searchParams.get('periodFrom');
    const periodTo = searchParams.get('periodTo');

    if (!contractId || !periodFrom || !periodTo) {
      return NextResponse.json(
        { error: 'contractId, periodFrom, and periodTo parameters are required' },
        { status: 400 }
      );
    }

    const result = await calculateDisputeAmounts({
      contractId,
      periodFrom,
      periodTo,
    });

    return NextResponse.json({
      success: true,
      ...result,
      earnedRupees: Math.round(result.earnedPaise / 100),
      paidRupees: Math.round(result.paidPaise / 100),
      shortfallRupees: Math.round(result.shortfallPaise / 100),
    });
  } catch (err: unknown) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[GET /api/disputes/calculate] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
