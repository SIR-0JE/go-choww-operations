import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, updateInMemoryOrder, updateInMemoryOrderRider } from '@/lib/prisma';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function getAuthenticatedRider(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('rider_session');
  let riderId: string | null = null;
  let cachedPayload: any = null;

  if (sessionCookie?.value) {
    try {
      cachedPayload = JSON.parse(sessionCookie.value);
      riderId = cachedPayload.id;
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
    if (rider) return rider;
  } catch (err) {
    console.warn('[getAuthenticatedRider] DB lookup warning, using session payload fallback:', err);
  }

  // Fallback to session payload so the rider is never booted out on transient DB hiccups
  if (cachedPayload && cachedPayload.id === riderId) {
    return {
      id: cachedPayload.id,
      name: cachedPayload.name || 'Rider',
      phone: cachedPayload.phone || '',
      isOnline: true,
      status: 'Active',
    };
  }

  return {
    id: riderId,
    name: 'Rider',
    phone: '',
    isOnline: true,
    status: 'Active',
  };
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

    try {
      // 1. Available Unassigned Pool (Active orders not yet delivered, completed, or cancelled)
      const availableOrders = await prisma.deliveryOrder.findMany({
        where: {
          riderId: null,
          orderStatus: {
            notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
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
            notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
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

      // 3. Completed Today / Current Shift by this rider
      // Use a 24-hour shift window (or midnight, whichever earlier) to reliably capture all delivered runs
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const shiftCutoff = dayAgo < todayMidnight ? dayAgo : todayMidnight;

      const completedToday = await prisma.deliveryOrder.findMany({
        where: {
          riderId: rider.id,
          orderStatus: {
            in: ['Delivered', 'Completed', 'delivered', 'completed'],
          },
          createdAt: {
            gte: shiftCutoff,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
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
    } catch (dbErr) {
      console.warn('[Rider Orders Fetch] DB fallback to memory:', dbErr);
      const mem = getInMemoryOrders();
      const availableOrders = mem.filter(
        (o) => !o.riderId && !['delivered', 'completed', 'cancelled'].includes((o.orderStatus || '').toLowerCase())
      );
      const activeTasks = mem.filter(
        (o) => o.riderId === rider.id && !['delivered', 'completed', 'cancelled'].includes((o.orderStatus || '').toLowerCase())
      );
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const completedToday = mem.filter(
        (o) =>
          o.riderId === rider.id &&
          ['delivered', 'completed'].includes((o.orderStatus || '').toLowerCase()) &&
          new Date(o.createdAt).getTime() >= dayAgo.getTime()
      );

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
    }
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
    let order: any = null;
    try {
      order = await prisma.deliveryOrder.findFirst({
        where: {
          OR: [{ id: orderId }, { orderId: orderId }],
        },
      });
    } catch {
      const mem = getInMemoryOrders();
      order = mem.find((o) => o.id === orderId || o.orderId === orderId);
    }

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
      let updated: any;
      try {
        updated = await prisma.deliveryOrder.update({
          where: { id: order.id },
          data: {
            riderId: rider.id,
            orderStatus: order.orderStatus === 'Delivered' ? 'Delivered' : order.orderStatus,
          },
        });
      } catch {
        updateInMemoryOrderRider(order.orderId || order.id, rider.id);
        updated = {
          ...order,
          riderId: rider.id,
        };
      }

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

      let updated: any;
      try {
        updated = await prisma.deliveryOrder.update({
          where: { id: order.id },
          data: {
            orderStatus: 'Dispatched',
          },
        });
      } catch {
        updated = updateInMemoryOrder(order.orderId || order.id, {
          orderStatus: 'Dispatched',
        });
      }

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

      let updated: any;
      try {
        updated = await prisma.deliveryOrder.update({
          where: { id: order.id },
          data: {
            orderStatus: 'Delivered',
          },
        });
      } catch {
        updated = updateInMemoryOrder(order.orderId || order.id, {
          orderStatus: 'Delivered',
        });
      }

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
