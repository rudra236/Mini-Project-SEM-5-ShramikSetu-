import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { cancelAssignment } from '@/lib/services/employment-service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const contractId = params.id;
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);

    const result = await cancelAssignment(contractId, authCtx.user.id);

    return NextResponse.json({
      success: true,
      contract: result.contract,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: error.code || 'CANCEL_FAILED', message: error.message } }, { status: error.statusCode || 400 });
  }
}
