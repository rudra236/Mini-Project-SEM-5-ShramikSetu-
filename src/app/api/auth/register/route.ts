import { NextRequest, NextResponse } from 'next/server';
import { registerUser } from '@/lib/auth/unified-auth';
import { z } from 'zod';

const registerSchema = z.object({
  role: z.enum(['WORKER', 'CONTRACTOR'], {
    errorMap: () => ({ message: 'Public registration allows only WORKER or CONTRACTOR roles' }),
  }),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  fullName: z.string().optional(),
  phone: z.string().optional(),
  occupation: z.string().optional(),
  skillCategory: z.enum(['UNSKILLED', 'SEMI_SKILLED', 'SKILLED', 'HIGHLY_SKILLED']).optional(),
  emergencyContact: z.string().optional(),
  companyName: z.string().optional(),
  licenseNumber: z.string().optional(),
  locale: z.enum(['en', 'hi', 'mr']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: firstIssue?.message || 'Invalid registration parameters',
            field: firstIssue?.path[0],
          },
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const result = await registerUser({
      role: data.role,
      password: data.password,
      fullName: data.fullName || '',
      phone: data.phone,
      occupation: data.occupation,
      skillCategory: data.skillCategory,
      emergencyContact: data.emergencyContact,
      companyName: data.companyName,
      licenseNumber: data.licenseNumber,
      locale: data.locale,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: {
            code: 'REGISTRATION_FAILED',
            message: result.error || 'Failed to register account',
            field: result.field,
          },
        },
        { status: result.statusCode || 400 }
      );
    }

    const redirectPath = data.role === 'WORKER' ? '/worker' : '/contractor';
    const response = NextResponse.json({
      success: true,
      id: result.id,
      loginId: result.loginId,
      role: data.role,
      user: result.user,
      profile: result.profile,
      redirect: redirectPath,
    });

    const isProduction = process.env.NODE_ENV === 'production';
    const cookieMaxAge = 7 * 24 * 60 * 60; // 7 days

    response.cookies.set({
      name: 'shramiksetu_session',
      value: result.sessionToken!,
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: cookieMaxAge,
    });

    if (data.role === 'WORKER') {
      response.cookies.set({
        name: 'shramiksetu_worker_session',
        value: result.sessionToken!,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: cookieMaxAge,
      });
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: err.message || 'Registration service error',
        },
      },
      { status: 500 }
    );
  }
}
