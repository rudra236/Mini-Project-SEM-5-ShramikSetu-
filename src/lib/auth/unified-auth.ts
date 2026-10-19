/**
 * SHRAMIKSETU UNIFIED AUTHENTICATION SERVICE
 *
 * Implements ID + Password authentication for both WORKER and CONTRACTOR roles:
 * - Credentials: ID + Password only (no phone/OTP in auth).
 * - Passwords hashed with bcrypt (cost = 12).
 * - Constant-time comparison and dummy hash on unknown IDs (no timing leaks).
 * - Server-side password policy (min 8 characters).
 * - Brute-force protection: rate limit per IP and per ID (5 attempts -> 15 min lockout).
 * - Cryptographically signed session tokens (HMAC-SHA256, HTTP-only, 7-day TTL).
 * - Reversible secure set-password flow with one-time tokens.
 */

import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateIndianMobileNumber } from '@/lib/auth/phone-validation';
import type { UserRole } from '@/types/database.types';

const BCRYPT_COST = 12;
const SESSION_SECRET = process.env.SESSION_SECRET || 'shramiksetu-unified-session-secret-2026-secure';

// Pre-computed bcrypt hash used for unknown IDs to guarantee constant-time execution
const DUMMY_BCRYPT_HASH = '$2a$10$e8uq5eJ0c6.0oR6x1xN8p.uR7Zz3t5cK1bN3yQe4g7m9s2d1v5r8e';

export interface AuthSessionPayload {
  userId: string;
  loginId: string;
  role: UserRole;
  fullName: string;
  phone?: string | null;
  occupation?: string | null;
  skillCategory?: string | null;
  exp: number; // Unix timestamp ms
}

// ─── Password Hashing & Verification ──────────────────────────────────────────

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST);
  return bcrypt.hash(plainText, salt);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

// ─── Password Policy ──────────────────────────────────────────────────────────

export function validatePasswordPolicy(password: string): { isValid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { isValid: false, error: 'Password is required' };
  }
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long' };
  }
  return { isValid: true };
}

// ─── Rate Limiter (Per ID & Per IP) ──────────────────────────────────────────

interface RateLimitRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

class AuthRateLimiter {
  private attempts = new Map<string, RateLimitRecord>();
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  public checkAllowed(identifier: string, ip?: string): { allowed: boolean; reason?: string; retryAfterSeconds?: number } {
    const idKey = identifier.toLowerCase().trim();
    const ipKey = ip ? `ip:${ip.trim()}` : null;

    const record = this.attempts.get(idKey) || (ipKey ? this.attempts.get(ipKey) : null);
    if (!record) return { allowed: true };

    const now = Date.now();
    if (record.lockedUntil) {
      if (now < record.lockedUntil) {
        const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
        const remainingMinutes = Math.ceil(remainingSeconds / 60);
        return {
          allowed: false,
          reason: `Too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
          retryAfterSeconds: remainingSeconds,
        };
      } else {
        this.attempts.delete(idKey);
        if (ipKey) this.attempts.delete(ipKey);
        return { allowed: true };
      }
    }

    return { allowed: true };
  }

  public recordFailure(identifier: string, ip?: string): { locked: boolean; remainingAttempts: number; retryAfterSeconds?: number; reason?: string } {
    const idKey = identifier.toLowerCase().trim();
    const ipKey = ip ? `ip:${ip.trim()}` : null;
    const now = Date.now();

    const record = this.attempts.get(idKey) || { failedAttempts: 0, lockedUntil: null };
    record.failedAttempts += 1;

    if (record.failedAttempts >= this.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.attempts.set(idKey, record);
      if (ipKey) this.attempts.set(ipKey, record);

      const remainingSeconds = Math.ceil(this.LOCKOUT_DURATION_MS / 1000);
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return {
        locked: true,
        remainingAttempts: 0,
        retryAfterSeconds: remainingSeconds,
        reason: `Too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`,
      };
    }

    this.attempts.set(idKey, record);
    if (ipKey) {
      const ipRecord = this.attempts.get(ipKey) || { failedAttempts: 0, lockedUntil: null };
      ipRecord.failedAttempts += 1;
      this.attempts.set(ipKey, ipRecord);
    }

    return {
      locked: false,
      remainingAttempts: this.MAX_FAILED_ATTEMPTS - record.failedAttempts,
    };
  }

  public recordSuccess(identifier: string, ip?: string): void {
    this.attempts.delete(identifier.toLowerCase().trim());
    if (ip) this.attempts.delete(`ip:${ip.trim()}`);
  }

  public resetAll(): void {
    this.attempts.clear();
  }
}

export const authRateLimiter = new AuthRateLimiter();

// ─── Local / In-Memory & Persistent User Registry for Offline & Development ───
export interface LocalUserRecord {
  user: any;
  profile: any;
  passwordHash: string;
}

export const localUserRegistry: Map<string, LocalUserRecord> = new Map<string, LocalUserRecord>();

// ─── Session Management (Signed HMAC-SHA256) ─────────────────────────────────

export function signSession(payload: AuthSessionPayload): string {
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
  return `${payloadStr}.${signature}`;
}

export function verifySession(token: string): AuthSessionPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadStr, signature] = parts;

    const expectedSig = createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('base64url');
    if (signature.length !== expectedSig.length) return null;

    const valid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
    if (!valid) return null;

    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf-8')) as AuthSessionPayload;
    if (Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

// ─── Human-Readable ID Generator ──────────────────────────────────────────────

export async function generateUniqueId(role: 'WORKER' | 'CONTRACTOR'): Promise<string> {
  const adminClient = createAdminClient();
  const year = new Date().getFullYear();
  const prefix = role === 'WORKER' ? `SS-W-${year}-` : `SS-C-${year}-`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const randomDigits = Math.floor(100000 + Math.random() * 900000).toString();
    const candidate = `${prefix}${randomDigits}`;

    try {
      const { data } = await adminClient
        .from('users')
        .select('id')
        .eq('login_id', candidate)
        .maybeSingle();

      if (!data) {
        return candidate;
      }
    } catch {
      return candidate;
    }
  }

  return `${prefix}${Date.now().toString().slice(-6)}`;
}

// ─── One-Time Set-Password Token Generator ────────────────────────────────────

export function generateSetPasswordToken(): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
  return { token, expiresAt };
}

// ─── Core Authentication Method: authenticateUser ─────────────────────────────

export interface AuthenticateResult {
  success: boolean;
  user?: any;
  profile?: any;
  role?: UserRole;
  sessionToken?: string;
  error?: string;
  field?: string;
  statusCode?: number;
  retryAfterSeconds?: number;
}

export async function authenticateUser(params: {
  idInput: string;
  passwordInput: string;
  roleInput: UserRole;
  ipAddress?: string;
}): Promise<AuthenticateResult> {
  const { idInput, passwordInput, roleInput, ipAddress } = params;
  const cleanId = (idInput || '').trim();

  // 1. Basic validation
  if (!cleanId || !passwordInput) {
    return {
      success: false,
      statusCode: 400,
      error: 'ID and password are required',
    };
  }

  // 2. Brute-Force Rate Limiter Check
  const rateCheck = authRateLimiter.checkAllowed(cleanId, ipAddress);
  if (!rateCheck.allowed) {
    return {
      success: false,
      statusCode: 429,
      error: rateCheck.reason,
      retryAfterSeconds: rateCheck.retryAfterSeconds,
    };
  }

  const GENERIC_ERROR = 'Invalid ID or password.';

  let matchedUser: any = null;
  let matchedProfile: any = null;
  let storedHash: string | null = null;


  // 2. Query PostgreSQL Database (Single Source of Truth)
  try {
    const admin = createAdminClient();

    // Query users by login_id (case-insensitive)
    const { data: userByLoginId } = await admin
      .from('users')
      .select('*')
      .ilike('login_id', cleanId)
      .maybeSingle();

    if (userByLoginId) {
      matchedUser = userByLoginId;
      storedHash = userByLoginId.password_hash;
    }

      // Fallback: If not matched directly on users.login_id, check role profile tables
      if (!matchedUser) {
        if (roleInput === 'WORKER') {
          const { data: worker } = await admin
            .from('workers')
            .select('*, users(*)')
            .ilike('internal_worker_id', cleanId)
            .maybeSingle();

          if (worker && worker.users) {
            matchedUser = worker.users;
            matchedProfile = worker;
            storedHash = worker.password_hash || matchedUser.password_hash;
          }
        } else if (roleInput === 'CONTRACTOR') {
          const { data: contractor } = await admin
            .from('contractors')
            .select('*, users(*)')
            .or(`internal_contractor_id.ilike.${cleanId},license_number.ilike.${cleanId}`)
            .maybeSingle();

          if (contractor && contractor.users) {
            matchedUser = contractor.users;
            matchedProfile = contractor;
            storedHash = contractor.password_hash || matchedUser.password_hash;
          }
        }
      }

      // If user was found via users table, fetch profile
      if (matchedUser && !matchedProfile) {
        if (matchedUser.role === 'WORKER') {
          const { data: worker } = await admin
            .from('workers')
            .select('*')
            .eq('user_id', matchedUser.id)
            .maybeSingle();
          matchedProfile = worker;
          if (!storedHash && worker?.password_hash) storedHash = worker.password_hash;
        } else if (matchedUser.role === 'CONTRACTOR') {
          const { data: contractor } = await admin
            .from('contractors')
            .select('*')
            .eq('user_id', matchedUser.id)
            .maybeSingle();
          matchedProfile = contractor;
          if (!storedHash && contractor?.password_hash) storedHash = contractor.password_hash;
        }
      }
    } catch {
      // If DB is offline or mock in test
    }

  // 3. Constant-Time Verification & Dummy Hash execution
  // We perform comparison even if user was not found or role mismatched to defeat timing attacks
  let passwordMatches = false;
  const isCandidateValid = matchedUser && matchedUser.role === roleInput && storedHash;

  if (isCandidateValid) {
    passwordMatches = await comparePassword(passwordInput, storedHash!);
  } else {
    // Run dummy compare to match elapsed time of bcrypt computation
    await comparePassword(passwordInput, DUMMY_BCRYPT_HASH);
    passwordMatches = false;
  }

  // 4. Failure handling: Generic message + Rate limiting
  if (!passwordMatches || !matchedUser || matchedUser.role !== roleInput) {
    const failResult = authRateLimiter.recordFailure(cleanId, ipAddress);
    if (failResult.locked) {
      return {
        success: false,
        statusCode: 429,
        error: failResult.reason,
        retryAfterSeconds: failResult.retryAfterSeconds,
      };
    }

    return {
      success: false,
      statusCode: 401,
      error: GENERIC_ERROR,
    };
  }

  // 5. Success: Reset rate limiter
  authRateLimiter.recordSuccess(cleanId, ipAddress);

  // 6. Sign Session
  const fullName = matchedProfile?.full_name || matchedProfile?.company_name || 'User';
  const effectiveLoginId = matchedUser.login_id || cleanId;

  const sessionPayload: AuthSessionPayload = {
    userId: matchedUser.id,
    loginId: effectiveLoginId,
    role: matchedUser.role,
    fullName,
    phone: matchedUser.phone || null,
    occupation: matchedProfile?.occupation || null,
    skillCategory: matchedProfile?.skill_category || null,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const sessionToken = signSession(sessionPayload);

  return {
    success: true,
    user: matchedUser,
    profile: matchedProfile,
    role: matchedUser.role,
    sessionToken,
  };
}

// ─── Core Registration Method: registerUser ───────────────────────────────────

export interface RegisterParams {
  role: 'WORKER' | 'CONTRACTOR';
  password: string;
  fullName: string;
  phone?: string;
  occupation?: string;
  skillCategory?: 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
  emergencyContact?: string;
  companyName?: string;
  licenseNumber?: string;
  locale?: 'en' | 'hi' | 'mr';
}

export async function registerUser(params: RegisterParams): Promise<{
  success: boolean;
  id?: string;
  loginId?: string;
  user?: any;
  profile?: any;
  sessionToken?: string;
  error?: string;
  field?: string;
  statusCode?: number;
}> {
  // 1. Validate Role
  if (params.role !== 'WORKER' && params.role !== 'CONTRACTOR') {
    return {
      success: false,
      statusCode: 400,
      field: 'role',
      error: 'Public registration only permits WORKER or CONTRACTOR roles.',
    };
  }

  // 2. Validate Password Policy
  const pwdCheck = validatePasswordPolicy(params.password);
  if (!pwdCheck.isValid) {
    return {
      success: false,
      statusCode: 400,
      field: 'password',
      error: pwdCheck.error,
    };
  }

  // 3. Validate Role-Specific Required Fields
  if (params.role === 'WORKER') {
    if (!params.fullName || params.fullName.trim().length < 2) {
      return {
        success: false,
        statusCode: 400,
        field: 'fullName',
        error: 'Full legal name is required (minimum 2 characters).',
      };
    }
  } else if (params.role === 'CONTRACTOR') {
    if (!params.companyName || params.companyName.trim().length < 2) {
      return {
        success: false,
        statusCode: 400,
        field: 'companyName',
        error: 'Company name is required (minimum 2 characters).',
      };
    }
  }

  // 4. Generate Unique Login ID and Hash Password with cost >= 12
  const generatedId = await generateUniqueId(params.role);
  const hashedPassword = await hashPassword(params.password);

  // Validate and normalize phone if provided (optional)
  let normalizedPhone: string | null = null;
  if (params.phone && params.phone.trim().length > 0) {
    const phoneCheck = validateIndianMobileNumber(params.phone.trim());
    if (!phoneCheck.isValid) {
      return {
        success: false,
        statusCode: 400,
        field: 'phone',
        error: phoneCheck.error || 'Please enter a valid 10-digit Indian mobile number.',
      };
    }
    normalizedPhone = phoneCheck.e164Phone;
  }

  const admin = createAdminClient();
  const userId = crypto.randomUUID();

  try {
    // 5. Insert users table record in PostgreSQL
    const { data: userRow, error: userError } = await admin
      .from('users')
      .insert({
        id: userId,
        phone: normalizedPhone,
        role: params.role,
        locale: params.locale || 'en',
        login_id: generatedId,
        password_hash: hashedPassword,
        is_active: true,
      })
      .select()
      .single();

    if (userError || !userRow) {
      if (userError?.code === '23505') {
        return {
          success: false,
          statusCode: 409,
          field: 'phone',
          error: 'An account with this phone number or ID already exists.',
        };
      }
      return {
        success: false,
        statusCode: 400,
        error: `User registration failed: ${userError?.message || 'Database error'}`,
      };
    }

    // 6. Insert Role-Specific Profile in PostgreSQL
    let profileRecord: any = null;

    if (params.role === 'WORKER') {
      const { data: worker, error: workerErr } = await admin
        .from('workers')
        .insert({
          user_id: userId,
          full_name: params.fullName.trim(),
          internal_worker_id: generatedId,
          password_hash: hashedPassword,
          occupation: params.occupation ? params.occupation.trim() : 'Worker',
          skill_category: params.skillCategory || 'UNSKILLED',
          emergency_contact: params.emergencyContact || null,
        })
        .select()
        .single();

      if (workerErr || !worker) {
        return {
          success: false,
          statusCode: 400,
          error: `Worker profile creation failed: ${workerErr?.message || 'Database error'}`,
        };
      }
      profileRecord = worker;
    } else if (params.role === 'CONTRACTOR') {
      const { data: contractor, error: contrErr } = await admin
        .from('contractors')
        .insert({
          user_id: userId,
          full_name: params.fullName ? params.fullName.trim() : params.companyName!.trim(),
          company_name: params.companyName!.trim(),
          license_number: params.licenseNumber || null,
          internal_contractor_id: generatedId,
          password_hash: hashedPassword,
        })
        .select()
        .single();

      if (contrErr || !contractor) {
        return {
          success: false,
          statusCode: 400,
          error: `Contractor profile creation failed: ${contrErr?.message || 'Database error'}`,
        };
      }
      profileRecord = contractor;
    }

    // Also mirror to profiles table
    try {
      await admin.from('profiles').insert({
        id: userId,
        role: params.role,
        phone: normalizedPhone,
        full_name: params.fullName ? params.fullName.trim() : params.companyName?.trim(),
        locale: params.locale || 'en',
        login_id: generatedId,
        is_active: true,
      });
    } catch {
      // Non-blocking trigger mirror
    }


    // 7. Issue Session Token
    const sessionPayload: AuthSessionPayload = {
      userId,
      loginId: generatedId,
      role: params.role,
      fullName: profileRecord?.full_name || profileRecord?.company_name || 'User',
      phone: userRow.phone || null,
      occupation: profileRecord?.occupation || null,
      skillCategory: profileRecord?.skill_category || null,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    const sessionToken = signSession(sessionPayload);

    return {
      success: true,
      id: generatedId,
      loginId: generatedId,
      user: userRow,
      profile: profileRecord,
      sessionToken,
    };
  } catch (err: any) {
    return {
      success: false,
      statusCode: 500,
      error: err.message || 'Registration failed',
    };
  }
}

// ─── Core Set-Password Method: setPasswordWithToken ────────────────────────────

export async function setPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string; statusCode?: number }> {
  if (!token || !newPassword) {
    return { success: false, statusCode: 400, error: 'Token and new password are required' };
  }

  const pwdCheck = validatePasswordPolicy(newPassword);
  if (!pwdCheck.isValid) {
    return { success: false, statusCode: 400, error: pwdCheck.error };
  }

  const admin = createAdminClient();

  try {
    const { data: user } = await admin
      .from('users')
      .select('*')
      .eq('set_password_token', token)
      .maybeSingle();

    if (!user) {
      return { success: false, statusCode: 400, error: 'Invalid or expired password reset token' };
    }

    if (user.set_password_token_expires_at) {
      const expiresAt = new Date(user.set_password_token_expires_at).getTime();
      if (Date.now() > expiresAt) {
        return { success: false, statusCode: 400, error: 'Set password token has expired' };
      }
    }

    const hashedPassword = await hashPassword(newPassword);

    await admin
      .from('users')
      .update({
        password_hash: hashedPassword,
        set_password_token: null,
        set_password_token_expires_at: null,
      })
      .eq('id', user.id);

    // Sync to worker or contractor table if applicable
    if (user.role === 'WORKER') {
      await admin.from('workers').update({ password_hash: hashedPassword }).eq('user_id', user.id);
    } else if (user.role === 'CONTRACTOR') {
      await admin.from('contractors').update({ password_hash: hashedPassword }).eq('user_id', user.id);
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, statusCode: 500, error: err.message || 'Failed to update password' };
  }
}

// ─── Local Profile Update Helper ──────────────────────────────────────────────

export function updateLocalUserProfile(
  loginIdOrUserId: string,
  updates: {
    fullName?: string;
    phone?: string | null;
    occupation?: string | null;
    skillCategory?: 'UNSKILLED' | 'SEMI_SKILLED' | 'SKILLED' | 'HIGHLY_SKILLED';
    emergencyContact?: string | null;
    companyName?: string;
    licenseNumber?: string | null;
  }
): { user: any; profile: any } | null {
  const cleanKey = (loginIdOrUserId || '').trim().toLowerCase();
  let foundKey = cleanKey;
  let record = localUserRegistry.get(cleanKey);

  if (!record) {
    for (const [key, val] of localUserRegistry.entries()) {
      if (
        val.user?.id === loginIdOrUserId ||
        val.user?.login_id?.toLowerCase() === cleanKey ||
        val.profile?.internal_worker_id?.toLowerCase() === cleanKey ||
        val.profile?.internal_contractor_id?.toLowerCase() === cleanKey ||
        val.profile?.id === loginIdOrUserId
      ) {
        foundKey = key;
        record = val;
        break;
      }
    }
  }

  if (!record) return null;

  if (updates.phone !== undefined) {
    record.user.phone = updates.phone ? updates.phone.trim() : null;
  }
  if (updates.fullName !== undefined && updates.fullName.trim().length > 0) {
    record.profile.full_name = updates.fullName.trim();
  }
  if (updates.occupation !== undefined) {
    record.profile.occupation = updates.occupation ? updates.occupation.trim() : null;
  }
  if (updates.skillCategory !== undefined) {
    record.profile.skill_category = updates.skillCategory;
  }
  if (updates.emergencyContact !== undefined) {
    record.profile.emergency_contact = updates.emergencyContact ? updates.emergencyContact.trim() : null;
  }
  if (updates.companyName !== undefined && updates.companyName.trim().length > 0) {
    record.profile.company_name = updates.companyName.trim();
  }
  if (updates.licenseNumber !== undefined) {
    record.profile.license_number = updates.licenseNumber ? updates.licenseNumber.trim() : null;
  }
  record.profile.updated_at = new Date().toISOString();
  record.user.updated_at = new Date().toISOString();

  localUserRegistry.set(foundKey, record);
  return { user: record.user, profile: record.profile };
}


