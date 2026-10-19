import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const contractId = params.id;
    const adminClient = createAdminClient();

    // 1. Fetch contract with all related entities
    const { data: contract, error: contractErr } = await adminClient
      .from('work_contracts')
      .select('*, workers(*), contractors(*), projects(*), worksites(*)')
      .eq('id', contractId)
      .maybeSingle();

    if (contractErr) {
      return NextResponse.json(
        { error: { code: 'QUERY_FAILED', message: contractErr.message } },
        { status: 400 }
      );
    }

    if (!contract) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Contract not found' } },
        { status: 404 }
      );
    }

    // 2. Strict Cross-Tenant Authorization Isolation Check
    if (authCtx.user.role === 'WORKER') {
      const workerProfileId = authCtx.workerProfile?.id;
      if (!workerProfileId || contract.worker_id !== workerProfileId) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN_CONTRACT_ACCESS',
              message: 'Access denied: You are not authorized to view this employment contract.',
            },
          },
          { status: 403 }
        );
      }
    } else if (authCtx.user.role === 'CONTRACTOR') {
      const contractorProfileId = authCtx.contractorProfile?.id;
      if (!contractorProfileId || contract.contractor_id !== contractorProfileId) {
        return NextResponse.json(
          {
            error: {
              code: 'FORBIDDEN_CONTRACT_ACCESS',
              message: 'Access denied: You are not authorized to view contracts outside your organization.',
            },
          },
          { status: 403 }
        );
      }
    }

    // 3. Fetch Linked Attendance Summary
    let verifiedDaysCount = 0;
    let totalEarnedPaise = 0;
    let recentAttendance: any[] = [];

    try {
      const { data: attendanceEvents } = await adminClient
        .from('attendance_events')
        .select('*')
        .eq('contract_id', contract.id)
        .order('date', { ascending: false });

      if (attendanceEvents) {
        const verified = attendanceEvents.filter((a: any) => a.status === 'VERIFIED');
        verifiedDaysCount = verified.length;
        const dailyWagePaise = Number(contract.daily_wage) || 50000;
        totalEarnedPaise = verifiedDaysCount * dailyWagePaise;
        recentAttendance = attendanceEvents.slice(0, 5);
      }
    } catch {
      // Non-blocking fallback
    }

    return NextResponse.json({
      success: true,
      contract,
      attendanceSummary: {
        verifiedDaysCount,
        totalEarnedPaise,
        recentAttendance,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: error.message || 'Failed to retrieve contract' } },
      { status: 500 }
    );
  }
}
