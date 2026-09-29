/**
 * Every order has two statuses, shown side by side:
 *  - GoChow status: exactly what GoChow says (the cafeteria's side), mirrored by the sync.
 *  - Rider status: our side — waiting for a rider, accepted, picked up, delivered.
 */

export type Tone = 'slate' | 'amber' | 'orange' | 'blue' | 'emerald' | 'rose';

export const TONE_DOT: Record<Tone, string> = {
  slate: 'bg-slate-400',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
};

export function gochowStatusView(gochowStatus?: string | null): { label: string; tone: Tone } {
  switch ((gochowStatus || '').toLowerCase()) {
    case 'confirmed':
      return { label: 'Confirmed', tone: 'slate' };
    case 'preparing':
      return { label: 'Preparing', tone: 'amber' };
    case 'ready':
      return { label: 'Ready', tone: 'orange' };
    case 'dispatched':
      return { label: 'Dispatched', tone: 'blue' };
    case 'delivered':
      return { label: 'Delivered', tone: 'emerald' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'rose' };
    default:
      return { label: 'Not synced', tone: 'slate' };
  }
}

/** Pick-up orders: the customer collects from the cafeteria, so no rider is involved. */
export function isPickup(deliveryType?: string | null): boolean {
  return (deliveryType || '').toLowerCase().includes('pick');
}

/** Prisma condition that leaves pick-up orders out. */
export const NOT_PICKUP = { NOT: { deliveryType: { contains: 'pick', mode: 'insensitive' as const } } };

export function riderStatusView(order: {
  riderId?: string | null;
  orderStatus: string;
  deliveryType?: string;
  collectorStage?: string | null;
}): { label: string; tone: Tone } {
  const s = (order.orderStatus || '').toLowerCase();
  if (s.startsWith('canc')) return { label: 'Cancelled', tone: 'rose' };
  if (s === 'delivered' || s === 'completed') return { label: 'Delivered', tone: 'emerald' };
  if (order.collectorStage === 'handed') return { label: 'Handed to collector', tone: 'blue' };
  if (order.collectorStage === 'received') return { label: 'With collector', tone: 'blue' };
  if (order.collectorStage === 'not_reachable') return { label: 'Customer not reachable', tone: 'rose' };
  if (s === 'in transit') return { label: 'Picked up', tone: 'blue' };
  if (order.riderId) return { label: 'Accepted', tone: 'orange' };
  if (isPickup(order.deliveryType)) return { label: 'Customer collects', tone: 'slate' };
  return { label: 'Waiting for rider', tone: 'slate' };
}

/** GoChow status, falling back to ours for orders synced before GoChow's was stored. */
export function effectiveGochowStatus(o: { gochowStatus?: string | null; orderStatus?: string | null }): string {
  if (o.gochowStatus) return gochowStatusView(o.gochowStatus).label;
  const own = (o.orderStatus || '').toLowerCase();
  if (own.startsWith('canc')) return 'Cancelled';
  if (own === 'completed' || own === 'delivered') return 'Delivered';
  if (own === 'ready') return 'Ready';
  if (own === 'preparing') return 'Preparing';
  return 'Confirmed';
}
