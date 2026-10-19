import { describe, it, expect, beforeEach } from 'vitest';
import {
  loginWorkerWithCredentials,
  workerLoginRateLimiter,
  hashPassword,
  comparePassword,
  signWorkerSession,
  verifyWorkerSession,
} from '@/lib/auth/worker-auth';

describe('Worker Authentication (Worker ID + Password)', () => {
  beforeEach(() => {
    workerLoginRateLimiter.resetAll();
  });

  it('1. Hashes passwords securely with bcrypt and verifies match', async () => {
    const rawPass = 'SecretPass@2026';
    const hashed = await hashPassword(rawPass);

    expect(hashed).not.toBe(rawPass);
    expect(hashed).toMatch(/^\$2[aby]\$\d+\$/);

    const matches = await comparePassword(rawPass, hashed);
    expect(matches).toBe(true);

    const wrongMatches = await comparePassword('WrongPassword', hashed);
    expect(wrongMatches).toBe(false);
  });

  it('2. Authenticates seeded demo worker (Ramesh Kumar: WRK-MH-2026-0001) successfully', async () => {
    const result = await loginWorkerWithCredentials('WRK-MH-2026-0001', 'Ramesh@123');

    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.role).toBe('WORKER');
    expect(result.profile.full_name).toBe('Ramesh Kumar');
    expect(result.sessionToken).toBeTruthy();

    const decoded = verifyWorkerSession(result.sessionToken);
    expect(decoded).not.toBeNull();
    expect(decoded?.fullName).toBe('Ramesh Kumar');
    expect(decoded?.role).toBe('WORKER');
  });

  it('3. Rejects invalid password with generic error message without leaking existence', async () => {
    const result = await loginWorkerWithCredentials('WRK-MH-2026-0001', 'IncorrectPass!');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid Worker ID or password.');
    expect(result.statusCode).toBe(401);
  });

  it('4. Rejects non-existent worker ID with the exact same generic error message', async () => {
    const result = await loginWorkerWithCredentials('NON_EXISTENT_ID_9999', 'AnyPassword123');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid Worker ID or password.');
    expect(result.statusCode).toBe(401);
  });

  it('5. Enforces rate limiting: locks account after 5 consecutive failures', async () => {
    const testId = 'WRK-MH-2026-0002';

    // 4 failed attempts
    for (let i = 0; i < 4; i++) {
      const res = await loginWorkerWithCredentials(testId, 'BadPass');
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(401);
    }

    // 5th failed attempt triggers temporary lockout
    const fifthRes = await loginWorkerWithCredentials(testId, 'BadPass');
    expect(fifthRes.success).toBe(false);
    expect(fifthRes.statusCode).toBe(429);
    expect(fifthRes.error).toContain('Too many failed login attempts');
    expect(fifthRes.retryAfterSeconds).toBeGreaterThan(0);

    // 6th attempt while locked is blocked immediately
    const sixthRes = await loginWorkerWithCredentials(testId, 'Sunita@123');
    expect(sixthRes.success).toBe(false);
    expect(sixthRes.statusCode).toBe(429);
  });

  it('6. Cryptographic session token tamper detection', () => {
    const validSession = signWorkerSession({
      userId: '11111111-1111-1111-1111-111111111101',
      workerId: '33333333-3333-3333-3333-333333333301',
      internalWorkerId: 'WRK-MH-2026-0001',
      fullName: 'Ramesh Kumar',
      role: 'WORKER',
      exp: Date.now() + 60000,
    });

    const parsed = verifyWorkerSession(validSession);
    expect(parsed?.internalWorkerId).toBe('WRK-MH-2026-0001');

    // Tampered payload (change a character in the base64 payload)
    const [payloadStr, signature] = validSession.split('.');
    const tamperedPayload = (payloadStr[0] === 'e' ? 'f' : 'e') + payloadStr.slice(1);
    const tamperedToken = `${tamperedPayload}.${signature}`;
    const tamperedResult = verifyWorkerSession(tamperedToken);
    expect(tamperedResult).toBeNull();
  });
});
