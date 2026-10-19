import { NextRequest } from 'next/server';
import { GET as apiGet } from '@/app/api/disputes/[id]/report.pdf/route';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  return apiGet(request, context);
}
