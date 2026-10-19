import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/auth/unified-auth';
import { z } from 'zod';

const signinSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['WORKER', 'CONTRACTOR'], {
    errorMap: () => ({ message: 'Role must be either WORKER or CONTRACTOR' }),
  }),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = signinSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: firstIssue?.message || 'Invalid input parameters',
            field: firstIssue?.path[0],
          },
        },
        { status: 400 }
      );
    }

    const { id, password, role } = parsed.data;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
               req.headers.get('x-real-ip')?.trim() ||
               '127.0.0.1';

    const authResult = await authenticateUser({
      idInput: id,
      passwordInput: password,
      roleInput: role,
      ipAddress: ip,
    });

    if (!authResult.success) {
      return NextResponse.json(
        {
          error: {
            code: authResult.statusCode === 429 ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
            message: authResult.error || 'Invalid ID or password.',
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

    const redirectPath = role === 'WORKER' ? '/worker' : '/contractor';
    const res = NextResponse.json({
      success: true,
      user: authResult.user,
      profile: authResult.profile,
      role: authResult.role,
      redirect: redirectPath,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60; // 7 days

    // Set unified session cookie
    res.cookies.set({
      name: 'shramiksetu_session',
      value: authResult.sessionToken!,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: cookieMaxAge,
    });

    // Also set shramiksetu_worker_session if role is WORKER for legacy compatibility
    if (role === 'WORKER') {
      res.cookies.set({
        name: 'shramiksetu_worker_session',
        value: authResult.sessionToken!,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: cookieMaxAge,
      });
    }

    return res;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: err.message || 'Authentication service error',
        },
      },
      { status: 500 }
    );
  }
}
