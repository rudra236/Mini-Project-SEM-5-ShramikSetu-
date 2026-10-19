import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveApplicableMinimumWage } from '@/lib/compliance/statutory-wages';
import { NotificationService } from '@/lib/services/notification-service';
import { z } from 'zod';

const createContractSchema = z
  .object({
    workerId: z.string().optional(),
    workerLoginId: z.string().optional(), // SS-W-XXXX-XXXXXX or WRK-MH-2026-XXXX login ID
    workerPhone: z.string().optional(),
    projectId: z.string().uuid(),
    worksiteId: z.string().uuid().optional(),
    workType: z.string().min(1),
    dailyWage: z.number().positive(),
    expectedWorkingHours: z.number().positive().default(8.0),
    paymentFrequency: z.enum(['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY']).default('DAILY'),
    startDate: z.string(),
    endDate: z.string().optional(),
    contractorId: z.string().uuid().optional(),
    terms: z.record(z.any()).optional(),
    initialStatus: z.enum(['DRAFT', 'OFFERED', 'PENDING_ACCEPTANCE', 'ACTIVE', 'PENDING', 'PENDING', 'accepted']).default('PENDING'),
    acknowledgeBelowMinimumWage: z.boolean().optional(),
    acknowledgeAboveMaximumWage: z.boolean().optional(),
  })
  .refine((data) => data.workerId || data.workerLoginId || data.workerPhone, {
    message: 'Either workerId, workerLoginId, or workerPhone must be provided',
    path: ['workerLoginId'],
  });

export async function GET(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const adminClient = createAdminClient();
    let query = adminClient.from('work_contracts').select('*, workers(*), contractors(*), projects(*)');

    if (authCtx.user.role === 'WORKER') {
      // Find worker profile by worker id or user id
      const workerId = authCtx.workerProfile?.id;
      if (workerId) {
        query = query.eq('worker_id', workerId);
      } else {
        const { data: w } = await adminClient.from('workers').select('id').eq('user_id', authCtx.user.id).maybeSingle();
        if (w) {
          query = query.eq('worker_id', w.id);
        } else {
          return NextResponse.json({ success: true, contracts: [] });
        }
      }
    } else if (authCtx.user.role === 'CONTRACTOR' && authCtx.contractorProfile) {
      query = query.eq('contractor_id', authCtx.contractorProfile.id);
    } else if (authCtx.user.role === 'SUPERVISOR' && authCtx.supervisorProfile) {
      const { data: assignments } = await adminClient
        .from('supervisor_project_assignments')
        .select('project_id')
        .eq('supervisor_id', authCtx.supervisorProfile.id)
        .eq('is_active', true);

      const projectIds = (assignments || []).map((a: { project_id: string }) => a.project_id);
      query = query.in('project_id', projectIds.length > 0 ? projectIds : ['00000000-0000-0000-0000-000000000000']);
    }

    const { data: contracts, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: { code: 'QUERY_FAILED', message: error.message } }, { status: 400 });
    }

    return NextResponse.json({ success: true, contracts: contracts || [] });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON body' } }, { status: 400 });
    }

    const parsedResult = createContractSchema.safeParse(body);
    if (!parsedResult.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Validation failed', details: parsedResult.error.flatten() } },
        { status: 400 }
      );
    }
    const parsed = parsedResult.data;

    let contractorId: string;
    if (authCtx.user.role === 'CONTRACTOR') {
      if (!authCtx.contractorProfile?.id) {
        return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Contractor profile missing' } }, { status: 403 });
      }
      contractorId = authCtx.contractorProfile.id;
    } else {
      contractorId = parsed.contractorId || (body as any).contractorId;
      if (!contractorId) {
        return NextResponse.json({ error: { code: 'VALIDATION_FAILED', message: 'contractorId required for admin' } }, { status: 400 });
      }
    }

    const adminClient = createAdminClient();

    // 1. Resolve Worker Record in PostgreSQL
    let workerRecord: any = null;
    const term = (parsed.workerLoginId || parsed.workerId || '').trim();

    if (parsed.workerId) {
      const { data } = await adminClient.from('workers').select('*').eq('id', parsed.workerId).maybeSingle();
      workerRecord = data;
      if (!workerRecord) {
        const { data: byUser } = await adminClient.from('workers').select('*').eq('user_id', parsed.workerId).maybeSingle();
        workerRecord = byUser;
      }
    }

    if (!workerRecord && term) {
      // 1a. Try lookup via users.login_id (e.g. SS-W-2026-000001)
      const { data: userByLogin } = await adminClient
        .from('users')
        .select('id')
        .eq('login_id', term)
        .maybeSingle();

      if (userByLogin) {
        const { data: w } = await adminClient.from('workers').select('*').eq('user_id', userByLogin.id).maybeSingle();
        workerRecord = w;
      }

      // 1b. Try lookup via workers table (internal_worker_id or full_name)
      if (!workerRecord) {
        const { data } = await adminClient
          .from('workers')
          .select('*')
          .or(`internal_worker_id.ilike.${term},full_name.ilike.%${term}%`)
          .limit(1)
          .maybeSingle();
        workerRecord = data;
      }
    }

    if (!workerRecord && parsed.workerPhone) {
      const cleanPhone = parsed.workerPhone.replace(/[^\d+]/g, '');
      const { data: userRec } = await adminClient
        .from('users')
        .select('id')
        .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone.replace('+91', '')}`)
        .maybeSingle();

      if (userRec) {
        const { data: w } = await adminClient.from('workers').select('*').eq('user_id', userRec.id).maybeSingle();
        workerRecord = w;
      }
    }

    if (!workerRecord) {
      return NextResponse.json(
        { error: { code: 'WORKER_NOT_FOUND', message: "Worker not found. Enter the worker's SS-W ID or WRK ID from their identity card." } },
        { status: 404 }
      );
    }

    // 2. Resolve Project & Verify Ownership
    const { data: project, error: projectErr } = await adminClient
      .from('projects')
      .select('id, contractor_id, name')
      .eq('id', parsed.projectId)
      .maybeSingle();

    if (projectErr || !project) {
      return NextResponse.json({ error: { code: 'PROJECT_NOT_FOUND', message: 'Project does not exist or access denied.' } }, { status: 404 });
    }

    if (authCtx.user.role === 'CONTRACTOR' && project.contractor_id !== contractorId) {
      throw new AuthorizationError('Access denied. Project does not belong to contractor.', 403);
    }

    // 3. Resolve Worksite
    let worksiteId = parsed.worksiteId;
    if (!worksiteId) {
      const { data: firstWorksite } = await adminClient
        .from('worksites')
        .select('id')
        .eq('project_id', parsed.projectId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!firstWorksite) {
        return NextResponse.json({ error: { code: 'WORKSITE_NOT_FOUND', message: 'Project has no registered worksites.' } }, { status: 404 });
      }
      worksiteId = firstWorksite.id;
    } else {
      const { data: ws } = await adminClient.from('worksites').select('id, project_id').eq('id', worksiteId).maybeSingle();
      if (!ws || ws.project_id !== parsed.projectId) {
        return NextResponse.json({ error: { code: 'INVALID_WORKSITE', message: 'Worksite does not belong to the project.' } }, { status: 400 });
      }
    }

    // 4. Statutory Minimum Wage Verification
    const offeredWagePaise = Math.round(parsed.dailyWage * 100);
    const statutory = await resolveApplicableMinimumWage({
      state: 'Maharashtra',
      skillCategory: workerRecord.skill_category || parsed.workType,
      zone: 'Zone I',
    });

    const minWagePaise = statutory ? statutory.daily_rate_paise : 60638;

    if (offeredWagePaise < minWagePaise && !parsed.acknowledgeBelowMinimumWage) {
      return NextResponse.json(
        {
          error: {
            code: 'WAGE_BELOW_MINIMUM',
            message: `Offered daily wage of ₹${parsed.dailyWage} is below the legal minimum wage of ₹${minWagePaise / 100} for ${statutory?.skill_category || 'this skill tier'}. Explicit contractor acknowledgement required to override.`,
            minWagePaise,
            offeredWagePaise,
            skillCategory: statutory?.skill_category,
            zone: statutory?.zone,
            sourceCitation: statutory?.source_name,
            sourceUrl: statutory?.source_url,
            effectiveFrom: statutory?.effective_from,
            verified: statutory?.verified,
          },
        },
        { status: 422 }
      );
    }

    // 4b. Statutory Maximum Wage Sanity Guard (Catch typos/unit errors e.g. ₹60,000/day instead of ₹600)
    const maxMultiple = parseInt(process.env.MAX_WAGE_MULTIPLE_OF_MIN || '5', 10);
    const maxAllowedWagePaise = minWagePaise * maxMultiple;

    if (offeredWagePaise > maxAllowedWagePaise && !parsed.acknowledgeAboveMaximumWage) {
      return NextResponse.json(
        {
          error: {
            code: 'WAGE_EXCEEDS_MAXIMUM_CAP',
            message: `Offered daily wage of ₹${parsed.dailyWage} exceeds the statutory sanity threshold of ₹${maxAllowedWagePaise / 100} (${maxMultiple}x the minimum wage of ₹${minWagePaise / 100}). Please check for paise/rupee conversion errors or typos.`,
            minWagePaise,
            maxAllowedWagePaise,
            offeredWagePaise,
          },
        },
        { status: 422 }
      );
    }

    // 5. Pre-check Database Concurrency for Active Contract on same Project
    const { data: existingActive } = await adminClient
      .from('work_contracts')
      .select('id')
      .eq('project_id', parsed.projectId)
      .eq('worker_id', workerRecord.id)
      .in('status', ['ACTIVE', 'OFFERED', 'ACCEPTED', 'PENDING_ACCEPTANCE', 'PENDING', 'pending', 'accepted'])
      .maybeSingle();

    if (existingActive) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_ACTIVE_ASSIGNMENT',
            message: 'Worker already has an active or pending contract on this project.',
          },
        },
        { status: 409 }
      );
    }

    // 6. Insert Work Contract into PostgreSQL
    const contractCode = `CTR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();

    const auditTrail = [
      {
        action: 'CONTRACT_CREATED',
        actorId: authCtx.user.id,
        timestamp: now,
        wagePaise: offeredWagePaise,
        minWagePaise,
        overrideAcknowledged: !!parsed.acknowledgeBelowMinimumWage,
      },
    ];

    const { data: newContract, error: insertError } = await adminClient
      .from('work_contracts')
      .insert({
        contract_code: contractCode,
        worker_id: workerRecord.id,
        contractor_id: contractorId,
        project_id: parsed.projectId,
        worksite_id: worksiteId,
        work_type: parsed.workType,
        daily_wage: offeredWagePaise,
        expected_working_hours: parsed.expectedWorkingHours || 8.0,
        payment_frequency: parsed.paymentFrequency || 'DAILY',
        start_date: parsed.startDate,
        end_date: parsed.endDate || null,
        status: parsed.initialStatus || 'PENDING',
        min_wage_override_acknowledged: !!parsed.acknowledgeBelowMinimumWage,
        min_wage_applicable_paise: minWagePaise,
        audit_trail: auditTrail,
      })
      .select('*, workers(*), contractors(*), projects(*)')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_ACTIVE_ASSIGNMENT',
              message: 'Worker already has an active contract on this project.',
            },
          },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: { code: 'INSERT_FAILED', message: insertError.message } }, { status: 400 });
    }

    // 7. Insert Initial Contract Version Snapshot (Version 1)
    try {
      await adminClient.from('contract_versions').insert({
        contract_id: newContract.id,
        version_number: 1,
        daily_wage: offeredWagePaise,
        expected_working_hours: parsed.expectedWorkingHours || 8.0,
        payment_frequency: parsed.paymentFrequency || 'DAILY',
        work_type: parsed.workType,
        effective_date: parsed.startDate,
        change_reason: 'Initial contract creation',
        created_by: authCtx.user.id,
      });
    } catch {
      // Non-blocking versioning failure
    }

    // 8. Audit Logging in Database
    try {
      await adminClient.from('audit_log').insert({
        actor: authCtx.user.id,
        action: 'CONTRACT_ASSIGNED',
        entity_type: 'work_contracts',
        entity_id: newContract.id,
        after: {
          contract_code: contractCode,
          worker_id: workerRecord.id,
          project_id: parsed.projectId,
          daily_wage: offeredWagePaise,
          min_wage_override: !!parsed.acknowledgeBelowMinimumWage,
        },
      });
    } catch {
      // Non-blocking audit failure
    }

    // 9. Send Notification to Worker
    if (workerRecord.user_id) {
      try {
        await NotificationService.createNotification({
          userId: workerRecord.user_id,
          role: 'WORKER',
          type: 'ASSIGNMENT_INVITE',
          title: `Project Assignment Offer: ${project.name}`,
          message: `You have received a project assignment invitation for ${parsed.workType} at ₹${parsed.dailyWage}/day. Please accept or reject.`,
          titleKey: 'notifications.assignment_invite_title',
          bodyKey: 'notifications.assignment_invite_body',
          payload: {
            contractId: newContract.id,
            projectId: parsed.projectId,
            projectName: project.name,
            dailyWage: parsed.dailyWage,
            workType: parsed.workType,
          },
        });
      } catch {
        // Non-blocking notification failure
      }
    }

    return NextResponse.json({ success: true, contract: newContract }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: { code: error.code || 'SERVER_ERROR', message: error.message || 'Server error' } },
      { status: error.statusCode || 500 }
    );
  }
}
