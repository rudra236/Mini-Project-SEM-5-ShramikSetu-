import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/authorization';
import { InstitutionalAnalyticsService } from '@/lib/services/institutional-analytics-service';
import { Logger } from '@/lib/observability/logger';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireRole(['INSTITUTIONAL_USER', 'LABOUR_ORGANIZATION', 'ADMIN']);
    const { searchParams } = new URL(req.url);

    const state = searchParams.get('state') || undefined;
    const district = searchParams.get('district') || undefined;
    const projectId = searchParams.get('projectId') || undefined;
    const contractorId = searchParams.get('contractorId') || undefined;
    const workerCategory = searchParams.get('workerCategory') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const status = searchParams.get('status') || undefined;

    const metrics = await InstitutionalAnalyticsService.getInstitutionalMetrics({
      state,
      district,
      projectId,
      contractorId,
      workerCategory,
      startDate,
      endDate,
      status,
    });

    const geographic = await InstitutionalAnalyticsService.getGeographicAnalytics(state);

    return NextResponse.json({
      success: true,
      metrics,
      geographic,
    });
  } catch (error: any) {
    Logger.error('GET /api/institutional/analytics', 'INSTITUTIONAL_API_ERROR', error);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: error.statusCode || 500 });
  }
}
