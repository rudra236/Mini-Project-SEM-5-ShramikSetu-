/**
 * OTP Rate Limiter & Lockout Policy Service
 *
 * Rules:
 *   1. OTP Send:
 *      - Max 3 sends per 10-minute window per phone.
 *      - Minimum 60-second cooldown between consecutive sends.
 *   2. OTP Verify:
 *      - Max 5 consecutive failed attempts per phone.
 *      - After 5 consecutive failures: 15-minute account/phone lockout.
 *      - Successful verification resets the failure counter.
 */

interface SendRecord {
  timestamps: number[];
  lastSend: number;
}

interface VerifyRecord {
  failedAttempts: number;
  lockedUntil: number | null;
}

class OtpRateLimiter {
  private sendRecords = new Map<string, SendRecord>();
  private verifyRecords = new Map<string, VerifyRecord>();

  private readonly SEND_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private readonly MAX_SENDS_PER_WINDOW = 3;
  private readonly SEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

  private readonly MAX_FAILED_VERIFIES = 5;
  private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  /**
   * Check if OTP send is permitted.
   */
  public checkSendAllowed(phone: string): { allowed: boolean; reason?: string; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = this.sendRecords.get(phone);

    if (!record) {
      return { allowed: true };
    }

    // Check 60s cooldown
    const elapsedSinceLast = now - record.lastSend;
    if (elapsedSinceLast < this.SEND_COOLDOWN_MS) {
      const waitSec = Math.ceil((this.SEND_COOLDOWN_MS - elapsedSinceLast) / 1000);
      return {
        allowed: false,
        reason: `Please wait ${waitSec} seconds before requesting another verification code.`,
        retryAfterSeconds: waitSec,
      };
    }

    // Filter timestamps within the 10m window
    const recentSends = record.timestamps.filter((ts) => now - ts < this.SEND_WINDOW_MS);
    if (recentSends.length >= this.MAX_SENDS_PER_WINDOW) {
      const oldestInWindow = recentSends[0];
      const waitSec = Math.ceil((this.SEND_WINDOW_MS - (now - oldestInWindow)) / 1000);
      return {
        allowed: false,
        reason: `Maximum OTP requests exceeded (limit: ${this.MAX_SENDS_PER_WINDOW} per 10 minutes). Try again in ${Math.ceil(waitSec / 60)} minutes.`,
        retryAfterSeconds: waitSec,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a successful OTP send.
   */
  public recordSend(phone: string): void {
    const now = Date.now();
    const record = this.sendRecords.get(phone) || { timestamps: [], lastSend: 0 };
    record.timestamps = record.timestamps.filter((ts) => now - ts < this.SEND_WINDOW_MS);
    record.timestamps.push(now);
    record.lastSend = now;
    this.sendRecords.set(phone, record);
  }

  /**
   * Check if phone is locked out from verification attempts.
   */
  public checkVerifyAllowed(phone: string): { allowed: boolean; reason?: string; retryAfterSeconds?: number } {
    const now = Date.now();
    const record = this.verifyRecords.get(phone);

    if (!record || !record.lockedUntil) {
      return { allowed: true };
    }

    if (now < record.lockedUntil) {
      const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
      const remainingMin = Math.ceil(remainingSec / 60);
      return {
        allowed: false,
        reason: `Account temporarily locked due to 5 consecutive failed OTP attempts. Please wait ${remainingMin} minute(s) before trying again.`,
        retryAfterSeconds: remainingSec,
      };
    }

    // Lockout expired: reset failed attempts
    record.failedAttempts = 0;
    record.lockedUntil = null;
    return { allowed: true };
  }

  /**
   * Record a failed verification attempt.
   */
  public recordVerifyFailure(phone: string): { locked: boolean; remainingAttempts: number; reason?: string; lockoutExpiresAt?: string } {
    const now = Date.now();
    const record = this.verifyRecords.get(phone) || { failedAttempts: 0, lockedUntil: null };

    record.failedAttempts += 1;

    if (record.failedAttempts >= this.MAX_FAILED_VERIFIES) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.verifyRecords.set(phone, record);
      return {
        locked: true,
        remainingAttempts: 0,
        lockoutExpiresAt: new Date(record.lockedUntil).toISOString(),
        reason: `5 consecutive failed attempts. Phone locked for 15 minutes.`,
      };
    }

    this.verifyRecords.set(phone, record);
    return {
      locked: false,
      remainingAttempts: this.MAX_FAILED_VERIFIES - record.failedAttempts,
    };
  }

  /**
   * Record a successful verification (resets failures).
   */
  public recordVerifySuccess(phone: string): void {
    this.verifyRecords.delete(phone);
  }

  /**
   * Clear all records (useful for test resets).
   */
  public reset(): void {
    this.sendRecords.clear();
    this.verifyRecords.clear();
  }

  public clear(): void {
    this.reset();
  }
}

export const otpRateLimiter = new OtpRateLimiter();
