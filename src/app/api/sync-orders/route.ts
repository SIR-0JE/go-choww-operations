import { NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, appendMockOrder } from '@/lib/prisma';
import { fetchLiveGoChowOrders } from '@/services/gochowApi';
import { classifyDeliveryType } from '@/lib/locations';

export const dynamic = 'force-dynamic';

/**
 * GoChow Live API Field Reference (verified from live response):
 *
 * order._id                       — MongoDB ID
 * order.orderNumber               — e.g. "ORD-MU5FPEPS-JBB33"  ← unique key
 * order.user.name                 — customer's full name
 * order.vendor.restaurantName     — cafeteria/vendor name
 * order.vendor.address            — "Permanent Side" | "Temporary Side"
 * order.deliveryAddress           — e.g. "288 girls hostel"
 * order.subtotal                  — food total (NGN)
 * order.deliveryFee               — delivery fee (NGN)
 * order.totalAmount               — total paid (NGN)
 * order.orderStatus               — "delivered" | "dispatched" | "pending" | "cancelled"
 * order.paymentStatus             — "success" | "pending" | "failed"
 * order.createdAt                 — ISO timestamp
 */

function mapOrderStatus(raw: string): 'Completed' | 'Cancelled' | 'Pending' {
  const s = raw.toLowerCase();
  if (s === 'delivered' || s === 'completed') return 'Completed';
  if (s.includes('cancel')) return 'Cancelled';
  return 'Pending'; // covers "dispatched", "pending", etc.
}

function mapPaymentStatus(raw: string): 'success' | 'failed' | 'pending' {
  const s = raw.toLowerCase();
  if (s === 'success' || s === 'paid') return 'success';
  if (s === 'failed') return 'failed';
  return 'pending';
}

async function performSync() {
  const liveOrders = await fetchLiveGoChowOrders();
  const orders = Array.isArray(liveOrders) ? liveOrders : [];

  let newlySyncedCount = 0;

  for (const order of orders) {
    // Unique identifier
    const orderNumber = String(order.orderNumber || order._id || '').trim();
    if (!orderNumber) continue;

    // Date & time
    const rawDate = order.createdAt;
    let parsedDate = rawDate ? new Date(rawDate) : new Date();
    if (isNaN(parsedDate.getTime())) parsedDate = new Date();

    const hours = parsedDate.getHours();
    const minutes = parsedDate.getMinutes();
    const time = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;

    // Customer name — nested under user.name
    const customerName = String(
      order.user?.name ||
      order.customerName ||
      'Student Customer'
    ).trim();

    // Vendor / cafeteria — nested under vendor.restaurantName
    const cafeteriaName = String(
      order.vendor?.restaurantName ||
      order.cafeteriaName ||
      order.vendorName ||
      'Campus Cafeteria'
    ).trim();

    // Delivery address
    const deliveryAddress = String(
      order.deliveryAddress ||
      order.address ||
      'Campus Hostel Block'
    ).trim();

    // Financials
    const deliveryFee = Number(order.deliveryFee ?? 0);
    const foodTotal = Number(order.subtotal ?? order.foodTotal ?? 0);
    const totalAmountPaid = Number(order.totalAmount ?? order.totalAmountPaid ?? foodTotal + deliveryFee);

    // Delivery type classification
    const rawOrderType = String(order.orderType || '').trim(); // e.g. "delivery"
    const deliveryType = classifyDeliveryType(cafeteriaName, deliveryAddress, rawOrderType);

    // Status mapping
    const orderStatus = mapOrderStatus(String(order.orderStatus || 'pending'));
    const paymentStatus = mapPaymentStatus(String(order.paymentStatus || 'pending'));

    // Deduplicate and save
    try {
      const existingOrder = await prisma.deliveryOrder.findUnique({
        where: { orderId: orderNumber },
      });

      if (!existingOrder) {
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
      // Graceful in-memory fallback if DB is unavailable
      const inMemOrders = getInMemoryOrders();
      const exists = inMemOrders.some((o) => o.orderId === orderNumber);
      if (!exists) {
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

  return {
    success: true,
    message:
      newlySyncedCount === 0
        ? `No new orders — all ${orders.length} fetched order${orders.length === 1 ? '' : 's'} already exist in the database.`
        : `Successfully synced ${newlySyncedCount} new order${newlySyncedCount === 1 ? '' : 's'} from GoChow!`,
    newlySyncedCount,
    syncedCount: newlySyncedCount,
    totalFetched: orders.length,
  };
}

export async function POST() {
  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sync-orders] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to sync orders from GoChow',
        newlySyncedCount: 0,
      },
      { status: 500 }
    );
  }
}

// Allow GET as a convenience for quick browser testing
export async function GET() {
  try {
    const result = await performSync();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[sync-orders] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Failed to sync orders from GoChow',
        newlySyncedCount: 0,
      },
      { status: 500 }
    );
  }
}
