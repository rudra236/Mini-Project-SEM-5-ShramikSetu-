import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { respondToContract } from '@/lib/services/employment-service';
import { z } from 'zod';

const respondContractSchema = z.object({
  response: z.enum(['ACCEPTED', 'REJECTED']),
  rejectionReason: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const contractId = params.id;
    const authCtx = await requireRole(['WORKER', 'ADMIN']);

    const body = await req.json();
    const parsed = respondContractSchema.parse(body);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await respondToContract(contractId, authCtx.user.id, parsed.response, {
      rejectionReason: parsed.rejectionReason,
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      contract: result.contract,
      acceptance: result.acceptance,
      employmentRelationship: result.employmentRelationship,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'RESPONSE_FAILED', message: error.message } }, { status: 400 });
  }
}
