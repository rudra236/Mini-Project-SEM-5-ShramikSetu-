/**
 * GET /api/passport/[workerId]
 *
 * Returns the full Benefit Passport data (JSON) for a worker.
 *
 * Access:
 *   - Worker self-access
 *   - Contractors with a shared contract
 *   - ADMIN / INSTITUTIONAL_USER / LABOUR_ORGANIZATION
 */

import { NextResponse } from 'next/server';
import { requireWorkerAccess, AuthorizationError } from '@/lib/auth/authorization';
import { getBenefitPassportData, PassportServiceError } from '@/lib/services/passport-service';

export async function GET(
  _req: Request,
  { params }: { params: { workerId: string } }
) {
  try {
    const { workerId } = params;

    // Authorization: verify caller has access to this worker's data
    await requireWorkerAccess(workerId);

    const passport = await getBenefitPassportData(workerId);

    return NextResponse.json({ passport }, { status: 200 });
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
    console.error('[GET /api/passport/:workerId] Unexpected error:', err?.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } },
      { status: 500 }
    );
  }
}
