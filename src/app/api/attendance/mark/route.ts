import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { markAttendance, AttendanceValidationError } from '@/lib/services/attendance-service';
import { z } from 'zod';

const markAttendanceSchema = z.object({
  qrToken: z.string().optional(),
  manualCode: z.string().length(6, 'Manual code must be exactly 6 digits').optional(),
  projectId: z.string().uuid().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  gpsAccuracyMeters: z.number().nonnegative().optional(),
  mockLocationFlag: z.boolean().optional(),
  deviceFingerprint: z.string().optional(),
  punchType: z.enum(['IN', 'OUT']).default('IN'),
  capturedAt: z.string().optional(),
  idempotencyKey: z.string().optional(),
  date: z.string().optional(),
}).refine(
  (data) => data.qrToken || data.manualCode,
  { message: 'Either qrToken (from QR scan) or manualCode (6-digit code) is required.' }
);

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['WORKER', 'ADMIN']);
    const body = await req.json();
    const parsed = markAttendanceSchema.parse(body);

    const result = await markAttendance({
      workerUserId: authCtx.user.id,
      qrToken: parsed.qrToken,
      manualCode: parsed.manualCode,
      projectId: parsed.projectId,
      workerLatitude: parsed.latitude,
      workerLongitude: parsed.longitude,
      gpsAccuracyMeters: parsed.gpsAccuracyMeters,
      mockLocationFlag: parsed.mockLocationFlag,
      deviceFingerprint: parsed.deviceFingerprint,
      punchType: parsed.punchType,
      capturedAt: parsed.capturedAt,
      idempotencyKey: parsed.idempotencyKey,
    });

    return NextResponse.json({
      success: true,
      attendanceEvent: result,
      hasFraudFlags: (result as any).hasFraudFlags,
      fraudFlagCount: (result as any).fraudFlags?.length || 0,
      fraudFlags: (result as any).fraudFlags || [],
      requiresReview: (result as any).reviewStatus !== 'NONE',
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    if (error instanceof AttendanceValidationError) {
      return NextResponse.json(
        {
          error: {
            code: error.reasonCode,
            message: error.message,
            calculatedDistanceMeters: (error as any).calculatedDistanceMeters,
            allowedRadiusMeters: (error as any).allowedRadiusMeters,
          },
        },
        { status: error.statusCode }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: error.errors[0]?.message || 'Invalid input' } },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: { code: 'ATTENDANCE_FAILED', message: error.message } }, { status: 400 });
  }
}
