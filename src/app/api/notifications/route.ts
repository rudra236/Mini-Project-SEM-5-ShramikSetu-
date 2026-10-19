import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { NotificationService } from '@/lib/services/notification-service';
import { Logger } from '@/lib/observability/logger';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const unreadOnly = searchParams.get('unread') === 'true';
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    // ── Dev-mode: Supabase not available, return empty notifications ──
    const isLocalDev = process.env.SUPABASE_SERVICE_ROLE_KEY?.includes('local_dev');
    if (isLocalDev) {
      return NextResponse.json({ success: true, notifications: [] });
    }

    const notifications = await NotificationService.getUserNotifications(authCtx.user.id, {
      unreadOnly,
      limit,
    });

    return NextResponse.json({ success: true, notifications });
  } catch (error: any) {
    Logger.error('GET /api/notifications', 'NOTIFICATIONS_FETCH_ERROR', error);
    // Return empty instead of 500 to prevent UI breakage
    return NextResponse.json({ success: true, notifications: [] });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const body = await req.json();
    if (!body.notificationId) {
      return NextResponse.json({ error: { code: 'MISSING_NOTIFICATION_ID', message: 'Notification ID is required' } }, { status: 400 });
    }

    const updated = await NotificationService.markAsRead(body.notificationId, authCtx.user.id);
    if (!updated) {
      return NextResponse.json({ error: { code: 'UPDATE_FAILED', message: 'Notification not found or access denied' } }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    Logger.error('PATCH /api/notifications', 'NOTIFICATION_UPDATE_ERROR', error);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: error.statusCode || 500 });
  }
}
