import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuthenticatedUser, requireProjectAccess, AuthorizationError } from '@/lib/auth/authorization';
import {
  getProjectCounts,
  getContractorCounts,
  getWorkerCounts,
  getUnreadNotificationCount,
} from '@/lib/services/counts-service';

export async function GET(req: NextRequest) {
  const reqId = crypto.randomUUID();
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope');
    const projectId = searchParams.get('projectId');

    // 1. Project-scoped counts
    if (projectId || scope === 'project') {
      if (!projectId) {
        return NextResponse.json(
          { error: { code: 'INVALID_PARAMETERS', message: 'projectId is required for project scope.' } },
          { status: 400 }
        );
      }

      await requireProjectAccess(projectId);
      const counts = await getProjectCounts(projectId);
      return NextResponse.json({ success: true, scope: 'project', counts });
    }

    // 2. Contractor-scoped counts
    if (scope === 'contractor' || authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile) {
        return NextResponse.json(
          { error: { code: 'PROFILE_MISSING', message: 'Contractor profile required.' } },
          { status: 403 }
        );
      }
      const counts = await getContractorCounts(authCtx.contractorProfile.id);
      const unreadNotifications = await getUnreadNotificationCount(authCtx.user.id);
      return NextResponse.json({ success: true, scope: 'contractor', counts, unreadNotifications });
    }

    // 3. Worker-scoped counts
    if (scope === 'worker' || authCtx.user.role === 'WORKER') {
      if (!authCtx.workerProfile) {
        return NextResponse.json(
          { error: { code: 'PROFILE_MISSING', message: 'Worker profile required.' } },
          { status: 403 }
        );
      }
      const counts = await getWorkerCounts(authCtx.workerProfile.id, authCtx.user.id);
      return NextResponse.json({ success: true, scope: 'worker', counts });
    }

    // 4. Default / Notification counts
    const unreadNotifications = await getUnreadNotificationCount(authCtx.user.id);
    return NextResponse.json({ success: true, scope: 'user', unreadNotifications });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: err.message } },
        { status: err.statusCode }
      );
    }
    console.error(`[REQUEST_ID: ${reqId}] Counts route error:`, err);
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Failed to retrieve counts. Please retry.' } },
      { status: 500 }
    );
  }
}
