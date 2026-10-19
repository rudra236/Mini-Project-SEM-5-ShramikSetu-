import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { getOpenDisputesCount, DisputeServiceError } from '@/lib/services/dispute-service';

/**
 * GET /api/disputes/count
 * Returns canonical count of open disputes.
 * Single source of truth for both Statutory Compliance Ledger and Arbitration Roster.
 */
export async function GET(request: NextRequest) {
  try {
    // ── Dev-mode: Supabase not available, return 0 count ──
    const isLocalDev = process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('local_dev');
    if (isLocalDev) {
      return NextResponse.json({ success: true, count: 0 }, { status: 200 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();

    if (authErr || !user) {
      // Try unified session fallback
      try {
        await requireAuthenticatedUser();
      } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const { searchParams } = new URL(request.url);
    const contractorId = searchParams.get('contractorId') || undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const count = await getOpenDisputesCount({ contractorId, projectId });

    return NextResponse.json({ success: true, count }, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof DisputeServiceError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[GET /api/disputes/count] Error:', err);
    return NextResponse.json({ success: true, count: 0 }, { status: 200 });
  }
}
