import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { createContractVersion } from '@/lib/services/employment-service';
import { z } from 'zod';

const createVersionSchema = z.object({
  dailyWage: z.number().positive().optional(),
  expectedWorkingHours: z.number().positive().optional(),
  paymentFrequency: z.enum(['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY']).optional(),
  workType: z.string().optional(),
  effectiveDate: z.string(),
  changeReason: z.string().min(1, 'Change reason is required'),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const contractId = params.id;
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);

    const body = await req.json();
    const parsed = createVersionSchema.parse(body);

    const result = await createContractVersion(contractId, authCtx.user.id, {
      dailyWage: parsed.dailyWage,
      expectedWorkingHours: parsed.expectedWorkingHours,
      paymentFrequency: parsed.paymentFrequency,
      workType: parsed.workType,
      effectiveDate: parsed.effectiveDate,
      changeReason: parsed.changeReason,
    });

    return NextResponse.json({ success: true, contract: result.contract, version: result.version });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'VERSIONING_FAILED', message: error.message } }, { status: 400 });
  }
}
