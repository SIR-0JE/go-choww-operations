import { prisma } from './prisma';
import { gochowKind } from './orderEvents';

/**
 * GoChow may include the time of each status change in its order data. We can't see the
 * payload shape from here, so this looks for the common shapes (a list of status changes,
 * or fields like preparingAt / readyAt). When none exist, our sync records the minute it
 * first saw each status instead.
 */
const HISTORY_FIELDS = ['statusHistory', 'statusTimeline', 'statusUpdates', 'timeline', 'history', 'trackingHistory', 'orderTimeline'];
const DIRECT_FIELDS: Record<string, string> = {
  confirmedAt: 'gochow_confirmed',
  paidAt: 'gochow_confirmed',
  acceptedAt: 'gochow_confirmed',
  preparingAt: 'gochow_preparing',
  readyAt: 'gochow_ready',
  dispatchedAt: 'gochow_dispatched',
  deliveredAt: 'gochow_delivered',
  completedAt: 'gochow_delivered',
  cancelledAt: 'gochow_cancelled',
  canceledAt: 'gochow_cancelled',
};

function validDate(v: unknown, createdAt: Date): Date | null {
  if (!v || (typeof v !== 'string' && typeof v !== 'number')) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  // Sanity: not before the order was placed (small slack), not in the future
  if (d.getTime() < createdAt.getTime() - 60_000 || d.getTime() > Date.now() + 5 * 60_000) return null;
  return d;
}

export function extractGoChowTimes(order: any, createdAt: Date): { kind: string; at: Date }[] {
  const found = new Map<string, Date>();
  for (const [field, kind] of Object.entries(DIRECT_FIELDS)) {
    const d = validDate(order?.[field], createdAt);
    if (d && (!found.has(kind) || d < found.get(kind)!)) found.set(kind, d);
  }
  for (const field of HISTORY_FIELDS) {
    const list = order?.[field];
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const kind = gochowKind(String(entry?.status ?? entry?.orderStatus ?? entry?.state ?? entry?.name ?? ''));
      const d = validDate(entry?.at ?? entry?.timestamp ?? entry?.createdAt ?? entry?.updatedAt ?? entry?.time ?? entry?.date, createdAt);
      if (kind && d && (!found.has(kind) || d < found.get(kind)!)) found.set(kind, d);
    }
  }
  return Array.from(found, ([kind, at]) => ({ kind, at }));
}

/** The steps to record for an order: GoChow's own times where given, else "seen just now". */
export function buildSteps(
  orderDbId: string,
  status: string | null | undefined,
  hints: { kind: string; at: Date }[],
  now: Date
) {
  const steps = hints.map((h) => ({ orderDbId, kind: h.kind, at: h.at, exact: true }));
  const current = gochowKind(status);
  if (current && !steps.some((s) => s.kind === current)) steps.push({ orderDbId, kind: current, at: now, exact: false });
  return steps;
}

// Which time-looking fields GoChow actually sends, kept so we can see what's available
const knownKeys = new Set<string>();
const DIAG_KEY = 'gochow_time_keys';

export async function noteTimeKeys(sampleOrders: any[]) {
  try {
    const before = knownKeys.size;
    for (const o of sampleOrders.slice(0, 20)) {
      for (const [k, v] of Object.entries(o || {})) {
        const looksTime = /(At|Time|Date)$/.test(k) || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v));
        if (looksTime) knownKeys.add(k);
        if (Array.isArray(v) && HISTORY_FIELDS.includes(k)) knownKeys.add(`${k}[]`);
      }
    }
    if (knownKeys.size > before) {
      const value = JSON.stringify({ keys: Array.from(knownKeys).sort(), seenAt: new Date().toISOString() });
      await prisma.systemSetting.upsert({ where: { key: DIAG_KEY }, update: { value }, create: { key: DIAG_KEY, value } });
    }
  } catch {
    // diagnostics only
  }
}
