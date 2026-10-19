/**
 * POST /api/credentials/issue
 *
 * Authenticated endpoint for workers to issue or refresh their verified work record credential,
 * configuring what consent toggles to share.
 */

import { NextResponse } from 'next/server';
import { requireWorkerAccess, AuthorizationError } from '@/lib/auth/authorization';
import { issueWorkRecordCredential, PassportServiceError } from '@/lib/services/passport-service';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { workerId, consent } = body;

    if (!workerId) {
      return NextResponse.json(
        { error: { code: 'INVALID_INPUT', message: 'workerId is required' } },
        { status: 400 }
      );
    }

    // Ensure caller has access to this worker's data
    await requireWorkerAccess(workerId);

    const credential = await issueWorkRecordCredential(workerId, consent);

    return NextResponse.json({
      success: true,
      credential,
    }, { status: 201 });
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
    console.error('[POST /api/credentials/issue] Unexpected error:', err?.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to issue credential' } },
      { status: 500 }
    );
  }
}
