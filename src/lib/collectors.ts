/**
 * Choww collector mode. During busy windows (Sunday bulk orders) each big hostel has a
 * collector: the rider brings the food to them, both confirm the handover, and the
 * collector gets it to the customer.
 *
 * Stages on an order (DeliveryOrder.collectorStage):
 *   null           on its way: waiting for a rider, accepted, or picked up
 *   handed         rider says they handed it over, waiting for the collector to confirm
 *   received       collector confirmed; the rider is done with it
 *   not_reachable  collector couldn't reach the customer; still holding it
 *   delivered      collector delivered it (orderStatus is then Completed)
 *   returned       collector gave it back; any rider can take it and deliver directly
 */

import { prisma } from './prisma';
import { getCurrentTimeInZone } from './settings';

export interface CollectorModeSettings {
  mode: 'auto' | 'on' | 'off'; // auto = follow the schedule
  days: number[]; // 0 = Sunday
  startTime: string; // "12:00", Lagos
  endTime: string; // "15:00", Lagos
  riderLimitNormal: number;
  riderLimitCollector: number;
  returnAfterMinutes: number; // after "not reachable", when the collector may give it back to a rider
  handoverAlertMinutes: number; // rider says handed, collector hasn't confirmed: goes red after this
  lastUpdated?: string;
}

export const DEFAULT_COLLECTOR_SETTINGS: CollectorModeSettings = {
  mode: 'off',
  days: [0],
  startTime: '12:00',
  endTime: '15:00',
  riderLimitNormal: 5,
  riderLimitCollector: 8,
  returnAfterMinutes: 20,
  handoverAlertMinutes: 10,
};

const KEY = 'collector_mode';
let cache: { value: CollectorModeSettings; at: number } | null = null;

export async function getCollectorSettings(maxAgeMs = 15_000): Promise<CollectorModeSettings> {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.value;
  try {
    const record = await prisma.systemSetting.findUnique({ where: { key: KEY } });
    const value = { ...DEFAULT_COLLECTOR_SETTINGS, ...(record?.value ? JSON.parse(record.value) : {}) };
    cache = { value, at: Date.now() };
    return value;
  } catch {
    return cache?.value ?? DEFAULT_COLLECTOR_SETTINGS;
  }
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const isTime = (t: unknown): t is string => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t);

export async function saveCollectorSettings(input: Partial<CollectorModeSettings>): Promise<CollectorModeSettings> {
  const cur = await getCollectorSettings(0);
  const next: CollectorModeSettings = {
    mode: input.mode && ['auto', 'on', 'off'].includes(input.mode) ? input.mode : cur.mode,
    days: Array.isArray(input.days) ? Array.from(new Set(input.days.map(Number).filter((d) => d >= 0 && d <= 6))).sort() : cur.days,
    startTime: isTime(input.startTime) ? input.startTime : cur.startTime,
    endTime: isTime(input.endTime) ? input.endTime : cur.endTime,
    riderLimitNormal: input.riderLimitNormal !== undefined ? clampInt(input.riderLimitNormal, 1, 30, cur.riderLimitNormal) : cur.riderLimitNormal,
    riderLimitCollector:
      input.riderLimitCollector !== undefined ? clampInt(input.riderLimitCollector, 1, 30, cur.riderLimitCollector) : cur.riderLimitCollector,
    returnAfterMinutes:
      input.returnAfterMinutes !== undefined ? clampInt(input.returnAfterMinutes, 0, 240, cur.returnAfterMinutes) : cur.returnAfterMinutes,
    handoverAlertMinutes:
      input.handoverAlertMinutes !== undefined ? clampInt(input.handoverAlertMinutes, 1, 120, cur.handoverAlertMinutes) : cur.handoverAlertMinutes,
    lastUpdated: new Date().toISOString(),
  };
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    update: { value: JSON.stringify(next) },
    create: { key: KEY, value: JSON.stringify(next) },
  });
  cache = { value: next, at: Date.now() };
  return next;
}

/** Is collector mode on right now? Manual on/off wins; otherwise the schedule decides. */
export function isCollectorModeActive(s: CollectorModeSettings, now: Date = new Date()): boolean {
  if (s.mode === 'on') return true;
  if (s.mode === 'off') return false;
  const { hour, minute, dayOfWeek } = getCurrentTimeInZone('Africa/Lagos', now);
  if (!s.days.includes(dayOfWeek)) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const cur = hour * 60 + minute;
  return cur >= toMin(s.startTime) && cur < toMin(s.endTime);
}

/** How many open orders a rider may hold right now. */
export async function currentRiderLimit(): Promise<number> {
  const s = await getCollectorSettings();
  return isCollectorModeActive(s) ? s.riderLimitCollector : s.riderLimitNormal;
}

// Stages where the rider no longer holds the food (it's with the collector)
export const RIDER_RELEASED_STAGES = ['received', 'not_reachable', 'delivered'];

/** Prisma condition: the order is not sitting with a collector. */
export const notWithCollector = {
  OR: [{ collectorStage: null }, { collectorStage: { notIn: RIDER_RELEASED_STAGES } }],
};

const OPEN_NOT_PICKED = ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled', 'In Transit', 'in transit'];

/**
 * Runs on every sync. While collector mode is on, today's orders to a covered hostel that
 * haven't been picked up yet get that hostel's collector. When it's off, orders not yet
 * picked up go back to normal direct delivery. Orders already on their way keep their collector.
 */
export async function attachCollectors(now: Date = new Date()) {
  const s = await getCollectorSettings(0);
  const active = isCollectorModeActive(s, now);
  const since = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  if (!active) {
    const r = await prisma.deliveryOrder.updateMany({
      where: { collectorId: { not: null }, collectorStage: null, orderStatus: { notIn: OPEN_NOT_PICKED } },
      data: { collectorId: null },
    });
    return { active, attached: 0, detached: r.count };
  }

  const collectors = await prisma.collector.findMany({ where: { status: 'Active' } });
  let attached = 0;
  for (const c of collectors) {
    if (!c.hostels.length) continue;
    const r = await prisma.deliveryOrder.updateMany({
      where: {
        collectorId: null,
        collectorStage: null,
        createdAt: { gte: since },
        deliveryAddress: { in: c.hostels },
        orderStatus: { notIn: OPEN_NOT_PICKED },
        NOT: { deliveryType: { contains: 'pick', mode: 'insensitive' } },
      },
      data: { collectorId: c.id },
    });
    attached += r.count;
  }
  return { active, attached, detached: 0 };
}

export function normalizePhone(p: string): string {
  const digits = (p || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** The signed-in collector (cookie set at login; header fallback like the rider app). */
export async function getCollectorFromRequest(req: { headers: Headers; cookies: { get(name: string): { value: string } | undefined } }) {
  let id = req.headers.get('x-collector-id');
  if (!id) {
    const raw = req.cookies.get('collector_session')?.value;
    if (raw) {
      try {
        id = JSON.parse(raw).id;
      } catch {
        // ignore
      }
    }
  }
  if (!id) return null;
  const c = await prisma.collector.findUnique({ where: { id } });
  return c && c.status === 'Active' ? c : null;
}

/** Fields both the collector app and the admin board show for an order. */
export const COLLECTOR_ORDER_SELECT = {
  id: true,
  orderId: true,
  createdAt: true,
  time: true,
  customerName: true,
  customerPhone: true,
  cafeteriaName: true,
  deliveryAddress: true,
  deliveryType: true,
  orderStatus: true,
  gochowStatus: true,
  pickupCode: true,
  items: true,
  riderId: true,
  collectorId: true,
  collectorStage: true,
  handedAt: true,
  receivedAt: true,
  notReachableAt: true,
  collectorDoneAt: true,
  rider: { select: { id: true, name: true, phone: true } },
  collector: { select: { id: true, name: true, phone: true, pointName: true } },
} as const;

/** Where a collector order is right now, in plain words. */
export function collectorPhase(o: { collectorStage: string | null; riderId: string | null; orderStatus: string }):
  | 'waiting_rider'
  | 'with_rider'
  | 'on_the_way'
  | 'handed'
  | 'with_collector'
  | 'not_reachable'
  | 'delivered'
  | 'returned'
  | 'cancelled' {
  const s = (o.orderStatus || '').toLowerCase();
  if (s.startsWith('canc')) return 'cancelled';
  if (o.collectorStage === 'delivered') return 'delivered';
  if (o.collectorStage === 'returned') return 'returned';
  if (o.collectorStage === 'not_reachable') return 'not_reachable';
  if (o.collectorStage === 'received') return 'with_collector';
  if (o.collectorStage === 'handed') return 'handed';
  if (s === 'completed' || s === 'delivered') return 'delivered';
  if (!o.riderId) return 'waiting_rider';
  if (s === 'in transit') return 'on_the_way';
  return 'with_rider';
}

/** Checks shared by create and update. Returns an error message, or null if fine. */
export async function validateCollector(
  data: { name?: string; phone?: string; pin?: string; pointName?: string; hostels?: string[]; status?: string },
  selfId?: string
): Promise<string | null> {
  if (data.name !== undefined && !data.name.trim()) return 'Name is required.';
  if (data.pointName !== undefined && !data.pointName.trim()) return 'Location name is required.';
  if (data.pin !== undefined && !/^\d{4}$/.test(data.pin)) return 'PIN must be 4 digits.';
  if (data.phone !== undefined) {
    const p = normalizePhone(data.phone);
    if (p.length < 10) return 'Enter a full phone number.';
    const all = await prisma.collector.findMany({ select: { id: true, phone: true } });
    if (all.some((c) => c.id !== selfId && normalizePhone(c.phone) === p)) return 'Another collector already uses this phone number.';
  }
  if (data.hostels !== undefined) {
    if (!data.hostels.length) return 'Pick at least one hostel.';
    // One hostel, one collector
    const others = await prisma.collector.findMany({ where: { status: 'Active', ...(selfId && { id: { not: selfId } }) } });
    for (const h of data.hostels) {
      const owner = others.find((c) => c.hostels.includes(h));
      if (owner) return `${h} is already covered by ${owner.name} (${owner.pointName}).`;
    }
  }
  return null;
}

