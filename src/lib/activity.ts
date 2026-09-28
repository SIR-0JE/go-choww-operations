import { prisma } from '@/lib/prisma';

export type ActivityType =
  | 'claim'
  | 'pickup'
  | 'deliver'
  | 'drop'
  | 'transfer'
  | 'handover_request'
  | 'handover_accept'
  | 'new_orders';

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
}
