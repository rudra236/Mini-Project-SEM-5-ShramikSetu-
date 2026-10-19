import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeDailyMerkleAnchor } from '@/lib/services/integrity-service';
import { z } from 'zod';

const anchorSchema = z.object({
  anchorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
  publishExternal: z.boolean().optional().default(true),
});

/**
 * POST /api/audit/anchor
 * Computes a Merkle root of the day's entries and stores it in the append-only `anchors` table.
 */
export async function POST(req: NextRequest) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = anchorSchema.parse(body);

    const targetDate = parsed.anchorDate || new Date().toISOString().split('T')[0];

    const anchor = await computeDailyMerkleAnchor(targetDate, {
      publishExternal: parsed.publishExternal,
    });

    return NextResponse.json({
      success: true,
      message: `Merkle anchor created and anchored for ${targetDate}`,
      anchor,
    });
  } catch (err: any) {
    console.error('[POST /api/audit/anchor] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to compute daily anchor' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/audit/anchor
 * Fetches anchors from the append-only `anchors` table.
 */
export async function GET(req: NextRequest) {
  try {
    const adminClient = createAdminClient();
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get('limit')) || 20, 100);

    const { data: anchors, error } = await adminClient
      .from('anchors')
      .select('*')
      .order('anchor_date', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      anchors: anchors || [],
    });
  } catch (err: any) {
    console.error('[GET /api/audit/anchor] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
