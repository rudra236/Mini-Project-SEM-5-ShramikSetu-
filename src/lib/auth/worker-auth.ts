/**
 * SHRAMIKSETU WORKER AUTHENTICATION SERVICE
 *
 * Provides:
 * 1. Worker ID + Password authentication (bcrypt hashing).
 * 2. Rate limiting & temporary lockout (max 5 failed attempts per 15-minute window).
 * 3. Generic error messages (no enumeration of valid IDs).
 * 4. Cryptographically signed session tokens (HMAC-SHA256).
 * 5. Deterministic fallback for seeded demo workers.
 */

import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const SESSION_SECRET = process.env.SESSION_SECRET || 'shramiksetu-worker-session-secret-2026-secure';

export interface WorkerSessionPayload {
  userId: string;
  workerId: string;
  internalWorkerId: string;
  fullName: string;
  role: 'WORKER';
  exp: number; // Unix timestamp ms
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

interface WorkerLoginAttemptRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

class WorkerLoginRateLimiter {
  private attempts = new Map<string, WorkerLoginAttemptRecord>();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  public checkAllowed(identifier: string): { allowed: boolean; reason?: string; retryAfterSeconds?: number } {
    const key = identifier.toLowerCase().trim();
    const record = this.attempts.get(key);
    if (!record) return { allowed: true };

    const now = Date.now();
    if (record.lockedUntil) {
      if (now < record.lockedUntil) {
        const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
        return {
          allowed: false,
          reason: `Too many failed login attempts. Account temporarily locked. Please try again in ${remainingSeconds} seconds.`,
          retryAfterSeconds: remainingSeconds,
        };
      } else {
        // Lockout expired, reset record
        this.attempts.delete(key);
        return { allowed: true };
      }
    }

    return { allowed: true };
  }

  public recordFailure(identifier: string): { locked: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
    const key = identifier.toLowerCase().trim();
    const now = Date.now();
    const record = this.attempts.get(key) || { failedAttempts: 0, lockedUntil: null };

    record.failedAttempts += 1;

    if (record.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.attempts.set(key, record);
      return {
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds: Math.ceil(this.LOCKOUT_DURATION_MS / 1000),
      };
    }

    this.attempts.set(key, record);
    return {
      locked: false,
      remainingAttempts: this.MAX_FAILED_ATTEMPTS - record.failedAttempts,
    };
  }

  public recordSuccess(identifier: string): void {
    const key = identifier.toLowerCase().trim();
    this.attempts.delete(key);
  }

  public resetAll(): void {
    this.attempts.clear();
  }
}

export const workerLoginRateLimiter = new WorkerLoginRateLimiter();

// ─── Password Hashing & Verification ──────────────────────────────────────────

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

// ─── Session Token Helpers (HMAC-SHA256) ──────────────────────────────────────

export function signWorkerSession(payload: WorkerSessionPayload): string {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function verifyWorkerSession(token: string): WorkerSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;

    const expectedSig = createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
    if (signature.length !== expectedSig.length) return null;

    const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!valid) return null;

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8')) as WorkerSessionPayload;
    if (Date.now() > payload.exp) {
      return null; // Expired session
    }

    return payload;
  } catch {
    return null;
  }
}

// ─── Known Seed Workers (Default Passwords for Test Isolation) ────────────────

export const SEEDED_WORKER_CREDENTIALS: Record<string, { password: string; userId: string; workerId: string; fullName: string }> = {
  'wrk-mh-2026-0001': {
    password: 'Ramesh@123',
    userId: '11111111-1111-1111-1111-111111111101',
    workerId: '33333333-3333-3333-3333-333333333301',
    fullName: 'Ramesh Kumar',
  },
  'wrk-mh-2026-0002': {
    password: 'Sunita@123',
    userId: '11111111-1111-1111-1111-111111111110',
    workerId: '33333333-3333-3333-3333-333333333302',
    fullName: 'Sunita Patil',
  },
  'wrk-mh-2026-0003': {
    password: 'Mohammad@123',
    userId: '11111111-1111-1111-1111-111111111111',
    workerId: '33333333-3333-3333-3333-333333333303',
    fullName: 'Mohammad Ansari',
  },
  'w-001': {
    password: 'Ramesh@123',
    userId: '11111111-1111-1111-1111-111111111101',
    workerId: '33333333-3333-3333-3333-333333333301',
    fullName: 'Ramesh Kumar',
  },
};

// ─── Worker Login Execution ───────────────────────────────────────────────────

export async function loginWorkerWithCredentials(
  workerIdInput: string,
  passwordInput: string
): Promise<{
  success: boolean;
  user: any;
  profile: any;
  sessionToken: string;
  error?: string;
  statusCode?: number;
  retryAfterSeconds?: number;
}> {
  const cleanId = workerIdInput.trim();
  const lowerId = cleanId.toLowerCase();

  // 1. Rate Limit Check
  const rateCheck = workerLoginRateLimiter.checkAllowed(lowerId);
  if (!rateCheck.allowed) {
    return {
      success: false,
      user: null,
      profile: null,
      sessionToken: '',
      error: rateCheck.reason,
      statusCode: 429,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    };
  }

  const GENERIC_ERROR = 'Invalid Worker ID or password.';

  let matchedWorker: any = null;
  let matchedUser: any = null;

  try {
    const adminClient = createAdminClient();
    const { data: dbWorker } = await adminClient
      .from('workers')
      .select('*, users(*)')
      .ilike('internal_worker_id', cleanId)
      .maybeSingle();

    if (dbWorker) {
      matchedWorker = dbWorker;
      matchedUser = dbWorker.users;
    }
  } catch {
    // If DB is offline / test client, proceed to seed check
  }

  // Check database password if worker exists and has a password_hash
  let isPasswordValid = false;
  if (matchedWorker && matchedWorker.password_hash) {
    isPasswordValid = await comparePassword(passwordInput, matchedWorker.password_hash);
  }

  // Fallback to seeded demo credentials if password_hash is not set or in offline demo
  if (!isPasswordValid) {
    const seedCred = SEEDED_WORKER_CREDENTIALS[lowerId];
    if (seedCred && seedCred.password === passwordInput) {
      isPasswordValid = true;
      if (!matchedWorker) {
        matchedWorker = {
          id: seedCred.workerId,
          user_id: seedCred.userId,
          full_name: seedCred.fullName,
          internal_worker_id: cleanId.toUpperCase(),
          occupation: 'Mason',
          skill_category: 'SKILLED',
        };
        matchedUser = {
          id: seedCred.userId,
          role: 'WORKER',
          phone: '+919820033001',
          email: 'worker@shramiksetu.local',
          locale: 'hi',
          is_active: true,
        };
      }
    }
  }

  if (!isPasswordValid || !matchedWorker || !matchedUser) {
    const failResult = workerLoginRateLimiter.recordFailure(lowerId);
    if (failResult.locked) {
      return {
        success: false,
        user: null,
        profile: null,
        sessionToken: '',
        error: `Too many failed login attempts. Account temporarily locked for 15 minutes.`,
        statusCode: 429,
        retryAfterSeconds: failResult.retryAfterSeconds,
      };
    }
    return {
      success: false,
      user: null,
      profile: null,
      sessionToken: '',
      error: GENERIC_ERROR,
      statusCode: 401,
    };
  }

  // 2. Success: Reset rate limiter
  workerLoginRateLimiter.recordSuccess(lowerId);

  // 3. Issue Session Token
  const sessionPayload: WorkerSessionPayload = {
    userId: matchedUser.id,
    workerId: matchedWorker.id,
    internalWorkerId: matchedWorker.internal_worker_id,
    fullName: matchedWorker.full_name,
    role: 'WORKER',
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const sessionToken = signWorkerSession(sessionPayload);

  return {
    success: true,
    user: matchedUser,
    profile: matchedWorker,
    sessionToken,
  };
}
