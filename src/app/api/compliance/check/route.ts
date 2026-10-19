import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { checkContractCompliance, ComplianceEngineError } from '@/lib/services/compliance-engine';

/**
 * POST /api/compliance/check
 * Run a minimum wage compliance check for a contract directly on PostgreSQL.
 */
export async function POST(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const user = authCtx.user;

    const body = await request.json();
    const { contractId, checkDate } = body;

    if (!contractId) {
      return NextResponse.json({ error: 'contractId field is required' }, { status: 400 });
    }

    const result = await checkContractCompliance({
      contractId,
      checkDate,
      checkedByUserId: user.id,
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof ComplianceEngineError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/compliance/check] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
