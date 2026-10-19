import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';
import { postgrestFetch } from './custom-fetch';

const FORBIDDEN_PLACEHOLDER_KEYS = new Set([
  'sb_service_role_key_for_local_dev',
  'placeholder',
  'local_dev',
  'change_me',
  'your-service-role-key',
]);

const FORBIDDEN_URL_PATTERNS = [
  'your-project.supabase.co',
  'placeholder.supabase.co',
];

/**
 * Validates Supabase environment variables and fails fast if missing
 * or set to known mock/placeholder values.
 */
export function validateSupabaseAdminConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl) {
    throw new Error(
      '[FAIL-FAST] FATAL: NEXT_PUBLIC_SUPABASE_URL is missing. Real PostgreSQL/Supabase database configuration is required.'
    );
  }

  for (const pattern of FORBIDDEN_URL_PATTERNS) {
    if (supabaseUrl.includes(pattern)) {
      throw new Error(
        `[FAIL-FAST] FATAL: NEXT_PUBLIC_SUPABASE_URL is set to a placeholder ("${supabaseUrl}"). Real database configuration is required.`
      );
    }
  }

  if (!serviceRoleKey) {
    throw new Error(
      '[FAIL-FAST] FATAL: SUPABASE_SERVICE_ROLE_KEY is missing. Real PostgreSQL/Supabase database configuration is required.'
    );
  }

  if (
    FORBIDDEN_PLACEHOLDER_KEYS.has(serviceRoleKey) ||
    serviceRoleKey.startsWith('mock_') ||
    serviceRoleKey === 'placeholder'
  ) {
    throw new Error(
      `[FAIL-FAST] FATAL: SUPABASE_SERVICE_ROLE_KEY is a placeholder ("${serviceRoleKey}"). Real database credentials are required. File/mock fallback is disabled.`
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

let mockAdminFactory: (() => any) | null = null;

export function setMockAdminClientFactory(factory: (() => any) | null) {
  mockAdminFactory = factory;
}


export function createAdminClient(): any {
  if (mockAdminFactory) {
    return mockAdminFactory();
  }
  const { supabaseUrl, serviceRoleKey } = validateSupabaseAdminConfig();

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: postgrestFetch,
    },
  });
}


