import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess, requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProjectCounts } from '@/lib/services/counts-service';
import { z } from 'zod';

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    await requireProjectAccess(projectId);

    const adminClient = createAdminClient();
    const { data: project, error } = await adminClient
      .from('projects')
      .select('*, worksites(*), contractors(*)')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, { status: 404 });
    }

    const counts = await getProjectCounts(projectId);

    return NextResponse.json({ success: true, project, counts });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);

    await requireProjectAccess(projectId);
    const body = await req.json();
    const parsed = updateProjectSchema.parse(body);

    const adminClient = createAdminClient();

    const payload: any = {};
    if (parsed.name) payload.name = parsed.name;
    if (parsed.description !== undefined) payload.description = parsed.description;
    if (parsed.status) payload.status = parsed.status;
    if (parsed.startDate) payload.start_date = parsed.startDate;
    if (parsed.endDate !== undefined) payload.end_date = parsed.endDate;

    const { data: project, error } = await adminClient
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: error.message } }, { status: 400 });
    }

    return NextResponse.json({ success: true, project });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}
