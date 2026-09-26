import { prisma } from './prisma';
import { sendPushNotification } from './pushService';

/** An order waiting longer than this for a rider triggers the dashboard warning and a push alert. */
export const WAITING_ALERT_MINUTES = 5;
/** At most one push alert per this many minutes, so a rush doesn't flood the phone. */
const ALERT_COOLDOWN_MINUTES = 10;
/** Ignore older unaccepted orders (stale records) so they can't trigger alerts forever. */
const LOOKBACK_HOURS = 12;
const ALERT_SETTING_KEY = 'dispatch_waiting_alert_last';
/** Orders a rider has held longer than this without delivering are flagged for follow-up. */
export const STUCK_AFTER_HOURS = 6;

const PICKED_UP_OR_FINISHED = [
  'In Transit', 'in transit', 'Delivered', 'delivered', 'Completed', 'completed',
  'Cancelled', 'cancelled', 'Canceled', 'canceled',
];

export interface DispatchStatus {
  waitingCount: number;
  waitingOverThreshold: number;
  oldestWaitingMinutes: number;
  oldestWaitingOrder: { orderId: string; cafeteriaName: string } | null;
  ridersOnline: number;
  thresholdMinutes: number;
  /** Accepted but not delivered, placed over STUCK_AFTER_HOURS ago — likely delivered but never tapped "Delivered". */
  stuckOrders: { orderId: string; riderName: string; hours: number; status: string }[];
  stuckAfterHours: number;
}

/** Paid delivery orders from the last 12 hours that no rider has accepted yet. */
export async function getDispatchStatus(now: Date = new Date()): Promise<DispatchStatus> {
  const since = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60 * 1000);
  const stuckBefore = new Date(now.getTime() - STUCK_AFTER_HOURS * 60 * 60 * 1000);
  const [waiting, ridersOnline, stuck] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: {
        riderId: null,
        createdAt: { gte: since },
        paymentStatus: 'success',
        orderStatus: { notIn: PICKED_UP_OR_FINISHED },
        deliveryType: { notIn: ['Pick up', 'pick up', 'Pickup', 'pickup'] },
      },
      select: { orderId: true, cafeteriaName: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.rider.count({ where: { status: 'Active', isOnline: true } }),
    prisma.deliveryOrder.findMany({
      where: {
        riderId: { not: null },
        createdAt: { lt: stuckBefore },
        orderStatus: { notIn: PICKED_UP_OR_FINISHED.filter((st) => !/transit/i.test(st)) },
      },
      select: { orderId: true, createdAt: true, orderStatus: true, rider: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ]);

  const thresholdMs = WAITING_ALERT_MINUTES * 60 * 1000;
  const oldest = waiting[0];
  return {
    waitingCount: waiting.length,
    waitingOverThreshold: waiting.filter((o) => now.getTime() - o.createdAt.getTime() > thresholdMs).length,
    oldestWaitingMinutes: oldest ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 60000) : 0,
    oldestWaitingOrder: oldest ? { orderId: oldest.orderId, cafeteriaName: oldest.cafeteriaName } : null,
    ridersOnline,
    thresholdMinutes: WAITING_ALERT_MINUTES,
    stuckOrders: stuck.map((o) => ({
      orderId: o.orderId,
      riderName: o.rider?.name || 'Unknown rider',
      hours: Math.floor((now.getTime() - o.createdAt.getTime()) / 3600000),
      status: o.orderStatus,
    })),
    stuckAfterHours: STUCK_AFTER_HOURS,
  };
}

/**
 * Push an alert to admin phones when orders have waited too long for a rider.
 * Called from the background sync, so it works with no dashboard open.
 */
export async function alertIfOrdersWaiting(): Promise<void> {
  const status = await getDispatchStatus();
  if (status.waitingOverThreshold === 0) return;

  const last = await prisma.systemSetting.findUnique({ where: { key: ALERT_SETTING_KEY } });
  const lastAt = last ? Number(last.value) : 0;
  if (Date.now() - lastAt < ALERT_COOLDOWN_MINUTES * 60 * 1000) return;

  await prisma.systemSetting.upsert({
    where: { key: ALERT_SETTING_KEY },
    create: { key: ALERT_SETTING_KEY, value: String(Date.now()) },
    update: { value: String(Date.now()) },
  });

  const n = status.waitingOverThreshold;
  const riders = status.ridersOnline === 1 ? '1 rider' : `${status.ridersOnline} riders`;
  await sendPushNotification(
    {
      title: `⏰ ${n} order${n === 1 ? '' : 's'} waiting for a rider`,
      body: `Oldest has waited ${status.oldestWaitingMinutes} min (${status.oldestWaitingOrder?.cafeteriaName}). ${riders} online — consider calling in help.`,
      url: '/dashboard',
      tag: 'dispatch-waiting',
    },
    { userType: 'admin' }
  );
}
