'use client';

import React from 'react';
import { STAGE_LABEL, clockTime, computeStages, formatDuration, slowStages, type SlowLimits, type TimelineEvent } from '@/lib/orderTimeline';

const SHOWN: { kinds: string[]; label: string }[] = [
  { kinds: ['gochow_preparing'], label: 'Preparing' },
  { kinds: ['gochow_ready', 'gochow_dispatched'], label: 'Ready' },
  { kinds: ['rider_picked_up'], label: 'Picked up' },
  { kinds: ['rep_received'], label: 'Rep got it' },
  { kinds: ['rider_delivered', 'rep_delivered'], label: 'Delivered' },
];

/** A short line of key times under an order's status, with slow steps in red. */
export function KeyTimes({
  order,
  limits,
}: {
  order: { createdAt: string; orderStatus?: string | null; events?: TimelineEvent[] };
  limits?: SlowLimits | null;
}) {
  const events = order.events || [];
  if (events.length === 0) return null;

  const times = SHOWN.map((s) => {
    const hit = events
      .filter((e) => s.kinds.includes(e.kind))
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())[0];
    return hit ? { label: s.label, at: hit.at, approx: hit.source === 'gochow' && hit.exact === false } : null;
  }).filter(Boolean) as { label: string; at: string; approx: boolean }[];

  // Show the slow step itself; only fall back to "door to door" when no single step is to blame
  const slowAll = slowStages(computeStages(order as any, events, limits || undefined));
  const slow = slowAll.some((x) => x.key !== 'total') ? slowAll.filter((x) => x.key !== 'total') : slowAll;

  return (
    <span className="flex flex-col gap-0.5 mt-1 text-xs">
      {times.length > 0 && (
        <span className="text-slate-500 whitespace-nowrap">
          {times.map((t, i) => (
            <span key={t.label}>
              {i > 0 && <span className="text-slate-300"> · </span>}
              {t.label} <span className="tabular-nums text-slate-700">{t.approx ? '~' : ''}{clockTime(t.at)}</span>
            </span>
          ))}
        </span>
      )}
      {slow.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1 text-rose-700 font-medium whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
          Slow: {STAGE_LABEL[s.key]} {formatDuration(s.ms)}
          {s.running ? ' so far' : ''}
        </span>
      ))}
    </span>
  );
}
