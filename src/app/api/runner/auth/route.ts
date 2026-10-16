import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/collectors';
import { RUNNER_COOKIE, RUNNER_COOKIE_OPTIONS, createRunnerToken, getRunnerFromCookies } from '@/lib/runners';

export const dynamic = 'force-dynamic';

/** POST /api/runner/auth: sign in with phone + 4-digit PIN */
export async function POST(request: NextRequest) {
  try {
    const { phone, pin } = await request.json();
    if (!phone || !pin) return NextResponse.json({ success: false, error: 'Phone number and PIN are required.' }, { status: 400 });

    const input = normalizePhone(String(phone));
    const runner = (await prisma.runner.findMany()).find((r) => normalizePhone(r.phone) === input);
    if (!runner) return NextResponse.json({ success: false, error: 'No runner registered with this phone number.' }, { status: 404 });
    if (runner.status !== 'Active') return NextResponse.json({ success: false, error: 'This account is switched off. Please contact operations.' }, { status: 403 });
    if (String(runner.pin).trim() !== String(pin).trim()) return NextResponse.json({ success: false, error: 'Incorrect PIN. Please try again.' }, { status: 401 });

    const token = await createRunnerToken(runner.id);
    if (!token) return NextResponse.json({ success: false, error: 'Sign-in is not available right now. Contact operations.' }, { status: 500 });
    (await cookies()).set(RUNNER_COOKIE, token, RUNNER_COOKIE_OPTIONS);
    return NextResponse.json({ success: true, runner: { id: runner.id, name: runner.name, cafeteria: runner.cafeteria } });
  } catch (err) {
    console.error('[Runner auth]', err);
    return NextResponse.json({ success: false, error: 'Could not sign in. Please try again.' }, { status: 503 });
  }
}

/** GET /api/runner/auth: who is signed in (also used by the phone app for push sign-up) */
export async function GET() {
  try {
    const runner = await getRunnerFromCookies();
    if (!runner) return NextResponse.json({ success: false }, { status: 401 });
    return NextResponse.json({ success: true, runner: { id: runner.id, name: runner.name, cafeteria: runner.cafeteria } });
  } catch {
    return NextResponse.json({ success: false }, { status: 503 });
  }
}

/** DELETE /api/runner/auth: sign out */
export async function DELETE() {
  (await cookies()).delete(RUNNER_COOKIE);
  return NextResponse.json({ success: true });
}
