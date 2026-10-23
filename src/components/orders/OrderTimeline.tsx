'use client';

import React, { useState } from 'react';
import {
  KIND_INFO,
  STAGE_LABEL,
  clockTime,
  computeStages,
  formatDuration,
  type SlowLimits,
  type StageKey,
  type TimelineEvent,
} from '@/lib/orderTimeline';

const k_isTotal = (k: string) => k === 'total';

const SIDE_DOT: Record<string, string> = { GoChow: 'bg-slate-400', Rider: 'bg-blue-500', Rep: 'bg-teal-500', Runner: 'bg-emerald-500' };

/** Every step of an order with its time and the gap since the step before. */
export function OrderTimeline({
  order,
  events,
  limits,
}: {
  order: { createdAt: string; orderStatus?: string | null; pickedUpAt?: string | null };
  events: TimelineEvent[];
  limits?: SlowLimits | null;
}) {
  // GoChow's own pickup time, when it sends one
  const all: TimelineEvent[] = [...events];
  if (order.pickedUpAt) all.push({ kind: 'gochow_picked_up', at: new Date(order.pickedUpAt).toISOString(), source: 'gochow', exact: true });
  all.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const stages = computeStages(order, events, limits || undefined);
  const riderDone = events.filter((e) => e.kind === 'rider_delivered').map((e) => new Date(e.at).getTime()).sort((a, b) => b - a)[0];
  const gochowDone = events.find((e) => e.kind === 'gochow_delivered');
  const lateStatusMs = riderDone && gochowDone ? new Date(gochowDone.at).getTime() - riderDone : null;
  const anyApprox = all.some((e) => e.source === 'gochow' && e.exact === false);

  const rows: { key: string; label: string; side: string; at: string; approx: boolean; who?: string | null; detail?: string | null }[] = [
    { key: 'placed', label: 'Order placed', side: 'GoChow', at: order.createdAt, approx: false },
    ...all.map((e, i) => {
      const info = e.kind === 'gochow_picked_up' ? { label: 'Picked up (GoChow)', side: 'GoChow' as const } : KIND_INFO[e.kind];
      return {
        key: `${e.kind}-${i}`,
        label: info?.label || e.kind,
        side: info?.side || e.source,
        at: e.at,
        approx: e.source === 'gochow' && e.exact === false,
        who: e.actorName,
        detail: e.detail,
      };
    }),
  ];

  const [showSteps, setShowSteps] = useState(false);
  const stageOrder: StageKey[] = ['ack', 'prep', 'wait', 'ride', 'total'];
  // Summary: slow steps in red, plus the total; every step is a tap away
  const shownStages = stageOrder.map((k) => stages[k]).filter((s) => s.ms !== null && (s.slow || k_isTotal(s.key)));

  return (
    <section>
      <h3 className="text-sm font-medium text-slate-900">Timeline</h3>

      {shownStages.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {shownStages.map((s) => (
            <span
              key={s.key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                s.slow ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'
              }`}
              title={`Limit ${s.limitMin} min`}
            >
              {STAGE_LABEL[s.key]} {formatDuration(s.ms)}
              {s.running ? ' so far' : ''}
            </span>
          ))}
        </div>
      )}

      {rows.length > 1 && (
        <button onClick={() => setShowSteps((v) => !v)} className="mt-3 text-xs font-medium text-brand-700 hover:underline">
          {showSteps ? 'Hide steps' : `Show all ${rows.length} steps`}
        </button>
      )}

      <ol className={`mt-3 space-y-0 ${showSteps ? '' : 'hidden'}`}>
        {rows.map((r, i) => {
          const prev = i > 0 ? rows[i - 1] : null;
          const gap = prev ? new Date(r.at).getTime() - new Date(prev.at).getTime() : null;
          return (
            <li key={r.key} className="flex gap-3">
              <div className="flex flex-col items-center shrink-0" aria-hidden="true">
                <span className={`w-2 h-2 rounded-full mt-1.5 ${SIDE_DOT[r.side] || 'bg-slate-300'}`} />
                {i < rows.length - 1 && <span className="w-px flex-1 bg-slate-200 my-0.5" />}
              </div>
              <div className="flex-1 min-w-0 pb-2.5 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    {r.label} <span className="text-xs text-slate-400">· {r.side}</span>
                  </p>
                  {(r.who || r.detail) && <p className="text-xs text-slate-500 truncate">{[r.who, r.detail].filter(Boolean).join(' · ')}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm tabular-nums text-slate-800">
                    {r.approx ? '~' : ''}
                    {clockTime(r.at)}
                  </p>
                  {gap !== null && gap > 0 && <p className="text-xs text-slate-400 tabular-nums">+{formatDuration(gap)}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {lateStatusMs !== null && lateStatusMs > 60_000 && (
        <p className="mt-1 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Rider marked it delivered at {clockTime(new Date(riderDone!).toISOString())}. GoChow marked it Delivered {formatDuration(lateStatusMs)} later.
        </p>
      )}
      {rows.length <= 1 && (
        <p className="mt-1 text-xs text-slate-500">No steps recorded for this order. Timelines are recorded from when this feature went live.</p>
      )}
      {anyApprox && <p className="mt-2 text-xs text-slate-400">~ means our sync first saw this status at that time, so it is right to about a minute.</p>}
    </section>
  );
}
