import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRotatingAttendanceToken,
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

describe('Live QR and Server-Generated 6-Digit Code Verification Suite', () => {
  const workerUserId = '11111111-1111-1111-1111-111111111101';
  const workerId = '33333333-3333-3333-3333-333333333301';
  const contractorUserId = '11111111-2222-3333-4444-000000000001';
  const contractorId = '22222222-2222-2222-2222-000000000001';
  const projectId = '66666666-6666-6666-6666-000000000001';
  const worksiteId = '77777777-7777-7777-7777-000000000001';
  const contractId = '55555555-5555-5555-5555-000000000001';

  let mockTokensDb: any[] = [];
  let mockAttendanceEvents: any[] = [];

  beforeEach(() => {
    mockTokensDb = [];
    mockAttendanceEvents = [];
    resetOtpAttempts(workerUserId);

    setMockAdminClientFactory(() => ({
      from: (table: string) => {
        if (table === 'worksites') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: worksiteId,
                      project_id: projectId,
                      latitude: 19.1138,
                      longitude: 72.8708,
                      allowed_radius_meters: 100,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'workers') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: {
                    id: workerId,
                    user_id: workerUserId,
                    full_name: 'Dev Test Worker',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'work_contracts') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: contractId,
                          worker_id: workerId,
                          project_id: projectId,
                          contractor_id: contractorId,
                          status: 'ACCEPTED',
                          daily_wage: 95000,
                        },
                        error: null,
                      }),
                    }),
                  }),
                  maybeSingle: async () => ({
                    data: {
                      id: contractId,
                      worker_id: workerId,
                      project_id: projectId,
                      contractor_id: contractorId,
                      status: 'ACCEPTED',
                      daily_wage: 95000,
                    },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === 'attendance_tokens') {
          return {
            select: () => ({
              eq: (col: string, val: any) => {
                const chain: any = {
                  eq: (col2: string, val2: any) => {
                    const chain2: any = {
                      order: () => ({
                        limit: () => ({
                          maybeSingle: async () => {
                            const found = mockTokensDb.filter(
                              (t) => t[col] === val && t[col2] === val2
                            ).pop();
                            return { data: found || null, error: null };
                          },
                        }),
                      }),
                      maybeSingle: async () => {
                        const found = mockTokensDb.filter(
                          (t) => t[col] === val && t[col2] === val2
                        ).pop();
                        return { data: found || null, error: null };
                      },
                    };
                    return chain2;
                  },
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => {
                        const found = mockTokensDb.filter((t) => t[col] === val).pop();
                        return { data: found || null, error: null };
                      },
                    }),
                  }),
                  maybeSingle: async () => {
                    const found = mockTokensDb.filter((t) => t[col] === val).pop();
                    return { data: found || null, error: null };
                  },
                  single: async () => {
                    const found = mockTokensDb.find((t) => t[col] === val);
                    return { data: found || null, error: null };
                  },
                };
                return chain;
              },
            }),
            insert: (row: any) => {
              const inserted = { id: `tok-${Date.now()}-${Math.random()}`, ...row };
              mockTokensDb.push(inserted);
              return {
                select: () => ({
                  single: async () => ({ data: inserted, error: null }),
                }),
              };
            },
            update: (updates: any) => ({
              eq: (col: string, val: any) => ({
                eq: (col2: string, val2: any) => {
                  mockTokensDb.forEach((t) => {
                    if (t[col] === val && t[col2] === val2) {
                      Object.assign(t, updates);
                    }
                  });
                  return Promise.resolve({ data: null, error: null });
                },
              }),
            }),
          };
        }

        if (table === 'attendance_events') {
          return {
            select: () => {
              const chain: any = {
                eq: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: async () => ({ data: null, error: null }),
              };
              return chain;
            },
            insert: (row: any) => {
              const inserted = { id: `event-${Date.now()}`, ...row };
              mockAttendanceEvents.push(inserted);
              return {
                select: () => ({
                  single: async () => ({ data: inserted, error: null }),
                }),
              };
            },
          };
        }

        if (table === 'fraud_review_queue') {
          return {
            insert: async () => ({ data: null, error: null }),
          };
        }

        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    }));
  });

  it('1. Generates 6-digit code server-side using cryptographically secure RNG', () => {
    const code = generateShortCode();
    expect(code).toMatch(/^[1-9]\d{5}$/);
    expect(code.length).toBe(6);
    // Distinct consecutive codes
    const code2 = generateShortCode();
    expect(code).not.toBe(code2);
  });

  it('2. QR token contains IST date, projectId, nonce, and HMAC signature', () => {
    const token = createRotatingQrToken(projectId, worksiteId, 30);
    expect(token.payload.date_ist).toBe(getTodayIst());
    expect(token.payload.project_id).toBe(projectId);
    expect(token.payload.nonce).toBeDefined();
    expect(token.compact).toBeDefined();

    const verified = verifyQrTokenSignature(token.compact);
    expect(verified.valid).toBe(true);
    expect(verified.payload.project_id).toBe(projectId);
  });

  it('3. Worker marks attendance successfully with signed QR token', async () => {
    const tokenRes = await createRotatingAttendanceToken({
      creatorUserId: contractorUserId,
      projectId,
      worksiteId,
      ttlSeconds: 60,
    });

    const markRes = await markAttendance({
      workerUserId,
      qrToken: tokenRes.signedToken.compact,
    });

    expect(markRes.status).toBe('VERIFIED');
    expect(markRes.worker_id).toBe(workerId);
  });

  it('4. Rejects forged / tampered QR tokens', async () => {
    const tokenRes = await createRotatingAttendanceToken({
      creatorUserId: contractorUserId,
      projectId,
      worksiteId,
      ttlSeconds: 60,
    });

    const tamperedCompact = Buffer.from(
      JSON.stringify({
        p: { ...tokenRes.signedToken.payload, project_id: 'forged-project-id' },
        s: tokenRes.signedToken.signature,
      })
    ).toString('base64url');

    await expect(
      markAttendance({
        workerUserId,
        qrToken: tamperedCompact,
      })
    ).rejects.toThrow(/FORGED_QR_TOKEN|invalid, tampered, or forged/);
  });

  it('5. Rejects yesterday/previous-day QR tokens with specific error', async () => {
    const yesterdayPayload = {
      project_id: projectId,
      worksite_id: worksiteId,
      nonce: 'nonce-yesterday-999',
      date_ist: '2026-09-01', // previous date
      issued_at: Date.now(),
      expires_at: Date.now() + 60000,
      short_code: generateShortCode(),
    };
    const signed = signQrToken(yesterdayPayload);

    await expect(
      markAttendance({
        workerUserId,
        qrToken: signed.compact,
      })
    ).rejects.toThrow(/PREVIOUS_DAY_CODE|previous day/);
  });

  it('6. Manual 6-digit code works and verifies worker attendance', async () => {
    const tokenRes = await createRotatingAttendanceToken({
      creatorUserId: contractorUserId,
      projectId,
      worksiteId,
      ttlSeconds: 900,
    });

    const markRes = await markAttendance({
      workerUserId,
      manualCode: tokenRes.shortCode,
    });

    expect(markRes.status).toBe('VERIFIED');
    expect(markRes.attendance_method).toBe('otp');
  });

  it('7. Wrong code fails with generic error and triggers lockout after 5 attempts', async () => {
    // 4 failed attempts throw generic error
    for (let i = 0; i < 4; i++) {
      await expect(
        markAttendance({
          workerUserId,
          manualCode: '999888',
        })
      ).rejects.toThrow(/INVALID_CODE|Invalid attendance code/);
    }

    // 5th failed attempt throws generic error
    await expect(
      markAttendance({
        workerUserId,
        manualCode: '999888',
      })
    ).rejects.toThrow(/INVALID_CODE|Invalid attendance code/);

    // 6th attempt is locked out with 429
    await expect(
      markAttendance({
        workerUserId,
        manualCode: '999888',
      })
    ).rejects.toThrow(/OTP_LOCKOUT|locked/);
  });

  it('8. Contractor token regeneration invalidates previous code', async () => {
    // 1st Token
    const token1 = await createRotatingAttendanceToken({
      creatorUserId: contractorUserId,
      projectId,
      worksiteId,
      ttlSeconds: 900,
    });

    // Contractor clicks "Regenerate" -> 2nd Token created
    const token2 = await createRotatingAttendanceToken({
      creatorUserId: contractorUserId,
      projectId,
      worksiteId,
      ttlSeconds: 900,
    });

    expect(token1.shortCode).not.toBe(token2.shortCode);

    // Old code now fails because is_active is false
    await expect(
      markAttendance({
        workerUserId,
        manualCode: token1.shortCode,
      })
    ).rejects.toThrow(/Invalid attendance code/);

    // New code succeeds
    const markRes = await markAttendance({
      workerUserId,
      manualCode: token2.shortCode,
    });
    expect(markRes.status).toBe('VERIFIED');
  });
});
