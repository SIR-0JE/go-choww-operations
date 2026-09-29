import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  COLLECTOR_ORDER_SELECT,
  collectorPhase,
  getCollectorSettings,
  isCollectorModeActive,
  validateCollector,
} from '@/lib/collectors';

export const dynamic = 'force-dynamic';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/**
 * GET /api/collectors?date=YYYY-MM-DD
 * Collectors, the mode settings, the hostels you can pick from, and the live board for the day.
 */
export async function GET(request: NextRequest) {
  try {
    const now = new Date();
    const todayKey = new Date(now.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
    const param = request.nextUrl.searchParams.get('date') || '';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : todayKey;
    const start = new Date(Date.parse(`${day}T00:00:00Z`) - LAGOS_OFFSET_MS);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    const [settings, collectors, orders, addresses] = await Promise.all([
      getCollectorSettings(0),
      prisma.collector.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.deliveryOrder.findMany({
        where: { collectorId: { not: null }, createdAt: { gte: start, lt: end } },
        orderBy: { createdAt: 'asc' },
        select: COLLECTOR_ORDER_SELECT,
      }),
      prisma.$queryRaw<{ address: string; n: bigint }[]>`
        select "deliveryAddress" as address, count(*) as n from "DeliveryOrder"
        where "createdAt" > now() - interval '60 days' and lower("deliveryType") not like 'pick%'
        group by 1 order by 2 desc limit 60`,
    ]);

    const alertMs = settings.handoverAlertMinutes * 60_000;
    const board = collectors.map((c) => {
      const mine = orders
        .filter((o) => o.collectorId === c.id)
        .map((o) => ({
          ...o,
          phase: collectorPhase(o),
          late: o.collectorStage === 'handed' && !!o.handedAt && now.getTime() - o.handedAt.getTime() > alertMs,
        }))
        .filter((o) => o.phase !== 'cancelled');
      const count = (p: string) => mine.filter((o) => o.phase === p).length;
      return {
        collectorId: c.id,
        total: mine.length,
        waitingRider: count('waiting_rider'),
        withRider: count('with_rider') + count('on_the_way'),
        handed: count('handed'),
        handedLate: mine.filter((o) => o.late).length,
        withCollector: count('with_collector'),
        notReachable: count('not_reachable'),
        delivered: count('delivered'),
        returned: count('returned'),
        orders: mine,
      };
    });

    return NextResponse.json(
      {
        success: true,
        date: day,
        isToday: day === todayKey,
        settings,
        modeActive: isCollectorModeActive(settings, now),
        collectors: collectors.map(({ pin: _pin, ...c }) => c), // PINs are set, never shown
        board,
        addresses: addresses.map((a) => ({ address: a.address, orders: Number(a.n) })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[GET /api/collectors]', err);
    return NextResponse.json({ success: false, error: 'Could not load collectors.' }, { status: 503 });
  }
}

/** POST /api/collectors: add a collector */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = {
      name: String(body.name || '').trim(),
      phone: String(body.phone || '').trim(),
      pin: String(body.pin || '1234').trim(),
      pointName: String(body.pointName || '').trim(),
      hostels: Array.isArray(body.hostels) ? body.hostels.map(String) : [],
    };
    const error = await validateCollector(data);
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });
    const { pin: _pin, ...collector } = await prisma.collector.create({ data });
    return NextResponse.json({ success: true, collector });
  } catch (err) {
    console.error('[POST /api/collectors]', err);
    return NextResponse.json({ success: false, error: 'Could not add the collector.' }, { status: 503 });
  }
}
