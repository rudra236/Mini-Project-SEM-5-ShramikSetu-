import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { logSensitiveOperation } from '@/lib/auth/audit';
import { z } from 'zod';

const followupActionSchema = z.object({
  followUpId: z.string(),
  action: z.enum(['NOTICE_SENT', 'RESOLVED', 'ESCALATED', 'DISMISSED']),
  notes: z.string().optional(),
});

/**
 * POST /api/compliance/followup
 * Updates follow-up queue item status with audit logging.
 */
export async function POST(req: NextRequest) {
  try {
    let user: any;
    try {
      const authCtx = await requireAuthenticatedUser();
      user = authCtx.user;
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parsed = followupActionSchema.parse(body);

    await logSensitiveOperation({
      actorId: user.id,
      action: `ENFORCEMENT_FOLLOWUP_${parsed.action}`,
      entityType: 'compliance_followups',
      entityId: parsed.followUpId,
      afterState: {
        action: parsed.action,
        notes: parsed.notes,
        updatedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Follow-up action recorded: ${parsed.action}`,
      followUpId: parsed.followUpId,
      status: parsed.action,
    });
  } catch (err: any) {
    console.error('[POST /api/compliance/followup] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to update follow-up item' },
      { status: 500 }
    );
  }
}
