import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getWorkerFinancialSummary, getContractFinancialSummary } from '@/lib/services/financial-summary-service';
import { paiseToRupeeDisplay } from '@/types/payment.types';

/**
 * GET /api/earnings?contractId=...&workerId=...
 *
 * Authoritative financial calculation endpoint backed by the `worker_financial_summary`
 * and `contract_financial_summary` database views.
 *
 * If `contractId` is provided: returns contract-specific verified shifts, earned, paid, and outstanding arrears.
 * If `contractId` is omitted: returns the worker's lifetime aggregated shifts, earned, paid, and arrears.
 */
export async function GET(request: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const workerIdParam = searchParams.get('workerId');

    // ── Dev-mode: Supabase not available, return zero earnings ──
    const isLocalDev = process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('local_dev');
    if (isLocalDev) {
      return NextResponse.json(
        {
          success: true,
          verifiedDaysCount: 0,
          dailyWagePaise: 0,
          totalEarnedPaise: 0,
          totalPaidPaise: 0,
          outstandingPaise: 0,
          totalEarnedDisplay: '₹0.00',
          totalPaidDisplay: '₹0.00',
          outstandingDisplay: '₹0.00',
        },
        { status: 200 }
      );
    }

    // Case 1: Contract-scoped summary
    if (contractId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(contractId)) {
        return NextResponse.json({ error: 'contractId must be a valid UUID' }, { status: 400 });
      }

      const summary = await getContractFinancialSummary(contractId);

      return NextResponse.json(
        {
          success: true,
          contractId: summary.contractId,
          contractCode: summary.contractCode,
          workerId: summary.workerId,
          contractorId: summary.contractorId,
          projectId: summary.projectId,
          verifiedDaysCount: summary.verifiedDaysCount,
          dailyWagePaise: summary.dailyWagePaise,
          totalEarnedPaise: summary.totalEarnedPaise,
          totalPaidPaise: summary.totalPaidPaise,
          outstandingPaise: summary.outstandingPaise,
          dailyWageDisplay: paiseToRupeeDisplay(summary.dailyWagePaise),
          totalEarnedDisplay: paiseToRupeeDisplay(summary.totalEarnedPaise),
          totalPaidDisplay: paiseToRupeeDisplay(summary.totalPaidPaise),
          outstandingDisplay: paiseToRupeeDisplay(summary.outstandingPaise),
        },
        { status: 200 }
      );
    }

    // Case 2: Worker-level lifetime summary
    let targetWorkerId = workerIdParam;
    if (!targetWorkerId && authCtx.workerProfile) {
      targetWorkerId = authCtx.workerProfile.id;
    }

    if (!targetWorkerId) {
      return NextResponse.json(
        { error: 'workerId query parameter or an active worker session is required' },
        { status: 400 }
      );
    }

    const summary = await getWorkerFinancialSummary(targetWorkerId);

    return NextResponse.json(
      {
        success: true,
        workerId: summary.workerId,
        fullName: summary.fullName,
        internalWorkerId: summary.internalWorkerId,
        verifiedDaysCount: summary.verifiedDaysCount,
        dailyWagePaise: 0,
        totalEarnedPaise: summary.totalEarnedPaise,
        totalPaidPaise: summary.totalPaidPaise,
        outstandingPaise: summary.outstandingPaise,
        totalContractsCount: summary.totalContractsCount,
        activeContractsCount: summary.activeContractsCount,
        totalEarnedDisplay: paiseToRupeeDisplay(summary.totalEarnedPaise),
        totalPaidDisplay: paiseToRupeeDisplay(summary.totalPaidPaise),
        outstandingDisplay: paiseToRupeeDisplay(summary.outstandingPaise),
      },
      { status: 200 }
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: err.message, code: 'UNAUTHORIZED' },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/earnings] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
