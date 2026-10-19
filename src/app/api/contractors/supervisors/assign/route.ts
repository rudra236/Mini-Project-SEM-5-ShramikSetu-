import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireProjectAccess, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateIndianMobileNumber } from '@/lib/auth/phone-validation';
import { recordAuditEvent } from '@/lib/services/audit-service';
import { z } from 'zod';

const assignSupervisorSchema = z.object({
  projectId: z.string().uuid('Valid project ID required'),
  phone: z.string().min(10, 'Valid mobile number required'),
  fullName: z.string().min(2, 'Supervisor name required'),
  badgeNumber: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    const body = await req.json();
    const parsed = assignSupervisorSchema.parse(body);

    // Verify contractor ownership of the project
    await requireProjectAccess(parsed.projectId);

    const phoneValidation = validateIndianMobileNumber(parsed.phone);
    if (!phoneValidation.isValid) {
      return NextResponse.json(
        { error: { code: 'INVALID_PHONE_NUMBER', message: phoneValidation.error } },
        { status: 422 }
      );
    }

    const adminClient = createAdminClient();

    // Check if contractor profile exists
    const contractorId = authCtx.contractorProfile?.id;
    if (!contractorId && authCtx.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Contractor profile required' } },
        { status: 403 }
      );
    }

    // 1. Locate or create public user for supervisor
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id, role')
      .eq('phone', phoneValidation.e164Phone)
      .maybeSingle();

    let supervisorUserId = existingUser?.id;

    if (!existingUser) {
      // Create user record with role SUPERVISOR
      const newUserId = crypto.randomUUID();
      const { data: newUser, error: userError } = await adminClient
        .from('users')
        .insert({
          id: newUserId,
          phone: phoneValidation.e164Phone,
          role: 'SUPERVISOR',
          locale: 'en',
          is_active: true,
        })
        .select()
        .single();

      if (userError || !newUser) {
        return NextResponse.json(
          { error: { code: 'USER_CREATION_FAILED', message: userError?.message || 'Failed to register supervisor' } },
          { status: 400 }
        );
      }
      supervisorUserId = newUser.id;
    } else if (existingUser.role !== 'SUPERVISOR') {
      // Promote or update user role to SUPERVISOR
      await adminClient
        .from('users')
        .update({ role: 'SUPERVISOR' })
        .eq('id', existingUser.id);
    }

    // 2. Ensure supervisor profile exists
    const { data: existingSupProfile } = await adminClient
      .from('supervisors')
      .select('id')
      .eq('user_id', supervisorUserId!)
      .maybeSingle();

    let supervisorId = existingSupProfile?.id;

    if (!existingSupProfile) {
      const { data: newProfile, error: profileErr } = await adminClient
        .from('supervisors')
        .insert({
          user_id: supervisorUserId!,
          contractor_id: contractorId!,
          full_name: parsed.fullName,
          badgeNumber: parsed.badgeNumber || `GATE-${Math.floor(1000 + Math.random() * 9000)}`,
        } as any)
        .select()
        .single();

      if (profileErr || !newProfile) {
        return NextResponse.json(
          { error: { code: 'PROFILE_CREATION_FAILED', message: profileErr?.message || 'Failed to create supervisor profile' } },
          { status: 400 }
        );
      }
      supervisorId = newProfile.id;
    }

    // 3. Assign supervisor to project
    const { data: assignment, error: assignErr } = await adminClient
      .from('supervisor_project_assignments')
      .upsert(
        {
          supervisor_id: supervisorId!,
          project_id: parsed.projectId,
          is_active: true,
          assigned_at: new Date().toISOString(),
        },
        { onConflict: 'supervisor_id,project_id' }
      )
      .select()
      .single();

    if (assignErr) {
      return NextResponse.json(
        { error: { code: 'ASSIGNMENT_FAILED', message: assignErr.message } },
        { status: 400 }
      );
    }

    // 4. Record audit event
    await recordAuditEvent({
      actorId: authCtx.authUserId,
      action: 'supervisor_assigned',
      entityType: 'supervisor_project_assignments',
      entityId: assignment.id,
      payload: {
        projectId: parsed.projectId,
        supervisorId,
        supervisorPhone: phoneValidation.e164Phone,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Supervisor successfully assigned to project gate',
      assignment,
      supervisor: {
        id: supervisorId,
        userId: supervisorUserId,
        phone: phoneValidation.e164Phone,
        fullName: parsed.fullName,
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
      { error: { code: 'SERVER_ERROR', message: error.message || 'Failed to assign supervisor' } },
      { status: 500 }
    );
  }
}
