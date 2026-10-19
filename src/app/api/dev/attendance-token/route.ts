import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRotatingAttendanceToken } from '@/lib/services/attendance-service';

export async function GET(req: NextRequest) {
  const isDemo =
    process.env.DEMO_MODE === 'true' ||
    process.env.ENABLE_DEV_AUTH === 'true' ||
    process.env.NODE_ENV !== 'production';

  if (!isDemo) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Demo mode is disabled' } },
      { status: 403 }
    );
  }

  try {
    const adminClient = createAdminClient();

    // Look for active worksite
    let { data: worksite } = await adminClient
      .from('worksites')
      .select('*, projects(*)')
      .limit(1)
      .maybeSingle();

    if (!worksite) {
      let { data: project } = await adminClient.from('projects').select('*').limit(1).maybeSingle();
      if (!project) {
        let { data: contractor } = await adminClient.from('contractors').select('*').limit(1).maybeSingle();
        if (!contractor) {
          const { data: newContractor } = await adminClient
            .from('contractors')
            .upsert({
              id: '22222222-2222-2222-2222-222222222201',
              user_id: '11111111-1111-1111-1111-111111111100',
              full_name: 'Metro Rail Infra Corp',
              company_name: 'Metro Rail Infra Corp',
              license_number: 'LIC-MH-2026-0981',
            })
            .select()
            .single();
          contractor = newContractor;
        }

        const { data: newProj } = await adminClient
          .from('projects')
          .upsert({
            id: '66666666-6666-6666-6666-666666666601',
            contractor_id: contractor?.id || '22222222-2222-2222-2222-222222222201',
            name: 'Mumbai Metro Line 4 - Thane Extension',
            start_date: '2026-01-01',
            status: 'ACTIVE',
          })
          .select()
          .single();
        project = newProj;
      }

      const { data: newWorksite } = await adminClient
        .from('worksites')
        .upsert({
          id: '77777777-7777-7777-7777-777777777701',
          project_id: project!.id,
          name: 'Ghodbunder Road Station Pier 14',
          address: 'Ghodbunder Road Station Pier 14',
          city: 'Thane',
          state: 'Maharashtra',
          latitude: 19.26123,
          longitude: 72.96445,
          allowed_radius_meters: 250,
        })
        .select('*, projects(*)')
        .single();
      worksite = newWorksite;
    }

    const creatorId = worksite?.projects?.contractor_id || '00000000-0000-0000-0000-000000000000';
    const tokenResult = await createRotatingAttendanceToken({
      creatorUserId: creatorId,
      projectId: worksite!.project_id,
      worksiteId: worksite!.id,
      ttlSeconds: 300,
    });

    return NextResponse.json({
      success: true,
      project: worksite?.projects || { id: worksite!.project_id, name: 'Metro Line 4' },
      worksite: {
        id: worksite!.id,
        name: worksite!.name,
        allowedRadiusMeters: worksite!.allowed_radius_meters,
      },
      qrToken: tokenResult.signedToken.compact,
      shortCode: tokenResult.shortCode,
      expiresAt: tokenResult.expiresAt,
      ttlSeconds: tokenResult.ttlSeconds,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: { code: 'TOKEN_GENERATION_FAILED', message: err.message } },
      { status: 500 }
    );
  }
}
