import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { escalateUnconfirmedPayments } from '@/lib/services/ledger-service';

/**
 * POST /api/payments/escalate
 *
 * Scans for payment claims in PAID_CLAIMED state that have remained unconfirmed
 * beyond N days (default 7 days). Transitions them to ESCALATED_TO_DISPUTE and
 * registers an inspection dispute record with the Labour Department.
 */
export async function POST(request: NextRequest) {
  try {
    // Only ADMIN, CONTRACTOR, or INSTITUTIONAL_USER can trigger escalation
    await requireRole(['ADMIN', 'CONTRACTOR', 'INSTITUTIONAL_USER']);

    let maxAgeDays = 7;
    try {
      const body = await request.json();
      if (body.maxAgeDays && typeof body.maxAgeDays === 'number') {
        maxAgeDays = body.maxAgeDays;
      }
    } catch {
      // Body is optional
    }

    const result = await escalateUnconfirmedPayments(maxAgeDays);

    return NextResponse.json({
      success: true,
      message: `Escalated ${result.escalatedCount} unconfirmed payment claims to Labour Inspector dispute queue.`,
      ...result,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: error.message || 'Escalation failed' }, { status: 500 });
  }
}
