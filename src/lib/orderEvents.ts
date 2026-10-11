import { prisma } from './prisma';
import { DEFAULT_SLOW_LIMITS, type SlowLimits, type TimelineEvent } from './orderTimeline';

/** Rider/rep activity (see logActivity) -> the order event it records. */
export const ACTIVITY_TO_EVENT: Record<string, { kind: string; source: 'rider' | 'rep' }> = {
  claim: { kind: 'rider_accepted', source: 'rider' },
  pickup: { kind: 'rider_picked_up', source: 'rider' },
  deliver: { kind: 'rider_delivered', source: 'rider' },
  drop: { kind: 'rider_dropped', source: 'rider' },
  transfer: { kind: 'rider_transferred', source: 'rider' },
  collector_handed: { kind: 'rep_handed', source: 'rep' },
  collector_received: { kind: 'rep_received', source: 'rep' },
  collector_delivered: { kind: 'rep_delivered', source: 'rep' },
  collector_not_reachable: { kind: 'rep_not_reachable', source: 'rep' },
  collector_returned: { kind: 'rep_returned', source: 'rep' },
};

const GOCHOW_KIND: Record<string, string> = {
  confirmed: 'gochow_confirmed',
  preparing: 'gochow_preparing',
  ready: 'gochow_ready',
  dispatched: 'gochow_dispatched',
  delivered: 'gochow_delivered',
  cancelled: 'gochow_cancelled',
};
export const gochowKind = (status?: string | null) => GOCHOW_KIND[(status || '').toLowerCase()] || null;

/** Record one step. Never throws: a failed log must not fail the action or the sync. */
export async function logOrderEvent(
  orderDbId: string | undefined | null,
  kind: string,
  opts: { source: string; at?: Date; exact?: boolean; actorName?: string | null; detail?: string | null }
) {
  if (!orderDbId) return;
  try {
    await prisma.orderEvent.create({
      data: {
        orderDbId,
        kind,
        at: opts.at ?? new Date(),
        source: opts.source,
        exact: opts.exact ?? true,
        actorName: opts.actorName ?? null,
        detail: opts.detail ?? null,
      },
    });
  } catch (err) {
    console.warn('[orderEvents] could not record', kind, (err as Error)?.message);
  }
}

/**
 * Record GoChow status steps for many orders at once (used by the sync). A status is
 * recorded once per order; repeats are ignored by the database.
 */
export async function logGoChowSteps(
  steps: { orderDbId: string; status?: string | null; kind?: string; at: Date; exact: boolean }[]
) {
  const data = steps
    .map((s) => ({ orderDbId: s.orderDbId, kind: s.kind || gochowKind(s.status), at: s.at, exact: s.exact }))
    .filter((s): s is { orderDbId: string; kind: string; at: Date; exact: boolean } => !!s.kind)
    .map((s) => ({ ...s, source: 'gochow' }));
  if (!data.length) return;
  try {
    await prisma.orderEvent.createMany({ data, skipDuplicates: true });
  } catch (err) {
    console.warn('[orderEvents] could not record GoChow steps', (err as Error)?.message);
  }
}

export async function loadEvents(orderDbIds: string[]): Promise<Map<string, TimelineEvent[]>> {
  const map = new Map<string, TimelineEvent[]>();
  if (!orderDbIds.length) return map;
  try {
    const rows = await prisma.orderEvent.findMany({
      where: { orderDbId: { in: orderDbIds } },
      orderBy: { at: 'asc' },
      select: { orderDbId: true, kind: true, at: true, source: true, exact: true, actorName: true, detail: true },
    });
    for (const r of rows) {
      if (!map.has(r.orderDbId)) map.set(r.orderDbId, []);
      map.get(r.orderDbId)!.push({ kind: r.kind, at: r.at.toISOString(), source: r.source, exact: r.exact, actorName: r.actorName, detail: r.detail });
    }
  } catch (err) {
    // Table not created yet, or database busy: show orders without a timeline
    console.warn('[orderEvents] could not load events', (err as Error)?.message);
  }
  return map;
}

const LIMITS_KEY = 'slow_limits';
export async function getSlowLimits(): Promise<SlowLimits> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: LIMITS_KEY } });
    return { ...DEFAULT_SLOW_LIMITS, ...(row?.value ? JSON.parse(row.value) : {}) };
  } catch {
    return DEFAULT_SLOW_LIMITS;
  }
}
export async function saveSlowLimits(input: Partial<SlowLimits>): Promise<SlowLimits> {
  const cur = await getSlowLimits();
  const clamp = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(600, Math.max(1, n)) : fallback;
  };
  const next: SlowLimits = {
    ack: clamp(input.ack ?? cur.ack, cur.ack),
    prep: clamp(input.prep ?? cur.prep, cur.prep),
    wait: clamp(input.wait ?? cur.wait, cur.wait),
    ride: clamp(input.ride ?? cur.ride, cur.ride),
    total: clamp(input.total ?? cur.total, cur.total),
  };
  await prisma.systemSetting.upsert({
    where: { key: LIMITS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: LIMITS_KEY, value: JSON.stringify(next) },
  });
  return next;
}
