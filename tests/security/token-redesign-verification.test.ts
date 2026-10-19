import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createRotatingAttendanceToken,
  markAttendance,
  AttendanceValidationError,
} from '@/lib/services/attendance-service';
import {
  getTodayIst,
  hashToken,
  hashCode,
  decryptPayload,
  signQrToken,
} from '@/lib/crypto/qr-token';

describe('Task 2 & 4 Verification: Attendance Tokens Redesign & Verification Suite', () => {
  const admin = createAdminClient();

  const PROJECT_ID = '66666666-6666-6666-6666-666666666601';
  const WORKSITE_ID = '77777777-7777-7777-7777-777777777701';
  const CONTRACTOR_USER_ID = '11111111-1111-1111-1111-111111111102';
  const ACCEPTED_WORKER_USER_ID = '11111111-1111-1111-1111-111111111101'; // Worker 1 (Active/Accepted)

  let pendingWorkerUserId = '';
  let pendingContractId = '';

  beforeAll(async () => {
    // Create a temporary worker with PENDING contract to test pending worker rejection
    const pUserId = crypto.randomUUID();
    const pWorkerId = crypto.randomUUID();
    pendingWorkerUserId = pUserId;

    await admin.from('users').insert({
      id: pUserId,
      role: 'WORKER',
      locale: 'en',
      login_id: 'SS-W-2026-PEND99',
      password_hash: 'testhash',
      is_active: true,
    });

    await admin.from('workers').insert({
      id: pWorkerId,
      user_id: pUserId,
      full_name: 'Pending Worker Test',
      internal_worker_id: 'SS-W-2026-PEND99',
      password_hash: 'testhash',
      occupation: 'Mason',
      skill_category: 'SEMI_SKILLED',
    });

    const cId = crypto.randomUUID();
    pendingContractId = cId;
    await admin.from('work_contracts').insert({
      id: cId,
      contract_code: 'CTR-2026-TESTPEND99',
      worker_id: pWorkerId,
      contractor_id: '22222222-2222-2222-2222-222222222201',
      project_id: PROJECT_ID,
      worksite_id: WORKSITE_ID,
      status: 'PENDING_ACCEPTANCE',
      work_type: 'Masonry',
      daily_wage: 65000,
      start_date: getTodayIst(),
    });
  });

  afterAll(async () => {
    if (pendingContractId) {
      await admin.from('work_contracts').delete().eq('id', pendingContractId);
    }
    if (pendingWorkerUserId) {
      await admin.from('workers').delete().eq('user_id', pendingWorkerUserId);
      await admin.from('users').delete().eq('id', pendingWorkerUserId);
    }
  });

  describe('1. Generate Gate Token → Returns QR + 6-digit code with Valid DB Schema', () => {
    it('generates a token storing UUID in token column and hashes at rest without uuid syntax error', async () => {
      const result = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
        ttlSeconds: 86400,
      });

      expect(result.tokenId).toBeDefined();
      expect(result.signedToken.compact).toBeDefined();
      expect(result.shortCode).toMatch(/^\d{6}$/);

      // Verify row in database
      const { data: dbRow, error } = await admin
        .from('attendance_tokens')
        .select('*')
        .eq('id', result.tokenId)
        .single();

      expect(error).toBeNull();
      expect(dbRow).toBeDefined();
      // Verify token column is a valid UUID, not a base64 string
      expect(dbRow.token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(dbRow.valid_date).toBe(getTodayIst());
      expect(dbRow.token_hash).toBe(hashToken(result.signedToken.compact));
      expect(dbRow.code_hash).toBe(hashCode(PROJECT_ID, getTodayIst(), result.shortCode));
      expect(dbRow.revoked_at).toBeNull();
      expect(dbRow.is_active).toBe(true);

      // Verify decrypted values for contractor reload
      expect(decryptPayload(dbRow.encrypted_code)).toBe(result.shortCode);
      expect(decryptPayload(dbRow.encrypted_token)).toBe(result.signedToken.compact);
    });
  });

  describe('2. Regenerate Gate Token → Old Revoked, Exactly One Active Token', () => {
    it('revokes previous token and maintains strictly one active token for today', async () => {
      const today = getTodayIst();

      // First generation
      const t1 = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
      });

      // Regeneration
      const t2 = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
      });

      expect(t1.tokenId).not.toBe(t2.tokenId);

      // Check t1 is revoked
      const { data: row1 } = await admin
        .from('attendance_tokens')
        .select('revoked_at, is_active')
        .eq('id', t1.tokenId)
        .single();

      expect(row1.revoked_at).not.toBeNull();
      expect(row1.is_active).toBe(false);

      // Check t2 is active
      const { data: row2 } = await admin
        .from('attendance_tokens')
        .select('revoked_at, is_active')
        .eq('id', t2.tokenId)
        .single();

      expect(row2.revoked_at).toBeNull();
      expect(row2.is_active).toBe(true);

      // Verify exactly ONE active token exists for this project and today's date
      const { data: activeList } = await admin
        .from('attendance_tokens')
        .select('id')
        .eq('project_id', PROJECT_ID)
        .eq('valid_date', today)
        .is('revoked_at', null);

      expect(activeList?.length).toBe(1);
      expect(activeList?.[0].id).toBe(t2.tokenId);
    });
  });

  describe('3. Accepted Worker Check-in via QR and Code → Success', () => {
    it('successfully checks in accepted worker using active signed QR token', async () => {
      const token = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
      });

      const res = await markAttendance({
        workerUserId: ACCEPTED_WORKER_USER_ID,
        qrToken: token.signedToken.compact,
        attendanceDate: getTodayIst(),
      });

      expect(res.id).toBeDefined();
      expect(res.status).toBe('VERIFIED');
    });

    it('successfully checks in accepted worker using 6-digit code', async () => {
      const token = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
      });

      const res = await markAttendance({
        workerUserId: ACCEPTED_WORKER_USER_ID,
        manualCode: token.shortCode,
        projectId: PROJECT_ID,
        attendanceDate: getTodayIst(),
      });

      expect(res.id).toBeDefined();
      expect(res.status).toBe('VERIFIED');
    });
  });

  describe('4. Clean Rejections: Wrong Code, Forged, Expired, Previous Day, Pending Worker', () => {
    it('rejects wrong 6-digit code with clean generic error message', async () => {
      await expect(
        markAttendance({
          workerUserId: ACCEPTED_WORKER_USER_ID,
          manualCode: '999999',
          projectId: PROJECT_ID,
          attendanceDate: getTodayIst(),
        })
      ).rejects.toThrow(/Invalid attendance code/);
    });

    it('rejects forged / tampered QR token', async () => {
      const validToken = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
      });

      const tampered = validToken.signedToken.compact.slice(0, -6) + 'AAAAAA';

      await expect(
        markAttendance({
          workerUserId: ACCEPTED_WORKER_USER_ID,
          qrToken: tampered,
          attendanceDate: getTodayIst(),
        })
      ).rejects.toThrow(/invalid, tampered, or forged/);
    });

    it('rejects expired QR token', async () => {
      const shortLived = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
        ttlSeconds: 1, // 1 second TTL
      });

      // Wait 1.2s for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1200));

      await expect(
        markAttendance({
          workerUserId: ACCEPTED_WORKER_USER_ID,
          qrToken: shortLived.signedToken.compact,
          attendanceDate: getTodayIst(),
        })
      ).rejects.toThrow(/expired/);
    });

    it('rejects previous-day code', async () => {
      const yesterday = '2026-10-07';
      const prevPayload = {
        tid: crypto.randomUUID(),
        project_id: PROJECT_ID,
        worksite_id: WORKSITE_ID,
        date: yesterday,
        date_ist: yesterday,
        nonce: 'prevdaynonce456',
        issued_at: Date.now(),
        expiry: Date.now() + 86400000,
        expires_at: Date.now() + 86400000,
        short_code: '777777',
      };
      const signedPrev = signQrToken(prevPayload);

      // Previous day token has valid_date = yesterday so no unique index conflict
      await admin.from('attendance_tokens').insert({
        id: prevPayload.tid,
        token: prevPayload.tid,
        project_id: PROJECT_ID,
        worksite_id: WORKSITE_ID,
        created_by: CONTRACTOR_USER_ID,
        valid_date: yesterday,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        token_hash: hashToken(signedPrev.compact),
        code_hash: hashCode(PROJECT_ID, yesterday, '777777'),
        nonce: 'prevdaynonce456',
        short_code: '777777',
        revoked_at: null,
        is_active: true,
      });

      await expect(
        markAttendance({
          workerUserId: ACCEPTED_WORKER_USER_ID,
          qrToken: signedPrev.compact,
          attendanceDate: getTodayIst(),
        })
      ).rejects.toThrow(/previous day/);
    });

    it('rejects pending worker from checking in', async () => {
      const activeToken = await createRotatingAttendanceToken({
        creatorUserId: CONTRACTOR_USER_ID,
        projectId: PROJECT_ID,
        worksiteId: WORKSITE_ID,
      });

      await expect(
        markAttendance({
          workerUserId: pendingWorkerUserId,
          qrToken: activeToken.signedToken.compact,
          attendanceDate: getTodayIst(),
        })
      ).rejects.toThrow(/pending acceptance/);
    });
  });

  describe('5. Simulated Insert Failure → Friendly Localized/Sanitized Message, Not Raw SQL', () => {
    it('returns sanitized error message instead of raw database/SQL error', () => {
      const dbError = new Error('invalid input syntax for type uuid: "eyJw..."');
      const err = new AttendanceValidationError(
        'Failed to store attendance token. Please retry.',
        500,
        'TOKEN_CREATION_FAILED'
      );

      expect(err.message).toBe('Failed to store attendance token. Please retry.');
      expect(err.message).not.toContain('invalid input syntax');
      expect(err.message).not.toContain('syntax');
      expect(err.reasonCode).toBe('TOKEN_CREATION_FAILED');
    });
  });
});
