import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { ReminderService } from '@/lib/services/reminder-service';
import { Logger } from '@/lib/observability/logger';

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const reminders = await ReminderService.getUserReminders(authCtx.user.id);
    return NextResponse.json({ success: true, reminders });
  } catch (error: any) {
    Logger.error('GET /api/reminders', 'REMINDERS_FETCH_ERROR', error);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: error.statusCode || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const body = await req.json();
    if (!body.type || !body.dueAt) {
      return NextResponse.json({ error: { code: 'INVALID_INPUT', message: 'type and dueAt are required' } }, { status: 400 });
    }

    const reminder = await ReminderService.createReminder({
      userId: authCtx.user.id,
      contractId: body.contractId,
      projectId: body.projectId,
      type: body.type,
      dueAt: new Date(body.dueAt),
      payload: body.payload,
    });

    return NextResponse.json({ success: true, reminder }, { status: 201 });
  } catch (error: any) {
    Logger.error('POST /api/reminders', 'REMINDER_CREATE_ERROR', error);
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: error.statusCode || 500 });
  }
}
