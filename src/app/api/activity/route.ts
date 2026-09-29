import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const FINISHED = ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled', 'Canceled', 'canceled'];
const ON_THE_WAY = ['In Transit', 'in transit'];

const lagosTodayStart = (now: Date) => {
  const key = new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
  return new Date(Date.parse(`${key}T00:00:00Z`) - LAGOS_OFFSET_MS);
};

/**
 * GET /api/activity
 *   -> { activities (last 24h, newest first), live: { inPool, accepted, onTheWay, deliveredToday, riders[] } }
 * GET /api/activity?unreadSince=<ISO>
 *   -> { unread } : how many rider/new-order events happened after that time (for the sidebar badge)
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const unreadSince = request.nextUrl.searchParams.get('unreadSince');
    if (unreadSince !== null) {
      const since = new Date(unreadSince);
      const from = isNaN(since.getTime()) ? new Date(now.getTime() - DAY_MS) : since;
      const unread = await prisma.riderActivity.count({ where: { createdAt: { gt: from } } });
      return NextResponse.json({ success: true, unread });
    }

    const todayStart = lagosTodayStart(now);
    const [activities, open, deliveredToday, riders] = await Promise.all([
      prisma.riderActivity.findMany({
        where: { createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
        orderBy: { createdAt: 'desc' },
        take: 300,
      }),
      // Everything not finished: unassigned = in the pool, assigned = with a rider
      prisma.deliveryOrder.findMany({
        where: { orderStatus: { notIn: FINISHED } },
        select: { riderId: true, orderStatus: true, deliveryType: true },
      }),
      prisma.deliveryOrder.groupBy({
        by: ['riderId'],
        where: {
          riderId: { not: null },
          orderStatus: { in: ['Delivered', 'Completed', 'delivered', 'completed'] },
          createdAt: { gte: todayStart },
        },
        _count: { _all: true },
      }),
      prisma.rider.findMany({
        where: { status: { in: ['Active', 'active'] } },
        select: { id: true, name: true, isOnline: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const perRider = new Map<string, { accepted: number; onTheWay: number; deliveredToday: number }>();
    const bucket = (id: string) => {
      if (!perRider.has(id)) perRider.set(id, { accepted: 0, onTheWay: 0, deliveredToday: 0 });
      return perRider.get(id)!;
    };

    let inPool = 0;
    let accepted = 0;
    let onTheWay = 0;
    for (const o of open) {
      if (!o.riderId) {
        // Pick-ups never go to riders
        if (!(o.deliveryType || '').toLowerCase().includes('pick')) inPool++;
      } else if (ON_THE_WAY.includes(o.orderStatus)) {
        onTheWay++;
        bucket(o.riderId).onTheWay++;
      } else {
        accepted++;
        bucket(o.riderId).accepted++;
      }
    }
    let delivered = 0;
    for (const d of deliveredToday) {
      if (!d.riderId) continue;
      delivered += d._count._all;
      bucket(d.riderId).deliveredToday += d._count._all;
    }

    return NextResponse.json({
      success: true,
      activities: activities.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      live: {
        inPool,
        accepted,
        onTheWay,
        deliveredToday: delivered,
        riders: riders.map((r) => ({ ...r, ...(perRider.get(r.id) || { accepted: 0, onTheWay: 0, deliveredToday: 0 }) })),
      },
    });
  } catch (err) {
    console.error('[GET /api/activity]', err);
    return NextResponse.json({ success: false, error: 'Could not load activity.' }, { status: 503 });
  }
}
