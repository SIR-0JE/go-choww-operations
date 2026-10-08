import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { sendPushNotification } from '@/lib/pushService';
import {
  COLLECTOR_ORDER_SELECT,
  collectorPhase,
  getCollectorFromRequest,
  getCollectorSettings,
  isCollectorModeActive,
} from '@/lib/collectors';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

function changed(message = 'This order was just updated. Refresh and try again.') {
  return NextResponse.json({ success: false, changed: true, error: message }, { status: 409 });
}

/**
 * GET /api/collector/orders
 * The signed-in collector's orders from the last 18 hours, grouped by where they are.
 */
export async function GET(request: NextRequest) {
  try {
    const collector = await getCollectorFromRequest(request);
    if (!collector) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

    const settings = await getCollectorSettings();
    const since = new Date(Date.now() - 18 * 60 * 60 * 1000);
    const orders = await prisma.deliveryOrder.findMany({
      where: { collectorId: collector.id, createdAt: { gte: since } },
      orderBy: { createdAt: 'asc' },
      select: COLLECTOR_ORDER_SELECT,
    });

    const list = orders.map((o) => ({ ...o, phase: collectorPhase(o) })).filter((o) => o.phase !== 'cancelled');

    return NextResponse.json(
      {
        success: true,
        collector: { id: collector.id, name: collector.name, pointName: collector.pointName, hostels: collector.hostels },
        mode: {
          active: isCollectorModeActive(settings),
          setting: settings.mode,
          startTime: settings.startTime,
          endTime: settings.endTime,
          days: settings.days,
          returnAfterMinutes: settings.returnAfterMinutes,
          handoverAlertMinutes: settings.handoverAlertMinutes,
        },
        orders: list,
        serverTime: new Date().toISOString(),
      },
      { headers: NO_STORE }
    );
  } catch (err) {
    console.error('[Rep orders GET]', err);
    return NextResponse.json({ success: false, busy: true, error: 'Server is busy, retrying.' }, { status: 503, headers: NO_STORE });
  }
}

/**
 * POST /api/collector/orders  { orderId, action }
 * receive | not_received | deliver | not_reachable | return_to_rider
 */
export async function POST(request: NextRequest) {
  try {
    const collector = await getCollectorFromRequest(request);
    if (!collector) return NextResponse.json({ success: false, error: 'Please sign in again.' }, { status: 401 });

    const { orderId, action } = await request.json();
    const order = await prisma.deliveryOrder.findFirst({
      where: { OR: [{ id: String(orderId || '') }, { orderId: String(orderId || '') }], collectorId: collector.id },
      include: { rider: { select: { id: true, name: true } } },
    });
    if (!order) return NextResponse.json({ success: false, error: 'This order is not assigned to you.' }, { status: 404 });

    const actor = { id: collector.id, name: collector.name };
    const now = new Date();

    // Rider said they handed it over; collector confirms they have it
    if (action === 'receive') {
      const r = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, collectorId: collector.id, collectorStage: 'handed' },
        data: { collectorStage: 'received', receivedAt: now },
      });
      if (r.count === 0) return changed('The rider hasn\'t marked this order as handed to you yet.');
      await logActivity('collector_received', actor, order, order.rider?.name ? `from ${order.rider.name}` : undefined);
      return NextResponse.json({ success: true, message: 'Received. It\'s with you now.' });
    }

    // Rider tapped "handed" but the rep didn't get it: send it back to the rider
    if (action === 'not_received') {
      const r = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, collectorId: collector.id, collectorStage: 'handed' },
        data: { collectorStage: null, handedAt: null },
      });
      if (r.count === 0) return changed();
      if (order.riderId) {
        sendPushNotification(
          {
            title: 'Rep didn\'t get this order',
            body: `${collector.name} says they haven't received ${order.customerName}'s order. Please check.`,
            url: '/rider/portal',
            tag: `not-received-${order.orderId}`,
          },
          { userType: 'rider', riderId: order.riderId }
        ).catch(() => {});
      }
      return NextResponse.json({ success: true, message: 'Sent back to the rider.' });
    }

    if (action === 'deliver') {
      const r = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, collectorId: collector.id, collectorStage: { in: ['received', 'not_reachable'] } },
        data: { collectorStage: 'delivered', collectorDoneAt: now, orderStatus: 'Completed' },
      });
      if (r.count === 0) return changed();
      await logActivity('collector_delivered', actor, order);
      return NextResponse.json({ success: true, message: 'Delivered.' });
    }

    if (action === 'not_reachable') {
      const r = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, collectorId: collector.id, collectorStage: 'received' },
        data: { collectorStage: 'not_reachable', notReachableAt: now },
      });
      if (r.count === 0) return changed();
      await logActivity('collector_not_reachable', actor, order);
      sendPushNotification(
        {
          title: 'Customer not reachable',
          body: `${collector.name} can't reach ${order.customerName} (${order.deliveryAddress})`,
          url: '/collectors',
          tag: `not-reachable-${order.orderId}`,
        },
        { userType: 'admin' }
      ).catch(() => {});
      return NextResponse.json({ success: true, message: 'Marked as not reachable.' });
    }

    // After the waiting time, the food goes back to the riders; any rider can take it
    if (action === 'return_to_rider') {
      const settings = await getCollectorSettings();
      const waitedMs = order.notReachableAt ? now.getTime() - order.notReachableAt.getTime() : 0;
      if (order.collectorStage === 'not_reachable' && waitedMs < settings.returnAfterMinutes * 60_000) {
        const left = Math.ceil((settings.returnAfterMinutes * 60_000 - waitedMs) / 60_000);
        return NextResponse.json({ success: false, error: `Keep trying the customer for ${left} more min first.` }, { status: 409 });
      }
      const r = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, collectorId: collector.id, collectorStage: 'not_reachable' },
        data: {
          collectorStage: 'returned',
          collectorDoneAt: now,
          riderId: null,
          orderStatus: 'Ready',
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
      if (r.count === 0) return changed();
      await logActivity('collector_returned', actor, order);
      sendPushNotification(
        {
          title: 'Order to collect from a rep',
          body: `${order.customerName}'s order is with ${collector.name} at ${collector.pointName}. Any rider can take it.`,
          url: '/rider/portal',
          tag: `returned-${order.orderId}`,
        },
        { userType: 'rider' }
      ).catch(() => {});
      return NextResponse.json({ success: true, message: 'Given back to the riders.' });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    console.error('[Rep orders POST]', err);
    return NextResponse.json({ success: false, busy: true, error: 'Could not save that. Please try again.' }, { status: 503 });
  }
}
