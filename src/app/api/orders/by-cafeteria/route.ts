import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { effectiveGochowStatus, isPickup } from '@/lib/orderStatus';

export const dynamic = 'force-dynamic';

const GOCHOW_STATUSES = ['Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'] as const;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

type Row = {
  cafeteria: string;
  total: number;
  noRider: number;
  byStatus: Record<string, number>;
};

/**
 * GET /api/orders/by-cafeteria?date=YYYY-MM-DD (Lagos day; defaults to today)
 * For each cafeteria: total orders that day, how many are at each GoChow status,
 * and how many (not cancelled) have no rider on our side.
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const todayKey = new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
    const param = request.nextUrl.searchParams.get('date') || '';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : todayKey;
    const start = new Date(Date.parse(`${day}T00:00:00Z`) - LAGOS_OFFSET_MS);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const orders = await prisma.deliveryOrder.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { cafeteriaName: true, gochowStatus: true, orderStatus: true, riderId: true, deliveryType: true },
    });

    const emptyCounts = () => Object.fromEntries(GOCHOW_STATUSES.map((s) => [s, 0])) as Record<string, number>;
    const rows = new Map<string, Row>();
    const totals: Row = { cafeteria: 'All cafeterias', total: 0, noRider: 0, byStatus: emptyCounts() };

    for (const o of orders) {
      const name = (o.cafeteriaName || 'Unknown').trim();
      const key = name.toLowerCase();
      if (!rows.has(key)) rows.set(key, { cafeteria: name, total: 0, noRider: 0, byStatus: emptyCounts() });
      const row = rows.get(key)!;
      const own = (o.orderStatus || '').toLowerCase();
      const status = effectiveGochowStatus(o);
      const cancelled = status === 'Cancelled' || own.startsWith('canc');
      for (const r of [row, totals]) {
        r.total++;
        r.byStatus[status] = (r.byStatus[status] || 0) + 1;
        if (!o.riderId && !cancelled && !isPickup(o.deliveryType)) r.noRider++;
      }
    }

    return NextResponse.json({
      success: true,
      date: day,
      isToday: day === todayKey,
      statuses: GOCHOW_STATUSES,
      totals,
      cafeterias: Array.from(rows.values()).sort((a, b) => b.total - a.total || a.cafeteria.localeCompare(b.cafeteria)),
    });
  } catch (err) {
    console.error('[GET /api/orders/by-cafeteria]', err);
    return NextResponse.json({ success: false, error: 'Could not load cafeteria summary.' }, { status: 503 });
  }
}
