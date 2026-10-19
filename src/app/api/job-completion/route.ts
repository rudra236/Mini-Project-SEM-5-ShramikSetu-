/**
 * POST /api/job-completion
 *
 * Generates an immutable Job Completion Statement when employment ends.
 *
 * Access: CONTRACTOR only (must own the contract).
 *
 * Body: { contractId: string, employmentRelationshipId: string }
 *
 * SETTLEMENT INVARIANT (enforced in service, not here):
 *   outstanding > 0  → settlement_status = OUTSTANDING_PAYMENT
 *   outstanding = 0  → settlement_status = SETTLED
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  generateJobCompletionStatement,
  PassportServiceError,
} from '@/lib/services/passport-service';

const RequestSchema = z.object({
  contractId: z.string().uuid('contractId must be a valid UUID'),
  employmentRelationshipId: z.string().uuid('employmentRelationshipId must be a valid UUID'),
});

export async function POST(req: Request) {
  try {
    // 1. Authenticate & authorize — contractors only
    const ctx = await requireRole(['CONTRACTOR']);

    const contractorProfile = ctx.contractorProfile;
    if (!contractorProfile) {
      return NextResponse.json(
        { error: { code: 'MISSING_PROFILE', message: 'Contractor profile not found' } },
        { status: 403 }
      );
    }

    // 2. Validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } },
        { status: 400 }
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parsed.error.flatten().fieldErrors,
          },
        },
        { status: 400 }
      );
    }

    const { contractId, employmentRelationshipId } = parsed.data;

    // 3. Ownership check — verify this contractor owns the contract
    const adminClient = createAdminClient();
    const { data: contract, error: contractErr } = await adminClient
      .from('work_contracts')
      .select('id, contractor_id, status')
      .eq('id', contractId)
      .single();

    if (contractErr || !contract) {
      return NextResponse.json(
        { error: { code: 'CONTRACT_NOT_FOUND', message: 'Work contract not found' } },
        { status: 404 }
      );
    }

    if (contract.contractor_id !== contractorProfile.id) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'You do not own this contract. Cannot generate completion statement.',
          },
        },
        { status: 403 }
      );
    }

    // 4. Generate the immutable Job Completion Statement
    const statement = await generateJobCompletionStatement({
      employmentRelationshipId,
      contractId,
      generatedByUserId: ctx.authUserId,
    });

    return NextResponse.json(
      {
        message: 'Job Completion Statement generated successfully.',
        settlementStatus: statement.settlement_status,
        statement,
      },
      { status: 201 }
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: err.message } },
        { status: err.statusCode }
      );
    }
    if (err instanceof PassportServiceError) {
      return NextResponse.json(
        { error: { code: err.reasonCode, message: err.message } },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/job-completion] Unexpected error:', err?.message);
    return NextResponse.json(
      { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } },
      { status: 500 }
    );
  }
}
