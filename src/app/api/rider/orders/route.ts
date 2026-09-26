import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { sendPushNotification } from '@/lib/pushService';
import { verifyCafeteriaProximity, calculateDistanceMeters, getCafeteriaCoordinates } from '@/lib/locations';
import { getGeofenceSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// Status groups used as conditions on every write, so an action only applies if the
// order is still in the state it was checked in (another tap or the GoChow sync may
// have changed it in between). Stored statuses vary in case.
const FINISHED_STATUSES = ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled', 'Canceled', 'canceled'];
const PICKED_UP_OR_FINISHED = [...FINISHED_STATUSES, 'In Transit', 'in transit'];
const MAX_ACTIVE_ORDERS = 5;

function orderChangedResponse(message = 'This order was just updated by someone else. Refresh and try again.') {
  return NextResponse.json({ success: false, changed: true, error: message }, { status: 409 });
}

// Radius that counts as "at the cafeteria" for handovers. Changes rarely, and this
// endpoint is polled constantly, so keep it in memory for a minute.
let radiusCache: { value: number; at: number } | null = null;
async function getHandoverRadiusMeters() {
  if (radiusCache && Date.now() - radiusCache.at < 60_000) return radiusCache.value;
  try {
    const s = await getGeofenceSettings();
    radiusCache = { value: s.radiusMeters || 200, at: Date.now() };
  } catch {
    radiusCache = { value: radiusCache?.value ?? 200, at: Date.now() };
  }
  return radiusCache.value;
}

function countActiveOrders(riderId: string) {
  return prisma.deliveryOrder.count({
    where: { riderId, orderStatus: { notIn: FINISHED_STATUSES } },
  });
}

function dbBusyResponse(message = 'Server is busy — retrying automatically.') {
  return NextResponse.json(
    { success: false, busy: true, error: message },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function getAuthenticatedRider(request: NextRequest) {
  let riderId = request.headers.get('x-rider-id');
  let cachedPayload: any = null;

  if (!riderId) {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('rider_session');
    if (sessionCookie?.value) {
      try {
        cachedPayload = JSON.parse(sessionCookie.value);
        riderId = cachedPayload.id;
      } catch {
        // ignore
      }
    }
  }

  if (!riderId) return null;

  try {
    const rider = await withDbRetry(async () => {
      return await prisma.rider.findUnique({
        where: { id: riderId },
      });
    }, 3, 400);
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
      assignedCafeterias: (cachedPayload.assignedCafeterias as string[]) || [],
    };
  }

  return {
    id: riderId,
    name: 'Rider',
    phone: '',
    isOnline: true,
    status: 'Active',
    assignedCafeterias: [] as string[],
  };
}

/**
 * GET /api/rider/orders
 * Returns Available (Unassigned Pool + Peer Claimed Awaiting Pickup), Active Tasks, and Completed Today
 * Excludes financial amounts to keep monetary data strictly on Admin dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const rider = await getAuthenticatedRider(request);
    if (!rider) {
      return NextResponse.json({ success: false, error: 'Unauthorized rider session' }, { status: 401 });
    }

    // Peer riders for transfers — started now so it runs alongside the pool queries
    const otherRidersPromise = Promise.all([
      prisma.rider.findMany({
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
      }),
      prisma.deliveryOrder.groupBy({
        by: ['riderId'],
        where: {
          riderId: { not: null },
          orderStatus: {
            notIn: ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
          },
        },
        _count: { id: true },
      }),
    ]).catch((err) => {
      console.warn('[Rider otherRiders fetch warning]:', err);
      return null;
    });

    try {
      const [availableOrders, activeTasks, completedToday] = await withDbRetry(async () => {
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const shiftCutoff = dayAgo < todayMidnight ? dayAgo : todayMidnight;

        return await Promise.all([
          // 1. Available Pool
          prisma.deliveryOrder.findMany({
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
                    notIn: ['In Transit', 'in transit', 'Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled'],
                  },
                },
              ],
            },
            orderBy: { createdAt: 'desc' },
            take: 500,
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
              pickupCode: true,
              handoverRequestedById: true,
              handoverRequestedByName: true,
              handoverDistance: true,
              rider: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                },
              },
            },
          }),

          // 2. Active Tasks
          prisma.deliveryOrder.findMany({
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
              pickupCode: true,
              handoverRequestedById: true,
              handoverRequestedByName: true,
              handoverDistance: true,
            },
          }),

          // 3. Completed Today
          prisma.deliveryOrder.findMany({
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
            take: 500,
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
              pickupCode: true,
            },
          }),
        ]);
      }, 1, 250);

      // 4. Other active riders available for peer-to-peer transfer (queried in parallel above)
      let otherRidersWithCounts: any[] = [];
      const otherRidersResult = await otherRidersPromise;
      if (otherRidersResult) {
        const [otherRidersList, activeOrderCounts] = otherRidersResult;
        const countMap = new Map(
          activeOrderCounts.map((c) => [c.riderId, c._count.id])
        );

        otherRidersWithCounts = otherRidersList.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          isOnline: r.isOnline,
          activeCount: countMap.get(r.id) || 0,
        }));
      }

      // Cafeteria assignment matching helper
      const assignedCafeterias: string[] = Array.isArray((rider as any)?.assignedCafeterias) ? (rider as any).assignedCafeterias : [];
      const assignedSet = new Set(assignedCafeterias.map((c: string) => c.trim().toLowerCase()));

      const isAssignedStation = (cafName?: string | null) => {
        if (!cafName || assignedSet.size === 0) return false;
        const clean = cafName.trim().toLowerCase();
        for (const assigned of assignedSet) {
          if (clean.includes(assigned) || assigned.includes(clean)) return true;
        }
        return false;
      };

      // Enrich and Sort available orders:
      // 1. Orders from rider's assigned cafeterias (Highest priority)
      // 2. Peer-claimed orders awaiting pickup
      // 3. Other campus orders (newest first)
      const mappedAvailableOrders = availableOrders.map((ord) => ({
        ...ord,
        isAssignedStation: isAssignedStation(ord.cafeteriaName),
      }));

      const sortedAvailableOrders = mappedAvailableOrders.sort((a, b) => {
        const aAssigned = a.isAssignedStation ? 1 : 0;
        const bAssigned = b.isAssignedStation ? 1 : 0;

        if (aAssigned !== bAssigned) return bAssigned - aAssigned;

        const aIsClaimed = Boolean(a.riderId || a.rider);
        const bIsClaimed = Boolean(b.riderId || b.rider);

        if (aIsClaimed && !bIsClaimed) return -1;
        if (!aIsClaimed && bIsClaimed) return 1;

        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return NextResponse.json(
        {
          success: true,
          rider: {
            id: rider.id,
            name: rider.name,
            phone: rider.phone,
            isOnline: rider.isOnline,
            assignedCafeterias,
          },
          available: sortedAvailableOrders,
          active: activeTasks,
          completedToday,
          otherRiders: otherRidersWithCounts,
          handoverRadiusMeters: await getHandoverRadiusMeters(),
          counts: {
            available: sortedAvailableOrders.length,
            active: activeTasks.length,
            completedToday: completedToday.length,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        }
      );
    } catch (dbErr) {
      // Never answer with an empty pool when the database is briefly unavailable —
      // the phone keeps showing its last good list and retries on the next poll.
      console.warn('[Rider Orders Fetch] Database unavailable:', dbErr);
      return dbBusyResponse();
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
    const order: any = await prisma.deliveryOrder.findFirst({
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

      // Assign to this rider atomically: only succeeds if the order is still unclaimed
      // (or already ours), so two riders tapping Accept together can't both win.
      const claimResult = await prisma.deliveryOrder.updateMany({
        where: {
          id: order.id,
          OR: [{ riderId: null }, { riderId: rider.id }],
          // never resurrect an order that was picked up, delivered or cancelled meanwhile
          orderStatus: { notIn: PICKED_UP_OR_FINISHED },
        },
        data: {
          riderId: rider.id,
          // Keep status as Ready so it is clearly awaiting pickup and visible to peers
          orderStatus: 'Ready',
        },
      });

      if (claimResult.count === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'This order was just accepted by another dispatch rider!',
          },
          { status: 409 }
        );
      }

      // Two accepts at once can both pass the cap check above; re-check now that the
      // order is ours and give it back if this one took the rider over the limit.
      if (order.riderId !== rider.id && (await countActiveOrders(rider.id)) > MAX_ACTIVE_ORDERS) {
        await prisma.deliveryOrder.updateMany({
          where: { id: order.id, riderId: rider.id },
          data: { riderId: null, orderStatus: order.orderStatus },
        });
        return NextResponse.json(
          { success: false, error: 'You already have 5 active orders. Deliver one before accepting more.' },
          { status: 409 }
        );
      }

      const updated = { ...order, riderId: rider.id, orderStatus: 'Ready' };

      // Dispatch mobile push notification to Dashboard
      sendPushNotification(
        {
          title: '🛵 Order Claimed',
          body: `${rider.name} accepted Order #${order.orderId || order.id}`,
          url: '/dashboard',
          tag: `claim-${order.orderId || order.id}`,
        },
        { userType: 'admin' }
      ).catch(() => {});

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

    // ── ACTION: REQUEST HANDOVER (CAFETERIA REQUEST) ─────────────────────────
    if (action === 'request_handover') {
      const lowerStatus = (order.orderStatus || '').toLowerCase();
      if (['delivered', 'completed', 'cancelled'].includes(lowerStatus)) {
        return NextResponse.json(
          { success: false, error: `Cannot request an order that is already ${order.orderStatus}` },
          { status: 400 }
        );
      }

      if (['in transit'].includes(lowerStatus)) {
        return NextResponse.json(
          {
            success: false,
            error: 'This order has already been picked up and is in transit.',
          },
          { status: 409 }
        );
      }

      if (order.riderId === rider.id) {
        return NextResponse.json(
          { success: false, error: 'You are already assigned to this order.' },
          { status: 400 }
        );
      }

      // GPS Geofence Proximity Check (Dynamic from Settings)
      const { lat, lng } = body;
      let verifiedDistance: number | null = null;
      if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
        try {
          const geoSettings = await getGeofenceSettings();
          if (geoSettings.enabled) {
            let targetCoords: { lat: number; lng: number } | null = null;
            if (Array.isArray(geoSettings.cafeterias) && geoSettings.cafeterias.length > 0) {
              const cleanTarget = String(order.cafeteriaName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const found = geoSettings.cafeterias.find((c) => {
                const cleanC = String(c.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return cleanTarget.includes(cleanC) || cleanC.includes(cleanTarget);
              });
              if (found) {
                targetCoords = { lat: found.lat, lng: found.lng };
              }
            }

            if (!targetCoords) {
              targetCoords = getCafeteriaCoordinates(order.cafeteriaName);
            }

            if (targetCoords) {
              verifiedDistance = calculateDistanceMeters(lat, lng, targetCoords.lat, targetCoords.lng);
            }
          }
        } catch (err) {
          console.warn('[Handover Distance Calc Warning]:', err);
        }
      }

      const requested = await prisma.deliveryOrder.updateMany({
        where: {
          id: order.id,
          riderId: { not: null, notIn: [rider.id] },
          orderStatus: { notIn: PICKED_UP_OR_FINISHED },
        },
        data: {
          handoverRequestedById: rider.id,
          handoverRequestedByName: rider.name,
          handoverDistance: verifiedDistance,
        },
      });
      if (requested.count === 0) {
        return orderChangedResponse('This order was just picked up or released. Refresh and try again.');
      }
      const updated: any = order;

      return NextResponse.json({
        success: true,
        message: verifiedDistance !== null
          ? `📍 Location logged (${verifiedDistance}m away)! Handover requested.`
          : `Handover requested! Waiting for assigned rider to release it.`,
        order: {
          id: updated.id,
          orderId: updated.orderId,
          handoverRequestedById: rider.id,
          handoverRequestedByName: rider.name,
          handoverDistance: verifiedDistance,
        },
      });
    }

    // ── ACTION: CANCEL HANDOVER REQUEST ──────────────────────────────────────
    if (action === 'cancel_handover') {
      // Only the rider who asked for the handover can withdraw it
      const cancelled = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, handoverRequestedById: rider.id },
        data: {
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
      if (cancelled.count === 0) {
        return orderChangedResponse('You have no active handover request on this order.');
      }
      const updated: any = order;

      return NextResponse.json({
        success: true,
        message: 'Handover request cancelled.',
        order: {
          id: updated.id,
          orderId: updated.orderId,
        },
      });
    }

    // ── ACTION: ACCEPT HANDOVER (RELEASE TO REQUESTING RIDER) ────────────────
    if (action === 'accept_handover') {
      if (order.riderId !== rider.id) {
        return NextResponse.json(
          { success: false, error: 'Only the assigned rider can accept handover.' },
          { status: 403 }
        );
      }

      if (!order.handoverRequestedById) {
        return NextResponse.json(
          { success: false, error: 'No active handover request for this order.' },
          { status: 400 }
        );
      }

      const targetRiderId = order.handoverRequestedById;
      const targetRiderName = order.handoverRequestedByName || 'Peer Rider';

      // Release only if we still own it, it isn't picked up, and the same rider is still asking
      const released = await prisma.deliveryOrder.updateMany({
        where: {
          id: order.id,
          riderId: rider.id,
          handoverRequestedById: targetRiderId,
          orderStatus: { notIn: PICKED_UP_OR_FINISHED },
        },
        data: {
          riderId: targetRiderId,
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
      if (released.count === 0) {
        return orderChangedResponse('The handover request changed or the order was picked up. Refresh and try again.');
      }
      const updated: any = order;

      return NextResponse.json({
        success: true,
        message: `Order released to ${targetRiderName}!`,
        order: {
          id: updated.id,
          orderId: updated.orderId,
          riderId: targetRiderId,
        },
      });
    }

    // ── ACTION: REJECT HANDOVER (KEEP ORDER) ──────────────────────────────────
    if (action === 'reject_handover') {
      if (order.riderId !== rider.id) {
        return NextResponse.json(
          { success: false, error: 'Only the assigned rider can decline handover.' },
          { status: 403 }
        );
      }

      const declined = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, riderId: rider.id },
        data: {
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
      if (declined.count === 0) {
        return orderChangedResponse('This order is no longer assigned to you.');
      }
      const updated: any = order;

      return NextResponse.json({
        success: true,
        message: 'Handover declined. You kept this order.',
        order: {
          id: updated.id,
          orderId: updated.orderId,
        },
      });
    }

    // ── ACTION: DROP ORDER (RETURN TO OPEN POOL) ─────────────────────────────
    if (action === 'drop_order') {
      if (order.riderId !== rider.id) {
        return NextResponse.json(
          { success: false, error: 'Only the assigned rider can drop this order.' },
          { status: 403 }
        );
      }

      const lowerStatus = (order.orderStatus || '').toLowerCase();
      if (['in transit', 'delivered', 'completed'].includes(lowerStatus)) {
        return NextResponse.json(
          { success: false, error: 'Cannot drop an order that has already been picked up or completed.' },
          { status: 400 }
        );
      }

      const dropped = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, riderId: rider.id, orderStatus: { notIn: PICKED_UP_OR_FINISHED } },
        data: {
          riderId: null,
          orderStatus: 'Ready',
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
      if (dropped.count === 0) {
        return orderChangedResponse('This order was just picked up or reassigned, so it can no longer be dropped.');
      }
      const updated: any = order;

      return NextResponse.json({
        success: true,
        message: 'Order dropped back to the open pool!',
        order: {
          id: updated.id,
          orderId: updated.orderId,
          riderId: null,
        },
      });
    }

    // ── ACTION: PICKUP ───────────────────────────────────────────────────────
    if (action === 'pickup') {
      if (order.riderId !== rider.id) {
        return NextResponse.json({ success: false, error: 'You are not assigned to this order' }, { status: 403 });
      }

      const pickedUp = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, riderId: rider.id, orderStatus: { notIn: FINISHED_STATUSES } },
        data: {
          orderStatus: 'In Transit',
          // a pickup settles any pending handover request
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
      if (pickedUp.count === 0) {
        return orderChangedResponse('This order was just reassigned or cancelled. Refresh and try again.');
      }
      const updated: any = { ...order, orderStatus: 'In Transit' };

      // Dispatch mobile push notification
      sendPushNotification(
        {
          title: '📦 Order Dispatched',
          body: `${rider.name} picked up Order #${order.orderId || order.id} — now in transit`,
          url: '/dashboard',
          tag: `pickup-${order.orderId || order.id}`,
        },
        { userType: 'admin' }
      ).catch(() => {});

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

      const deliveredResult = await prisma.deliveryOrder.updateMany({
        where: {
          id: order.id,
          riderId: rider.id,
          orderStatus: { notIn: ['Cancelled', 'cancelled', 'Canceled', 'canceled'] },
        },
        data: {
          orderStatus: 'Completed',
        },
      });
      if (deliveredResult.count === 0) {
        return orderChangedResponse('This order was just reassigned or cancelled. Refresh and try again.');
      }
      const updated: any = { ...order, orderStatus: 'Completed' };

      // Dispatch mobile push notification
      sendPushNotification(
        {
          title: '✅ Order Delivered',
          body: `${rider.name} completed delivery of Order #${order.orderId || order.id}`,
          url: '/dashboard',
          tag: `deliver-${order.orderId || order.id}`,
        },
        { userType: 'admin' }
      ).catch(() => {});

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

      // Move only if we still own it and it hasn't been delivered or cancelled meanwhile
      const transferred = await prisma.deliveryOrder.updateMany({
        where: { id: order.id, riderId: rider.id, orderStatus: { notIn: FINISHED_STATUSES } },
        data: {
          riderId: targetRider.id,
        },
      });
      if (transferred.count === 0) {
        return orderChangedResponse('This order was just delivered or reassigned. Refresh and try again.');
      }

      // The recipient may have accepted orders at the same moment; undo if now over the cap
      if ((await countActiveOrders(targetRider.id)) > MAX_ACTIVE_ORDERS) {
        await prisma.deliveryOrder.updateMany({
          where: { id: order.id, riderId: targetRider.id },
          data: { riderId: rider.id },
        });
        return NextResponse.json(
          { success: false, error: `${targetRider.name} just reached 5 active orders. Please select another rider.` },
          { status: 409 }
        );
      }
      const updated: any = { ...order, riderId: targetRider.id };

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
    // Report the failure honestly — never tell the rider an action succeeded when it wasn't saved
    console.error('[Rider Order Action Error]:', error);
    return dbBusyResponse('Could not save that — the network is busy. Please try again.');
  }
}
