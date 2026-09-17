import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getAuthenticatedRider(request: NextRequest) {
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

  if (!riderId) return null;

  try {
    const rider = await prisma.rider.findUnique({
      where: { id: riderId },
    });
    return rider;
  } catch {
    return null;
  }
}

/**
 * GET /api/rider/orders
 * Returns Available (Unassigned Pool), Active Tasks, and Completed Today
 * Excludes financial amounts to keep monetary data strictly on Admin dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const rider = await getAuthenticatedRider(request);
    if (!rider) {
      return NextResponse.json({ success: false, error: 'Unauthorized rider session' }, { status: 401 });
    }

    // 1. Available Unassigned Pool (Active orders not yet delivered, completed, or cancelled)
    const availableOrders = await prisma.deliveryOrder.findMany({
      where: {
        riderId: null,
        orderStatus: {
          notIn: ['Delivered', 'Completed', 'Cancelled'],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: {
        id: true,
        orderId: true,
        customerName: true,
        cafeteriaName: true,
        deliveryAddress: true,
        deliveryType: true,
        orderStatus: true,
        createdAt: true,
        time: true,
      },
    });

    // 2. Active Tasks claimed by this rider
    const activeTasks = await prisma.deliveryOrder.findMany({
      where: {
        riderId: rider.id,
        orderStatus: {
          notIn: ['Delivered', 'Completed', 'Cancelled'],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderId: true,
        customerName: true,
        cafeteriaName: true,
        deliveryAddress: true,
        deliveryType: true,
        orderStatus: true,
        createdAt: true,
        time: true,
      },
    });

    // 3. Completed Today by this rider
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const completedToday = await prisma.deliveryOrder.findMany({
      where: {
        riderId: rider.id,
        orderStatus: {
          in: ['Delivered', 'Completed'],
        },
        createdAt: {
          gte: today,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        orderId: true,
        customerName: true,
        cafeteriaName: true,
        deliveryAddress: true,
        deliveryType: true,
        orderStatus: true,
        createdAt: true,
        time: true,
      },
    });

    return NextResponse.json({
      success: true,
      rider: {
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        isOnline: rider.isOnline,
      },
      available: availableOrders,
      active: activeTasks,
      completedToday,
      counts: {
        available: availableOrders.length,
        active: activeTasks.length,
        completedToday: completedToday.length,
      },
    });
  } catch (error: any) {
    console.error('[Rider Orders Fetch Error]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch orders' }, { status: 500 });
  }
}

/**
 * POST /api/rider/orders
 * Actions: 'claim', 'pickup', 'deliver'
 */
export async function POST(request: NextRequest) {
  try {
    const rider = await getAuthenticatedRider(request);
    if (!rider) {
      return NextResponse.json({ success: false, error: 'Unauthorized rider session' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, action } = body;

    if (!orderId || !action) {
      return NextResponse.json({ success: false, error: 'orderId and action are required' }, { status: 400 });
    }

    // Find the order
    const order = await prisma.deliveryOrder.findFirst({
      where: {
        OR: [{ id: orderId }, { orderId: orderId }],
      },
    });

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    if (order.orderStatus === 'Cancelled') {
      return NextResponse.json({ success: false, error: 'This order has been cancelled.' }, { status: 400 });
    }

    // ── ACTION: CLAIM ────────────────────────────────────────────────────────
    if (action === 'claim') {
      // Concurrency guard: Check if already assigned to someone else
      if (order.riderId && order.riderId !== rider.id) {
        return NextResponse.json(
          {
            success: false,
            error: 'This order was just accepted by another dispatch rider!',
          },
          { status: 409 }
        );
      }

      // Assign to this rider atomically
      const updated = await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: {
          riderId: rider.id,
          // If status was still pending/confirmed, advance to preparing or dispatched
          orderStatus: order.orderStatus === 'Delivered' ? 'Delivered' : order.orderStatus,
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Order accepted successfully!',
        order: {
          id: updated.id,
          orderId: updated.orderId,
          orderStatus: updated.orderStatus,
        },
      });
    }

    // ── ACTION: PICKUP ───────────────────────────────────────────────────────
    if (action === 'pickup') {
      if (order.riderId !== rider.id) {
        return NextResponse.json({ success: false, error: 'You are not assigned to this order' }, { status: 403 });
      }

      const updated = await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: {
          orderStatus: 'Dispatched',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Order marked as Picked Up / In Transit!',
        order: {
          id: updated.id,
          orderId: updated.orderId,
          orderStatus: updated.orderStatus,
        },
      });
    }

    // ── ACTION: DELIVER ──────────────────────────────────────────────────────
    if (action === 'deliver') {
      if (order.riderId !== rider.id) {
        return NextResponse.json({ success: false, error: 'You are not assigned to this order' }, { status: 403 });
      }

      const updated = await prisma.deliveryOrder.update({
        where: { id: order.id },
        data: {
          orderStatus: 'Delivered',
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Order confirmed as Delivered to customer!',
        order: {
          id: updated.id,
          orderId: updated.orderId,
          orderStatus: updated.orderStatus,
        },
      });
    }

    return NextResponse.json({ success: false, error: `Invalid action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('[Rider Order Action Error]:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Action failed' }, { status: 500 });
  }
}
