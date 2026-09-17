import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('rider_session');
    let riderId: string | null = null;

    if (sessionCookie?.value) {
      try {
        const parsed = JSON.parse(sessionCookie.value);
        riderId = parsed.id;
      } catch {
        // ignore
      }
    }

    if (!riderId) {
      riderId = request.headers.get('x-rider-id');
    }

    if (!riderId) {
      return NextResponse.json({ success: false, error: 'Unauthorized rider' }, { status: 401 });
    }

    const body = await request.json();
    const { isOnline } = body;

    const updated = await prisma.rider.update({
      where: { id: riderId },
      data: { isOnline: Boolean(isOnline) },
      select: {
        id: true,
        name: true,
        isOnline: true,
      },
    });

    return NextResponse.json({
      success: true,
      isOnline: updated.isOnline,
      message: updated.isOnline ? 'You are now Online and ready for orders!' : 'You are now Offline.',
    });
  } catch (error: any) {
    console.error('[Rider Status Update Error]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update status' }, { status: 500 });
  }
}
