import { NextRequest } from 'next/server';
import { GET as disputesGet, POST as disputesPost } from '@/app/api/disputes/route';

export async function GET(request: NextRequest) {
  return disputesGet(request);
}

export async function POST(request: NextRequest) {
  return disputesPost(request);
}
