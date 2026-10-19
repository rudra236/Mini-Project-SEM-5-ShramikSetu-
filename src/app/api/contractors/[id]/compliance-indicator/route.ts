import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { evaluateContractorComplianceIndicator, ContractorIndicatorError } from '@/lib/services/contractor-indicator-service';

/**
 * GET /api/contractors/[id]/compliance-indicator
 * Returns explainable rule-based risk indicator for a contractor.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contractorId = params.id;
    if (!contractorId) {
      return NextResponse.json({ error: 'Contractor ID path parameter is required' }, { status: 400 });
    }

    const indicator = await evaluateContractorComplianceIndicator(contractorId);

    return NextResponse.json({ success: true, indicator }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof ContractorIndicatorError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/contractors/[id]/compliance-indicator] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
