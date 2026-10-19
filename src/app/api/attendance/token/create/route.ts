import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireProjectAccess, AuthorizationError } from '@/lib/auth/authorization';
import { AttendanceValidationError, createRotatingAttendanceToken } from '@/lib/services/attendance-service';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const createTokenSchema = z.object({
  projectId: z.string().uuid('Valid project ID required'),
  worksiteId: z.string().uuid('Valid worksite ID required').optional(),
  ttlSeconds: z.number().positive().default(900),
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    const body = await req.json();
    const parsed = createTokenSchema.parse(body);

    const adminClient = createAdminClient();

    // Enforce strict project ownership: only the project owner contractor can generate
    if (authCtx.user.role === 'CONTRACTOR') {
      const { data: project } = await adminClient
        .from('projects')
        .select('id, contractor_id')
        .eq('id', parsed.projectId)
        .maybeSingle();

      if (!project || project.contractor_id !== authCtx.contractorProfile?.id) {
        throw new AuthorizationError('Only the project owner contractor can generate gate tokens.', 403);
      }
    } else {
      await requireProjectAccess(parsed.projectId);
    }

    let worksiteId: string;
    if (!parsed.worksiteId) {
      const { data: ws } = await adminClient
        .from('worksites')
        .select('id')
        .eq('project_id', parsed.projectId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (ws) {
        worksiteId = ws.id;
      } else {
        return NextResponse.json(
          {
            error: {
              code: 'WORKSITE_NOT_FOUND',
              message: 'No worksite found for project. Please add a worksite first.',
              requestId,
            },
          },
          { status: 400 }
        );
      }
    } else {
      worksiteId = parsed.worksiteId;
    }

    const result = await createRotatingAttendanceToken({
      creatorUserId: authCtx.user.id,
      projectId: parsed.projectId,
      worksiteId: worksiteId,
      ttlSeconds: parsed.ttlSeconds,
    });

    return NextResponse.json(
      {
        success: true,
        token: result.signedToken.compact,
        shortCode: result.shortCode,
        tokenId: result.tokenId,
        expiresAt: result.expiresAt,
        ttlSeconds: result.ttlSeconds,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error(`[REQUEST_ID: ${requestId}] Gate token generation error:`, error);

    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: error.message, requestId } },
        { status: error.statusCode }
      );
    }
    if (error instanceof AttendanceValidationError) {
      return NextResponse.json(
        { error: { code: error.reasonCode, message: error.message, requestId } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      {
        error: {
          code: 'TOKEN_CREATION_FAILED',
          message: 'Failed to generate gate token. Please retry.',
          requestId,
        },
      },
      { status: 500 }
    );
  }
}
