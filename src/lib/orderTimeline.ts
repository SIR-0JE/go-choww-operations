/**
 * Order timeline: turns an order's recorded steps into stage durations
 * (vendor start, preparing, waiting for a rider, ride, total) and flags slow ones.
 * Pure functions, safe to use on the server and in the browser.
 */

export type EventSource = 'gochow' | 'rider' | 'rep' | 'runner' | 'admin';

export interface TimelineEvent {
  kind: string;
  at: string; // ISO
  source: EventSource | string;
  exact?: boolean; // false: first seen by our sync, good to about a minute
  actorName?: string | null;
  detail?: string | null;
}

export const KIND_INFO: Record<string, { label: string; side: 'GoChow' | 'Rider' | 'Rep' | 'Runner' }> = {
  gochow_confirmed: { label: 'Confirmed', side: 'GoChow' },
  gochow_preparing: { label: 'Preparing', side: 'GoChow' },
  gochow_ready: { label: 'Ready', side: 'GoChow' },
  gochow_dispatched: { label: 'Dispatched', side: 'GoChow' },
  gochow_delivered: { label: 'Delivered', side: 'GoChow' },
  gochow_cancelled: { label: 'Cancelled', side: 'GoChow' },
  runner_ready: { label: 'Packed and ready', side: 'Runner' },
  rider_accepted: { label: 'Rider accepted', side: 'Rider' },
  rider_picked_up: { label: 'Picked up', side: 'Rider' },
  rider_delivered: { label: 'Delivered', side: 'Rider' },
  rider_dropped: { label: 'Rider dropped it', side: 'Rider' },
  rider_transferred: { label: 'Passed to another rider', side: 'Rider' },
  rep_handed: { label: 'Rider handed to rep', side: 'Rep' },
  rep_received: { label: 'Rep received', side: 'Rep' },
  rep_delivered: { label: 'Rep delivered', side: 'Rep' },
  rep_not_reachable: { label: 'Customer not reachable', side: 'Rep' },
  rep_returned: { label: 'Given back to riders', side: 'Rep' },
};

export interface SlowLimits {
  ack: number; // minutes: placed -> vendor starts
  prep: number; // preparing -> ready
  wait: number; // ready -> rider picks up
  ride: number; // picked up -> delivered (or handed to the rep)
  total: number; // placed -> delivered
}
export const DEFAULT_SLOW_LIMITS: SlowLimits = { ack: 10, prep: 20, wait: 10, ride: 25, total: 60 };

export type StageKey = keyof SlowLimits;
export const STAGE_LABEL: Record<StageKey, string> = {
  ack: 'Vendor starts',
  prep: 'Preparing',
  wait: 'Waiting for rider',
  ride: 'Ride',
  total: 'Door to door',
};

export interface Stage {
  key: StageKey;
  from: number | null; // ms
  to: number | null; // ms
  ms: number | null; // finished duration, or time so far when still running
  running: boolean;
  slow: boolean;
  limitMin: number;
}

const ts = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN);

function firstAt(events: TimelineEvent[], ...kinds: string[]): number | null {
  const times = events.filter((e) => kinds.includes(e.kind)).map((e) => ts(e.at)).filter((n) => !isNaN(n));
  return times.length ? Math.min(...times) : null;
}
function lastAt(events: TimelineEvent[], ...kinds: string[]): number | null {
  const times = events.filter((e) => kinds.includes(e.kind)).map((e) => ts(e.at)).filter((n) => !isNaN(n));
  return times.length ? Math.max(...times) : null;
}

const isFinished = (status?: string | null) => /^(completed|delivered|cancel)/i.test(status || '');

/** Stage durations for one order. `now` only matters for stages still in progress. */
export function computeStages(
  order: { createdAt: string; orderStatus?: string | null },
  events: TimelineEvent[],
  limits: SlowLimits = DEFAULT_SLOW_LIMITS,
  now: number = Date.now()
): Record<StageKey, Stage> {
  const placed = ts(order.createdAt);
  const preparing = firstAt(events, 'gochow_preparing');
  const ready = firstAt(events, 'gochow_ready') ?? firstAt(events, 'gochow_dispatched');
  const vendorStart = firstAt(events, 'gochow_preparing', 'gochow_ready', 'gochow_dispatched');
  const pickup = firstAt(events, 'rider_picked_up');
  const arrived = firstAt(events, 'rep_received') ?? lastAt(events, 'rider_delivered');
  const done = lastAt(events, 'rep_delivered') ?? lastAt(events, 'rider_delivered') ?? firstAt(events, 'gochow_delivered');
  const live = !isFinished(order.orderStatus);

  const make = (key: StageKey, from: number | null, to: number | null): Stage => {
    const limitMin = limits[key];
    if (from === null || isNaN(from)) return { key, from: null, to, ms: null, running: false, slow: false, limitMin };
    if (to !== null && to >= from) {
      const ms = to - from;
      return { key, from, to, ms, running: false, slow: ms > limitMin * 60000, limitMin };
    }
    if (live && to === null) {
      const ms = Math.max(0, now - from);
      return { key, from, to: null, ms, running: true, slow: ms > limitMin * 60000, limitMin };
    }
    return { key, from, to, ms: null, running: false, slow: false, limitMin };
  };

  return {
    ack: make('ack', placed, vendorStart),
    prep: make('prep', preparing, ready),
    wait: make('wait', ready, pickup),
    ride: make('ride', pickup, arrived),
    total: make('total', placed, done),
  };
}

/** "<1 min", "7 min", "1h 12m" */
export function formatDuration(ms: number | null): string {
  if (ms === null || isNaN(ms)) return '—';
  const min = Math.round(ms / 60000);
  if (min < 1) return '<1 min';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const slowStages = (stages: Record<StageKey, Stage>) => (Object.values(stages) as Stage[]).filter((s) => s.slow);

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
