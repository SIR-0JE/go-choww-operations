import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, SESSION_COOKIE_OPTIONS, createSessionToken } from '@/lib/adminSession';
import { clearFailures, clientKey, getAdminPasswordHash, lockedFor, recordFailure, verifyPassword } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/login { password } */
export async function POST(request: NextRequest) {
  try {
    const key = clientKey(request.headers);
    const wait = lockedFor(key);
    if (wait > 0) {
      return NextResponse.json({ success: false, error: `Too many wrong tries. Try again in ${wait} min.` }, { status: 429 });
    }

    const { password } = await request.json().catch(() => ({ password: '' }));
    const stored = await getAdminPasswordHash();
    if (!stored) {
      return NextResponse.json({ success: false, error: 'No password is set up yet.', needsSetup: true }, { status: 409 });
    }
    if (typeof password !== 'string' || !password || !(await verifyPassword(password, stored))) {
      recordFailure(key);
      return NextResponse.json({ success: false, error: 'Wrong password.' }, { status: 401 });
    }

    const token = await createSessionToken();
    if (!token) {
      return NextResponse.json({ success: false, error: 'Sign-in is not available on this server. Contact support.' }, { status: 500 });
    }
    clearFailures(key);
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    console.error('[auth/login]', err);
    return NextResponse.json({ success: false, error: 'Server is busy. Try again.' }, { status: 503 });
  }
}
