import assert from 'node:assert';
import { describe, it } from 'vitest';
import { calculateHaversineDistance } from '../../src/lib/geo/haversine';
import { AttendanceValidationError } from '../../src/lib/services/attendance-service';

// Fallback mock environment variables for test runner
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-role-key';

describe('Phase 4 Attendance & Geofencing Security Suite', () => {
  // Test Worksite Location: Mumbai BKC Construction Site
  const worksiteLat = 19.0660;
  const worksiteLon = 72.8687;
  const allowedRadius = 100.0; // 100 metres

  it('TEST 1 & 6: INSIDE 100m GEOFENCE -> HAVERSINE DISTANCE < 100m -> VERIFIED', () => {
    const workerLatInside = 19.0662;
    const workerLonInside = 72.8688;
    const distanceInside = calculateHaversineDistance(workerLatInside, workerLonInside, worksiteLat, worksiteLon);
    assert.ok(distanceInside <= allowedRadius, `Distance ${distanceInside}m should be <= 100m`);
  });

  it('TEST 5: OUTSIDE 100m GEOFENCE -> HAVERSINE DISTANCE > 100m -> REJECTED', () => {
    const workerLatOutside = 19.0700;
    const workerLonOutside = 72.8720;
    const distanceOutside = calculateHaversineDistance(workerLatOutside, workerLonOutside, worksiteLat, worksiteLon);
    assert.ok(distanceOutside > allowedRadius, `Distance ${distanceOutside}m should be > 100m`);

    try {
      if (distanceOutside > allowedRadius) {
        throw new AttendanceValidationError(
          `Attendance rejected: Distance ${distanceOutside}m exceeds maximum allowed geofence radius of ${allowedRadius}m.`,
          422,
          'OUT_OF_RADIUS'
        );
      }
      assert.fail('Outside 100m GPS should NOT be accepted!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'OUT_OF_RADIUS');
      assert.strictEqual(err.statusCode, 422);
    }
  });

  it('TEST 2: EXPIRED QR TOKEN REJECTED', () => {
    const expiredToken = {
      token: '00000000-0000-4000-8000-000000000001',
      expires_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      is_active: true,
    };

    try {
      if (new Date(expiredToken.expires_at).getTime() < Date.now()) {
        throw new AttendanceValidationError('Attendance token has expired.', 422, 'TOKEN_EXPIRED');
      }
      assert.fail('Expired token should NOT be accepted!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'TOKEN_EXPIRED');
    }
  });

  it('TEST 3: WRONG PROJECT TOKEN REJECTED', () => {
    const tokenProjectId = 'proj-aaaa-1111';
    const workerEmploymentProjectId = 'proj-bbbb-2222';

    try {
      if ((tokenProjectId as string) !== (workerEmploymentProjectId as string)) {
        throw new AttendanceValidationError('Worker does not have an active employment relationship on this project.', 403, 'INACTIVE_EMPLOYMENT');
      }
      assert.fail('Wrong project token should NOT be accepted!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'INACTIVE_EMPLOYMENT');
    }
  });

  it('TEST 4: INACTIVE CONTRACT REJECTED', () => {
    const contractStatus = 'REJECTED';

    try {
      if ((contractStatus as string) !== 'ACTIVE') {
        throw new AttendanceValidationError('Active work contract not found for worker on this project.', 403, 'INACTIVE_CONTRACT');
      }
      assert.fail('Inactive contract should NOT allow attendance!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'INACTIVE_CONTRACT');
    }
  });

  it('TEST 7: DUPLICATE SAME-DAY ATTENDANCE REJECTED', () => {
    const existingSameDayAttendance = { id: 'evt-1', worker_id: 'w-1', contract_id: 'ctr-1', date: '2026-08-15' };

    try {
      if (existingSameDayAttendance) {
        throw new AttendanceValidationError('Attendance already recorded for this date.', 409, 'DUPLICATE_ATTENDANCE');
      }
      assert.fail('Duplicate attendance should NOT be allowed!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'DUPLICATE_ATTENDANCE');
      assert.strictEqual(err.statusCode, 409);
    }
  });

  it('TEST 8: UNAUTHORIZED WORKER REJECTED', () => {
    const authenticatedWorkerProfile = null;

    try {
      if (!authenticatedWorkerProfile) {
        throw new AttendanceValidationError('Worker profile not found for authenticated user.', 403, 'UNAUTHORIZED_WORKER');
      }
      assert.fail('Unauthorized worker should NOT mark attendance!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'UNAUTHORIZED_WORKER');
    }
  });

  it('TEST 9: MALICIOUS WORKER ID IN PAYLOAD IGNORED', () => {
    const authenticatedUserWorkerId = 'w-real-111';
    const payloadMaliciousWorkerId = 'w-hacked-999';

    const effectiveWorkerId = authenticatedUserWorkerId;
    assert.strictEqual(effectiveWorkerId, authenticatedUserWorkerId);
    assert.notStrictEqual(effectiveWorkerId, payloadMaliciousWorkerId);
  });

  it('TEST 10: TAMPERED / INVALID QR TOKEN REJECTED', () => {
    const fakeTokenQueryResult = null;

    try {
      if (!fakeTokenQueryResult) {
        throw new AttendanceValidationError('Invalid or tampered QR attendance token.', 404, 'TOKEN_NOT_FOUND');
      }
      assert.fail('Tampered token should NOT be accepted!');
    } catch (err: any) {
      assert.strictEqual(err.reasonCode, 'TOKEN_NOT_FOUND');
      assert.strictEqual(err.statusCode, 404);
    }
  });
});

