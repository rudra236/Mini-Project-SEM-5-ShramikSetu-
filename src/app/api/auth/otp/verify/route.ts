import { NextResponse } from 'next/server';

/**
 * DEPRECATED: Phone/OTP login has been replaced by unified ID + Password authentication.
 * Attendance OTP verification remains active under /api/attendance/mark.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: 'AUTH_METHOD_DEPRECATED',
        message: 'Phone/OTP verification has been discontinued. Please use your ShramikSetu ID and password at /auth/signin or /api/auth/signin.',
      },
    },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    {
      error: {
        code: 'AUTH_METHOD_DEPRECATED',
        message: 'Phone/OTP verification has been discontinued. Please use your ShramikSetu ID and password at /auth/signin or /api/auth/signin.',
      },
    },
    { status: 410 }
  );
}
