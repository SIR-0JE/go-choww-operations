import { prisma } from './prisma';
import { sendPushNotification } from './pushService';
import { sameCafeteria } from './runners';

/**
 * Phone alert for the runner on duty at each cafeteria that just got new orders.
 * One alert per runner per batch ("3 new orders to pack"). Never throws.
 */
export async function notifyRunners(newOrders: { cafeteriaName: string; orderId: string; deliveryType?: string }[]) {
  if (!newOrders.length) return;
  try {
    const runners = await prisma.runner.findMany({ where: { status: 'Active' } });
    for (const r of runners) {
      const mine = newOrders.filter((o) => sameCafeteria(o.cafeteriaName, r.cafeteria));
      if (!mine.length) continue;
      await sendPushNotification(
        {
          title: mine.length === 1 ? `🥡 New order at ${r.cafeteria}` : `🥡 ${mine.length} new orders at ${r.cafeteria}`,
          body: mine.length === 1 ? 'Pack it and tap Ready.' : 'Pack them and tap Ready on each.',
          url: '/runner',
          tag: `runner-${r.id}-${Date.now()}`,
          requireInteraction: true,
        },
        { userType: 'runner', riderId: r.id }
      ).catch(() => {});
    }
  } catch (err) {
    // Runner table not created yet, or database busy: skip the alert
    console.warn('[runnerAlerts] skipped:', (err as Error)?.message);
  }
}
