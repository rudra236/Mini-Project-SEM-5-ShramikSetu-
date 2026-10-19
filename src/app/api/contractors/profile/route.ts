import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireContractorAccess, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const updateContractorSchema = z.object({
  contractorId: z.string().optional(),
  fullName: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  licenseNumber: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const contractorId = searchParams.get('contractorId') || authCtx.contractorProfile?.id;

    if (!contractorId) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Contractor profile not found' } }, { status: 404 });
    }

    await requireContractorAccess(contractorId);
    const adminClient = createAdminClient();

    const { data: contractor, error } = await adminClient
      .from('contractors')
      .select('*, users(*)')
      .eq('id', contractorId)
      .single();

    if (error || !contractor) {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Contractor profile not found' } }, { status: 404 });
    }

    return NextResponse.json({ success: true, contractor });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const body = await req.json();
    const parsed = updateContractorSchema.parse(body);

    const targetContractorId = parsed.contractorId || authCtx.contractorProfile?.id;
    if (!targetContractorId) {
      return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'Contractor ID required' } }, { status: 400 });
    }

    await requireContractorAccess(targetContractorId);
    const adminClient = createAdminClient();

    const payload: any = {};
    if (parsed.fullName) payload.full_name = parsed.fullName;
    if (parsed.companyName) payload.company_name = parsed.companyName;
    if (parsed.licenseNumber !== undefined) payload.license_number = parsed.licenseNumber;
    if (parsed.organizationId !== undefined) payload.organization_id = parsed.organizationId;

    const { data: contractor, error } = await adminClient
      .from('contractors')
      .update(payload)
      .eq('id', targetContractorId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: error.message } }, { status: 400 });
    }

    let updatedUser = authCtx.user;
    if (parsed.phone) {
      const { data: u } = await adminClient
        .from('users')
        .update({ phone: parsed.phone })
        .eq('id', authCtx.user.id)
        .select()
        .single();
      if (u) updatedUser = u;

      await adminClient
        .from('profiles')
        .update({ phone: parsed.phone })
        .eq('id', authCtx.user.id);
    }

    return NextResponse.json({
      success: true,
      contractor,
      user: updatedUser,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}
