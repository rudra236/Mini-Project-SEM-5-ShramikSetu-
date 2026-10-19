import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getDisputeDetails, DisputeServiceError } from '@/lib/services/dispute-service';
import { generateComplaintReportPdf } from '@/lib/services/complaint-report-service';

// In-memory rate limiting map: ipOrUser -> timestamp array
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(identifier) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    rateLimitMap.set(identifier, timestamps);
    return true;
  }
  timestamps.push(now);
  rateLimitMap.set(identifier, timestamps);
  return false;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;

    if (!disputeId) {
      return NextResponse.json({ error: 'Dispute ID is required' }, { status: 400 });
    }

    // Rate limiting: 10 requests per minute per user or IP
    const clientIdentifier = authCtx?.user?.id || request.ip || 'anonymous';
    if (isRateLimited(clientIdentifier)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a minute before downloading another report.' },
        { status: 429, headers: { 'Retry-After': '60' } }
      );
    }

    // 1. Fetch dispute to check ownership
    const details = await getDisputeDetails(disputeId);
    if (!details || !details.dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // 2. Strict Authorization: Only the dispute's worker (403 otherwise; contractors and others cannot)
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== details.dispute.worker_id) {
        return NextResponse.json(
          { error: 'Forbidden: You are not authorized to download this dispute complaint report.' },
          { status: 403 }
        );
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      return NextResponse.json(
        { error: 'Forbidden: Contractors cannot generate worker complaint filing reports.' },
        { status: 403 }
      );
    } else if (authCtx.user.role !== 'ADMIN' && authCtx.user.role !== 'INSTITUTIONAL_USER') {
      return NextResponse.json(
        { error: 'Forbidden: You are not authorized to access this report.' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawLang = (searchParams.get('lang') || 'en').toUpperCase();
    const lang = ['EN', 'HI', 'MR'].includes(rawLang) ? (rawLang as 'EN' | 'HI' | 'MR') : 'EN';

    const rawRecipientType = (searchParams.get('recipient_type') || searchParams.get('recipientType') || 'police').toLowerCase();
    let recipientType: 'POLICE_STATION' | 'LABOUR_OFFICE' | 'OTHER' = 'POLICE_STATION';
    if (rawRecipientType.includes('labour')) recipientType = 'LABOUR_OFFICE';
    else if (rawRecipientType.includes('other')) recipientType = 'OTHER';

    const recipientName =
      searchParams.get('recipient_name') ||
      searchParams.get('recipientName') ||
      '';

    const recipientAddress =
      searchParams.get('recipient_address') ||
      searchParams.get('recipientAddress') ||
      '';

    // 3. Generate server-side PDF
    const { pdfBuffer, report, sha256 } = await generateComplaintReportPdf({
      disputeId,
      language: lang,
      recipientName,
      recipientAddress,
      recipientType,
      generatedByUserId: authCtx.user.id,
    });

    const fileRef = details.dispute.reference || report.report_ref;
    const filename = `Complaint_Report_${fileRef}_${lang}.pdf`;

    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Report-Ref': report.report_ref,
        'X-Content-Hash': sha256,
        'X-Dispute-Ref': fileRef,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[GET report.pdf] Error:', err);
    return NextResponse.json({ error: 'Failed to generate complaint report' }, { status: 500 });
  }
}
