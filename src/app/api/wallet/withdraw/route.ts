import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { recordWorkerWithdrawal } from '@/lib/services/ledger-service';
import { z } from 'zod';

const WithdrawSchema = z.object({
  amountPaise: z
    .number()
    .int('Amount must be an integer in paise')
    .positive('Withdrawal amount must be greater than zero'),
  destinationType: z.enum(['UPI', 'BANK_TRANSFER']),
  destinationValue: z.string().min(3).max(100),
  idempotencyKey: z.string().min(1).max(255),
  simulateFailure: z.boolean().optional(),
});

function maskDestination(type: 'UPI' | 'BANK_TRANSFER', value: string): string {
  const clean = value.trim();
  if (type === 'UPI') {
    const parts = clean.split('@');
    if (parts.length === 2) {
      const handle = parts[0];
      const bank = parts[1];
      const maskedHandle = handle.length > 2 ? `${handle.slice(0, 2)}••••` : '••••';
      return `${maskedHandle}@${bank}`;
    }
    return `${clean.slice(0, 2)}••••`;
  } else {
    // Bank Account Number: keep last 4 digits
    if (clean.length > 4) {
      return `••••••••${clean.slice(-4)}`;
    }
    return '••••••••';
  }
}

export async function POST(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();

    // Only workers can initiate wallet withdrawals
    if (authCtx.user.role !== 'WORKER' || !authCtx.workerProfile) {
      return NextResponse.json(
        { error: 'Only registered workers can withdraw from worker wallet.' },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const parsed = WithdrawSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { amountPaise, destinationType, destinationValue, idempotencyKey, simulateFailure } = parsed.data;

    // Mask destination before storing or logging (NEVER log plaintext)
    const destinationMasked = maskDestination(destinationType, destinationValue);

    const result = await recordWorkerWithdrawal({
      workerId: authCtx.workerProfile.id,
      amountPaise,
      destinationType,
      destinationMasked,
      idempotencyKey,
      simulateFailure: !!simulateFailure,
      actorUserId: authCtx.user.id,
    });

    const statusCode = result.status === 'FAILED' ? 400 : result.isDuplicate ? 200 : 201;

    return NextResponse.json(result, { status: statusCode });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err.message?.includes('OVER_WITHDRAW_REJECTED')) {
      return NextResponse.json({ error: err.message, code: 'OVER_WITHDRAW_REJECTED' }, { status: 422 });
    }
    console.error('[POST /api/wallet/withdraw] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
