import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: 'Signed out successfully',
  });

  // Expire and clear all session cookies
  const cookieOptions = {
    path: '/',
    maxAge: 0,
    expires: new Date(0),
    httpOnly: true,
    sameSite: 'lax' as const,
  };

  response.cookies.set('shramiksetu_session', '', cookieOptions);
  response.cookies.set('shramiksetu_worker_session', '', cookieOptions);
  response.cookies.set('shramiksetu_worker_id', '', cookieOptions);

  return response;
}
