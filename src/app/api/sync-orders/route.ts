import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, appendMockOrder, updateInMemoryOrder } from '@/lib/prisma';
import { fetchLiveGoChowOrders } from '@/services/gochowApi';
import { classifyDeliveryType } from '@/lib/locations';
import { getSyncSettings, isWithinOperatingWindow, getOperationalStatus } from '@/lib/settings';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// STATUS MAPPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps GoChow live orderStatus → our granular system orderStatus:
 * - delivered / completed → Delivered
 * - dispatched            → Dispatched
 * - ready                 → Ready
 * - preparing             → Preparing
 * - confirmed / paid      → Confirmed
 * - cancelled / canceled  → Cancelled
 * - (other / pending)     → Confirmed (if paid) or Pending
 */
function mapOrderStatus(raw: string): string {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'delivered' || s === 'completed') return 'Delivered';
  if (s === 'dispatched') return 'Dispatched';
  if (s === 'ready') return 'Ready';
  if (s === 'preparing') return 'Preparing';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'confirmed' || s === 'paid' || s === 'pending') return 'Confirmed';
  return 'Confirmed';
}

function mapPaymentStatus(raw: string): 'success' | 'failed' | 'pending' {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'success' || s === 'paid') return 'success';
  if (s === 'failed') return 'failed';
  return 'pending';
}

const STATUS_RANK: Record<string, number> = {
  pending: 1,
  confirmed: 1,
  paid: 1,
  preparing: 2,
  ready: 3,
  dispatched: 4,
  delivered: 5,
  completed: 5,
};

/**
 * Enforces one-way forward status progression during external sync.
 * Prevents remote GoChow sync from reverting/demoting locally dispatched or delivered orders.
 */
function shouldSyncUpdateOrderStatus(currentDbStatus: string, incomingLiveStatus: string): boolean {
  const current = (currentDbStatus || '').trim().toLowerCase();
  const incoming = (incomingLiveStatus || '').trim().toLowerCase();

  if (!incoming || current === incoming) return false;

  // 1. Terminal Delivered / Completed: Never demote or cancel once delivered to customer
  if (current === 'delivered' || current === 'completed') {
    return false;
  }

  // 2. Cancellation handling
  if (incoming === 'cancelled' || incoming === 'canceled') {
    // Only cancel if not already delivered
    return current !== 'delivered' && current !== 'completed';
  }

  // 3. If locally cancelled, do not resurrect unless remote explicitly marks delivered
  if (current === 'cancelled' || current === 'canceled') {
    return incoming === 'delivered' || incoming === 'completed';
  }

  // 4. If currently Dispatched (rider is physically en route), never demote back to Ready, Preparing, or Confirmed
  if (current === 'dispatched') {
    return incoming === 'delivered' || incoming === 'completed';
  }

  // 5. Forward progression rule: incoming rank must be strictly higher than current
  const currentRank = STATUS_RANK[current] ?? 0;
  const incomingRank = STATUS_RANK[incoming] ?? 0;

  return incomingRank > currentRank;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC FUNCTION (HIGH SPEED < 0.5s)
// ─────────────────────────────────────────────────────────────────────────────

async function performSync(force: boolean = false) {
  // ── 0. Check Operating Schedule Window ───────────────────────────────────────
  const settings = await getSyncSettings();
  const isOperating = isWithinOperatingWindow(settings);

  if (!force && !isOperating) {
    const status = getOperationalStatus(settings);
    return {
      success: true,
      hasChanges: false,
      skipped: true,
      inOperatingWindow: false,
      operatingStatus: status,
      newlySyncedCount: 0,
      syncedCount: 0,
      statusUpdatedCount: 0,
      totalFetched: 0,
      message: status.statusText,
    };
  }

  // ── 1. Fetch the latest 30 live orders from GoChow in a single fast call ────
  const liveOrders: any[] = await fetchLiveGoChowOrders(30);

  const orderNumbers: string[] = [];
  const validLiveOrders: any[] = [];

  for (const order of liveOrders) {
    const orderNumber = String(order.orderNumber || order._id || '').trim();
    if (!orderNumber) continue;

    // Filter: only insert orders with successful payment (or previously paid)
    const rawPayment = String(order.paymentStatus || '').toLowerCase();
    const isPaid = rawPayment === 'success' || rawPayment === 'paid';
    if (!isPaid) continue;

    orderNumbers.push(orderNumber);
    validLiveOrders.push(order);
  }

  let newlySyncedCount = 0;
  let statusUpdatedCount = 0;

  if (orderNumbers.length > 0) {
    try {
      // ── 2. Batch fetch all existing records in 1 single roundtrip ────
      const existingDbOrders = await prisma.deliveryOrder.findMany({
        where: { orderId: { in: orderNumbers } },
      });
      const existingMap = new Map<string, (typeof existingDbOrders)[0]>();
      for (const edb of existingDbOrders) {
        existingMap.set(edb.orderId, edb);
      }

      const toCreate: any[] = [];
      const toUpdate: { id: string; status: string; pay: string }[] = [];

      for (const order of validLiveOrders) {
        const orderNumber = String(order.orderNumber || order._id || '').trim();
        const rawDate = order.createdAt;
        let parsedDate = rawDate ? new Date(rawDate) : new Date();
        if (isNaN(parsedDate.getTime())) parsedDate = new Date();

        const h = parsedDate.getHours();
        const m = parsedDate.getMinutes();
        const time = `${(h % 12 || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

        const customerName = String(order.user?.name || order.customerName || 'Student Customer').trim();
        const cafeteriaName = String(order.vendor?.restaurantName || order.cafeteriaName || 'Campus Cafeteria').trim();
        const deliveryAddress = String(order.deliveryAddress || 'Campus Hostel Block').trim();
        // Extract phone from GoChow user profile if present
        const customerPhone = String(order.user?.phone || order.user?.phoneNumber || order.customerPhone || '').trim() || null;

        const deliveryFee = Number(order.deliveryFee ?? 0);
        const foodTotal = Number(order.subtotal ?? order.foodTotal ?? 0);
        const totalAmountPaid = Number(order.totalAmount ?? order.totalAmountPaid ?? foodTotal + deliveryFee);

        const deliveryType = classifyDeliveryType(cafeteriaName, deliveryAddress, String(order.orderType || ''));
        const liveOrderStatus = mapOrderStatus(String(order.orderStatus || 'confirmed'));
        const livePaymentStatus = 'success';

        const existing = existingMap.get(orderNumber);
        if (!existing) {
          toCreate.push({
            orderId: orderNumber,
            createdAt: parsedDate,
            time,
            customerName,
            cafeteriaName,
            deliveryAddress,
            deliveryFee,
            foodTotal,
            totalAmountPaid,
            deliveryType,
            orderStatus: liveOrderStatus,
            paymentStatus: livePaymentStatus,
            ...(customerPhone && { customerPhone }),
          });
        } else {
          const currentDbStatus = (existing.orderStatus || '').trim().toLowerCase();
          const currentDbPay = (existing.paymentStatus || '').trim().toLowerCase();

          const updateStatus = shouldSyncUpdateOrderStatus(currentDbStatus, liveOrderStatus);
          const updatePay = currentDbPay !== livePaymentStatus.toLowerCase();

          if (updateStatus || updatePay) {
            toUpdate.push({
              id: existing.id,
              status: updateStatus ? liveOrderStatus : existing.orderStatus,
              pay: updatePay ? livePaymentStatus : existing.paymentStatus,
            });
          }
        }
      }

      // Concurrently insert new orders
      if (toCreate.length > 0) {
        await Promise.all(
          toCreate.map(async (c) => {
            try {
              await prisma.deliveryOrder.create({ data: c });
              newlySyncedCount++;
            } catch {
              // Ignore duplicate race condition
            }
          })
        );
      }

      // Concurrently update orders with changed status
      if (toUpdate.length > 0) {
        await Promise.all(
          toUpdate.map(async (u) => {
            try {
              await prisma.deliveryOrder.update({
                where: { id: u.id },
                data: {
                  orderStatus: u.status,
                  paymentStatus: u.pay,
                },
              });
              statusUpdatedCount++;
            } catch {
              // Ignore update error
            }
          })
        );
      }
    } catch (dbErr) {
      console.error('[sync-orders] Database error, falling back to memory:', dbErr);
      const mem = getInMemoryOrders();
      for (const order of validLiveOrders) {
        const orderNumber = String(order.orderNumber || order._id || '').trim();
        const rawDate = order.createdAt;
        let parsedDate = rawDate ? new Date(rawDate) : new Date();
        if (isNaN(parsedDate.getTime())) parsedDate = new Date();

        const h = parsedDate.getHours();
        const m = parsedDate.getMinutes();
        const time = `${(h % 12 || 12).toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

        const customerName = String(order.user?.name || order.customerName || 'Student Customer').trim();
        const cafeteriaName = String(order.vendor?.restaurantName || order.cafeteriaName || 'Campus Cafeteria').trim();
        const deliveryAddress = String(order.deliveryAddress || 'Campus Hostel Block').trim();

        const deliveryFee = Number(order.deliveryFee ?? 0);
        const foodTotal = Number(order.subtotal ?? order.foodTotal ?? 0);
        const totalAmountPaid = Number(order.totalAmount ?? order.totalAmountPaid ?? foodTotal + deliveryFee);

        const deliveryType = classifyDeliveryType(cafeteriaName, deliveryAddress, String(order.orderType || ''));
        const liveOrderStatus = mapOrderStatus(String(order.orderStatus || 'confirmed'));
        const livePaymentStatus = 'success';

        const existingMem = mem.find((o) => o.orderId === orderNumber);
        if (!existingMem) {
          appendMockOrder({
            orderId: orderNumber,
            createdAt: parsedDate,
            time,
            customerName,
            cafeteriaName,
            deliveryAddress,
            deliveryFee,
            foodTotal,
            totalAmountPaid,
            deliveryType,
            orderStatus: liveOrderStatus,
            paymentStatus: livePaymentStatus,
          });
          newlySyncedCount++;
        } else {
          const updateStatus = shouldSyncUpdateOrderStatus(existingMem.orderStatus, liveOrderStatus);
          const updatePay = (existingMem.paymentStatus || '').toLowerCase() !== livePaymentStatus.toLowerCase();
          if (updateStatus || updatePay) {
            updateInMemoryOrder(orderNumber, {
              orderStatus: updateStatus ? liveOrderStatus : existingMem.orderStatus,
              paymentStatus: updatePay ? livePaymentStatus : existingMem.paymentStatus,
            });
            statusUpdatedCount++;
          }
        }
      }
    }
  }

  // ── Build response ─────────────────────────────────────────────────────────
  const hasChanges = newlySyncedCount > 0 || statusUpdatedCount > 0;

  let message = 'No changes — all orders are up to date.';
  if (hasChanges) {
    const parts: string[] = [];
    if (newlySyncedCount > 0) parts.push(`${newlySyncedCount} new order${newlySyncedCount === 1 ? '' : 's'} synced`);
    if (statusUpdatedCount > 0) parts.push(`${statusUpdatedCount} status${statusUpdatedCount === 1 ? '' : 'es'} updated`);
    message = parts.join('. ') + '.';
  }

  const status = getOperationalStatus(settings);

  return {
    success: true,
    hasChanges,
    inOperatingWindow: true,
    operatingStatus: status,
    newlySyncedCount,
    syncedCount: newlySyncedCount,
    statusUpdatedCount,
    totalFetched: liveOrders.length,
    message,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLERS WITH IN-FLIGHT DEDUPLICATION & FORCE OVERRIDE
// ─────────────────────────────────────────────────────────────────────────────

let inFlightSync: Promise<any> | null = null;

async function synchronizedSync(force: boolean = false) {
  if (inFlightSync && !force) {
    return inFlightSync;
  }
  const currentPromise = performSync(force).finally(() => {
    if (inFlightSync === currentPromise) {
      inFlightSync = null;
    }
  });
  if (!inFlightSync) {
    inFlightSync = currentPromise;
  }
  return currentPromise;
}

export async function POST(request: NextRequest) {
  try {
    let force = false;
    try {
      const body = await request.json();
      force = Boolean(body?.force);
    } catch {
      // not JSON body
    }
    const { searchParams } = new URL(request.url);
    if (searchParams.get('force') === 'true') {
      force = true;
    }

    const result = await synchronizedSync(force);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sync-orders] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Sync failed', hasChanges: false },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    const result = await synchronizedSync(force);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sync-orders] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Sync failed', hasChanges: false },
      { status: 500 }
    );
  }
}
