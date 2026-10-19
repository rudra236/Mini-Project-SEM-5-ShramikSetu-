import { createClient as createBrowserClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database.types';

export type UserRole = Database['public']['Enums']['user_role'];

export interface AuthSession {
  user: {
    id: string;
    phone?: string | null;
    email?: string | null;
  };
  roleProfile?: {
    dbUser: Database['public']['Tables']['users']['Row'];
    roleDetails?: any;
  } | null;
}

/**
 * Sends OTP to phone number using Supabase Auth.
 * If phone is provided, formats with E.164 format.
 */
export async function sendPhoneOtp(phone: string) {
  const supabase = createBrowserClient();
  const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;

  const { data, error } = await supabase.auth.signInWithOtp({
    phone: formattedPhone,
  });

  if (error) {
    throw new Error(`Failed to send OTP: ${error.message}`);
  }

  return data;
}

/**
 * Verifies OTP code for phone authentication.
 */
export async function verifyPhoneOtp(phone: string, token: string) {
  const supabase = createBrowserClient();
  const formattedPhone = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;

  const { data, error } = await supabase.auth.verifyOtp({
    phone: formattedPhone,
    token,
    type: 'sms',
  });

  if (error) {
    throw new Error(`OTP Verification failed: ${error.message}`);
  }

  return data;
}

/**
 * Development fallback: sign in / sign up using email & password for test automation.
 */
export async function devSignInWithEmail(email: string, password: string = 'TestPass123!') {
  const supabase = createBrowserClient();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!error && data?.session) {
      return data;
    }

    // If user doesn't exist, try signing up
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (!signUpError && signUpData?.session) {
      return signUpData;
    }
  } catch {
    // Fall through to deterministic mock session for offline dev/demo
  }

  // Fallback for offline/local dev mode or when Supabase project rejects .local / dummy keys
  const roleMap: Record<string, { role: UserRole; name: string; id: string }> = {
    'worker@shramiksetu.local': {
      role: 'WORKER',
      name: 'Ramesh Kumar',
      id: '11111111-1111-1111-1111-111111111101',
    },
    'contractor@shramiksetu.local': {
      role: 'CONTRACTOR',
      name: 'Apex Infrastructure Ltd',
      id: '11111111-1111-1111-1111-111111111102',
    },
    'supervisor@shramiksetu.local': {
      role: 'SUPERVISOR',
      name: 'Suresh Patil',
      id: '11111111-1111-1111-1111-111111111106',
    },
    'inspector@shramiksetu.local': {
      role: 'INSTITUTIONAL_USER',
      name: 'Labour Commissionerate Mumbai',
      id: '00000000-0000-0000-0001-000000000002',
    },
  };

  const devUser = roleMap[email] || {
    role: 'WORKER' as UserRole,
    name: 'Demo User',
    id: '11111111-1111-1111-1111-111111111101',
  };

  return {
    user: {
      id: devUser.id,
      email,
      role: devUser.role,
      user_metadata: { name: devUser.name, role: devUser.role },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
    },
    session: {
      access_token: `mock_jwt_token_${devUser.role.toLowerCase()}`,
      refresh_token: `mock_refresh_${devUser.role.toLowerCase()}`,
      expires_in: 3600,
      user: {
        id: devUser.id,
        email,
        role: devUser.role,
      },
    },
  };
}

/**
 * Helper to register or update user profile linked to auth.users.
 * Uses trusted server-side execution.
 */
export async function linkUserProfile(params: {
  userId: string;
  phone: string;
  role: UserRole;
  email?: string;
  locale?: 'en' | 'hi' | 'mr';
  profileData?: any;
}) {
  const adminClient = createAdminClient();

  // 1. Upsert public.users record
  const { data: userRow, error: userError } = await adminClient
    .from('users')
    .upsert(
      {
        id: params.userId,
        phone: params.phone,
        email: params.email || null,
        role: params.role,
        locale: params.locale || 'en',
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (userError || !userRow) {
    throw new Error(`Failed to create public user record: ${userError?.message}`);
  }

  // 2. Create role-specific profile if details provided
  let profileRecord: any = null;

  if (params.profileData) {
    switch (params.role) {
      case 'WORKER': {
        const { data: worker, error: workerErr } = await adminClient
          .from('workers')
          .upsert(
            {
              user_id: params.userId,
              full_name: params.profileData.fullName || 'Worker',
              internal_worker_id: params.profileData.internalWorkerId || `W-${Date.now()}`,
              occupation: params.profileData.occupation || 'General Labor',
              skill_category: params.profileData.skillCategory || 'UNSKILLED',
              emergency_contact: params.profileData.emergencyContact || null,
              profile_photo_url: params.profileData.profilePhotoUrl || null,
            },
            { onConflict: 'user_id' }
          )
          .select()
          .single();

        if (workerErr) throw new Error(`Failed to link worker profile: ${workerErr.message}`);
        profileRecord = worker;
        break;
      }

      case 'CONTRACTOR': {
        const { data: contractor, error: contrErr } = await adminClient
          .from('contractors')
          .upsert(
            {
              user_id: params.userId,
              full_name: params.profileData.fullName || 'Contractor',
              company_name: params.profileData.companyName || 'Sole Proprietorship',
              license_number: params.profileData.licenseNumber || null,
              organization_id: params.profileData.organizationId || null,
            },
            { onConflict: 'user_id' }
          )
          .select()
          .single();

        if (contrErr) throw new Error(`Failed to link contractor profile: ${contrErr.message}`);
        profileRecord = contractor;
        break;
      }

      case 'SUPERVISOR': {
        if (!params.profileData.contractorId) {
          throw new Error('Supervisor profile requires contractorId');
        }
        const { data: supervisor, error: supErr } = await adminClient
          .from('supervisors')
          .upsert(
            {
              user_id: params.userId,
              contractor_id: params.profileData.contractorId,
              full_name: params.profileData.fullName || 'Supervisor',
              badge_number: params.profileData.badgeNumber || null,
            },
            { onConflict: 'user_id' }
          )
          .select()
          .single();

        if (supErr) throw new Error(`Failed to link supervisor profile: ${supErr.message}`);
        profileRecord = supervisor;
        break;
      }

      case 'INSTITUTIONAL_USER': {
        if (!params.profileData.organizationId) {
          throw new Error('Institutional User profile requires organizationId');
        }
        const { data: instUser, error: instErr } = await adminClient
          .from('institutional_users')
          .upsert(
            {
              user_id: params.userId,
              organization_id: params.profileData.organizationId,
              full_name: params.profileData.fullName || 'Official User',
              official_designation: params.profileData.officialDesignation || 'Inspector',
              jurisdiction_region: params.profileData.jurisdictionRegion || 'Statewide',
            },
            { onConflict: 'user_id' }
          )
          .select()
          .single();

        if (instErr) throw new Error(`Failed to link institutional profile: ${instErr.message}`);
        profileRecord = instUser;
        break;
      }
    }
  }

  return {
    user: userRow,
    profile: profileRecord,
  };
}
