import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { createMinimumWageRule, ComplianceEngineError } from '@/lib/services/compliance-engine';

/**
 * GET /api/compliance/rules
 * Fetch active minimum wage rules.
 */
export async function GET(request: NextRequest) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state');
    const skillLevel = searchParams.get('skillLevel');

    const adminClient = createAdminClient();
    let query = adminClient
      .from('minimum_wage_rules')
      .select('*')
      .eq('is_active', true)
      .order('effective_from', { ascending: false });

    if (state) query = query.eq('state', state);
    if (skillLevel) query = query.eq('skill_level', skillLevel as any);

    const { data: rules, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, rules }, { status: 200 });
  } catch (err: unknown) {
    console.error('[GET /api/compliance/rules] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/compliance/rules
 * Register a new versioned minimum wage rule.
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const rule = await createMinimumWageRule({
      state: body.state,
      district: body.district ?? null,
      workerCategory: body.workerCategory ?? null,
      skillLevel: body.skillLevel,
      wageType: body.wageType ?? 'DAILY',
      minimumAmountPaise: body.minimumAmountPaise,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
      sourceReference: body.sourceReference,
      version: body.version ?? 1,
    });

    return NextResponse.json({ success: true, rule }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ComplianceEngineError) {
      return NextResponse.json(
        { error: err.message, code: err.reasonCode },
        { status: err.statusCode }
      );
    }
    console.error('[POST /api/compliance/rules] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
