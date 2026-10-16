import { prisma } from '@/lib/prisma';
import { ACTIVITY_TO_EVENT, logOrderEvent } from '@/lib/orderEvents';

export type ActivityType =
  | 'claim'
  | 'pickup'
  | 'deliver'
  | 'drop'
  | 'transfer'
  | 'handover_request'
  | 'handover_accept'
  | 'new_orders'
  // collector mode (for rep actions the "rider" fields hold the rep)
  | 'collector_handed'
  | 'collector_received'
  | 'collector_delivered'
  | 'collector_not_reachable'
  | 'collector_returned'
  // runners (the "rider" fields hold the runner)
  | 'runner_ready'
  | 'runner_undo';

/**
 * Records a rider action so the admin sees it on the Notifications page,
 * whichever device they're on. Never throws: a failed log must not fail the action.
 */
export async function logActivity(
  type: ActivityType,
  rider: { id: string; name: string } | null,
  order: { id?: string; orderId?: string; customerName?: string; cafeteriaName?: string; deliveryAddress?: string },
  detail?: string
) {
  try {
    await prisma.riderActivity.create({
      data: {
        type,
        riderId: rider?.id ?? null,
        riderName: rider?.name ?? null,
        orderDbId: order.id ?? null,
        orderNumber: order.orderId ?? null,
        customerName: order.customerName ?? null,
        cafeteriaName: order.cafeteriaName ?? null,
        deliveryAddress: order.deliveryAddress ?? null,
        detail: detail ?? null,
      },
    });
  } catch (err) {
    console.warn('[activity] could not record', type, err);
  }

  // The same tap, as a step on the order's timeline
  const step = ACTIVITY_TO_EVENT[type];
  if (step && order.id) {
    await logOrderEvent(order.id, step.kind, { source: step.source, actorName: rider?.name ?? null, detail: detail ?? null });
  }
}
