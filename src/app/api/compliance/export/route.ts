import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth/authorization';
import {
  getFullEnforcementOverview,
  generateStatutoryAuditCsv,
  generateStatutoryAuditPdf,
  EnforcementFilters,
} from '@/lib/services/enforcement-service';

/**
 * GET /api/compliance/export?format=csv|pdf&state=...&district=...
 *
 * Exports official statutory labour inspection audit reports in CSV or PDF.
 */
export async function GET(req: NextRequest) {
  try {
    try {
      await requireAuthenticatedUser();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'csv').toLowerCase();

    const filters: EnforcementFilters = {
      state: searchParams.get('state') || undefined,
      district: searchParams.get('district') || undefined,
      riskLevel: (searchParams.get('riskLevel') as any) || undefined,
      contractorId: searchParams.get('contractorId') || undefined,
    };

    const overview = await getFullEnforcementOverview(filters);
    const dateStr = new Date().toISOString().split('T')[0];

    if (format === 'pdf') {
      const pdfBuffer = await generateStatutoryAuditPdf(overview);
      return new NextResponse(pdfBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="statutory-labour-audit-${dateStr}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
        },
      });
    }

    // Default to CSV
    const csvContent = generateStatutoryAuditCsv(overview);
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="statutory-labour-audit-${dateStr}.csv"`,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/compliance/export] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to export statutory audit report' },
      { status: 500 }
    );
  }
}
