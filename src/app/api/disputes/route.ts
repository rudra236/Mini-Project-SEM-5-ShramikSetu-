import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { createDispute, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * GET /api/disputes
 * List disputes with strict server-side authorization.
 * Worker sees only own disputes.
 * Contractor sees only disputes on their own projects/contracts.
 */
export async function GET(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();

    const { searchParams } = new URL(request.url);
    const workerIdParam = searchParams.get('workerId');
    const contractorIdParam = searchParams.get('contractorId');
    const statusParam = searchParams.get('status');

    const adminClient = createAdminClient();
    let query = adminClient
      .from('disputes')
      .select('*')
      .order('created_at', { ascending: false });

    // Strict role-based isolation
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile) {
        return NextResponse.json({ error: 'Worker profile not found' }, { status: 403 });
      }
      query = query.eq('worker_id', authCtx.workerProfile.id);
    } else if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile) {
        return NextResponse.json({ error: 'Contractor profile not found' }, { status: 403 });
      }
      query = query.eq('contractor_id', authCtx.contractorProfile.id);
    } else if (authCtx.user.role === 'ADMIN' || authCtx.user.role === 'INSTITUTIONAL_USER') {
      if (workerIdParam) query = query.eq('worker_id', workerIdParam);
      if (contractorIdParam) query = query.eq('contractor_id', contractorIdParam);
    } else {
      return NextResponse.json({ error: 'Unauthorized role' }, { status: 403 });
    }

    if (statusParam) {
      query = query.eq('status', statusParam.toLowerCase() as any);
    }

    const { data: disputes, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enhance disputes with relation details
    const enrichedDisputes = await Promise.all(
      (disputes || []).map(async (d: any) => {
        const [projectRes, contractorRes, workerRes] = await Promise.all([
          adminClient.from('projects').select('id, name, location').eq('id', d.project_id).maybeSingle(),
          adminClient.from('contractors').select('id, company_name, full_name, compliance_status').eq('id', d.contractor_id).maybeSingle(),
          adminClient.from('workers').select('id, full_name, occupation, skill_category').eq('id', d.worker_id).maybeSingle(),
        ]);
        return {
          ...d,
          projects: projectRes.data || null,
          contractors: contractorRes.data || null,
          workers: workerRes.data || null,
        };
      })
    );

    return NextResponse.json({ success: true, disputes: enrichedDisputes }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[GET /api/disputes] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/disputes
 * Create dispute with server-computed financial amounts.
 */
export async function POST(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const user = authCtx.user;

    const body = await request.json();

    // Strict worker isolation: workerId must be authenticated worker
    if (authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile) {
        return NextResponse.json({ error: 'Worker profile not found' }, { status: 403 });
      }
    }

    const workerId =
      authCtx.user.role === 'WORKER' && authCtx.workerProfile
        ? authCtx.workerProfile.id
        : body.workerId;

    if (!workerId) {
      return NextResponse.json({ error: 'workerId is required' }, { status: 400 });
    }

    if (!body.contractId) {
      return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
    }

    // Default dates if missing (fallback for compatibility)
    const today = new Date().toISOString().slice(0, 10);
    const periodTo = body.periodTo || body.period_to || today;
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const periodFrom = body.periodFrom || body.period_from || pastDate;

    const result = await createDispute({
      workerId,
      contractId: body.contractId,
      category: body.category,
      periodFrom,
      periodTo,
      description: body.description || '',
      priority: body.priority ?? 'MEDIUM',
      raisedByUserId: user.id,
      claimedPaise: body.claimedPaise !== undefined ? body.claimedPaise : body.claimed_paise !== undefined ? body.claimed_paise : body.amountClaimedPaise,
      claimedJustification: body.claimedJustification || body.claimed_justification,
      evidencePhotoUrl: body.evidencePhotoUrl,
      evidenceVoiceUrl: body.evidenceVoiceUrl,
      voiceTranscription: body.voiceTranscription,
      linkedAttendanceEventIds: body.linkedAttendanceEventIds,
      linkedLedgerEntryIds: body.linkedLedgerEntryIds,
    });

    return NextResponse.json({ success: true, dispute: result.dispute }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[POST /api/disputes] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
