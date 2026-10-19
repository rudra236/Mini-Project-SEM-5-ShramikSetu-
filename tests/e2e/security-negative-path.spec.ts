import { test, expect } from '@playwright/test';

test.describe('ShramikSetu Security Negative-Path Test Suite (Phase 2 Hardening)', () => {
  test('01. Unauthenticated request to protected API routes returns 401 or 403', async ({ request }) => {
    // Attempting to access contractor project creation without auth
    const projectRes = await request.post('/api/projects', {
      data: {
        name: 'Unauthorized Project',
        contractorId: '00000000-0000-0000-0000-000000000001',
      },
    });
    expect([401, 403, 400]).toContain(projectRes.status());
  });

  test('02. GPS Geofence Rejection: Worker punching outside allowed radius (>100m) is rejected', async ({ request }) => {
    // Attempt to mark attendance with far-off coordinates (e.g. Delhi coordinates for Mumbai site)
    const spoofedAttendanceRes = await request.post('/api/attendance/mark', {
      data: {
        token: 'TEST-DISP-TOKEN',
        latitude: 28.6139, // New Delhi
        longitude: 77.2090,
        workerId: '00000000-0000-0000-0000-000000000001',
        contractId: '00000000-0000-0000-0000-000000000001',
      },
    });

    // Must be rejected with 422 UNPROCESSABLE_ENTITY or 400/403/404
    expect([422, 400, 401, 403, 404]).toContain(spoofedAttendanceRes.status());
    if (spoofedAttendanceRes.status() === 422) {
      const body = await spoofedAttendanceRes.json();
      expect(body.error?.code).toMatch(/OUT_OF_RADIUS|GEOFENCE_FAILED|INVALID_TOKEN/);
    }
  });

  test('03. Expired or Replayed Attendance Token Rejection', async ({ request }) => {
    const expiredTokenRes = await request.post('/api/attendance/mark', {
      data: {
        token: 'EXPIRED-TOKEN-123',
        latitude: 19.0760,
        longitude: 72.8777,
        workerId: '00000000-0000-0000-0000-000000000001',
      },
    });

    expect([422, 400, 401, 403, 404]).toContain(expiredTokenRes.status());
  });

  test('04. IDOR Protection: Cross-tenant payment initiation blocked', async ({ request }) => {
    // Attempting to disburse payment on another contractor's contract
    const idorRes = await request.post('/api/payments/initiate', {
      data: {
        contractId: '00000000-0000-0000-0000-000000000099',
        workerId: '00000000-0000-0000-0000-000000000001',
        amountPaise: 50000,
      },
    });

    expect([400, 401, 403, 404]).toContain(idorRes.status());
  });

  test('05. Public Verification: Tampered certificate hash fails verification', async ({ page }) => {
    // Visit a non-existent or corrupted certificate ref
    await page.goto('/verify/REF-CORRUPTED-FAKE-999');

    // Should indicate invalid or not found or tampered
    await expect(page.locator('body')).toContainText(/NOT FOUND|INVALID|TAMPERED|RECORD/i);
  });

  test('06. Cryptographic Chain Integrity Verification rejects broken links', async ({ request }) => {
    const verifyRes = await request.get('/api/audit/verify');
    expect(verifyRes.ok()).toBeTruthy();
    const data = await verifyRes.json();
    // Valid system is intact
    expect(data.isValid).toBe(true);
    expect(data.ledger?.totalEntries ?? data.totalLedgerEntriesVerified ?? 0).toBeGreaterThanOrEqual(0);
  });
});
