import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateWorkerProfile } from '@/lib/services/employment-service';
import { z } from 'zod';

const updateProfileSchema = z.object({
  workerId: z.string().optional().nullable(),
  fullName: z.string().min(1).or(z.literal('')).optional().nullable(),
  phone: z.string().regex(/^(?:\+?91)?[6-9]\d{9}$/, 'Invalid Indian mobile number').or(z.literal('')).nullable().optional(),
  occupation: z.string().optional().nullable(),
  skillCategory: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED']).optional(),
  emergencyContact: z.string().optional().nullable(),
  profilePhotoUrl: z.string().url().optional().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['WORKER', 'ADMIN']);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 });
    }

    const parsedResult = updateProfileSchema.safeParse(body);
    if (!parsedResult.success) {
      console.error('[API /api/workers/profile] Validation error:', JSON.stringify(parsedResult.error.flatten()), 'body:', body);
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: parsedResult.error.flatten() } },
        { status: 400 }
      );
    }
    const parsed = parsedResult.data;

    const adminClient = createAdminClient();

    // Resolve worker ID
    let workerId = authCtx.workerProfile?.id;
    if (!workerId) {
      const { data: w } = await adminClient.from('workers').select('id').eq('user_id', authCtx.user.id).maybeSingle();
      workerId = w?.id;
    }

    if (parsed.workerId && authCtx.user.role === 'ADMIN') {
      workerId = parsed.workerId;
    }

    if (!workerId) {
      return NextResponse.json({ error: { code: 'WORKER_NOT_FOUND', message: 'Worker profile not found' } }, { status: 404 });
    }

    // 1. Update worker table
    const updatedWorker = await updateWorkerProfile(workerId, authCtx.user.id, {
      fullName: parsed.fullName || undefined,
      occupation: parsed.occupation || undefined,
      skillCategory: parsed.skillCategory,
      emergencyContact: parsed.emergencyContact,
      profilePhotoUrl: parsed.profilePhotoUrl,
    });

    // 2. Update user / profile table if phone or name changed
    let updatedUser = authCtx.user;
    if (parsed.phone || parsed.fullName) {
      const { data: u } = await adminClient
        .from('users')
        .update({
          ...(parsed.phone && { phone: parsed.phone }),
        })
        .eq('id', authCtx.user.id)
        .select()
        .single();
      if (u) updatedUser = u;

      await adminClient
        .from('profiles')
        .update({
          ...(parsed.phone && { phone: parsed.phone }),
          ...(parsed.fullName && { full_name: parsed.fullName }),
        })
        .eq('id', authCtx.user.id);
    }

    return NextResponse.json({
      success: true,
      worker: updatedWorker,
      user: updatedUser,
      message: 'Worker profile updated successfully.',
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}

export const PUT = POST;
export const PATCH = POST;
