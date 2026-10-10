import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/adminSession';

/**
 * Everything is locked behind the admin sign-in except what has its own way in or
 * must work with nobody signed in:
 *  - the rider app and rep app (their own phone + PIN sign-in) and their data
 *  - push sign-up used by those apps
 *  - the background order sync (the scheduled job calls it with no cookie)
 *  - the sign-in page itself, and static files
 */
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',
  '/rider',
  '/api/rider',
  '/collector',
  '/api/collector',
  '/rep',
  '/api/notifications',
  '/api/sync-orders',
  '/api/sync',
  '/_next',
  '/icons',
];
const PUBLIC_FILES = ['/favicon.ico', '/manifest.json', '/sw.js', '/robots.txt'];

// Matches whole path segments, so /api/collectors (admin side) is NOT covered by /api/collector
const isPublic = (path: string) =>
  PUBLIC_FILES.includes(path) || PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Emergency off-switch: set ADMIN_AUTH_DISABLED=1 in the host's environment settings and redeploy
  if (process.env.ADMIN_AUTH_DISABLED === '1') return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  if (await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ success: false, error: 'Please sign in.', unauthorized: true }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' || pathname === '/dashboard' ? '' : `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
