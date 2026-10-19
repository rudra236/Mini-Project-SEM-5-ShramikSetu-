import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { confirmPayment, PaymentServiceError } from '@/lib/services/payment-service';
import { z } from 'zod';

/**
 * POST /api/payments/confirm
 *
 * Worker confirms (YES) or disputes (NO) a payment transaction.
 *
 * INVARIANT: The original payment_transactions row is NEVER modified.
 * A payment_confirmations row is inserted regardless of YES or NO.
 *
 * Body:
 *   transactionId — payment_transactions.id
 *   isConfirmed   — true (YES) | false (NO)
 *   disputeReason — required when isConfirmed = false
 *   workerNotes   — optional free text
 *
 * Returns:
 *   201  — confirmation recorded
 *   400  — validation error
 *   403  — not the worker on this transaction
 *   409  — already confirmed
 */

const RequestSchema = z.object({
  transactionId: z.string().uuid(),
  isConfirmed: z.boolean(),
  disputeReason: z.string().max(2000).optional(),
  workerNotes: z.string().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate caller (must be a worker)
    let user: any;
    try {
      const authCtx = await requireAuthenticatedUser();
      user = authCtx.user;
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const params = parsed.data;

    // 3. Confirm or dispute via service layer
    const confirmation = await confirmPayment({
      workerUserId: user.id,
      transactionId: params.transactionId,
      isConfirmed: params.isConfirmed,
      disputeReason: params.disputeReason,
      workerNotes: params.workerNotes,
    });

    return NextResponse.json(
      {
        success: true,
        confirmation,
        status: params.isConfirmed ? 'CONFIRMED' : 'DISPUTED',
        message: params.isConfirmed
          ? 'Worker confirmed payment. Original transaction unchanged.'
          : 'Worker disputed payment. Dispute-ready record created. Original transaction unchanged.',
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if (err instanceof PaymentServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/payments/confirm] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
