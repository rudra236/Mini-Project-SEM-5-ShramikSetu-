import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifySignedEvidenceToken } from '@/lib/services/dispute-service';

/**
 * GET /api/disputes/[id]/evidence/[evidenceId]?token=...&expires=...
 * Serves private storage evidence file via short-lived signed URL checked against dispute participants.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; evidenceId: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;
    const evidenceId = params.evidenceId;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    const expiresStr = searchParams.get('expires');

    if (!token || !expiresStr) {
      return NextResponse.json({ error: 'Signed URL token and expires parameters are required' }, { status: 403 });
    }

    const expires = parseInt(expiresStr, 10);
    if (isNaN(expires) || !verifySignedEvidenceToken(evidenceId, disputeId, expires, token)) {
      return NextResponse.json({ error: 'Invalid or expired signed URL token' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Fetch dispute to verify participant access
    const { data: dispute, error: dispErr } = await adminClient
      .from('disputes')
      .select('id, worker_id, contractor_id')
      .eq('id', disputeId)
      .maybeSingle();

    if (dispErr || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Strict participant authorization: another worker or contractor gets 403
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== dispute.worker_id) {
        return NextResponse.json({ error: 'Forbidden: You cannot access evidence for another worker\'s dispute.' }, { status: 403 });
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile || authCtx.contractorProfile.id !== dispute.contractor_id) {
        return NextResponse.json({ error: 'Forbidden: You cannot access evidence for another contractor\'s project.' }, { status: 403 });
      }
    } else if (authCtx.user.role !== 'ADMIN' && authCtx.user.role !== 'INSTITUTIONAL_USER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch evidence record
    const { data: evidence, error: evErr } = await adminClient
      .from('dispute_evidence')
      .select('*')
      .eq('id', evidenceId)
      .eq('dispute_id', disputeId)
      .maybeSingle();

    if (evErr || !evidence) {
      return NextResponse.json({ error: 'Evidence record not found' }, { status: 404 });
    }

    if (!fs.existsSync(evidence.file_path)) {
      return NextResponse.json({ error: 'Evidence file not found on disk' }, { status: 404 });
    }

    const fileBuffer = fs.readFileSync(evidence.file_path);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': evidence.mime || 'application/octet-stream',
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[GET evidence] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
