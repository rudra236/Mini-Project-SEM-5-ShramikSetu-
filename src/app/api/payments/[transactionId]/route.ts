import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { getTransactionWithLedger, PaymentServiceError } from '@/lib/services/payment-service';

/**
 * GET /api/payments/[transactionId]
 *
 * Returns a single payment transaction with its ledger entries and worker confirmation status.
 *
 * This endpoint is the canonical way to verify that a payment's ledger is intact:
 * a SUCCESS transaction must have exactly 2 ledger entries (1 DEBIT + 1 CREDIT).
 *
 * Path param:
 *   transactionId — payment_transactions.id (UUID)
 *
 * Returns:
 *   {
 *     transaction:   PaymentTransactionRow
 *     ledgerEntries: LedgerEntryRow[]   — always 2 for SUCCESS transactions
 *     confirmation:  PaymentConfirmationRow | null
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { transactionId: string } }
) {
  try {
    // 1. Authenticate
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { transactionId } = params;

    // Validate UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(transactionId)) {
      return NextResponse.json({ error: 'transactionId must be a valid UUID' }, { status: 400 });
    }

    // 2. Fetch transaction, ledger entries and confirmation
    const result = await getTransactionWithLedger(transactionId);

    // 3. Integrity check (visible to caller for transparency)
    const integrityOk =
      result.transaction.status !== 'SUCCESS' ||
      (result.ledgerEntries.length === 2 &&
        result.ledgerEntries.some((e) => e.direction === 'DEBIT') &&
        result.ledgerEntries.some((e) => e.direction === 'CREDIT'));

    return NextResponse.json(
      {
        success: true,
        ...result,
        ledgerIntegrityOk: integrityOk,
        message: integrityOk
          ? 'Transaction ledger is consistent.'
          : 'WARNING: Transaction is SUCCESS but ledger entries are missing or incomplete.',
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    if (err instanceof PaymentServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/payments/[transactionId]] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
