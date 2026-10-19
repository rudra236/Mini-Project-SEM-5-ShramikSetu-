/**
 * SHRAMIKSETU QR ATTENDANCE TOKEN CRYPTO SERVICE
 *
 * Provides HMAC-SHA256 signing and verification for daily/rotating QR attendance tokens.
 * Complies strictly with anti-fraud statutory standards:
 * - Token payload: { tid, project_id, date, nonce, expiry }
 * - Signature: HMAC-SHA256(payload_json, server_secret)
 * - SHA-256 token hashing at rest (raw token never stored)
 * - HMAC-SHA256 6-digit short code hashing at rest (code never stored plaintext)
 * - AES-256-GCM authenticated encryption for contractor UI page reload
 */

import {
  createHmac,
  createHash,
  randomBytes,
  randomInt,
  createCipheriv,
  createDecipheriv,
} from 'crypto';

const QR_SIGNING_SECRET =
  process.env.QR_SIGNING_SECRET ||
  process.env.ATTENDANCE_SECRET ||
  'shramiksetu-qr-dev-secret-never-use-in-prod';

// Derived 32-byte key for AES-256-GCM symmetric encryption
const ENCRYPTION_KEY = createHash('sha256').update(QR_SIGNING_SECRET).digest();

export interface QrTokenPayload {
  tid?: string; // Token row UUID in attendance_tokens
  project_id: string; // Project UUID
  date?: string; // YYYY-MM-DD in Asia/Kolkata
  nonce: string; // Cryptographic single-use nonce
  expiry?: number; // Unix epoch ms (end of day IST)
  worksite_id: string;
  short_code: string;
  date_ist?: string; // Alias for date
  issued_at: number;
  expires_at: number; // Alias for expiry
}

export interface SignedQrToken {
  payload: QrTokenPayload;
  signature: string;
  /** Base64-encoded compact token for QR embedding */
  compact: string;
}

/**
 * Returns today's calendar date in Asia/Kolkata (IST) as YYYY-MM-DD.
 */
export function getTodayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/**
 * Returns end of day timestamp in Asia/Kolkata (IST).
 */
export function getEndOfDayIst(dateStr?: string): { isoString: string; epochMs: number } {
  const date = dateStr || getTodayIst();
  const endOfDay = new Date(`${date}T23:59:59.999+05:30`);
  return {
    isoString: endOfDay.toISOString(),
    epochMs: endOfDay.getTime(),
  };
}

/**
 * Generate a cryptographically random 6-digit numeric code for manual fallback.
 * Uses crypto.randomInt uniformly in range [100000, 999999].
 */
export function generateShortCode(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Generate a cryptographic nonce (32 hex chars).
 */
export function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Computes SHA-256 hash of the signed compact token string.
 * Used to store token_hash in DB without persisting raw token.
 */
export function hashToken(compactToken: string): string {
  return createHash('sha256').update(compactToken).digest('hex');
}

/**
 * Computes HMAC-SHA256 hash of the 6-digit code scoped to project and IST date.
 * Prevents rainbow tables and dictionary attacks at rest.
 */
export function hashCode(
  projectId: string,
  date: string,
  code: string,
  secret?: string
): string {
  const signingSecret = secret || QR_SIGNING_SECRET;
  return createHmac('sha256', signingSecret)
    .update(`${projectId}:${date}:${code}`)
    .digest('hex');
}

/**
 * Encrypt sensitive display string (like 6-digit code or compact token) using AES-256-GCM.
 * Enables contractor to reload page and re-see active code without plaintext at rest.
 */
export function encryptPayload(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt string encrypted with encryptPayload.
 */
export function decryptPayload(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) return null;
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encryptedText] = parts;
    const decipher = createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Sign a QR token payload with HMAC-SHA256.
 * Returns the signed token with a compact representation for QR encoding.
 */
export function signQrToken(payload: QrTokenPayload, secret?: string): SignedQrToken {
  const signingSecret = secret || QR_SIGNING_SECRET;
  const payloadJson = JSON.stringify(payload);
  const signature = createHmac('sha256', signingSecret)
    .update(payloadJson)
    .digest('hex');

  // Compact format: base64(JSON({ p: payload, s: signature }))
  const compactObj = { p: payload, s: signature };
  const compact = Buffer.from(JSON.stringify(compactObj)).toString('base64url');

  return { payload, signature, compact };
}

/**
 * Verify a QR token's HMAC signature.
 * Returns the payload if valid, throws if tampered or invalid.
 */
export function verifyQrTokenSignature(
  compact: string,
  secret?: string
): { payload: QrTokenPayload; valid: boolean } {
  const signingSecret = secret || QR_SIGNING_SECRET;

  let parsed: { p: QrTokenPayload; s: string };
  try {
    const decoded = Buffer.from(compact, 'base64url').toString('utf-8');
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error('INVALID_QR_TOKEN: Failed to decode token payload.');
  }

  if (!parsed.p || !parsed.s) {
    throw new Error('INVALID_QR_TOKEN: Missing payload or signature.');
  }

  const payloadJson = JSON.stringify(parsed.p);
  const expectedSignature = createHmac('sha256', signingSecret)
    .update(payloadJson)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(parsed.s, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) {
    throw new Error('TAMPERED_QR_TOKEN: Signature length mismatch.');
  }

  let diff = 0;
  for (let i = 0; i < sigBuffer.length; i++) {
    diff |= sigBuffer[i] ^ expectedBuffer[i];
  }

  if (diff !== 0) {
    throw new Error('TAMPERED_QR_TOKEN: Signature verification failed.');
  }

  return { payload: parsed.p, valid: true };
}

/**
 * Validate that a QR token has not expired.
 * For offline submissions, validates against the captured_at timestamp instead of now.
 */
export function validateTokenExpiry(
  payload: QrTokenPayload,
  referenceTimeMs?: number
): { expired: boolean; remainingMs: number } {
  const now = referenceTimeMs || Date.now();
  const expiryTime = payload.expiry || payload.expires_at || 0;
  const remainingMs = expiryTime - now;
  return {
    expired: remainingMs <= 0,
    remainingMs: Math.max(0, remainingMs),
  };
}

/**
 * Create a complete signed rotating/daily QR token for a project/worksite.
 */
export function createRotatingQrToken(
  projectId: string,
  worksiteId: string,
  tokenIdOrTtl?: string | number,
  shortCodeParam?: string,
  ttlSecondsParam?: number
): SignedQrToken {
  let tid: string;
  let ttlSeconds: number | undefined;

  if (typeof tokenIdOrTtl === 'number') {
    ttlSeconds = tokenIdOrTtl;
    tid = randomBytes(16).toString('hex');
  } else {
    tid = tokenIdOrTtl || randomBytes(16).toString('hex');
    ttlSeconds = ttlSecondsParam;
  }

  const nonce = generateNonce();
  const shortCode = shortCodeParam || generateShortCode();
  const dateIst = getTodayIst();
  const { epochMs: endOfDayMs } = getEndOfDayIst(dateIst);
  let expiryMs: number;
  if (ttlSeconds !== undefined) {
    expiryMs = Date.now() + ttlSeconds * 1000;
  } else if (typeof tokenIdOrTtl === 'string' && tokenIdOrTtl) {
    expiryMs = endOfDayMs;
  } else {
    expiryMs = Date.now() + 30000;
  }

  const payload: QrTokenPayload = {
    tid,
    project_id: projectId,
    worksite_id: worksiteId,
    date: dateIst,
    date_ist: dateIst,
    nonce,
    expiry: expiryMs,
    issued_at: Date.now(),
    expires_at: expiryMs,
    short_code: shortCode,
  };

  return signQrToken(payload);
}
