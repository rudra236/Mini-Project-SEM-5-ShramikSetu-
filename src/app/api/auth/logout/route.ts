import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Signed out successfully' });

  // Clear worker session cookies
  response.cookies.delete('shramiksetu_worker_session');
  response.cookies.delete('shramiksetu_worker_id');

  return response;
}
