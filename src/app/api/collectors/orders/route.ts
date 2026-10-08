import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { sendPushNotification } from '@/lib/pushService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/collectors/orders  { orderId, action }  (admin overrides)
 *  confirm_handover  rider handed it, collector forgot to confirm
 *  back_to_riders    take it off the rep; any rider can collect it from them
 *  deliver_direct    stop using the rep for this order (rider delivers to the customer)
 */
export async function POST(request: NextRequest) {
  try {
    const { orderId, action } = await request.json();
    const order = await prisma.deliveryOrder.findUnique({
      where: { id: String(orderId || '') },
      include: { collector: { select: { id: true, name: true, pointName: true } } },
    });
    if (!order || !order.collectorId) return NextResponse.json({ success: false, error: 'Order not found.' }, { status: 404 });
    const now = new Date();

    let count = 0;
    if (action === 'confirm_handover') {
      count = (
        await prisma.deliveryOrder.updateMany({
          where: { id: order.id, collectorStage: 'handed' },
          data: { collectorStage: 'received', receivedAt: now },
        })
      ).count;
    } else if (action === 'back_to_riders') {
      const result = await prisma.deliveryOrder.updateMany({
          where: { id: order.id, collectorStage: { in: ['received', 'not_reachable'] } },
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
      count = result.count;
      if (count > 0 && order.collector) {
        await logActivity('collector_returned', { id: order.collector.id, name: order.collector.name }, order, 'by admin');
        sendPushNotification(
          {
            title: 'Order to collect from a rep',
            body: `${order.customerName}'s order is with ${order.collector.name} at ${order.collector.pointName}. Any rider can take it.`,
            url: '/rider/portal',
            tag: `returned-${order.orderId}`,
          },
          { userType: 'rider' }
        ).catch(() => {});
      }
    } else if (action === 'deliver_direct') {
      count = (
        await prisma.deliveryOrder.updateMany({
          where: { id: order.id, OR: [{ collectorStage: null }, { collectorStage: 'handed' }] },
          data: { collectorId: null, collectorStage: null, handedAt: null },
        })
      ).count;
    } else {
      return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
    if (count === 0) {
      return NextResponse.json({ success: false, error: 'This order just changed. Refresh and try again.' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/collectors/orders]', err);
    return NextResponse.json({ success: false, error: 'Could not save that.' }, { status: 503 });
  }
}
