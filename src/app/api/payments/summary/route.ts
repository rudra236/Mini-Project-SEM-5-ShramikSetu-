import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { getPaymentSummary, PaymentServiceError } from '@/lib/services/payment-service';
import { getWorkerFinancialSummary } from '@/lib/services/financial-summary-service';

/**
 * GET /api/payments/summary?contractId=...&periodStart=...&periodEnd=...
 *
 * Returns earnings and payment summary.
 * If contractId is provided, returns contract-level summary.
 * If contractId is omitted, returns worker-level summary for the authenticated worker.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Dev-mode: Supabase not available, return zero summary ──
    const isLocalDev = process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('local_dev');
    if (isLocalDev) {
      return NextResponse.json(
        {
          success: true,
          totalEarnedPaise: 0,
          totalPaidPaise: 0,
          outstandingPaise: 0,
          verifiedDaysCount: 0,
          transactions: [],
        },
        { status: 200 }
      );
    }

    // 1. Authenticate (try unified session first, then Supabase auth)
    let userId: string | null = null;
    try {
      const authCtx = await requireAuthenticatedUser();
      userId = authCtx.user.id;
    } catch {
      const supabase = createServerSupabaseClient();
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.id;
    }

    // 2. Parse query params
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get('contractId');
    const projectId = searchParams.get('projectId');
    const periodStart = searchParams.get('periodStart') ?? undefined;
    const periodEnd = searchParams.get('periodEnd') ?? undefined;

    // Case 1: Contract-specific query
    if (contractId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(contractId)) {
        return NextResponse.json({ error: 'contractId must be a valid UUID' }, { status: 400 });
      }

      const summary = await getPaymentSummary({ contractId, periodStart, periodEnd });
      return NextResponse.json({ success: true, ...summary }, { status: 200 });
    }

    // Case 2: Project-specific query
    if (projectId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        return NextResponse.json({ error: 'projectId must be a valid UUID' }, { status: 400 });
      }

      const admin = createAdminClient();
      const { data: transactions } = await admin
        .from('payment_transactions')
        .select('*, contractors(company_name), projects(name), payment_confirmations(*)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      const totalPaidPaise = (transactions || []).reduce(
        (sum: number, t: any) => sum + (Number(t.amount_paise) || 0),
        0
      );

      return NextResponse.json({
        success: true,
        projectId,
        totalPaidPaise,
        transactions: transactions || [],
      }, { status: 200 });
    }

    // Case 2: Worker-level query (authenticated worker)
    const admin = createAdminClient();
    const { data: worker } = await admin
      .from('workers')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (worker) {
      const financialSummary = await getWorkerFinancialSummary(worker.id);
      const { data: transactions } = await admin
        .from('payment_transactions')
        .select('*, contractors(company_name), projects(name), payment_confirmations(*)')
        .eq('worker_id', worker.id)
        .order('created_at', { ascending: false });

      return NextResponse.json(
        {
          success: true,
          workerId: worker.id,
          totalEarnedPaise: financialSummary.totalEarnedPaise,
          totalPaidPaise: financialSummary.totalPaidPaise,
          outstandingPaise: financialSummary.outstandingPaise,
          verifiedDaysCount: financialSummary.verifiedDaysCount,
          transactions: transactions || [],
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ error: 'contractId query parameter is required' }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof PaymentServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error('[GET /api/payments/summary] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
