import { NextResponse } from 'next/server';
import { requireAuthenticatedUser, AuthorizationError } from '@/lib/auth/authorization';

export async function GET() {
  try {
    const authCtx = await requireAuthenticatedUser();

    const profile =
      authCtx.workerProfile ||
      authCtx.contractorProfile ||
      authCtx.supervisorProfile ||
      authCtx.institutionalProfile ||
      null;

    return NextResponse.json({
      success: true,
      authUserId: authCtx.authUserId,
      user: authCtx.user,
      role: authCtx.user.role,
      profile,
      profiles: {
        worker: authCtx.workerProfile,
        contractor: authCtx.contractorProfile,
        supervisor: authCtx.supervisorProfile,
        institutionalUser: authCtx.institutionalProfile,
      },
    });
  } catch (err: any) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: err.message || 'Authentication required',
          },
        },
        { status: err.statusCode || 401 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: err.message || 'Failed to fetch session profile',
        },
      },
      { status: 500 }
    );
  }
}
