import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const LOCATION_FRESH_FOR_ONLINE_MS = 3 * 60 * 1000;

async function handleStatusUpdate(request: NextRequest) {
  try {
    let riderId: string | null = null;

    // 1. Try session cookie
    try {
      const cookieStore = await cookies();
      const sessionCookie = cookieStore.get('rider_session');
      if (sessionCookie?.value) {
        const parsed = JSON.parse(sessionCookie.value);
        riderId = parsed.id || null;
      }
    } catch {
      // ignore
    }

    // 2. Try header
    if (!riderId) {
      riderId = request.headers.get('x-rider-id');
    }

    // Parse body
    const body = await request.json().catch(() => ({}));
    const { isOnline } = body;

    // 3. Try body riderId fallback
    if (!riderId && body.riderId) {
      riderId = String(body.riderId).trim();
    }

    if (!riderId) {
      return NextResponse.json({ success: false, error: 'Unauthorized rider session' }, { status: 401 });
    }

    // Going online requires a location from the phone in the last few minutes,
    // so the dispatch map never shows an online rider it cannot place.
    if (Boolean(isOnline)) {
      const current = await prisma.rider.findUnique({
        where: { id: riderId },
        select: { lastLocationAt: true },
      });
      const fresh =
        current?.lastLocationAt && Date.now() - new Date(current.lastLocationAt).getTime() <= LOCATION_FRESH_FOR_ONLINE_MS;
      if (!fresh) {
        return NextResponse.json(
          { success: false, needsLocation: true, error: 'Turn on your location to go online.' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: {
        isOnline: Boolean(isOnline),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        isOnline: true,
        status: true,
        assignedCafeterias: true,
      },
    });

    // Update cookie if session cookie exists
    try {
      const cookieStore = await cookies();
      cookieStore.set('rider_session', JSON.stringify(updated), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 days
      });
    } catch {
      // ignore
    }

    return NextResponse.json({
      success: true,
      isOnline: updated.isOnline,
      rider: updated,
      message: updated.isOnline ? 'You are now Online and ready for orders!' : 'You are now Offline.',
    });
  } catch (error: any) {
    console.error('[Rider Status Update Error]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update status' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handleStatusUpdate(request);
}

export async function PATCH(request: NextRequest) {
  return handleStatusUpdate(request);
}

