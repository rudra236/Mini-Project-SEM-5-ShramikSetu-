/**
 * GET /api/employment-history/[workerId]/timeline?contractId=<uuid>
 *
 * Returns the chronological employment timeline for a specific contract.
 * ALL events are built dynamically from real database records — nothing is hardcoded.
 *
 * Event types:
 *   CONTRACT_CREATED, WORKER_ACCEPTED, EMPLOYMENT_ACTIVATED,
 *   ATTENDANCE, ATTENDANCE_CONFIRMATION, EARNINGS,
 *   PAYMENT, PAYMENT_CONFIRMATION, DISPUTE, RESOLUTION, JOB_COMPLETION
 *
 * Access:
 *   - Worker self-access
 *   - Contractors with a shared contract
 *   - ADMIN / INSTITUTIONAL_USER / LABOUR_ORGANIZATION
 */

import { NextResponse } from 'next/server';
import { requireWorkerAccess, AuthorizationError } from '@/lib/auth/authorization';
import { buildEmploymentTimeline, PassportServiceError } from '@/lib/services/passport-service';

export async function GET(
  req: Request,
  { params }: { params: { workerId: string } }
) {
  try {
    const { workerId } = params;
    const url = new URL(req.url);
    const contractId = url.searchParams.get('contractId');

    if (!contractId) {
      return NextResponse.json(
        { error: { code: 'MISSING_PARAM', message: 'Query parameter contractId is required' } },
        { status: 400 }
      );
    }

    await requireWorkerAccess(workerId);

    const timeline = await buildEmploymentTimeline(contractId, workerId);

    return NextResponse.json(
      {
        workerId,
        contractId,
        eventCount: timeline.length,
        timeline,
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
    console.error('[GET /api/employment-history/:workerId/timeline] Unexpected error:', err?.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } },
      { status: 500 }
    );
  }
}
