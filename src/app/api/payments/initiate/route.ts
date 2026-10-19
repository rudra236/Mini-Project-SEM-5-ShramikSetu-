import { NextRequest, NextResponse } from 'next/server';
import { initiatePayment, PaymentServiceError } from '@/lib/services/payment-service';
import { requireContractorAccess, requireProjectAccess, AuthorizationError } from '@/lib/auth/authorization';
import { z } from 'zod';

const RequestSchema = z.object({
  contractId: z.string().uuid(),
  workerId: z.string().uuid(),
  contractorId: z.string().uuid(),
  projectId: z.string().uuid(),
  amountPaise: z
    .number()
    .int('amountPaise must be an integer — no floating point allowed')
    .positive('amountPaise must be positive'),
  idempotencyKey: z.string().min(1).max(255),
  paymentSource: z
    .enum(['PLATFORM_TRANSFER', 'CONTRACTOR_REPORTED_CASH_PAYMENT', 'BANK_TRANSFER'])
    .optional(),
  paymentMethod: z
    .enum(['UPI_SIMULATED', 'CASH', 'BANK_TRANSFER'])
    .optional(),
  referenceNumber: z.string().optional(),
  proofUrl: z.string().optional(),
  notes: z.string().max(2000).optional(),
  isAdvance: z.boolean().optional(),
  disputeId: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
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

    // 1. Server-side authorization check: verify authenticated user owns contractor profile
    const authCtx = await requireContractorAccess(params.contractorId);

    // 2. Server-side authorization check: verify contractor has access to the project
    await requireProjectAccess(params.projectId);

    // 3. Initiate payment via service layer
    const result = await initiatePayment({
      initiatorUserId: authCtx.user.id,
      contractId: params.contractId,
      workerId: params.workerId,
      contractorId: params.contractorId,
      projectId: params.projectId,
      amountPaise: params.amountPaise,
      idempotencyKey: params.idempotencyKey,
      paymentSource: params.paymentSource,
      paymentMethod: params.paymentMethod,
      referenceNumber: params.referenceNumber,
      proofUrl: params.proofUrl,
      notes: params.notes,
      isAdvance: params.isAdvance,
      disputeId: params.disputeId,
    });

    const statusCode = result.isDuplicate ? 200 : 201;
    return NextResponse.json(
      {
        success: true,
        isDuplicate: result.isDuplicate,
        transaction: result.transaction,
        ledger: {
          debit: result.senderLedgerEntry,
          credit: result.receiverLedgerEntry,
        },
        message: result.isDuplicate
          ? 'Idempotent: existing transaction returned.'
          : 'Payment initiated and ledger entries committed.',
      },
      { status: statusCode }
    );
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: err.statusCode }
      );
    }
    if (err instanceof PaymentServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/payments/initiate] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
