/**
 * GET /api/verify/[ref]
 *
 * Public unauthenticated verification endpoint.
 * Supports verifying Work Credentials (Passport) and Complaint Reports.
 * Returns privacy-safe attestation without personal identifiable information.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentialByRef } from '@/lib/services/passport-service';
import { verifyComplaintReportByRef } from '@/lib/services/complaint-report-service';

export async function GET(
  req: NextRequest,
  { params }: { params: { ref: string } }
) {
  try {
    const { ref } = params;
    if (!ref) {
      return NextResponse.json(
        { error: { code: 'INVALID_REF', message: 'Reference is required' } },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const candidateHash = searchParams.get('hash') || undefined;

    // Check if reference is a dispute or complaint report reference
    const isDisputeOrReport =
      ref.startsWith('SS-D-') ||
      ref.startsWith('CMP-') ||
      ref.startsWith('DISP-') ||
      ref.startsWith('CR-');

    if (isDisputeOrReport) {
      const complaintRes = await verifyComplaintReportByRef(ref, candidateHash);
      if (complaintRes.status !== 'NOT_FOUND') {
        return NextResponse.json(
          {
            success: true,
            type: 'COMPLAINT_REPORT',
            verification: {
              reference: complaintRes.reference,
              status: complaintRes.status,
              claimedAmountRupees: complaintRes.claimedAmountRupees,
              generatedAt: complaintRes.generatedAt,
              hashMatchesRecord: complaintRes.hashMatchesRecord,
              shortHash: complaintRes.shortHash,
              // Strictly privacy safe: no personal worker or contractor data
            },
          },
          {
            status: 200,
            headers: {
              'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
            },
          }
        );
      }
    }

    // Otherwise, try passport credential verification
    const credentialRes = await verifyCredentialByRef(ref);
    if (credentialRes && credentialRes.status !== 'NOT_FOUND') {
      return NextResponse.json(
        {
          success: true,
          type: 'CREDENTIAL',
          verification: credentialRes,
        },
        {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
          },
        }
      );
    }

    // Final fallback: try complaint report if not tried yet
    if (!isDisputeOrReport) {
      const fallbackReport = await verifyComplaintReportByRef(ref, candidateHash);
      if (fallbackReport.status !== 'NOT_FOUND') {
        return NextResponse.json(
          {
            success: true,
            type: 'COMPLAINT_REPORT',
            verification: {
              reference: fallbackReport.reference,
              status: fallbackReport.status,
              claimedAmountRupees: fallbackReport.claimedAmountRupees,
              generatedAt: fallbackReport.generatedAt,
              hashMatchesRecord: fallbackReport.hashMatchesRecord,
              shortHash: fallbackReport.shortHash,
            },
          },
          {
            status: 200,
            headers: {
              'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
            },
          }
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        verification: {
          reference: ref,
          status: 'NOT_FOUND',
          hashMatchesRecord: false,
        },
      },
      { status: 404 }
    );
  } catch (err: any) {
    console.error('[GET /api/verify/:ref] Error during verification:', err?.message);
    return NextResponse.json(
      {
        success: false,
        error: { code: 'VERIFICATION_FAILED', message: err?.message || 'Verification failed' },
      },
      { status: 500 }
    );
  }
}
