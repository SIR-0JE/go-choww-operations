import { NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, appendMockOrder, updateInMemoryOrder } from '@/lib/prisma';
import { fetchLiveGoChowOrders, fetchGoChowOrderByNumber } from '@/services/gochowApi';
import { classifyDeliveryType } from '@/lib/locations';

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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC FUNCTION (HIGH SPEED < 0.5s)
// ─────────────────────────────────────────────────────────────────────────────

async function performSync() {
  // ── 1. Fetch the latest 30 live orders from GoChow in a single fast call ────
  const liveOrders: any[] = await fetchLiveGoChowOrders(30);

  // Quick lookup map: orderNumber → GoChow order object
  const liveOrderMap = new Map<string, any>();
  for (const o of liveOrders) {
    const key = String(o.orderNumber || o._id || '').trim();
    if (key) liveOrderMap.set(key, o);
  }

  let newlySyncedCount = 0;
  let statusUpdatedCount = 0;

  // ── Part A: Process fetched live orders (Insert new + Update existing) ────
  for (const order of liveOrders) {
    const orderNumber = String(order.orderNumber || order._id || '').trim();
    if (!orderNumber) continue;

    // Filter: only insert orders with successful payment (or previously paid)
    const rawPayment = String(order.paymentStatus || '').toLowerCase();
    const isPaid = rawPayment === 'success' || rawPayment === 'paid';
    if (!isPaid) continue;

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

    try {
      const existing = await prisma.deliveryOrder.findUnique({ where: { orderId: orderNumber } });

      if (!existing) {
        // Insert new order
        await prisma.deliveryOrder.create({
          data: {
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
          },
        });
        newlySyncedCount++;
      } else {
        // Order exists in DB — check if status changed (e.g. Confirmed → Cancelled or Delivered)
        const currentDbStatus = (existing.orderStatus || '').trim().toLowerCase();
        const currentDbPay = (existing.paymentStatus || '').trim().toLowerCase();

        if (
          currentDbStatus !== liveOrderStatus.toLowerCase() ||
          currentDbPay !== livePaymentStatus.toLowerCase()
        ) {
          await prisma.deliveryOrder.update({
            where: { id: existing.id },
            data: {
              orderStatus: liveOrderStatus,
              paymentStatus: livePaymentStatus,
            },
          });
          statusUpdatedCount++;
        }
      }
    } catch {
      // In-memory fallback
      const mem = getInMemoryOrders();
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
        if (existingMem.orderStatus.toLowerCase() !== liveOrderStatus.toLowerCase()) {
          updateInMemoryOrder(orderNumber, {
            orderStatus: liveOrderStatus,
            paymentStatus: livePaymentStatus,
          });
          statusUpdatedCount++;
        }
      }
    }
  }

  // ── Part B: Parallel targeted check for older active orders ────────────────
  const terminalStatuses = ['Delivered', 'Completed', 'Cancelled', 'delivered', 'completed', 'cancelled'];

  let activeDbOrders: any[] = [];
  try {
    activeDbOrders = await prisma.deliveryOrder.findMany({
      where: {
        orderStatus: {
          notIn: terminalStatuses,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, orderId: true, orderStatus: true, paymentStatus: true },
    });
  } catch {
    const mem = getInMemoryOrders();
    activeDbOrders = mem
      .filter((o) => !terminalStatuses.includes(o.orderStatus))
      .slice(0, 20)
      .map((o) => ({
        id: o.id || o.orderId,
        orderId: o.orderId,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
      }));
  }

  // Only perform targeted lookups for active orders NOT in the top 30
  const olderActiveOrders = activeDbOrders.filter((o) => !liveOrderMap.has(o.orderId));

  if (olderActiveOrders.length > 0) {
    // Run targeted searches in parallel (< 1s total)
    const lookups = await Promise.all(
      olderActiveOrders.map(async (dbOrder) => {
        try {
          const match = await fetchGoChowOrderByNumber(dbOrder.orderId);
          return { dbOrder, match };
        } catch {
          return { dbOrder, match: null };
        }
      })
    );

    for (const { dbOrder, match } of lookups) {
      if (!match) continue;

      const newOrderStatus = mapOrderStatus(String(match.orderStatus || ''));
      const newPaymentStatus = mapPaymentStatus(String(match.paymentStatus || ''));

      const statusChanged =
        newOrderStatus.toLowerCase() !== dbOrder.orderStatus.toLowerCase() ||
        newPaymentStatus.toLowerCase() !== dbOrder.paymentStatus.toLowerCase();

      if (!statusChanged) continue;

      try {
        await prisma.deliveryOrder.update({
          where: { id: dbOrder.id },
          data: { orderStatus: newOrderStatus, paymentStatus: newPaymentStatus },
        });
        statusUpdatedCount++;
      } catch {
        updateInMemoryOrder(dbOrder.orderId, { orderStatus: newOrderStatus, paymentStatus: newPaymentStatus });
        statusUpdatedCount++;
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

  return {
    success: true,
    hasChanges,
    newlySyncedCount,
    syncedCount: newlySyncedCount,
    statusUpdatedCount,
    totalFetched: liveOrders.length,
    message,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sync-orders] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Sync failed', hasChanges: false },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sync-orders] Error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Sync failed', hasChanges: false },
      { status: 500 }
    );
  }
}
