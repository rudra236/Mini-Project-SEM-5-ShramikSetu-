/**
 * GET /api/passport/[workerId]/pdf
 *
 * Generates and streams the Benefit Passport PDF server-side.
 *
 * Access:
 *   - Worker self-access
 *   - Contractors with a shared contract
 *   - ADMIN / INSTITUTIONAL_USER / LABOUR_ORGANIZATION
 *
 * Security: requireWorkerAccess() enforces access before any data is fetched.
 * The PDF itself is generated server-side (pdfkit) and never stored in Supabase Storage
 * on this endpoint — it is streamed directly to the caller.
 *
 * PDF DISCLAIMER: This document is a ShramikSetu Digital Employment Record.
 * It is NOT a government-approved document or KYC certificate.
 */

import { requireWorkerAccess, AuthorizationError } from '@/lib/auth/authorization';
import { generatePassportPdf, PassportServiceError } from '@/lib/services/passport-service';

export async function GET(
  req: Request,
  { params }: { params: { workerId: string } }
) {
  try {
    const { workerId } = params;

    // Authorization: verify caller has access BEFORE generating any sensitive content
    await requireWorkerAccess(workerId);

    const url = new URL(req.url);
    const ref = url.searchParams.get('ref') || undefined;
    const shareEarningsParam = url.searchParams.get('shareEarnings');
    const shareDisputesParam = url.searchParams.get('shareDisputes');
    const shareEmployerNamesParam = url.searchParams.get('shareEmployerNames');
    const shareGpsMetricsParam = url.searchParams.get('shareGpsMetrics');

    const consent = {
      ...(shareEarningsParam !== null ? { shareEarnings: shareEarningsParam === 'true' } : {}),
      ...(shareDisputesParam !== null ? { shareDisputes: shareDisputesParam === 'true' } : {}),
      ...(shareEmployerNamesParam !== null ? { shareEmployerNames: shareEmployerNamesParam === 'true' } : {}),
      ...(shareGpsMetricsParam !== null ? { shareGpsMetrics: shareGpsMetricsParam === 'true' } : {}),
    };

    const pdfBuffer = await generatePassportPdf(workerId, {
      credentialRef: ref,
      consent: Object.keys(consent).length > 0 ? consent : undefined,
    });

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="shramiksetu-work-record-${ref || workerId.slice(0, 8)}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        // Prevent caching of sensitive employment data
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return Response.json(
        { error: { code: 'UNAUTHORIZED', message: err.message } },
        { status: err.statusCode }
      );
    }
    if (err instanceof PassportServiceError) {
      return Response.json(
        { error: { code: err.reasonCode, message: err.message } },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/passport/:workerId/pdf] Unexpected error:', err?.message);
    return Response.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } },
      { status: 500 }
    );
  }
}
