import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { linkUserProfile, UserRole } from '@/lib/auth/supabase-auth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { validateIndianMobileNumber } from '@/lib/auth/phone-validation';
import { z } from 'zod';

const createProfileSchema = z.object({
  role: z.enum(['WORKER', 'CONTRACTOR', 'SUPERVISOR', 'LABOUR_ORGANIZATION', 'INSTITUTIONAL_USER', 'ADMIN']),
  locale: z.enum(['en', 'hi', 'mr']).optional(),
  profileData: z.object({
    fullName: z.string().optional(),
    internalWorkerId: z.string().optional(),
    occupation: z.string().optional(),
    skillCategory: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED']).optional(),
    companyName: z.string().optional(),
    licenseNumber: z.string().optional(),
    contractorId: z.string().optional(),
    badgeNumber: z.string().optional(),
    organizationId: z.string().optional(),
    officialDesignation: z.string().optional(),
    jurisdictionRegion: z.string().optional(),
    emergencyContact: z.string().optional(),
    profilePhotoUrl: z.string().optional(),
  }).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    return NextResponse.json({
      success: true,
      authUserId: authCtx.authUserId,
      user: authCtx.user,
      profiles: {
        worker: authCtx.workerProfile,
        contractor: authCtx.contractorProfile,
        supervisor: authCtx.supervisorProfile,
        institutionalUser: authCtx.institutionalProfile,
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
      { error: { code: 'SERVER_ERROR', message: error.message || 'Failed to fetch user profile' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    let authUser: any = null;
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) authUser = data.user;
    } catch {}

    if (!authUser) {
      try {
        const ctx = await requireAuthenticatedUser();
        authUser = { id: ctx.authUserId };
      } catch {}
    }

    if (!authUser) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = createProfileSchema.parse(body);

    // Fetch existing database user record if any to prevent role tampering
    let authCtx = null;
    try {
      authCtx = await requireAuthenticatedUser();
    } catch {
      // User does not have a public user record yet (first-time registration)
    }

    let targetRole: UserRole = parsed.role;

    // Rule 1: Public enrollment permits only WORKER or CONTRACTOR self-selection
    if (!authCtx?.user) {
      const ALLOWED_PUBLIC_ROLES: UserRole[] = ['WORKER', 'CONTRACTOR'];
      if (!ALLOWED_PUBLIC_ROLES.includes(parsed.role)) {
        return NextResponse.json(
          {
            error: {
              code: 'PRIVILEGE_ESCALATION_FORBIDDEN',
              message: `Public registration only permits WORKER or CONTRACTOR roles. Role '${parsed.role}' requires an authorized invite or administrative provisioning.`,
            },
          },
          { status: 403 }
        );
      }
    }

    // Rule 2: If user already has a database role, client can NEVER mutate role
    if (authCtx?.user) {
      if (parsed.role && parsed.role !== authCtx.user.role) {
        return NextResponse.json(
          {
            error: {
              code: 'ROLE_MUTATION_FORBIDDEN',
              message: `Cannot alter assigned role '${authCtx.user.role}' via profile update. Contact an administrator.`,
            },
          },
          { status: 403 }
        );
      }
      targetRole = authCtx.user.role;
    }

    let phone = authUser.phone || authUser.email || `user-${authUser.id.slice(0, 8)}`;
    if (authUser.phone) {
      const validatedPhone = validateIndianMobileNumber(authUser.phone);
      if (validatedPhone.isValid) {
        phone = validatedPhone.e164Phone;
      }
    }

    const linked = await linkUserProfile({
      userId: authUser.id,
      phone,
      email: authUser.email || undefined,
      role: targetRole,
      locale: parsed.locale || 'en',
      profileData: parsed.profileData,
    });

    return NextResponse.json({
      success: true,
      user: linked.user,
      profile: linked.profile,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { code: 'PROFILE_LINK_FAILED', message: error.message || 'Failed to link profile' } },
      { status: 400 }
    );
  }
}
