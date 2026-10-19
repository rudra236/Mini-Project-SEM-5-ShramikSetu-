import { NextRequest, NextResponse } from 'next/server';
import { setPasswordWithToken } from '@/lib/auth/unified-auth';
import { z } from 'zod';

const setPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = setPasswordSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: firstIssue?.message || 'Invalid parameters',
            field: firstIssue?.path[0],
          },
        },
        { status: 400 }
      );
    }

    const { token, newPassword } = parsed.data;
    const result = await setPasswordWithToken(token, newPassword);

    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            code: 'SET_PASSWORD_FAILED',
            message: result.error || 'Failed to update password',
          },
        },
        { status: result.statusCode || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully. You can now sign in with your ID and password.',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: err.message || 'Set-password service error',
        },
      },
      { status: 500 }
    );
  }
}
