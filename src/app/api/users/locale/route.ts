import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const updateLocaleSchema = z.object({
  locale: z.enum(['en', 'hi', 'mr']),
});

export async function POST(req: NextRequest) {
  try {
    const authCtx = await requireAuthenticatedUser();
    const body = await req.json();
    const parsed = updateLocaleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_FAILED', message: 'Valid locale (en, hi, mr) is required' } },
        { status: 400 }
      );
    }

    const { locale } = parsed.data;
    const admin = createAdminClient();

    const { error: userErr } = await admin
      .from('users')
      .update({ locale })
      .eq('id', authCtx.user.id);

    if (userErr) {
      return NextResponse.json(
        { error: { code: 'UPDATE_FAILED', message: userErr.message } },
        { status: 500 }
      );
    }

    await admin
      .from('profiles')
      .update({ locale })
      .eq('id', authCtx.user.id);

    const response = NextResponse.json({
      success: true,
      locale,
      message: 'User language preference persisted to database.',
    });

    response.cookies.set('shramiksetu_locale', locale, {
      path: '/',
      maxAge: 31536000,
      sameSite: 'lax',
    });

    return response;
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: err.message } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: err.message || 'Internal server error' } },
      { status: 500 }
    );
  }
}
