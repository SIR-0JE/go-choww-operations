import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, SESSION_COOKIE_OPTIONS, createSessionToken } from '@/lib/adminSession';
import {
  clearFailures,
  clientKey,
  createAdminPassword,
  getAdminPasswordHash,
  lockedFor,
  recordFailure,
  setupCodeValid,
} from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/** POST /api/auth/setup { code, password }: choose the password, once, with the setup code */
export async function POST(request: NextRequest) {
  try {
    const key = clientKey(request.headers);
    const wait = lockedFor(key);
    if (wait > 0) {
      return NextResponse.json({ success: false, error: `Too many wrong tries. Try again in ${wait} min.` }, { status: 429 });
    }

    if (await getAdminPasswordHash()) {
      return NextResponse.json({ success: false, error: 'A password is already set. Sign in instead.' }, { status: 409 });
    }

    const { code, password } = await request.json().catch(() => ({ code: '', password: '' }));
    if (typeof code !== 'string' || !setupCodeValid(code)) {
      recordFailure(key);
      return NextResponse.json({ success: false, error: 'That setup code is not right.' }, { status: 401 });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ success: false, error: 'Use at least 8 characters.' }, { status: 400 });
    }

    if (!(await createAdminPassword(password))) {
      return NextResponse.json({ success: false, error: 'A password is already set. Sign in instead.' }, { status: 409 });
    }

    const token = await createSessionToken();
    if (!token) {
      return NextResponse.json({ success: false, error: 'Password saved, but signing in is not available on this server.' }, { status: 500 });
    }
    clearFailures(key);
    const res = NextResponse.json({ success: true });
    res.cookies.set(ADMIN_COOKIE, token, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    console.error('[auth/setup]', err);
    return NextResponse.json({ success: false, error: 'Server is busy. Try again.' }, { status: 503 });
  }
}
