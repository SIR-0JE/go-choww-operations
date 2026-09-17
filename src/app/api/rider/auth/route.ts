import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryRiders } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

function normalizePhone(p: string): string {
  if (!p) return '';
  const digits = p.replace(/\D/g, '');
  if (digits.startsWith('234') && digits.length >= 13) {
    return '0' + digits.slice(3);
  }
  return digits;
}

/**
 * POST /api/rider/auth - Login rider with Phone + 4-digit PIN
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, pin } = body;

    if (!phone || !pin) {
      return NextResponse.json(
        { success: false, error: 'Phone number and 4-digit PIN are required.' },
        { status: 400 }
      );
    }

    const cleanInputPhone = normalizePhone(phone);
    const cleanPin = String(pin).trim();

    let rider: any = null;

    try {
      // Find rider in database
      const allRiders = await prisma.rider.findMany();
      rider = allRiders.find((r) => {
        const storedClean = normalizePhone(r.phone || '');
        return storedClean === cleanInputPhone || (r.phone && r.phone.replace(/\D/g, '').includes(cleanInputPhone));
      });
    } catch {
      // Fallback in memory
      const memRiders = getInMemoryRiders();
      rider = memRiders.find((r) => {
        const storedClean = normalizePhone(r.phone || '');
        return storedClean === cleanInputPhone;
      });
    }

    if (!rider) {
      return NextResponse.json(
        {
          success: false,
          error: 'No rider registered with this phone number. Please contact your operations admin.',
        },
        { status: 404 }
      );
    }

    if (rider.status && rider.status.toLowerCase() !== 'active') {
      return NextResponse.json(
        {
          success: false,
          error: `Account is currently ${rider.status}. Please contact operations.`,
        },
        { status: 403 }
      );
    }

    // Check PIN (default is '1234')
    const storedPin = String(rider.pin || '1234').trim();
    if (storedPin !== cleanPin) {
      return NextResponse.json(
        { success: false, error: 'Incorrect 4-digit PIN. Please try again.' },
        { status: 401 }
      );
    }

    // Auto set rider online on login
    try {
      await prisma.rider.update({
        where: { id: rider.id },
        data: { isOnline: true },
      });
      rider.isOnline = true;
    } catch {
      // ignore if mock
    }

    // Set secure cookie
    const sessionData = JSON.stringify({
      id: rider.id,
      name: rider.name,
      phone: rider.phone,
    });

    const cookieStore = await cookies();
    cookieStore.set('rider_session', sessionData, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year persistent login
    });

    return NextResponse.json({
      success: true,
      rider: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        isOnline: rider.isOnline ?? true,
      },
    });
  } catch (error: any) {
    console.error('[Rider Auth Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Login failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/rider/auth - Check current session
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('rider_session');
    let session: any = null;

    if (sessionCookie?.value) {
      try {
        session = JSON.parse(sessionCookie.value);
      } catch {
        // ignore
      }
    }

    const headerRiderId = request.headers.get('x-rider-id');
    const riderId = session?.id || headerRiderId;

    if (!riderId) {
      return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
    }

    let rider: any = null;

    try {
      rider = await prisma.rider.findUnique({
        where: { id: riderId },
        select: {
          id: true,
          name: true,
          phone: true,
          status: true,
          isOnline: true,
        },
      });
    } catch {
      rider = session || { id: riderId, name: 'Rider', phone: '', isOnline: true, status: 'Active' };
    }

    if (!rider) {
      rider = session || { id: riderId, name: 'Rider', phone: '', isOnline: true, status: 'Active' };
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      rider,
    });
  } catch {
    return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
  }
}

/**
 * DELETE /api/rider/auth - Logout
 */
export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('rider_session');

    if (sessionCookie?.value) {
      try {
        const session = JSON.parse(sessionCookie.value);
        // Set offline on logout
        await prisma.rider.update({
          where: { id: session.id },
          data: { isOnline: false },
        });
      } catch {
        // ignore
      }
    }

    cookieStore.delete('rider_session');
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
