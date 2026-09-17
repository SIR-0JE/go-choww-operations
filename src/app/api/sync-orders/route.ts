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
 * - cancelled             → Cancelled
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
// MAIN SYNC FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

async function performSync() {
  // ── 1. Fetch the latest 10 live orders from GoChow ─────────────────────────
  const liveOrders: any[] = await fetchLiveGoChowOrders(10);

  // Quick lookup map: orderNumber → GoChow order object
  const liveOrderMap = new Map<string, any>();
  for (const o of liveOrders) {
    const key = String(o.orderNumber || o._id || '').trim();
    if (key) liveOrderMap.set(key, o);
  }

  let newlySyncedCount = 0;
  let statusUpdatedCount = 0;

  // ── Part A: Insert new paid orders ────────────────────────────────────────
  for (const order of liveOrders) {
    const orderNumber = String(order.orderNumber || order._id || '').trim();
    if (!orderNumber) continue;

    // STRICT RULE: only insert orders with successful payment
    const rawPayment = String(order.paymentStatus || '').toLowerCase();
    if (rawPayment !== 'success' && rawPayment !== 'paid') continue;

    // Parse creation timestamp
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
    const orderStatus = mapOrderStatus(String(order.orderStatus || 'confirmed'));
    const paymentStatus = 'success';

    try {
      const existing = await prisma.deliveryOrder.findUnique({ where: { orderId: orderNumber } });
      if (!existing) {
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
            orderStatus,
            paymentStatus,
          },
        });
        newlySyncedCount++;
      }
    } catch {
      // In-memory fallback
      const mem = getInMemoryOrders();
      if (!mem.some((o) => o.orderId === orderNumber)) {
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
          orderStatus,
          paymentStatus,
        });
        newlySyncedCount++;
      }
    }
  }

  // ── Part B: Re-check & update active (non-delivered) orders ────────────────
  // Terminal statuses that no longer need scanning: "Delivered", "Completed", "Cancelled"
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

  for (const dbOrder of activeDbOrders) {
    let liveMatch = liveOrderMap.get(dbOrder.orderId);

    // If order slipped past the top 10 on GoChow, perform a targeted single lookup
    if (!liveMatch) {
      liveMatch = await fetchGoChowOrderByNumber(dbOrder.orderId);
      if (liveMatch) {
        liveOrderMap.set(dbOrder.orderId, liveMatch);
      }
    }

    if (!liveMatch) continue;

    const newOrderStatus = mapOrderStatus(String(liveMatch.orderStatus || ''));
    const newPaymentStatus = mapPaymentStatus(String(liveMatch.paymentStatus || ''));

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
