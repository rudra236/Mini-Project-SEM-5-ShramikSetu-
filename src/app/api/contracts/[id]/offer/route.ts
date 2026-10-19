import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthorizationError } from '@/lib/auth/authorization';
import { offerContract } from '@/lib/services/employment-service';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authCtx = await requireRole(['CONTRACTOR', 'ADMIN']);
    const contractId = params.id;

    const result = await offerContract(contractId, authCtx.user.id);

    return NextResponse.json({
      success: true,
      contract: result,
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: { code: error.code || 'OFFER_FAILED', message: error.message } },
      { status: error.statusCode || 400 }
    );
  }
}
