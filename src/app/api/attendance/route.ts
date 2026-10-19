import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const adminClient = createAdminClient();

    let query = adminClient
      .from('attendance_events')
      .select('*, workers(*), contractors(*), projects(*), worksites(*), work_contracts(*)');

    if (authCtx.user.role === 'WORKER') {
      const workerId = authCtx.workerProfile?.id;
      if (workerId) {
        query = query.eq('worker_id', workerId);
      } else {
        const { data: w } = await adminClient.from('workers').select('id').eq('user_id', authCtx.user.id).maybeSingle();
        if (w) {
          query = query.eq('worker_id', w.id);
        } else {
          return NextResponse.json({ success: true, attendanceEvents: [] });
        }
      }
    } else if (authCtx.user.role === 'CONTRACTOR' && authCtx.contractorProfile) {
      query = query.eq('contractor_id', authCtx.contractorProfile.id);
    } else if (authCtx.user.role === 'SUPERVISOR' && authCtx.supervisorProfile) {
      const { data: assignments } = await adminClient
        .from('supervisor_project_assignments')
        .select('project_id')
        .eq('supervisor_id', authCtx.supervisorProfile.id)
        .eq('is_active', true);

      const projectIds = (assignments || []).map((a: { project_id: string }) => a.project_id);
      query = query.in('project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data: attendanceEvents, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 400 });
    }

    return NextResponse.json({ success: true, attendanceEvents: attendanceEvents || [] });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}
