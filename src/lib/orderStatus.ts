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

export function riderStatusView(order: {
  riderId?: string | null;
  orderStatus: string;
  deliveryType?: string;
}): { label: string; tone: Tone } {
  const s = (order.orderStatus || '').toLowerCase();
  if (s.startsWith('canc')) return { label: 'Cancelled', tone: 'rose' };
  if (s === 'delivered' || s === 'completed') return { label: 'Delivered', tone: 'emerald' };
  if (s === 'in transit') return { label: 'Picked up', tone: 'blue' };
  if (order.riderId) return { label: 'Accepted', tone: 'orange' };
  return { label: 'Waiting for rider', tone: 'slate' };
}
