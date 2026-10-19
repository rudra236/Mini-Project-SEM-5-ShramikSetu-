import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { syncOfflineAttendanceEvent, SyncEngineError } from '@/lib/services/sync-service';

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['WORKER', 'ADMIN']);
    const body = await req.json();

    // Support single event payload or array batch of payloads
    const eventsToSync = Array.isArray(body) ? body : body.events ? body.events : [body];

    const results = [];
    for (const evt of eventsToSync) {
      if (!evt.eventUuid || !evt.tokenUuid) {
        return NextResponse.json(
          { error: { code: 'INVALID_PAYLOAD', message: 'eventUuid and tokenUuid are required for sync.' } },
          { status: 400 }
        );
      }

      const result = await syncOfflineAttendanceEvent({
        workerUserId: authCtx.user.id,
        eventUuid: evt.eventUuid,
        tokenUuid: evt.tokenUuid,
        workerLatitude: Number(evt.workerLatitude),
        workerLongitude: Number(evt.workerLongitude),
        attendanceDate: evt.attendanceDate,
        timestamp: evt.timestamp,
      });

      results.push(result);
    }

    const isBatch = Array.isArray(body) || Array.isArray(body?.events);
    if (isBatch) {
      return NextResponse.json({ success: true, count: results.length, results });
    } else {
      const singleResult = results[0];
      const statusCode = singleResult.status === 'REJECTED' ? 422 : 200;
      return NextResponse.json({ success: singleResult.success, result: singleResult }, { status: statusCode });
    }
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    if (error instanceof SyncEngineError) {
      return NextResponse.json({ error: { code: error.reasonCode, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message || 'Failed to sync offline attendance event.' } }, { status: 500 });
  }
}
