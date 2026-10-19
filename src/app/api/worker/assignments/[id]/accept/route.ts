import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { respondToContract } from '@/lib/services/employment-service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const contractId = params.id;
    const authCtx = await requireRole(['WORKER', 'ADMIN']);

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await respondToContract(contractId, authCtx.user.id, 'ACCEPTED', {
      ipAddress,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      contract: result.contract,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: error.code || 'ACCEPT_FAILED', message: error.message } }, { status: error.statusCode || 400 });
  }
}
