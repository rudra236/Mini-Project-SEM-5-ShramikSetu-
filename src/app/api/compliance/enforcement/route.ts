import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { getFullEnforcementOverview, EnforcementFilters } from '@/lib/services/enforcement-service';

/**
 * GET /api/compliance/enforcement
 *
 * Provides real-time statutory enforcement overview:
 * - Jurisdiction metrics
 * - Contractor risk score roster (with transparent 5-factor breakdown)
 * - Explainable violations feed with evidence rows
 * - Follow-up notification queue with countdown SLA timers
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
    const filters: EnforcementFilters = {
      state: searchParams.get('state') || undefined,
      district: searchParams.get('district') || undefined,
      riskLevel: (searchParams.get('riskLevel') as any) || undefined,
      contractorId: searchParams.get('contractorId') || undefined,
      ruleType: (searchParams.get('ruleType') as any) || undefined,
    };

    const overview = await getFullEnforcementOverview(filters);

    return NextResponse.json({
      success: true,
      ...overview,
    });
  } catch (err: any) {
    console.error('[GET /api/compliance/enforcement] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve enforcement overview' },
      { status: 500 }
    );
  }
}
