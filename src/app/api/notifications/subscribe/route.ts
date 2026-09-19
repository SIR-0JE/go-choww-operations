import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint, keys, userType = 'admin', riderId } = body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return NextResponse.json(
        { success: false, error: 'Invalid push subscription payload' },
        { status: 400 }
      );
    }

    // Upsert subscription in database with fallback
    let subscription: any = null;
    try {
      subscription = await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          userType: userType || 'admin',
          riderId: riderId || null,
          updatedAt: new Date(),
        },
        create: {
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userType: userType || 'admin',
          riderId: riderId || null,
        },
      });
    } catch (dbErr) {
      console.warn('Database pool busy, storing subscription in memory fallback:', dbErr);
      const { saveInMemorySubscription } = await import('@/lib/prisma');
      subscription = saveInMemorySubscription({
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userType,
        riderId,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Subscribed to phone push notifications successfully',
      subscriptionId: subscription?.id || 'active',
    });
  } catch (error: any) {
    console.error('Push subscribe error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save subscription' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { endpoint } = body;

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint },
    });

    return NextResponse.json({
      success: true,
      message: 'Unsubscribed from push notifications',
    });
  } catch (error: any) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}
