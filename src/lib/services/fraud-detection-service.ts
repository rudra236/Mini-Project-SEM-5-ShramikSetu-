/**
 * SHRAMIKSETU ANTI-FRAUD DETECTION ENGINE
 *
 * Detects and flags suspicious attendance punches:
 * 1. Mock location detection (Android `isMockLocation` / iOS jailbreak indicators)
 * 2. Impossible travel: if a worker punches at two sites too far apart in too little time
 * 3. Device sharing: many workers punching from an identical device fingerprint
 * 4. GPS accuracy degradation: accuracy > threshold means unreliable position
 *
 * Philosophy: FLAG, don't silently reject. Flagged punches go to supervisor review queue.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { calculateHaversineDistance } from '@/lib/geo/haversine';

export interface FraudFlag {
  type: 'MOCK_LOCATION' | 'IMPOSSIBLE_TRAVEL' | 'DEVICE_SHARING' | 'LOW_GPS_ACCURACY' | 'DUPLICATE_NONCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string;
  metadata?: Record<string, unknown>;
}

export interface FraudCheckInput {
  workerId: string;
  projectId: string;
  worksiteId: string;
  latitude: number;
  longitude: number;
  gpsAccuracyMeters?: number;
  mockLocationFlag?: boolean;
  deviceFingerprint?: string;
  capturedAt?: string; // ISO timestamp
  punchDate: string; // YYYY-MM-DD
}

// Maximum average human travel speed: 120 km/h = 33.33 m/s
const MAX_TRAVEL_SPEED_MPS = 33.33;

// GPS accuracy threshold: above this, flag as unreliable
const GPS_ACCURACY_THRESHOLD_METERS = 50;

// Device sharing threshold: if >= N different workers used same device same day
const DEVICE_SHARING_THRESHOLD = 3;

/**
 * Run all anti-fraud checks against a punch attempt.
 * Returns an array of fraud flags (empty = clean).
 */
export async function detectFraud(input: FraudCheckInput): Promise<FraudFlag[]> {
  const flags: FraudFlag[] = [];

  // 1. Mock location detection
  if (input.mockLocationFlag) {
    flags.push({
      type: 'MOCK_LOCATION',
      severity: 'CRITICAL',
      details: 'Device reported mock/spoofed GPS location.',
    });
  }

  // 2. GPS accuracy check
  if (input.gpsAccuracyMeters !== undefined && input.gpsAccuracyMeters > GPS_ACCURACY_THRESHOLD_METERS) {
    flags.push({
      type: 'LOW_GPS_ACCURACY',
      severity: 'MEDIUM',
      details: `GPS accuracy ${input.gpsAccuracyMeters.toFixed(1)}m exceeds threshold of ${GPS_ACCURACY_THRESHOLD_METERS}m.`,
      metadata: { accuracy: input.gpsAccuracyMeters, threshold: GPS_ACCURACY_THRESHOLD_METERS },
    });
  }

  // 3. Impossible travel check
  try {
    const travelFlag = await checkImpossibleTravel(input);
    if (travelFlag) {
      flags.push(travelFlag);
    }
  } catch {
    // Non-blocking: if travel check fails, don't block the punch
  }

  // 4. Device sharing check
  if (input.deviceFingerprint) {
    try {
      const sharingFlag = await checkDeviceSharing(input);
      if (sharingFlag) {
        flags.push(sharingFlag);
      }
    } catch {
      // Non-blocking
    }
  }

  return flags;
}

/**
 * Check if the worker has punched at another site impossibly quickly.
 * Compares against the most recent attendance event for this worker today.
 */
async function checkImpossibleTravel(input: FraudCheckInput): Promise<FraudFlag | null> {
  const adminClient = createAdminClient();

  const { data: recentPunches } = await adminClient
    .from('attendance_events')
    .select('worker_latitude, worker_longitude, created_at, project_id, worksite_id')
    .eq('worker_id', input.workerId)
    .eq('date', input.punchDate)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!recentPunches || recentPunches.length === 0) {
    return null;
  }

  const lastPunch = recentPunches[0];

  // Same worksite? No travel issue
  if (lastPunch.worksite_id === input.worksiteId) {
    return null;
  }

  const distanceMeters = calculateHaversineDistance(
    Number(lastPunch.worker_latitude),
    Number(lastPunch.worker_longitude),
    input.latitude,
    input.longitude
  );

  const lastPunchTime = new Date(lastPunch.created_at).getTime();
  const currentTime = input.capturedAt
    ? new Date(input.capturedAt).getTime()
    : Date.now();
  const elapsedSeconds = Math.abs(currentTime - lastPunchTime) / 1000;

  if (elapsedSeconds <= 0) {
    return null;
  }

  const requiredSpeedMps = distanceMeters / elapsedSeconds;

  if (requiredSpeedMps > MAX_TRAVEL_SPEED_MPS) {
    return {
      type: 'IMPOSSIBLE_TRAVEL',
      severity: 'HIGH',
      details: `Worker would need to travel ${(distanceMeters / 1000).toFixed(1)}km in ${Math.round(elapsedSeconds / 60)} minutes (${(requiredSpeedMps * 3.6).toFixed(0)} km/h required).`,
      metadata: {
        distanceMeters: Math.round(distanceMeters),
        elapsedSeconds: Math.round(elapsedSeconds),
        requiredSpeedKmh: Math.round(requiredSpeedMps * 3.6),
        previousProjectId: lastPunch.project_id,
      },
    };
  }

  return null;
}

/**
 * Check if too many different workers are punching from the same device.
 * This suggests a single phone being used to batch-punch multiple workers.
 */
async function checkDeviceSharing(input: FraudCheckInput): Promise<FraudFlag | null> {
  if (!input.deviceFingerprint) return null;

  const adminClient = createAdminClient();

  const { data: devicePunches } = await adminClient
    .from('attendance_events')
    .select('worker_id')
    .eq('device_fingerprint', input.deviceFingerprint)
    .eq('date', input.punchDate);

  if (!devicePunches) return null;

  // Count distinct workers who already punched from this device today
  const distinctWorkers = new Set(devicePunches.map((p: { worker_id: string }) => p.worker_id));
  // Add current worker
  distinctWorkers.add(input.workerId);

  if (distinctWorkers.size >= DEVICE_SHARING_THRESHOLD) {
    return {
      type: 'DEVICE_SHARING',
      severity: 'HIGH',
      details: `${distinctWorkers.size} different workers have punched from the same device today (threshold: ${DEVICE_SHARING_THRESHOLD}).`,
      metadata: {
        deviceFingerprint: input.deviceFingerprint,
        workerCount: distinctWorkers.size,
        threshold: DEVICE_SHARING_THRESHOLD,
      },
    };
  }

  return null;
}

/**
 * Calculate the overall severity from a list of fraud flags.
 * Returns the highest severity found.
 */
export function getMaxSeverity(flags: FraudFlag[]): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  const severityOrder = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
  let max = 0;
  for (const flag of flags) {
    const val = severityOrder[flag.severity] || 0;
    if (val > max) max = val;
  }
  const reverseMap = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  return reverseMap[max];
}
