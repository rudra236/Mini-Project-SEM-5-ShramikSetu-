import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess, requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createWorksite } from '@/lib/services/employment-service';
import { z } from 'zod';

const createWorksiteSchema = z.object({
  name: z.string().min(1, 'Worksite name is required'),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  allowedRadiusMeters: z.number().positive().default(100.0),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  pincode: z.string().nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);

    await requireProjectAccess(projectId);
    const body = await req.json();
    const parsed = createWorksiteSchema.parse(body);

    const worksite = await createWorksite(authCtx.user.id, {
      projectId,
      name: parsed.name,
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      allowedRadiusMeters: parsed.allowedRadiusMeters,
      address: parsed.address,
      city: parsed.city,
      state: parsed.state,
      pincode: parsed.pincode,
    });

    return NextResponse.json({ success: true, worksite }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'WORKSITE_CREATION_FAILED', message: error.message } }, { status: 400 });
  }
}
