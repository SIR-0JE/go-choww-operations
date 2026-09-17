import { NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, appendMockOrder, updateInMemoryOrder } from '@/lib/prisma';
import { fetchLiveGoChowOrders } from '@/services/gochowApi';
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
          });
        } else {
          const currentDbStatus = (existing.orderStatus || '').trim().toLowerCase();
          const currentDbPay = (existing.paymentStatus || '').trim().toLowerCase();

          if (
            currentDbStatus !== liveOrderStatus.toLowerCase() ||
            currentDbPay !== livePaymentStatus.toLowerCase()
          ) {
            toUpdate.push({
              id: existing.id,
              status: liveOrderStatus,
              pay: livePaymentStatus,
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
        } else if (existingMem.orderStatus.toLowerCase() !== liveOrderStatus.toLowerCase()) {
          updateInMemoryOrder(orderNumber, {
            orderStatus: liveOrderStatus,
            paymentStatus: livePaymentStatus,
          });
          statusUpdatedCount++;
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
