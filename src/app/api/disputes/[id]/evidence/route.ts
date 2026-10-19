import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { uploadDisputeEvidence, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * POST /api/disputes/[id]/evidence
 * Uploads evidence file (max 5 files, <= 5MB, PDF/images validated with magic bytes).
 * Stored in private storage bucket, access via signed URLs.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const disputeId = params.id;

    const adminClient = createAdminClient();
    const { data: dispute, error: dispErr } = await adminClient
      .from('disputes')
      .select('id, worker_id, contractor_id')
      .eq('id', disputeId)
      .maybeSingle();

    if (dispErr || !dispute) {
      return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });
    }

    // Participant authorization check
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile || authCtx.workerProfile.id !== dispute.worker_id) {
        return NextResponse.json({ error: 'Forbidden: You cannot upload evidence to this dispute.' }, { status: 403 });
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile || authCtx.contractorProfile.id !== dispute.contractor_id) {
        return NextResponse.json({ error: 'Forbidden: You cannot upload evidence to this dispute.' }, { status: 403 });
      }
    } else if (authCtx.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse multipart form-data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'file is required in form-data' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadDisputeEvidence({
      disputeId,
      userId: authCtx.user.id,
      fileBuffer: buffer,
      fileName: file.name || 'evidence',
    });

    return NextResponse.json({ success: true, evidence: result }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof DisputeServiceError) {
      return NextResponse.json({ error: err.message, code: err.reasonCode }, { status: err.statusCode });
    }
    console.error('[POST /api/disputes/[id]/evidence] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
