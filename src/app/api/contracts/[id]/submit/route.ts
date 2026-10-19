import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { submitContract } from '@/lib/services/employment-service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const contractId = params.id;
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);

    const contract = await submitContract(contractId, authCtx.user.id);
    return NextResponse.json({ success: true, contract });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: 'SUBMIT_FAILED', message: error.message } }, { status: 400 });
  }
}
