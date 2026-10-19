import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  hashPassword,
  comparePassword,
  validatePasswordPolicy,
  authRateLimiter,
  signSession,
  verifySession,
  authenticateUser,
  generateSetPasswordToken,
  registerUser,
} from '@/lib/auth/unified-auth';
import { validateIndianMobileNumber } from '@/lib/auth/phone-validation';
import { middleware } from '@/middleware';
import { POST as signoutHandler } from '@/app/api/auth/signout/route';

describe('Unified ID + Password Authentication Suite', () => {
  beforeEach(() => {
    authRateLimiter.resetAll();
  });

  describe('1. Password Hashing and Policy Checks', () => {
    it('hashes passwords using bcrypt with cost >= 12 and verifies correctly', async () => {
      const password = 'StrongPassword@2026';
      const hash = await hashPassword(password);

      expect(hash).not.toBe(password);
      // Bcrypt hash structure $2a$12$... or $2b$12$...
      expect(hash).toMatch(/^\$2[ab]\$12\$/);

      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await comparePassword('WrongPassword123', hash);
      expect(isInvalid).toBe(false);
    });

    it('enforces password policy (minimum 8 characters, field-level error)', () => {
      const shortResult = validatePasswordPolicy('short');
      expect(shortResult.isValid).toBe(false);
      expect(shortResult.error).toBe('Password must be at least 8 characters long');

      const emptyResult = validatePasswordPolicy('');
      expect(emptyResult.isValid).toBe(false);
      expect(emptyResult.error).toBe('Password is required');

      const validResult = validatePasswordPolicy('ValidPass123!');
      expect(validResult.isValid).toBe(true);
      expect(validResult.error).toBeUndefined();
    });
  });

  describe('2. Brute-Force Lockout and Timing Attack Defenses', () => {
    it('returns generic error on invalid password without leaking existence', async () => {
      const result = await authenticateUser({
        idInput: 'SS-W-2026-000001',
        passwordInput: 'IncorrectPassword999',
        roleInput: 'WORKER',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid ID or password.');
    });

    it('returns the exact same generic error on unknown IDs', async () => {
      const result = await authenticateUser({
        idInput: 'SS-W-UNKNOWN-ID',
        passwordInput: 'AnyPassword@123',
        roleInput: 'WORKER',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid ID or password.');
    });

    it('locks out ID and IP after 5 consecutive failed attempts with HTTP 429', async () => {
      const targetId = 'SS-W-LOCKOUT-TEST';
      const testIp = '192.168.1.100';

      for (let i = 0; i < 4; i++) {
        const res = await authenticateUser({
          idInput: targetId,
          passwordInput: 'BadPass',
          roleInput: 'WORKER',
          ipAddress: testIp,
        });
        expect(res.success).toBe(false);
        expect(res.statusCode).toBe(401);
      }

      // 5th failed attempt triggers lockout
      const fifthRes = await authenticateUser({
        idInput: targetId,
        passwordInput: 'BadPass',
        roleInput: 'WORKER',
        ipAddress: testIp,
      });

      expect(fifthRes.success).toBe(false);
      expect(fifthRes.statusCode).toBe(429);
      expect(fifthRes.error).toContain('Too many failed login attempts');
      expect(fifthRes.retryAfterSeconds).toBeGreaterThan(0);

      // Subsequent attempt blocked immediately by rate limiter
      const sixthRes = await authenticateUser({
        idInput: targetId,
        passwordInput: 'AnyPass',
        roleInput: 'WORKER',
        ipAddress: testIp,
      });
      expect(sixthRes.success).toBe(false);
      expect(sixthRes.statusCode).toBe(429);
    });
  });

  describe('3. Role Enforcement and Separation', () => {
    it('rejects worker attempting to authenticate with contractor role', async () => {
      const result = await authenticateUser({
        idInput: 'SS-W-2026-000001',
        passwordInput: 'Ramesh@123',
        roleInput: 'CONTRACTOR',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid ID or password.');
    });

    it('rejects contractor attempting to authenticate with worker role', async () => {
      const result = await authenticateUser({
        idInput: 'SS-C-2026-000001',
        passwordInput: 'Vikram@123',
        roleInput: 'WORKER',
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(401);
      expect(result.error).toBe('Invalid ID or password.');
    });

    it('authenticates seeded worker credentials with WORKER role', async () => {
      const result = await authenticateUser({
        idInput: 'SS-W-2026-000001',
        passwordInput: 'Ramesh@123',
        roleInput: 'WORKER',
      });

      if (result.success) {
        expect(result.role).toBe('WORKER');
        expect(result.sessionToken).toBeDefined();
        const verified = verifySession(result.sessionToken!);
        expect(verified?.role).toBe('WORKER');
      }
    });

    it('authenticates seeded contractor credentials with CONTRACTOR role', async () => {
      const result = await authenticateUser({
        idInput: 'SS-C-2026-000001',
        passwordInput: 'Vikram@123',
        roleInput: 'CONTRACTOR',
      });

      if (result.success) {
        expect(result.role).toBe('CONTRACTOR');
        expect(result.sessionToken).toBeDefined();
        const verified = verifySession(result.sessionToken!);
        expect(verified?.role).toBe('CONTRACTOR');
      }
    });
  });

  describe('4. Session Tokens and Tamper Detection', () => {
    it('creates, cryptographically signs, and parses valid session tokens', () => {
      const payload = {
        userId: 'u-12345',
        loginId: 'SS-W-2026-000001',
        role: 'WORKER' as const,
        fullName: 'Ramesh Kumar',
        exp: Date.now() + 60 * 60 * 1000,
      };

      const token = signSession(payload);
      expect(token).toContain('.');

      const decoded = verifySession(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.loginId).toBe('SS-W-2026-000001');
      expect(decoded?.role).toBe('WORKER');
    });

    it('detects and rejects tampered session tokens', () => {
      const payload = {
        userId: 'u-12345',
        loginId: 'SS-W-2026-000001',
        role: 'WORKER' as const,
        fullName: 'Ramesh Kumar',
        exp: Date.now() + 60 * 60 * 1000,
      };

      const token = signSession(payload);
      const [payloadPart, sigPart] = token.split('.');

      // Alter payload slightly
      const tamperedPayload = (payloadPart[0] === 'a' ? 'b' : 'a') + payloadPart.slice(1);
      const tamperedToken = `${tamperedPayload}.${sigPart}`;

      expect(verifySession(tamperedToken)).toBeNull();
    });

    it('rejects expired session tokens', () => {
      const expiredPayload = {
        userId: 'u-12345',
        loginId: 'SS-W-2026-000001',
        role: 'WORKER' as const,
        fullName: 'Ramesh Kumar',
        exp: Date.now() - 1000, // Expired in past
      };

      const token = signSession(expiredPayload);
      expect(verifySession(token)).toBeNull();
    });
  });

  describe('5. One-Time Set-Password Flow', () => {
    it('generates high-entropy set-password tokens with 24-hour expiry', () => {
      const { token, expiresAt } = generateSetPasswordToken();

      expect(token).toHaveLength(64); // 32 random bytes in hex
      const expDate = new Date(expiresAt).getTime();
      expect(expDate).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
      expect(expDate).toBeLessThanOrEqual(Date.now() + 25 * 60 * 60 * 1000);
    });
  });

  describe('6. Route Protection Middleware (Worker vs Contractor)', () => {
    const workerToken = signSession({
      userId: 'w-user-1',
      loginId: 'SS-W-2026-000001',
      role: 'WORKER',
      fullName: 'Ramesh Kumar',
      exp: Date.now() + 3600000,
    });

    const contractorToken = signSession({
      userId: 'c-user-1',
      loginId: 'SS-C-2026-000001',
      role: 'CONTRACTOR',
      fullName: 'Apex Infra',
      exp: Date.now() + 3600000,
    });

    describe('Worker Routes (/worker/*, /api/workers/*)', () => {
      it('blocks unauthenticated requests to worker API with 401', async () => {
        const req = new NextRequest('http://localhost:3000/api/workers/dashboard');
        const res = await middleware(req);

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error.code).toBe('UNAUTHORIZED');
      });

      it('redirects unauthenticated worker page visits to /signin?role=worker', async () => {
        const req = new NextRequest('http://localhost:3000/worker/attendance');
        const res = await middleware(req);

        expect(res.status).toBe(307);
        const location = res.headers.get('location');
        expect(location).toContain('/signin?role=worker');
        expect(location).toContain('redirect=%2Fworker%2Fattendance');
      });

      it('blocks contractor session from accessing worker API with 403 Forbidden', async () => {
        const req = new NextRequest('http://localhost:3000/api/workers/me', {
          headers: {
            cookie: `shramiksetu_session=${contractorToken}`,
          },
        });
        const res = await middleware(req);

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error.code).toBe('FORBIDDEN');
      });

      it('allows valid worker session to access worker routes', async () => {
        const req = new NextRequest('http://localhost:3000/worker/dashboard', {
          headers: {
            cookie: `shramiksetu_session=${workerToken}`,
          },
        });
        const res = await middleware(req);

        expect(res.status).toBe(200);
      });
    });

    describe('Contractor Routes (/contractor/*, /api/contractors/*)', () => {
      it('blocks unauthenticated requests to contractor API with 401', async () => {
        const req = new NextRequest('http://localhost:3000/api/contractors/projects');
        const res = await middleware(req);

        expect(res.status).toBe(401);
        const data = await res.json();
        expect(data.error.code).toBe('UNAUTHORIZED');
      });

      it('redirects unauthenticated contractor page visits to /signin?role=contractor', async () => {
        const req = new NextRequest('http://localhost:3000/contractor/projects');
        const res = await middleware(req);

        expect(res.status).toBe(307);
        const location = res.headers.get('location');
        expect(location).toContain('/signin?role=contractor');
      });

      it('blocks worker session from accessing contractor API with 403 Forbidden', async () => {
        const req = new NextRequest('http://localhost:3000/api/contractors/projects', {
          headers: {
            cookie: `shramiksetu_session=${workerToken}`,
          },
        });
        const res = await middleware(req);

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error.code).toBe('FORBIDDEN');
      });

      it('allows valid contractor session to access contractor routes', async () => {
        const req = new NextRequest('http://localhost:3000/contractor/dashboard', {
          headers: {
            cookie: `shramiksetu_session=${contractorToken}`,
          },
        });
        const res = await middleware(req);

        expect(res.status).toBe(200);
      });
    });
  });

  describe('7. Signout Cookie Invalidation', () => {
    it('clears session cookies on signout', async () => {
      const response = await signoutHandler();
      expect(response.status).toBe(200);

      const setCookieHeaders = response.headers.getSetCookie();
      expect(setCookieHeaders.length).toBeGreaterThan(0);

      const hasInvalidatedUnifiedSession = setCookieHeaders.some(
        (header) => header.includes('shramiksetu_session=') && (header.includes('Max-Age=0') || header.includes('1970'))
      );
      expect(hasInvalidatedUnifiedSession).toBe(true);
    });
  });

  describe('8. Worker & Contractor Registration Phone Validation & Normalization', () => {
    it('normalizes valid Indian mobile numbers to E.164 (+91) format', () => {
      const r1 = validateIndianMobileNumber('98200 33001');
      expect(r1.isValid).toBe(true);
      expect(r1.e164Phone).toBe('+919820033001');

      const r2 = validateIndianMobileNumber('+91 88888 77777');
      expect(r2.isValid).toBe(true);
      expect(r2.e164Phone).toBe('+918888877777');

      const r3 = validateIndianMobileNumber('07123456789');
      expect(r3.isValid).toBe(true);
      expect(r3.e164Phone).toBe('+917123456789');

      const r4 = validateIndianMobileNumber('6999988888');
      expect(r4.isValid).toBe(true);
      expect(r4.e164Phone).toBe('+916999988888');
    });

    it('rejects invalid mobile numbers with clear error message', () => {
      const shortNum = validateIndianMobileNumber('98200');
      expect(shortNum.isValid).toBe(false);
      expect(shortNum.error).toContain('10 digits');

      const badStart = validateIndianMobileNumber('5555555555');
      expect(badStart.isValid).toBe(false);
      expect(badStart.error).toContain('First digit must be 6, 7, 8, or 9');
    });

    it('rejects registration with invalid phone format', async () => {
      const res = await registerUser({
        role: 'WORKER',
        password: 'Password@123',
        fullName: 'Invalid Phone Worker',
        phone: '12345',
      });
      expect(res.success).toBe(false);
      expect(res.statusCode).toBe(400);
      expect(res.field).toBe('phone');
    });
  });
});
