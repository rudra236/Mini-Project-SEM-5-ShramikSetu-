import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { getContractReconciliation, ReconciliationServiceError } from '@/lib/services/reconciliation-service';

/**
 * GET /api/reconciliation/[contractId]
 *
 * Single authoritative source of truth endpoint for contract payment reconciliation.
 * Used uniformly across Worker, Contractor, and Inspector dashboards.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { contractId: string } }
) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { contractId } = params;
    if (!contractId) {
      return NextResponse.json({ error: 'contractId path parameter is required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const periodStart = searchParams.get('periodStart') ?? undefined;
    const periodEnd = searchParams.get('periodEnd') ?? undefined;

    const summary = await getContractReconciliation({
      contractId,
      periodStart,
      periodEnd,
    });

    return NextResponse.json({ success: true, reconciliation: summary, ...summary }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof ReconciliationServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/reconciliation/[contractId]] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
