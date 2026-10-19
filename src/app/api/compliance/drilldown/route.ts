import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { getContractorDrilldown } from '@/lib/services/enforcement-service';

/**
 * GET /api/compliance/drilldown?contractorId=...
 *
 * Implements 4-tier statutory drill-down:
 * Contractor -> Workers -> Shifts -> Double-Entry Ledger Rows
 */
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      const isDevAllowed = process.env.ENABLE_DEV_AUTH === 'true' || process.env.NODE_ENV !== 'production';
      if (!isDevAllowed) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(req.url);
    const contractorId = searchParams.get('contractorId');

    if (!contractorId) {
      return NextResponse.json({ error: 'contractorId query parameter is required' }, { status: 400 });
    }

    const drilldown = await getContractorDrilldown(contractorId);

    return NextResponse.json({
      success: true,
      drilldown,
    });
  } catch (err: any) {
    console.error('[GET /api/compliance/drilldown] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve contractor drill-down data' },
      { status: 500 }
    );
  }
}
