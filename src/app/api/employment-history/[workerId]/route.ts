/**
 * GET /api/employment-history/[workerId]
 *
 * Returns the full employment history for a worker, sourced from
 * authoritative backend records (no cached or approximated data).
 *
 * Fields per entry:
 *   contractor, project, work_type, start_date, end_date,
 *   acceptance_date, daily_wage, verified_workdays, total_earned,
 *   total_paid, outstanding, disputes, final_status
 *
 * Access:
 *   - Worker self-access
 *   - Contractors with a shared contract
 *   - ADMIN / INSTITUTIONAL_USER / LABOUR_ORGANIZATION
 */

import { NextResponse } from 'next/server';
import { requireWorkerAccess, AuthorizationError } from '@/lib/auth/authorization';
import { getEmploymentHistory, PassportServiceError } from '@/lib/services/passport-service';

export async function GET(
  _req: Request,
  { params }: { params: { workerId: string } }
) {
  try {
    const { workerId } = params;

    await requireWorkerAccess(workerId);

    const history = await getEmploymentHistory(workerId);

    return NextResponse.json(
      {
        workerId,
        count: history.length,
        employmentHistory: history,
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: err.message } },
        { status: err.statusCode }
      );
    }
    if (err instanceof PassportServiceError) {
      return NextResponse.json(
        { error: { code: err.reasonCode, message: err.message } },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/employment-history/:workerId] Unexpected error:', err?.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } },
      { status: 500 }
    );
  }
}
