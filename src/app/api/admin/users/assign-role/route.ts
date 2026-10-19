import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditEvent } from '@/lib/services/audit-service';
import type { UserRole } from '@/types/database.types';

export async function POST(req: NextRequest) {
  try {
    // 1. Strictly require ADMIN role
    const authCtx = await requireRole(['ADMIN']);

    const body = await req.json();
    const { targetUserId, newRole, designation, jurisdictionRegion, organizationName } = body;

    if (!targetUserId || !newRole) {
      return NextResponse.json(
        { error: { code: 'INVALID_PAYLOAD', message: 'targetUserId and newRole are required.' } },
        { status: 400 }
      );
    }

    const allowedAdminAssignableRoles: UserRole[] = [
      'INSTITUTIONAL_USER',
      'LABOUR_ORGANIZATION',
      'ADMIN',
      'SUPERVISOR',
      'WORKER',
      'CONTRACTOR',
    ];

    if (!allowedAdminAssignableRoles.includes(newRole)) {
      return NextResponse.json(
        { error: { code: 'INVALID_ROLE', message: `Invalid target role: ${newRole}` } },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 2. Fetch existing user
    const { data: targetUser, error: fetchErr } = await adminClient
      .from('users')
      .select('*')
      .eq('id', targetUserId)
      .maybeSingle();

    if (fetchErr || !targetUser) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'Target user could not be found.' } },
        { status: 404 }
      );
    }

    const previousRole = targetUser.role;

    // 3. Update users table
    const { error: updateErr } = await adminClient
      .from('users')
      .update({ role: newRole })
      .eq('id', targetUserId);

    if (updateErr) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: updateErr.message } },
        { status: 500 }
      );
    }

    // Update profiles table if it exists
    await adminClient
      .from('profiles')
      .update({ role: newRole })
      .eq('id', targetUserId);

    // 4. Handle institutional user registration
    if (newRole === 'INSTITUTIONAL_USER') {
      let orgId: string | null = null;
      if (organizationName) {
        const { data: existingOrg } = await adminClient
          .from('organizations')
          .select('id')
          .eq('name', organizationName)
          .maybeSingle();

        if (existingOrg) {
          orgId = existingOrg.id;
        } else {
          const { data: newOrg } = await adminClient
            .from('organizations')
            .insert({
              name: organizationName,
              org_type: 'INSPECTORATE',
            })
            .select('id')
            .single();
          if (newOrg) orgId = newOrg.id;
        }
      }

      if (orgId) {
        await adminClient
          .from('institutional_users')
          .upsert({
            user_id: targetUserId,
            organization_id: orgId,
            full_name: body.fullName || 'Labour Inspector',
            official_designation: designation || 'Labour Enforcement Officer',
            jurisdiction_region: jurisdictionRegion || 'All India',
          });
      }
    }

    // 5. Append-only Audit Trail
    await recordAuditEvent({
      actorId: authCtx.authUserId,
      action: 'role_assigned',
      entityType: 'users',
      entityId: targetUserId,
      payload: {
        targetUserId,
        previousRole,
        newRole,
        assignedBy: authCtx.authUserId,
        designation: designation || null,
        jurisdictionRegion: jurisdictionRegion || null,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Role successfully updated to ${newRole}`,
      data: {
        userId: targetUserId,
        previousRole,
        newRole,
      },
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: err.message } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: err?.message || 'Internal error' } },
      { status: 500 }
    );
  }
}
