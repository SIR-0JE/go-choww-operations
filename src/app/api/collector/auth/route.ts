import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { normalizePhone } from '@/lib/collectors';

export const dynamic = 'force-dynamic';

/** POST /api/collector/auth: sign in with phone + 4-digit PIN (same as riders) */
export async function POST(request: NextRequest) {
  try {
    const { phone, pin } = await request.json();
    if (!phone || !pin) {
      return NextResponse.json({ success: false, error: 'Phone number and PIN are required.' }, { status: 400 });
    }
    const input = normalizePhone(String(phone));
    const all = await prisma.collector.findMany();
    const collector = all.find((c) => normalizePhone(c.phone) === input);
    if (!collector) {
      return NextResponse.json({ success: false, error: 'No rep registered with this phone number.' }, { status: 404 });
    }
    if (collector.status !== 'Active') {
      return NextResponse.json({ success: false, error: 'This account is switched off. Please contact operations.' }, { status: 403 });
    }
    if (String(collector.pin).trim() !== String(pin).trim()) {
      return NextResponse.json({ success: false, error: 'Incorrect PIN. Please try again.' }, { status: 401 });
    }
    const session = { id: collector.id, name: collector.name, pointName: collector.pointName };
    (await cookies()).set('collector_session', JSON.stringify(session), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return NextResponse.json({ success: true, collector: session });
  } catch (err: any) {
    console.error('[Rep auth]', err);
    return NextResponse.json({ success: false, error: 'Could not sign in. Please try again.' }, { status: 503 });
  }
}

/** DELETE /api/collector/auth: sign out */
export async function DELETE() {
  (await cookies()).delete('collector_session');
  return NextResponse.json({ success: true });
}
