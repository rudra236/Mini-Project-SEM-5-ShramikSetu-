import { NextRequest, NextResponse } from 'next/server';
import { loginWorkerWithCredentials } from '@/lib/auth/worker-auth';
import { z } from 'zod';

const workerLoginSchema = z.object({
  workerId: z.string().min(1, 'Worker ID is required'),
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = workerLoginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Worker ID and password are required',
          },
        },
        { status: 400 }
      );
    }

    const { workerId, password } = parsed.data;
    const authResult = await loginWorkerWithCredentials(workerId, password);

    if (!authResult.success) {
      return NextResponse.json(
        {
          error: {
            code: authResult.statusCode === 429 ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
            message: authResult.error || 'Invalid Worker ID or password.',
            retryAfterSeconds: authResult.retryAfterSeconds,
          },
        },
        {
          status: authResult.statusCode || 401,
          headers: authResult.retryAfterSeconds
            ? { 'Retry-After': String(authResult.retryAfterSeconds) }
            : undefined,
        }
      );
    }

    const res = NextResponse.json({
      success: true,
      user: authResult.user,
      profile: authResult.profile,
      redirect: '/worker',
    });

    // Set signed worker session cookie (HTTP-only, Secure in production)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookies.set({
      name: 'shramiksetu_worker_session',
      value: authResult.sessionToken,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return res;
  } catch (error: any) {
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: error.message || 'Worker login failed',
        },
      },
      { status: 500 }
    );
  }
}
