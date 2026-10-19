import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { signQrToken, decryptPayload, getTodayIst } from '@/lib/crypto/qr-token';

export async function GET(req: NextRequest) {
  try {
    // Only contractors and admins can view active gate tokens; workers must never receive plaintext tokens/codes
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: { code: 'BAD_REQUEST', message: 'projectId parameter is required' } },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Enforce strict project ownership for contractors
    if (authCtx.user.role === 'CONTRACTOR') {
      const { data: project } = await adminClient
        .from('projects')
        .select('id, contractor_id')
        .eq('id', projectId)
        .maybeSingle();

      if (!project || project.contractor_id !== authCtx.contractorProfile?.id) {
        throw new AuthorizationError('Only the project owner contractor can view active gate tokens.', 403);
      }
    }

    const todayIst = getTodayIst();
    const nowIso = new Date().toISOString();

    const { data: active, error } = await adminClient
      .from('attendance_tokens')
      .select('id, short_code, encrypted_code, encrypted_token, project_id, worksite_id, token, payload_json, expires_at, ttl_seconds, is_active, revoked_at, valid_date, projects(name)')
      .is('revoked_at', null)
      .eq('valid_date', todayIst)
      .gt('expires_at', nowIso)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !active) {
      return NextResponse.json({ success: true, activeToken: null });
    }

    const decryptedToken = decryptPayload(active.encrypted_token);
    const decryptedCode = decryptPayload(active.encrypted_code);
    const compactToken = decryptedToken || (active.payload_json ? signQrToken(active.payload_json as any).compact : active.token || '');
    const shortCode = decryptedCode || active.short_code || '';

    return NextResponse.json({
      success: true,
      activeToken: {
        tokenId: active.id,
        token: compactToken,
        shortCode: shortCode,
        projectId: active.project_id,
        projectName: (active.projects as any)?.name || 'Active Site Gate',
        expiresAt: active.expires_at,
        ttlSeconds: active.ttl_seconds,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json({ success: true, activeToken: null });
  }
}
