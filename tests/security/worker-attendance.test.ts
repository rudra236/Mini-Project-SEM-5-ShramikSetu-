import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  markAttendance,
  AttendanceValidationError,
  checkOtpRateLimit,
  recordFailedOtpAttempt,
  resetOtpAttempts,
} from '@/lib/services/attendance-service';
import {
  createRotatingQrToken,
  signQrToken,
  verifyQrTokenSignature,
  validateTokenExpiry,
  generateShortCode,
  getTodayIst,
} from '@/lib/crypto/qr-token';
import { setMockAdminClientFactory } from '@/lib/supabase/admin';

describe('Worker Attendance Verification & Anti-Tamper Security Suite', () => {
  const workerUserId = '11111111-1111-1111-1111-111111111101';
  const workerId = '33333333-3333-3333-3333-333333333301';
  const contractorId = '22222222-2222-2222-2222-222222222201';
  const projectId = '66666666-6666-6666-6666-666666666601';
  const worksiteId = '77777777-7777-7777-7777-777777777701';
  const contractId = '55555555-5555-5555-5555-555555555501';

  beforeEach(() => {
    resetOtpAttempts(workerUserId);
  });

  describe('1. Cryptographic HMAC Token Security', () => {
    it('creates and verifies a valid HMAC-signed rotating QR token', () => {
      const signed = createRotatingQrToken(projectId, worksiteId, 30);
      expect(signed.compact).toBeDefined();
      expect(signed.payload.short_code).toMatch(/^\d{6}$/);

      const verified = verifyQrTokenSignature(signed.compact);
      expect(verified.valid).toBe(true);
      expect(verified.payload.project_id).toBe(projectId);
      expect(verified.payload.worksite_id).toBe(worksiteId);
    });

    it('rejects forged QR tokens signed with invalid secret or tampered payload', () => {
      const signed = createRotatingQrToken(projectId, worksiteId, 30);

      // Tampered payload
      const tamperedPayload = { ...signed.payload, project_id: 'forged-project-id' };
      const forgedToken = signQrToken(tamperedPayload, 'wrong-secret-attacker-key');

      expect(() => {
        verifyQrTokenSignature(forgedToken.compact);
      }).toThrow(/TAMPERED_QR_TOKEN|Signature verification failed/);
    });

    it('detects and rejects expired attendance tokens', () => {
      const issuedAt = Date.now() - 60000; // 60 seconds ago
      const expiresAt = Date.now() - 30000; // expired 30 seconds ago
      const expiredPayload = {
        project_id: projectId,
        worksite_id: worksiteId,
        nonce: 'expired-nonce-1234',
        date_ist: getTodayIst(),
        issued_at: issuedAt,
        expires_at: expiresAt,
        short_code: generateShortCode(),
      };

      const result = validateTokenExpiry(expiredPayload, Date.now());
      expect(result.expired).toBe(true);
    });
  });

  describe('2. OTP Rate Limiting & Lockout Window', () => {
    it('locks out manual OTP entry after 5 failed attempts for 15 minutes', () => {
      const testWorkerUser = 'user-otp-lockout-test-999';
      resetOtpAttempts(testWorkerUser);

      // 4 failed attempts should not trigger lockout
      for (let i = 0; i < 4; i++) {
        recordFailedOtpAttempt(testWorkerUser);
        expect(() => checkOtpRateLimit(testWorkerUser)).not.toThrow();
      }

      // 5th failed attempt triggers lockout
      recordFailedOtpAttempt(testWorkerUser);
      expect(() => checkOtpRateLimit(testWorkerUser)).toThrowError(
        /Too many incorrect OTP attempts|locked/
      );
    });

    it('resets OTP failed attempts upon successful reset', () => {
      const testWorkerUser = 'user-otp-reset-test-888';
      recordFailedOtpAttempt(testWorkerUser);
      recordFailedOtpAttempt(testWorkerUser);
      resetOtpAttempts(testWorkerUser);

      expect(() => checkOtpRateLimit(testWorkerUser)).not.toThrow();
    });
  });

  describe('3. Idempotent Duplicate Attendance Check', () => {
    it('returns friendly isAlreadyMarked response when punch already exists for today', async () => {
      const todayStr = new Date().toISOString().split('T')[0];

      // Setup mock Supabase admin client with existing punch
      setMockAdminClientFactory(() => ({
        from: vi.fn((table: string) => {
          if (table === 'workers') {
            return {
              select: () => ({
                eq: () => ({
                  single: async () => ({
                    data: { id: workerId, user_id: workerUserId },
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'work_contracts') {
            const chain: any = {
              select: () => chain,
              eq: () => chain,
              order: () => chain,
              limit: () => chain,
              maybeSingle: async () => ({
                data: {
                  id: contractId,
                  worker_id: workerId,
                  project_id: projectId,
                  contractor_id: contractorId,
                  status: 'ACTIVE',
                  daily_wage: 85000,
                },
                error: null,
              }),
            };
            return chain;
          }
          if (table === 'worksites') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    single: async () => ({
                      data: {
                        id: worksiteId,
                        project_id: projectId,
                        latitude: 19.26,
                        longitude: 72.96,
                        allowed_radius_meters: 250,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === 'attendance_events') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        maybeSingle: async () => ({
                          data: {
                            id: 'existing-event-id-777',
                            punch_type: 'IN',
                            status: 'VERIFIED',
                            created_at: new Date().toISOString(),
                            date: todayStr,
                          },
                          error: null,
                        }),
                      }),
                    }),
                  }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
                single: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }),
      }));

      const signed = createRotatingQrToken(projectId, worksiteId, 30);
      const res = await markAttendance({
        workerUserId,
        qrToken: signed.compact,
        punchType: 'IN',
        attendanceDate: todayStr,
      });

      expect(res.isAlreadyMarked).toBe(true);
      expect(res.status).toBe('VERIFIED');
      expect(res.message).toMatch(/Attendance already marked for today/);
    });
  });
});
