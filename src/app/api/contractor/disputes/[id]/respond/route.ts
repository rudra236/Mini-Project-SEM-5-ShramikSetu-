import { NextRequest } from 'next/server';
import { POST as respondPost } from '@/app/api/disputes/[id]/respond/route';

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  return respondPost(request, context);
}
