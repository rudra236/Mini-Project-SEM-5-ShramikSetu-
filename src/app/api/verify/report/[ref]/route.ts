/**
 * GET /api/verify/report/[ref]
 *
 * Public unauthenticated verification endpoint for statutory complaint reports.
 * Used by police stations, labour enforcement officers, and dispute conciliation boards.
 */

import { NextResponse } from 'next/server';
import { verifyComplaintReportByRef } from '@/lib/services/complaint-report-service';

export async function GET(
  _req: Request,
  { params }: { params: { ref: string } }
) {
  try {
    const { ref } = params;
    if (!ref) {
      return NextResponse.json(
        { error: { code: 'INVALID_REF', message: 'Report reference is required' } },
        { status: 400 }
      );
    }

    const verification = await verifyComplaintReportByRef(ref);

    return NextResponse.json(
      {
        success: true,
        verification,
        verified: verification.isValid,
        dispute_ref: (verification as any).disputeRef || (verification as any).reportRef,
        report_ref: (verification as any).reportRef,
        status: (verification as any).status,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (err: any) {
    console.error('[GET /api/verify/report/:ref] Error during verification:', err?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VERIFICATION_FAILED', message: err?.message || 'Verification failed' },
      },
      { status: 500 }
      );
  }
}
