import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';
import { fetchLiveGoChowOrders, fetchLiveGoChowOrdersWithStatus } from '@/services/gochowApi';
import { classifyDeliveryType } from '@/lib/locations';
import { getSyncSettings, isWithinOperatingWindow, getOperationalStatus, getCurrentTimeInZone } from '@/lib/settings';
import { sendPushNotification } from '@/lib/pushService';

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
  if (s === 'delivered' || s === 'completed') return 'Completed';
  if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
  if (s === 'dispatched') return 'Ready'; // Ready for rider pickup in dispatch pool
  if (s === 'ready') return 'Ready';
  if (s === 'preparing') return 'Preparing';
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
 * Enforces order status progression rules during external GoChow sync:
 * 1. Active Delivery Lock: If an active rider has claimed this order (hasRiderAssigned),
 *    do not let external GoChow mark it completed or demote it — rider portal controls delivery lifecycle.
 * 2. Terminal Completed: Once marked Completed/Delivered, never alter or demote.
 * 3. Remote Cancellation: GoChow cancellations apply to any active uncompleted order.
 * 4. Transit Protection: Dispatched orders cannot be demoted back to Ready/Preparing.
 * 5. Kitchen Progression: GoChow updates Confirmed -> Preparing -> Ready.
 */
function shouldSyncUpdateOrderStatus(
  currentDbStatus: string,
  incomingLiveStatus: string,
  hasRiderAssigned: boolean = false
): boolean {
  const current = (currentDbStatus || '').trim().toLowerCase();
  const incoming = (incomingLiveStatus || '').trim().toLowerCase();

  if (!incoming || current === incoming) return false;

  // 1. Terminal lock: Never demote or alter once completed
  if (current === 'completed' || current === 'delivered') {
    return false;
  }

  // 2. Cancellation handling: GoChow remote cancellation takes effect on uncompleted orders
  if (incoming === 'cancelled' || incoming === 'canceled') {
    return true;
  }

  // 3. Active Delivery Protection: If an active rider holds this order,
  // do not let external GoChow auto-complete it or change its transit state.
  if (hasRiderAssigned) {
    // Only kitchen progression from Confirmed -> Preparing -> Ready is allowed before pickup
    if (incoming === 'preparing' && current === 'confirmed') return true;
    if (incoming === 'ready' && (current === 'confirmed' || current === 'preparing')) return true;
    return false;
  }

  // 4. If locally cancelled, do not resurrect unless GoChow explicitly marks completed
  if (current === 'cancelled' || current === 'canceled') {
    return incoming === 'completed' || incoming === 'delivered';
  }

  // 5. Transit protection: Dispatched orders cannot be demoted back to Ready, Preparing, or Confirmed
  if (current === 'dispatched') {
    return incoming === 'completed' || incoming === 'delivered';
  }

  // 6. Forward progression rule: incoming rank must be strictly higher than current
  const currentRank = STATUS_RANK[current] ?? 0;
  const incomingRank = STATUS_RANK[incoming] ?? 0;

  return incomingRank > currentRank;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SYNC FUNCTION (HIGH SPEED < 0.5s)
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_PAGE_SIZE = 50;
const DEEP_SCAN_INTERVAL_MS = 5 * 60 * 1000; // catch-up scan at most every 5 minutes (or on manual sync)
const DEEP_SCAN_LOOKBACK_MS = 48 * 60 * 60 * 1000; // look back 48 hours
const DEEP_SCAN_MAX_PAGES = 10; // hard cap: 500 orders per catch-up scan
let lastDeepScanAt = 0;

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

  // ── 1. Fetch the latest 50 live orders from GoChow with retry & connection status ────
  const fetchResult = await fetchLiveGoChowOrdersWithStatus(SYNC_PAGE_SIZE);

  if (!fetchResult.success) {
    const status = getOperationalStatus(settings);
    return {
      success: false,
      hasChanges: false,
      isNetworkError: fetchResult.isNetworkError,
      inOperatingWindow: true,
      operatingStatus: status,
      newlySyncedCount: 0,
      syncedCount: 0,
      statusUpdatedCount: 0,
      totalFetched: 0,
      error: fetchResult.error,
      message: fetchResult.isNetworkError
        ? 'Reconnecting to GoChow API... Retrying automatically on next poll.'
        : `GoChow API notice: ${fetchResult.error}`,
    };
  }

  const liveOrders: any[] = fetchResult.orders;

  // ── 1b. Catch-up scan: page back through the last 48h so orders that fell past
  // page 1 while nobody was syncing (or were paid late) still get picked up ────
  if (force || Date.now() - lastDeepScanAt > DEEP_SCAN_INTERVAL_MS) {
    const cutoff = Date.now() - DEEP_SCAN_LOOKBACK_MS;
    const seen = new Set(liveOrders.map((o) => String(o.orderNumber || o._id || '')));
    let lastPage = liveOrders;
    let completed = true;

    for (let page = 2; page <= DEEP_SCAN_MAX_PAGES; page++) {
      if (lastPage.length < SYNC_PAGE_SIZE) break;
      const oldest = new Date(lastPage[lastPage.length - 1]?.createdAt).getTime();
      if (!isNaN(oldest) && oldest < cutoff) break;

      const pageResult = await fetchLiveGoChowOrdersWithStatus(SYNC_PAGE_SIZE, page);
      if (!pageResult.success) {
        completed = false;
        break;
      }
      const fresh = pageResult.orders.filter((o) => !seen.has(String(o.orderNumber || o._id || '')));
      // Stop if the API ignores paging and keeps returning orders we've already seen
      if (fresh.length === 0) break;
      for (const o of fresh) seen.add(String(o.orderNumber || o._id || ''));
      liveOrders.push(...fresh);
      lastPage = pageResult.orders;
    }

    if (completed) lastDeepScanAt = Date.now();
  }

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
      // ── 2. Batch fetch all existing records in 1 single roundtrip with retry ────
      const existingDbOrders = await withDbRetry(async () => {
        return await prisma.deliveryOrder.findMany({
          where: { orderId: { in: orderNumbers } },
        });
      }, 3, 400);

      const existingMap = new Map<string, (typeof existingDbOrders)[0]>();
      for (const edb of existingDbOrders) {
        existingMap.set(edb.orderId, edb);
      }

      const toCreate: any[] = [];
      const toUpdate: { id: string; status: string; pay: string; pickupCode?: string | null }[] = [];

      for (const order of validLiveOrders) {
        const orderNumber = String(order.orderNumber || order._id || '').trim();
        const rawDate = order.createdAt;
        let parsedDate = rawDate ? new Date(rawDate) : new Date();
        if (isNaN(parsedDate.getTime())) parsedDate = new Date();

        // Server runs in UTC; record the order time as Lagos (WAT) wall-clock time
        const time = getCurrentTimeInZone('Africa/Lagos', parsedDate).timeString12;

        const customerName = String(order.user?.name || order.customerName || 'Student Customer').trim();
        const cafeteriaName = String(order.vendor?.restaurantName || order.cafeteriaName || 'Campus Cafeteria').trim();
        const deliveryAddress = String(order.deliveryAddress || 'Campus Hostel Block').trim();
        // Extract phone & email from GoChow user profile if present
        const customerPhone = String(order.user?.phone || order.user?.phoneNumber || order.customerPhone || '').trim() || null;
        const customerEmail = String(order.user?.email || order.customerEmail || order.email || '').trim().toLowerCase() || null;
        const pickupCode = order.confirmationCode ? String(order.confirmationCode).trim() : (order.pickupCode ? String(order.pickupCode).trim() : null);

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
            ...(customerEmail && { customerEmail }),
            ...(pickupCode && { pickupCode }),
          });
        } else {
          const currentDbStatus = (existing.orderStatus || '').trim().toLowerCase();
          const currentDbPay = (existing.paymentStatus || '').trim().toLowerCase();
          const hasRider = Boolean(existing.riderId);

          const updateStatus = shouldSyncUpdateOrderStatus(currentDbStatus, liveOrderStatus, hasRider);
          const updatePay = currentDbPay !== livePaymentStatus.toLowerCase();
          const updateCode = Boolean(pickupCode && (existing as any).pickupCode !== pickupCode);

          if (updateStatus || updatePay || updateCode) {
            toUpdate.push({
              id: existing.id,
              status: updateStatus ? liveOrderStatus : existing.orderStatus,
              pay: updatePay ? livePaymentStatus : existing.paymentStatus,
              ...(updateCode && { pickupCode }),
            });
          }
        }
      }

      // Batch insert new orders in a single query with retry
      if (toCreate.length > 0) {
        try {
          const result = await withDbRetry(async () => {
            return await prisma.deliveryOrder.createMany({
              data: toCreate,
              skipDuplicates: true,
            });
          }, 3, 400);
          newlySyncedCount = result.count;
        } catch (insertErr) {
          console.error('[sync-orders] Batch createMany error, falling back to sequential inserts:', insertErr);
          for (const c of toCreate) {
            try {
              await withDbRetry(async () => {
                return await prisma.deliveryOrder.create({ data: c });
              }, 2, 200);
              newlySyncedCount++;
            } catch (err: any) {
              console.warn(`[sync-orders] Failed inserting order ${c.orderId}:`, err?.message);
            }
          }
        }
      }

      // Update orders with changed status
      if (toUpdate.length > 0) {
        for (const u of toUpdate) {
          try {
            await withDbRetry(async () => {
              return await prisma.deliveryOrder.update({
                where: { id: u.id },
                data: {
                  orderStatus: u.status,
                  paymentStatus: u.pay,
                  ...(u.pickupCode && { pickupCode: u.pickupCode }),
                },
              });
            }, 2, 200);
            statusUpdatedCount++;
          } catch (updateErr: any) {
            console.warn(`[sync-orders] Failed updating order ID ${u.id}:`, updateErr?.message);
          }
        }
      }
    } catch (dbErr) {
      console.error('[sync-orders] Database error during sync execution:', dbErr);
    }
  }

  // ── Build response ─────────────────────────────────────────────────────────
  const hasChanges = newlySyncedCount > 0 || statusUpdatedCount > 0;

  if (newlySyncedCount > 0) {
    // Asynchronously dispatch mobile phone push notification to all riders and dashboard
    sendPushNotification(
      {
        title: newlySyncedCount === 1 ? '🛵 New Order on GoChoww!' : `🛵 ${newlySyncedCount} New Orders on GoChoww!`,
        body:
          newlySyncedCount === 1
            ? `New order ready for pickup in the dispatch pool!`
            : `${newlySyncedCount} new customer orders are waiting for pickup in the pool!`,
        url: '/rider/portal',
        tag: `new-order-${Date.now()}`,
      },
      { userType: 'all' }
    ).catch((err) => console.warn('Background push dispatch error:', err));
  }

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
