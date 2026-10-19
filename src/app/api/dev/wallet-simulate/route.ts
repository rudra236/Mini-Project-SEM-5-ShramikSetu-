import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  recordWageAccrual,
  recordPaymentClaim,
  confirmOrDisputePayment,
} from '@/lib/services/ledger-service';

export async function POST(req: NextRequest) {
  const isDemo =
    process.env.DEMO_MODE === 'true' ||
    process.env.ENABLE_DEV_AUTH === 'true' ||
    process.env.NODE_ENV !== 'production';

  if (!isDemo) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Sandbox mode is only available when DEMO_MODE=true.' } },
      { status: 403 }
    );
  }

  try {
    const authCtx = await requireAuthenticatedUser();
    const admin = createAdminClient();
    const body = await req.json();
    const { action, days = 3, amountRupees = 1500, simulateFailure = false } = body;

    // Resolve worker
    let worker = authCtx.workerProfile;
    if (!worker) {
      const { data: firstWorker } = await admin
        .from('workers')
        .select('*')
        .limit(1)
        .maybeSingle();
      worker = firstWorker;
    }

    if (!worker) {
      return NextResponse.json(
        { error: { code: 'WORKER_NOT_FOUND', message: 'No worker record found to simulate.' } },
        { status: 404 }
      );
    }

    // Resolve active contract
    let { data: contract } = await admin
      .from('work_contracts')
      .select('*, projects(*), worksites(*)')
      .eq('worker_id', worker.id)
      .eq('status', 'ACTIVE')
      .limit(1)
      .maybeSingle();

    if (!contract) {
      // Look for any contract
      const { data: anyContract } = await admin
        .from('work_contracts')
        .select('*, projects(*), worksites(*)')
        .eq('worker_id', worker.id)
        .limit(1)
        .maybeSingle();
      contract = anyContract;
    }

    if (!contract) {
      return NextResponse.json(
        { error: { code: 'NO_CONTRACT', message: 'Worker has no active contract for wage simulation.' } },
        { status: 400 }
      );
    }

    const dailyWage = contract.daily_wage || 85000;

    // ── ACTION 1: CREDIT TEST WAGES ──────────────────────────────────────────
    if (action === 'credit_wages') {
      const creditedDates: string[] = [];

      for (let i = 0; i < Number(days); i++) {
        // past dates: yesterday, 2 days ago, etc.
        const dateObj = new Date(Date.now() - (i + 1) * 86400000);
        const dateStr = dateObj.toISOString().split('T')[0];

        // Check if attendance already exists for this date
        let { data: existingAttendance } = await admin
          .from('attendance_events')
          .select('id')
          .eq('worker_id', worker.id)
          .eq('contract_id', contract.id)
          .eq('date', dateStr)
          .maybeSingle();

        let attendanceId = existingAttendance?.id;

        if (!attendanceId) {
          const { data: newAtt, error: attErr } = await admin
            .from('attendance_events')
            .insert({
              worker_id: worker.id,
              contractor_id: contract.contractor_id,
              project_id: contract.project_id,
              worksite_id: contract.worksite_id || '77777777-7777-7777-7777-777777777701',
              contract_id: contract.id,
              date: dateStr,
              punch_type: 'IN',
              attendance_method: 'qr',
              worker_latitude: 19.2612,
              worker_longitude: 72.9644,
              worksite_latitude: 19.2612,
              worksite_longitude: 72.9644,
              calculated_distance_meters: 0.0,
              allowed_radius_meters: 250,
              status: 'VERIFIED',
              created_at: new Date(dateObj.getTime() + 9 * 3600000).toISOString(),
            })
            .select()
            .single();

          if (newAtt) {
            attendanceId = newAtt.id;
          }
        }

        if (attendanceId) {
          await recordWageAccrual({
            attendanceEventId: attendanceId,
            contractId: contract.id,
            workerId: worker.id,
            contractorId: contract.contractor_id,
            amountPaise: dailyWage,
            date: dateStr,
            description: `Test Sandbox: Verified shift accrual for ${dateStr}`,
          }).catch(() => {});
          creditedDates.push(dateStr);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Successfully credited test wages for ${creditedDates.length} days (₹${(dailyWage * creditedDates.length) / 100}).`,
        dates: creditedDates,
        amountPaise: dailyWage * creditedDates.length,
      });
    }

    // ── ACTION 2: SIMULATE WITHDRAWAL ────────────────────────────────────────
    if (action === 'simulate_withdrawal') {
      if (simulateFailure) {
        return NextResponse.json(
          {
            success: false,
            simulatedFailure: true,
            error: {
              code: 'SIMULATED_GATEWAY_TIMEOUT',
              message: 'Simulated payout failure: Bank server timeout / Insufficient contractor account funds.',
            },
          },
          { status: 400 }
        );
      }

      const amountPaise = Math.round(Number(amountRupees) * 100);
      const referenceNumber = `UPI-SANDBOX-${Date.now().toString().slice(-6)}`;

      // 1. Record payment claim
      const claim = await recordPaymentClaim({
        contractId: contract.id,
        workerId: worker.id,
        contractorId: contract.contractor_id,
        projectId: contract.project_id,
        amountPaise,
        paymentMethod: 'UPI_SIMULATED',
        referenceNumber,
        notes: 'Simulated Sandbox payout withdrawal via UPI',
        initiatorUserId: authCtx.user.id,
      });

      // 2. Automatically confirm payout to debit ledger and update balance
      await confirmOrDisputePayment({
        transactionId: claim.id,
        workerUserId: worker.user_id || authCtx.user.id,
        isConfirmed: true,
      });

      return NextResponse.json({
        success: true,
        message: `Successfully simulated payout withdrawal of ₹${amountRupees}.`,
        transactionId: claim.id,
        referenceNumber,
        amountPaise,
      });
    }

    return NextResponse.json(
      { error: { code: 'INVALID_ACTION', message: 'Action must be "credit_wages" or "simulate_withdrawal".' } },
      { status: 400 }
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: err.message } }, { status: err.statusCode });
    }
    return NextResponse.json(
      { error: { code: 'SIMULATION_ERROR', message: err.message } },
      { status: 500 }
    );
  }
}
