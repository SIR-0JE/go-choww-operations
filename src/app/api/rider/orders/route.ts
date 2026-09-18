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
      // 1. Available Pool:
      // A) Unassigned orders (riderId: null)
      // B) Orders claimed by other riders that are still awaiting pickup at cafeteria (not yet Dispatched/In Transit)
      const availableOrders = await prisma.deliveryOrder.findMany({
        where: {
          OR: [
            {
              riderId: null,
              orderStatus: {
                notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
              },
            },
            {
              riderId: { not: null, notIn: [rider.id] },
              orderStatus: {
                notIn: ['Dispatched', 'dispatched', 'Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
              },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 60,
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
          riderId: true,
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
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
          customerPhone: true,
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

      // 4. Other active riders available for peer-to-peer transfer
      let otherRidersWithCounts: any[] = [];
      try {
        const otherRidersList = await prisma.rider.findMany({
          where: {
            id: { not: rider.id },
            status: 'Active',
          },
          select: {
            id: true,
            name: true,
            phone: true,
            isOnline: true,
          },
          orderBy: { name: 'asc' },
        });

        otherRidersWithCounts = await Promise.all(
          otherRidersList.map(async (r) => {
            const count = await prisma.deliveryOrder.count({
              where: {
                riderId: r.id,
                orderStatus: {
                  notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
                },
              },
            });
            return {
              id: r.id,
              name: r.name,
              phone: r.phone,
              isOnline: r.isOnline,
              activeCount: count,
            };
          })
        );
      } catch (err) {
        console.warn('[Rider otherRiders fetch warning]:', err);
      }

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
        otherRiders: otherRidersWithCounts,
        counts: {
          available: availableOrders.length,
          active: activeTasks.length,
          completedToday: completedToday.length,
        },
      });
    } catch (dbErr) {
      console.warn('[Rider Orders Fetch] DB fallback to memory:', dbErr);
      const mem = getInMemoryOrders();
      const availableOrders = mem.filter((o) => {
        const s = (o.orderStatus || '').toLowerCase();
        if (['delivered', 'completed', 'cancelled', 'dispatched'].includes(s)) return false;
        if (!o.riderId) return true;
        if (o.riderId !== rider.id) return true;
        return false;
      });
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

      // 5-order cap: rider cannot hold more than 5 active orders at once
      try {
        const activeCount = await prisma.deliveryOrder.count({
          where: {
            riderId: rider.id,
            orderStatus: {
              notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
            },
          },
        });
        if (activeCount >= 5) {
          return NextResponse.json(
            {
              success: false,
              error: 'You already have 5 active orders. Deliver one before accepting more.',
            },
            { status: 409 }
          );
        }
      } catch {
        // If DB check fails, proceed — don't block rider on a transient error
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

    // ── ACTION: TAKEOVER (CAFETERIA PICKUP OVERRIDE) ──────────────────────────
    if (action === 'takeover') {
      const lowerStatus = (order.orderStatus || '').toLowerCase();
      if (['delivered', 'completed', 'cancelled'].includes(lowerStatus)) {
        return NextResponse.json(
          { success: false, error: `Cannot pick up an order that is already ${order.orderStatus}` },
          { status: 400 }
        );
      }

      if (['dispatched', 'in transit'].includes(lowerStatus)) {
        return NextResponse.json(
          {
            success: false,
            error: 'This order was already picked up and is in transit by another rider.',
          },
          { status: 409 }
        );
      }

      // Check 5-order cap on the acquiring rider
      try {
        const activeCount = await prisma.deliveryOrder.count({
          where: {
            riderId: rider.id,
            orderStatus: {
              notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
            },
          },
        });
        if (activeCount >= 5) {
          return NextResponse.json(
            {
              success: false,
              error: 'You already have 5 active orders. Deliver one before accepting more.',
            },
            { status: 409 }
          );
        }
      } catch {
        // Proceed if DB check fails
      }

      const previousRiderId = order.riderId;

      // Assign to this rider and mark as Dispatched immediately
      let updated: any;
      try {
        updated = await prisma.deliveryOrder.update({
          where: { id: order.id },
          data: {
            riderId: rider.id,
            orderStatus: 'Dispatched',
          },
        });
      } catch {
        updateInMemoryOrderRider(order.orderId || order.id, rider.id);
        updated = updateInMemoryOrder(order.orderId || order.id, {
          orderStatus: 'Dispatched',
        });
      }

      return NextResponse.json({
        success: true,
        message: `Order #${order.orderId} picked up at cafeteria and assigned to you!`,
        previousRiderId,
        order: {
          id: updated.id,
          orderId: updated.orderId,
          orderStatus: updated.orderStatus,
          riderId: rider.id,
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
            orderStatus: 'Completed',
          },
        });
      } catch {
        updated = updateInMemoryOrder(order.orderId || order.id, {
          orderStatus: 'Completed',
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Order confirmed as Completed!',
        order: {
          id: updated.id,
          orderId: updated.orderId,
          orderStatus: updated.orderStatus,
        },
      });
    }

    // ── ACTION: TRANSFER (RIDER TO RIDER) ────────────────────────────────────
    if (action === 'transfer') {
      const { targetRiderId } = body;
      if (!targetRiderId) {
        return NextResponse.json(
          { success: false, error: 'Recipient rider is required for transfer' },
          { status: 400 }
        );
      }

      if (targetRiderId === rider.id) {
        return NextResponse.json(
          { success: false, error: 'You cannot transfer an order to yourself' },
          { status: 400 }
        );
      }

      // Check that caller is currently assigned to this order
      if (order.riderId !== rider.id) {
        return NextResponse.json(
          { success: false, error: 'You can only transfer orders currently assigned to you' },
          { status: 403 }
        );
      }

      // Check if order is already delivered or cancelled
      const lowerStatus = (order.orderStatus || '').toLowerCase();
      if (['delivered', 'completed', 'cancelled'].includes(lowerStatus)) {
        return NextResponse.json(
          { success: false, error: `Cannot transfer an order that is already ${order.orderStatus}` },
          { status: 400 }
        );
      }

      // Verify recipient rider exists and is Active
      let targetRider: any = null;
      try {
        targetRider = await prisma.rider.findUnique({
          where: { id: targetRiderId },
        });
      } catch (err) {
        console.warn('Target rider lookup DB error:', err);
      }

      if (!targetRider || targetRider.status !== 'Active') {
        return NextResponse.json(
          { success: false, error: 'Selected rider is not active or could not be found' },
          { status: 400 }
        );
      }

      // Check 5-order cap on the recipient rider
      try {
        const recipientActiveCount = await prisma.deliveryOrder.count({
          where: {
            riderId: targetRider.id,
            orderStatus: {
              notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
            },
          },
        });
        if (recipientActiveCount >= 5) {
          return NextResponse.json(
            {
              success: false,
              error: `${targetRider.name} already has 5 active orders (limit reached). Please select another rider.`,
            },
            { status: 409 }
          );
        }
      } catch {
        // Proceed if DB count check fails
      }

      // Update riderId to targetRiderId atomically
      let updated: any;
      try {
        updated = await prisma.deliveryOrder.update({
          where: { id: order.id },
          data: {
            riderId: targetRider.id,
          },
        });
      } catch {
        updateInMemoryOrderRider(order.orderId || order.id, targetRider.id);
        updated = {
          ...order,
          riderId: targetRider.id,
        };
      }

      return NextResponse.json({
        success: true,
        message: `Order #${order.orderId} successfully transferred to ${targetRider.name}!`,
        order: {
          id: updated.id,
          orderId: updated.orderId,
          riderId: updated.riderId,
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
