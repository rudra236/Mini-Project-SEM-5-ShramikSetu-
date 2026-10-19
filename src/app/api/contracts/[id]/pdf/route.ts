import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { generateBilingualContractPdf } from '@/lib/services/contract-pdf-service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuthenticatedUser();
    const contractId = params.id;

    const pdfBuffer = await generateBilingualContractPdf(contractId);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ShramikSetu_Contract_${contractId.slice(0, 8)}.pdf"`,
      },
    });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: { code: 'PDF_GENERATION_FAILED', message: error.message || 'Failed to generate contract PDF' } },
      { status: error.statusCode || 500 }
    );
  }
}
