import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { issueInspectorRuling, DisputeServiceError } from '@/lib/services/dispute-service';
import type { UserRole } from '@/types/database.types';

/**
 * POST /api/disputes/[id]/ruling
 * Inspector executes official arbitration tribunal ruling:
 * Actions: DISMISS | ORDER_PAYMENT | PARTIAL_SETTLEMENT
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
    const { rulingDecision, reason, resolutionNotes, orderedAmountPaise, deadlineDays } = body;

    if (!rulingDecision || !['DISMISS', 'ORDER_PAYMENT', 'PARTIAL_SETTLEMENT'].includes(rulingDecision)) {
      return NextResponse.json(
        { error: "rulingDecision must be 'DISMISS', 'ORDER_PAYMENT', or 'PARTIAL_SETTLEMENT'" },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'Official ruling reason is required' }, { status: 400 });
    }

    const reviewerRole: UserRole = (authCtx.user.role as UserRole) || 'WORKER';

    const result = await issueInspectorRuling({
      disputeId,
      rulingDecision,
      reason: reason.trim(),
      resolutionNotes: resolutionNotes ? resolutionNotes.trim() : undefined,
      orderedAmountPaise: orderedAmountPaise ? Math.floor(orderedAmountPaise) : undefined,
      deadlineDays: deadlineDays ? Number(deadlineDays) : undefined,
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
    console.error('[POST /api/disputes/[id]/ruling] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
