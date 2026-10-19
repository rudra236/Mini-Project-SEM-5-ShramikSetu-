import { describe, it, expect, afterAll } from 'vitest';
import { postgrestFetch } from '@/lib/supabase/custom-fetch';
import { registerUser } from '@/lib/auth/unified-auth';
import { createAdminClient } from '@/lib/supabase/admin';

describe('Worker and Contractor Registration End-to-End Suite', () => {
  const createdUserIds: string[] = [];
  const admin = createAdminClient();

  afterAll(async () => {
    for (const uid of createdUserIds) {
      await admin.from('workers').delete().eq('user_id', uid);
      await admin.from('contractors').delete().eq('user_id', uid);
      await admin.from('users').delete().eq('id', uid);
    }
  });

  describe('1. PostgREST URL Rewrite Adapter', () => {
    it('strips /rest/v1/ prefix correctly for standalone PostgREST routing', () => {
      let capturedUrl = '';
      const mockFetch = (url: any) => {
        capturedUrl = typeof url === 'string' ? url : (url.href || url.url || String(url));
        return Promise.resolve(new Response(JSON.stringify({ ok: true })));
      };

      // Monkey-patch global fetch temporarily to inspect the rewritten URL
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = mockFetch as any;

        // String input
        postgrestFetch('http://127.0.0.1:54320/rest/v1/users?select=*');
        expect(capturedUrl).toBe('http://127.0.0.1:54320/users?select=*');

        // URL input
        postgrestFetch(new URL('http://127.0.0.1:54320/rest/v1/workers?id=eq.123'));
        expect(capturedUrl).toBe('http://127.0.0.1:54320/workers?id=eq.123');

        // Request input
        postgrestFetch(new Request('http://127.0.0.1:54320/rest/v1/contractors'));
        expect(capturedUrl).toBe('http://127.0.0.1:54320/contractors');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('2. Real Database Worker Registration', () => {
    it('successfully registers a new WORKER in the PostgreSQL database', async () => {
      const result = await registerUser({
        role: 'WORKER',
        password: 'ValidPassword@2026',
        fullName: 'E2E Worker Automation',
        occupation: 'Carpenter',
        skillCategory: 'SKILLED',
        locale: 'hi',
      });

      expect(result.success).toBe(true);
      expect(result.loginId).toMatch(/^SS-W-2026-\d{6}$/);
      expect(result.sessionToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.profile).toBeDefined();
      expect(result.profile.full_name).toBe('E2E Worker Automation');
      expect(result.profile.occupation).toBe('Carpenter');
      expect(result.profile.skill_category).toBe('SKILLED');

      if (result.user?.id) {
        createdUserIds.push(result.user.id);
        const { data: dbUser } = await admin.from('users').select('*').eq('id', result.user.id).single();
        expect(dbUser).toBeDefined();
        expect(dbUser.login_id).toBe(result.loginId);
        expect(dbUser.role).toBe('WORKER');

        const { data: dbWorker } = await admin.from('workers').select('*').eq('user_id', result.user.id).single();
        expect(dbWorker).toBeDefined();
        expect(dbWorker.internal_worker_id).toBe(result.loginId);
      }
    });
  });

  describe('3. Real Database Contractor Registration', () => {
    it('successfully registers a new CONTRACTOR in the PostgreSQL database', async () => {
      const result = await registerUser({
        role: 'CONTRACTOR',
        password: 'ValidPassword@2026',
        companyName: 'E2E Infra Projects Pvt Ltd',
        fullName: 'E2E Contractor Lead',
        locale: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.loginId).toMatch(/^SS-C-2026-\d{6}$/);
      expect(result.sessionToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.profile).toBeDefined();
      expect(result.profile.company_name).toBe('E2E Infra Projects Pvt Ltd');

      if (result.user?.id) {
        createdUserIds.push(result.user.id);
        const { data: dbUser } = await admin.from('users').select('*').eq('id', result.user.id).single();
        expect(dbUser).toBeDefined();
        expect(dbUser.login_id).toBe(result.loginId);
        expect(dbUser.role).toBe('CONTRACTOR');

        const { data: dbContractor } = await admin.from('contractors').select('*').eq('user_id', result.user.id).single();
        expect(dbContractor).toBeDefined();
        expect(dbContractor.internal_contractor_id).toBe(result.loginId);
      }
    });
  });
});
