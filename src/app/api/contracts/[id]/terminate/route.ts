import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const terminateSchema = z.object({
  reason: z.string().min(1, 'Reason for ending assignment is required'),
  endDate: z.string().optional(),
  confirmOutstandingDues: z.boolean().optional(),
});

/**
 * POST /api/contracts/[id]/terminate
 *
 * Contractor ends a worker's active assignment on a project.
 * - Soft-end: moves status to COMPLETED, preserves full history.
 * - Enforces check on unresolved wage dues: requires explicit confirmation if dues exist.
 * - Appends audit trail entry.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    const contractId = params.id;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 });
    }

    const parsedResult = terminateSchema.safeParse(body);
    if (!parsedResult.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: parsedResult.error.issues[0]?.message || 'Validation failed',
          },
        },
        { status: 400 }
      );
    }
    const { reason, endDate, confirmOutstandingDues } = parsedResult.data;

    let actorId: string;
    if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile?.id) {
        return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Contractor profile missing' } }, { status: 403 });
      }
      actorId = authCtx.contractorProfile.id;
    } else {
      actorId = authCtx.user.id;
    }

    // ── Pure PostgreSQL flow ──
    const adminClient = createAdminClient();

    // 1. Fetch contract
    const { data: contract, error: fetchErr } = await adminClient
      .from('work_contracts')
      .select('*')
      .eq('id', contractId)
      .maybeSingle();

    if (fetchErr || !contract) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Contract not found' } }, { status: 404 });
    }

    // 2. Authorization check: Contractor must own this contract or be admin
    if (authCtx.user.role === 'CONTRACTOR' && contract.contractor_id !== actorId) {
      throw new AuthorizationError('Access denied: You do not own this contract.', 403);
    }

    // 3. Calculate unresolved wage dues
    const { data: attendanceRows } = await adminClient
      .from('attendance_events')
      .select('id, punch_type, status')
      .eq('contract_id', contractId)
      .neq('status', 'REJECTED');

    const totalDays = (attendanceRows || []).length;
    const estimatedEarnedPaise = totalDays * Number(contract.daily_wage || 0);

    const { data: paymentRows } = await adminClient
      .from('payment_transactions')
      .select('amount_paise, status')
      .eq('contract_id', contractId)
      .in('status', ['SUCCESS', 'WORKER_CONFIRMED'] as any);

    const totalPaidPaise = (paymentRows || []).reduce(
      (sum: number, tx: any) => sum + Number(tx.amount_paise || 0),
      0
    );

    const outstandingPaise = Math.max(0, estimatedEarnedPaise - totalPaidPaise);

    if (outstandingPaise > 0 && !confirmOutstandingDues) {
      return NextResponse.json(
        {
          error: {
            code: 'UNRESOLVED_DUES_CONFIRMATION_REQUIRED',
            message: `Worker has unresolved wage dues of ₹${outstandingPaise / 100}. Explicit confirmation is required to end assignment.`,
            unresolvedDuesPaise: outstandingPaise,
          },
        },
        { status: 409 }
      );
    }

    // 4. Update contract to COMPLETED (soft-end)
    const now = new Date().toISOString();
    const effectiveEndDate = endDate || now.split('T')[0];

    const currentAudit = Array.isArray(contract.audit_trail) ? contract.audit_trail : [];
    const updatedAudit = [
      ...currentAudit,
      {
        action: 'ASSIGNMENT_ENDED',
        actorId,
        timestamp: now,
        reason,
        unresolvedDuesPaise: outstandingPaise,
        duesConfirmed: !!confirmOutstandingDues,
      },
    ];

    const { data: updatedContract, error: updateErr } = await adminClient
      .from('work_contracts')
      .update({
        status: 'COMPLETED',
        end_date: effectiveEndDate,
        end_reason: reason,
        ended_by: authCtx.user.id,
        unresolved_dues_paise: outstandingPaise,
        dues_confirmed: !!confirmOutstandingDues,
        audit_trail: updatedAudit,
        updated_at: now,
      })
      .eq('id', contractId)
      .select('*, workers(*), contractors(*), projects(*)')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: updateErr.message } }, { status: 500 });
    }

    // 5. Append to DB audit_log
    try {
      await adminClient.from('audit_log').insert({
        actor: authCtx.user.id,
        action: 'CONTRACT_TERMINATED',
        entity_type: 'work_contracts',
        entity_id: contractId,
        before: { status: contract.status },
        after: {
          status: 'COMPLETED',
          reason,
          unresolvedDuesPaise: outstandingPaise,
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      contract: updatedContract,
      message: 'Worker assignment completed successfully.',
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Server error' } },
      { status: 500 }
    );
  }
}
