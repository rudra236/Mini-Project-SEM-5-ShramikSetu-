import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { respondToDispute, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * POST /api/disputes/[id]/respond
 * Contractor response to formal worker dispute:
 * 1. accept_and_pay
 * 2. deduction_claimed (reason + amount + message)
 * 3. reject (message)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    if (authCtx.user.role !== 'CONTRACTOR' && authCtx.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Forbidden: Contractor or Admin role required' },
        { status: 403 }
      );
    }

    const disputeId = params.id;
    if (!disputeId) {
      return NextResponse.json({ error: 'Dispute ID path parameter is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: dispute, error: dispErr } = await adminClient
      .from('disputes')
      .select('id, contractor_id, status')
      .eq('id', disputeId)
      .maybeSingle();

    if (dispErr || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Strict contractor project ownership check
    if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile || authCtx.contractorProfile.id !== dispute.contractor_id) {
        return NextResponse.json(
          { error: 'Forbidden: You are not authorized to respond to disputes on other contractors\' projects.' },
          { status: 403 }
        );
      }
    }

    const body = await request.json();

    // Map parameters
    const type = body.type || (body.counterStatement ? 'deduction_claimed' : 'reject');
    const message = body.message || body.counterStatement || '';
    const deductionReason = body.deductionReason || body.deduction_reason;
    const deductionAmountPaise = body.deductionAmountPaise !== undefined ? body.deductionAmountPaise : body.deduction_amount_paise;

    const result = await respondToDispute({
      disputeId,
      contractorUserId: authCtx.user.id,
      type,
      deductionReason,
      deductionAmountPaise,
      message,
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
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
    console.error('[POST /api/disputes/[id]/respond] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
