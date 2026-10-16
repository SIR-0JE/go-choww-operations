import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { getRunnerFromCookies, getRunnerSettings, sameCafeteria, toPackWhere } from '@/lib/runners';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const WINDOW_HOURS = 8;
const UNDO_MINUTES = 10;

const SELECT = {
  id: true,
  orderId: true,
  createdAt: true,
  time: true,
  customerName: true,
  deliveryAddress: true,
  deliveryType: true,
  orderStatus: true,
  gochowStatus: true,
  pickupCode: true,
  items: true,
  rider: { select: { name: true } },
} as const;

/**
 * GET /api/runner/orders
 * The signed-in runner's cafeteria: orders still to pack (oldest first) and what they packed recently.
 */
export async function GET() {
  try {
    const runner = await getRunnerFromCookies();
    if (!runner) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
    const [settings, toPack, packed] = await Promise.all([
      getRunnerSettings(),
      prisma.deliveryOrder.findMany({ where: toPackWhere(runner.cafeteria, since), orderBy: { createdAt: 'asc' }, select: SELECT }),
      prisma.deliveryOrder.findMany({
        where: {
          cafeteriaName: { equals: runner.cafeteria, mode: 'insensitive' },
          createdAt: { gte: since },
          events: { some: { kind: 'runner_ready' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { ...SELECT, events: { where: { kind: 'runner_ready' }, select: { at: true, actorName: true } } },
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        runner: { id: runner.id, name: runner.name, cafeteria: runner.cafeteria },
        alertMinutes: settings.alertMinutes,
        undoMinutes: UNDO_MINUTES,
        toPack,
        packed: packed.map(({ events, ...o }) => ({ ...o, packedAt: events[0]?.at ?? null, packedBy: events[0]?.actorName ?? null })),
        serverTime: new Date().toISOString(),
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error('[Runner orders GET]', err);
    return NextResponse.json({ success: false, busy: true, error: 'Server is busy, retrying.' }, { status: 503, headers: NO_STORE });
  }
}

/** POST /api/runner/orders { orderId, action: 'ready' | 'undo' } */
export async function POST(request: NextRequest) {
  try {
    const runner = await getRunnerFromCookies();
    if (!runner) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

    const { orderId, action } = await request.json();
    const order = await prisma.deliveryOrder.findFirst({ where: { OR: [{ id: String(orderId || '') }, { orderId: String(orderId || '') }] } });
    if (!order || !sameCafeteria(order.cafeteriaName, runner.cafeteria)) {
      return NextResponse.json({ success: false, error: 'This order is not for your cafeteria.' }, { status: 404 });
    }
    if (/^canc/i.test(order.orderStatus) || order.gochowStatus === 'Cancelled') {
      return NextResponse.json({ success: false, error: 'This order was cancelled.' }, { status: 409 });
    }

    if (action === 'ready') {
      let created;
      try {
        created = await prisma.orderEvent.createMany({
          data: [{ orderDbId: order.id, kind: 'runner_ready', at: new Date(), source: 'runner', exact: true, actorName: runner.name }],
          skipDuplicates: true, // already marked Ready (by this or another tap) is ignored by the database
        });
      } catch (err) {
        console.error('[Runner ready]', err);
        return NextResponse.json({ success: false, error: 'Could not save. Please try again.' }, { status: 503 });
      }
      if (created.count === 0) return NextResponse.json({ success: true, already: true, message: 'Already marked Ready.' });
      await logActivity('runner_ready', { id: runner.id, name: runner.name }, order, runner.cafeteria);
      return NextResponse.json({ success: true, message: 'Marked Ready.' });
    }

    if (action === 'undo') {
      if (/^(in transit|completed|delivered)/i.test(order.orderStatus)) {
        return NextResponse.json({ success: false, error: 'A rider already has this order.' }, { status: 409 });
      }
      const cutoff = new Date(Date.now() - UNDO_MINUTES * 60 * 1000);
      const removed = await prisma.orderEvent.deleteMany({ where: { orderDbId: order.id, kind: 'runner_ready', at: { gte: cutoff } } });
      if (removed.count === 0) return NextResponse.json({ success: false, error: `Ready can only be undone within ${UNDO_MINUTES} minutes.` }, { status: 409 });
      await logActivity('runner_undo', { id: runner.id, name: runner.name }, order, runner.cafeteria);
      return NextResponse.json({ success: true, message: 'Back to to-pack.' });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[Runner orders POST]', err);
    return NextResponse.json({ success: false, busy: true, error: 'Could not save that. Please try again.' }, { status: 503 });
  }
}
