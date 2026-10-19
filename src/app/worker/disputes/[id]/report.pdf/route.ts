import { NextRequest } from 'next/server';
import { GET as apiGetReportPdf } from '@/app/api/disputes/[id]/report.pdf/route';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  return apiGetReportPdf(request, context);
}
