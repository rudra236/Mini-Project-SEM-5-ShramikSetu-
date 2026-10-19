import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { resolveDispute, DisputeServiceError } from '@/lib/services/dispute-service';
import type { UserRole } from '@/types/database.types';

/**
 * POST /api/disputes/[id]/resolve
 * Authorized reviewer resolves or rejects a dispute.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const user = authCtx.user;


    const disputeId = params.id;
    if (!disputeId) {
      return NextResponse.json({ error: 'Dispute ID path parameter is required' }, { status: 400 });
    }

    const body = await request.json();
    const { decision, reason, resolutionNotes } = body;

    if (!decision || !['RESOLVED', 'REJECTED'].includes(decision)) {
      return NextResponse.json({ error: "decision must be 'RESOLVED' or 'REJECTED'" }, { status: 400 });
    }
    if (!reason || typeof reason !== 'string') {
      return NextResponse.json({ error: 'reason text is required' }, { status: 400 });
    }

    const reviewerRole: UserRole = (authCtx.user.role as UserRole) || 'WORKER';

    const result = await resolveDispute({
      disputeId,
      decision,
      reason,
      resolutionNotes,
      reviewerUserId: user.id,
      reviewerRole,
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/disputes/[id]/resolve] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
