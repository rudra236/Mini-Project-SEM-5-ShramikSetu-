import { NextResponse, type NextRequest } from 'next/server';
import { verifySessionAsync } from '@/lib/auth/session-token';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Session Extraction from Cookies
  let sessionUser: { role: string; userId: string; loginId?: string } | null = null;

  const unifiedToken = request.cookies.get('shramiksetu_session')?.value;
  if (unifiedToken) {
    const verified = await verifySessionAsync(unifiedToken);
    if (verified) {
      sessionUser = { role: verified.role, userId: verified.userId, loginId: verified.loginId };
    }
  }

  // Legacy fallback for worker session cookie
  if (!sessionUser) {
    const workerToken = request.cookies.get('shramiksetu_worker_session')?.value;
    if (workerToken) {
      const verifiedWorker = await verifySessionAsync(workerToken);
      if (verifiedWorker) {
        sessionUser = { role: verifiedWorker.role || 'WORKER', userId: verifiedWorker.userId, loginId: verifiedWorker.loginId };
      }
    }
  }

  // Route rewrites for dispute endpoints
  if (pathname === '/worker/disputes' && request.method === 'POST') {
    return NextResponse.rewrite(new URL('/api/worker/disputes', request.url));
  }
  const contractorRespondMatch = pathname.match(/^\/contractor\/disputes\/([^/]+)\/respond$/);
  if (contractorRespondMatch && request.method === 'POST') {
    return NextResponse.rewrite(new URL(`/api/contractor/disputes/${contractorRespondMatch[1]}/respond`, request.url));
  }

  const isApiRequest = pathname.startsWith('/api/');

  // 2. Worker Routes Protection (/worker/* and /api/workers/*)
  const isWorkerRoute = pathname.startsWith('/worker') || pathname.startsWith('/api/workers');
  if (isWorkerRoute) {
    if (!sessionUser) {
      if (isApiRequest) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required. Please sign in as a worker.' } },
          { status: 401 }
        );
      }
      const loginUrl = new URL('/signin', request.url);
      loginUrl.searchParams.set('role', 'worker');
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (sessionUser.role !== 'WORKER' && sessionUser.role !== 'ADMIN') {
      if (isApiRequest) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Access denied. Worker role required.' } },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/contractor', request.url));
    }
  }

  // 3. Contractor Routes Protection (/contractor/* and /api/contractors/*)
  const isContractorRoute = pathname.startsWith('/contractor') || pathname.startsWith('/api/contractors');
  if (isContractorRoute) {
    if (!sessionUser) {
      if (isApiRequest) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required. Please sign in as a contractor.' } },
          { status: 401 }
        );
      }
      const loginUrl = new URL('/signin', request.url);
      loginUrl.searchParams.set('role', 'contractor');
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    if (sessionUser.role !== 'CONTRACTOR' && sessionUser.role !== 'ADMIN') {
      if (isApiRequest) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Access denied. Contractor role required.' } },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/worker', request.url));
    }
  }

  // 4. Inspector Routes Protection (/inspector/*)
  if (pathname.startsWith('/inspector')) {
    if (!sessionUser) {
      const loginUrl = new URL('/signin', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (sessionUser.role !== 'INSTITUTIONAL_USER' && sessionUser.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 5. Admin Routes Protection (/admin/* and /api/admin/*)
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (!sessionUser) {
      if (isApiRequest) {
        return NextResponse.json(
          { error: { code: 'UNAUTHORIZED', message: 'Admin authentication required.' } },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL('/signin', request.url));
    }
    if (sessionUser.role !== 'ADMIN') {
      if (isApiRequest) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Admin role required.' } },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // 6. Public Auth Pages: Allow users to access /signin, /login, /register freely
  // No forced redirect away so users can switch accounts or sign in without being bounced back.

  const response = NextResponse.next({ request });

  // Baseline Security Headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static images (.svg, .png, .jpg, .jpeg, .gif, .webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
