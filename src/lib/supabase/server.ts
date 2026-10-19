import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';
import { postgrestFetch } from './custom-fetch';

let mockServerFactory: (() => any) | null = null;

export function setMockServerClientFactory(factory: (() => any) | null) {
  mockServerFactory = factory;
}

export function createServerSupabaseClient(): any {
  if (mockServerFactory) {
    return mockServerFactory();
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )?.trim();

  if (!supabaseUrl) {
    throw new Error(
      '[FAIL-FAST] NEXT_PUBLIC_SUPABASE_URL is missing. Real PostgreSQL/Supabase database configuration is required.'
    );
  }

  if (!supabaseAnonKey) {
    throw new Error(
      '[FAIL-FAST] NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Real PostgreSQL/Supabase database configuration is required.'
    );
  }

  const cookieStore = cookies();

  return createServerClient<Database>(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set({ name, value, ...options })
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
      global: {
        fetch: postgrestFetch,
      },
    }
  );
}

