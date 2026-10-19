import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import {
  getAllStatutoryMinimumWages,
  resolveApplicableMinimumWage,
} from '@/lib/compliance/statutory-wages';

const minimumWageSchema = z.object({
  skillTier: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED']),
  region: z.string().min(1),
  effectiveDate: z.string(),
  minimumWagePaise: z.number().positive(),
  sourceCitation: z.string().min(3),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedUser();
    const { searchParams } = new URL(req.url);
    const stateParam = searchParams.get('state') || undefined;
    const skillParam = searchParams.get('skillCategory') || searchParams.get('skillTier') || undefined;
    const zoneParam = searchParams.get('zone') || undefined;

    let applicable = null;
    if (skillParam) {
      applicable = await resolveApplicableMinimumWage({
        state: stateParam,
        skillCategory: skillParam,
        zone: zoneParam,
      });
    }

    const wages = await getAllStatutoryMinimumWages();

    return NextResponse.json({
      success: true,
      minimumWages: wages,
      applicableMinimumWage: applicable,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(['ADMIN', 'INSTITUTIONAL_USER']);
    const body = await req.json();
    const parsed = minimumWageSchema.parse(body);

    const adminClient = createAdminClient();
    const { data: inserted, error } = await adminClient
      .from('minimum_wages')
      .insert({
        skill_tier: parsed.skillTier,
        region: parsed.region,
        effective_date: parsed.effectiveDate,
        minimum_wage_paise: parsed.minimumWagePaise,
        source_citation: parsed.sourceCitation,
        is_active: parsed.isActive,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: { code: 'INSERT_FAILED', message: error.message } }, { status: 400 });
    }

    return NextResponse.json({ success: true, minimumWage: inserted }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'VALIDATION_FAILED', message: error.message } }, { status: 400 });
  }
}
