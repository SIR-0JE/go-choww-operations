'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Save } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { STAGE_LABEL, type SlowLimits, type StageKey } from '@/lib/orderTimeline';

interface Stat {
  n: number;
  median: number | null;
  p90: number | null;
}
interface Vendor {
  cafeteria: string;
  orders: number;
  cancelled: number;
  ack: Stat;
  prep: Stat;
  wait: Stat;
  ride: Stat;
  total: Stat;
}
interface Data {
  days: number;
  limits: SlowLimits;
  trackingSince: string | null;
  vendors: Vendor[];
}

const STAGES: StageKey[] = ['ack', 'prep', 'wait', 'ride', 'total'];
const RANGES = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];
const mins = (n: number | null) => (n === null ? '—' : n < 1 ? '<1' : `${Math.round(n)}`);

function Cell({ stat, limit }: { stat: Stat; limit: number }) {
  if (!stat.n) return <span className="text-slate-300">—</span>;
  const slow = stat.median !== null && stat.median > limit;
  const nearly = !slow && stat.p90 !== null && stat.p90 > limit * 1.5;
  return (
    <span title={`${stat.n} orders · slowest 10%: ${mins(stat.p90)} min`}>
      <span className={`font-semibold tabular-nums ${slow ? 'text-rose-600' : 'text-slate-900'}`}>{mins(stat.median)}</span>
      <span className={`ml-1 text-xs tabular-nums ${nearly ? 'text-amber-600' : 'text-slate-400'}`}>/ {mins(stat.p90)}</span>
    </span>
  );
}

export default function VendorsPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<SlowLimits | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendors?days=${days}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setData(json);
        setDraft((d) => d ?? json.limits);
        setError('');
      } else setError(json.error || 'Could not load.');
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const saveLimits = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch('/api/vendors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const json = await res.json();
      if (json.success) {
        setDraft(json.limits);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const limits = data?.limits;
  const dirty = !!draft && !!limits && JSON.stringify(draft) !== JSON.stringify(limits);
  const since = data?.trackingSince ? new Date(data.trackingSince).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' }) : null;

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vendor speed</h1>
            <p className="text-sm text-slate-500 mt-1">How long each cafeteria takes, and how long food waits for a rider. Median and slowest 10%, in minutes.</p>
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={`h-8 px-3 rounded-md text-sm font-medium ${days === r.days ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {data && (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3 py-2">
            {since
              ? `Vendor times are recorded since ${since}. Each is the minute our sync first saw the change, so it is right to about a minute. Orders from before that are not included.`
              : 'No vendor times recorded yet. They start filling in as orders come through.'}
            {' '}Delivery orders only; pick-ups are left out.
          </p>
        )}

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading && !data ? (
          <div className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
        ) : data && data.vendors.length === 0 ? (
          <p className="rounded-xl bg-white border border-slate-200 px-4 py-12 text-center text-sm text-slate-500">No orders in this period.</p>
        ) : (
          data && (
            <>
              {/* Desktop table */}
              <div className="hidden md:block rounded-xl bg-white border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-100">
                      <th className="text-left font-medium px-4 py-2.5">Cafeteria</th>
                      <th className="text-right font-medium px-3 py-2.5">Orders</th>
                      {STAGES.map((k) => (
                        <th key={k} className="text-right font-medium px-3 py-2.5 whitespace-nowrap">
                          {STAGE_LABEL[k]}
                          <span className="block text-slate-400 font-normal">limit {data.limits[k]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.vendors.map((v) => (
                      <tr key={v.cafeteria}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{v.cafeteria}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                          {v.orders}
                          {v.cancelled > 0 && <span className="text-xs text-rose-500"> · {v.cancelled} cancelled</span>}
                        </td>
                        {STAGES.map((k) => (
                          <td key={k} className="px-3 py-2.5 text-right whitespace-nowrap">
                            <Cell stat={v[k]} limit={data.limits[k]} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone cards */}
              <ul className="md:hidden space-y-3">
                {data.vendors.map((v) => (
                  <li key={v.cafeteria} className="rounded-xl bg-white border border-slate-200 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-base font-semibold text-slate-900">{v.cafeteria}</p>
                      <p className="text-sm text-slate-500 tabular-nums">{v.orders} orders</p>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                      {STAGES.map((k) => (
                        <div key={k} className={k === 'total' ? 'col-span-2 border-t border-slate-100 pt-2' : ''}>
                          <dt className="text-xs text-slate-500">
                            {STAGE_LABEL[k]} <span className="text-slate-400">· limit {data.limits[k]}</span>
                          </dt>
                          <dd className="text-sm">
                            <Cell stat={v[k]} limit={data.limits[k]} /> <span className="text-xs text-slate-400">min</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-400">Numbers show median / slowest 10%. Red means the median is over the limit. Hover a number for how many orders it covers.</p>
            </>
          )
        )}

        {draft && (
          <section className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">When is a step slow?</h2>
            <p className="text-xs text-slate-500 mt-1">Minutes. A step over its limit turns red on the Orders page and on this page.</p>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {STAGES.map((k) => (
                <label key={k} className="text-xs text-slate-500">
                  {STAGE_LABEL[k]}
                  <input
                    type="number"
                    min={1}
                    max={600}
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })}
                    className="mt-1 h-10 w-full bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                  />
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-end gap-3">
              {saved && <span className="text-xs text-emerald-700">Saved</span>}
              <button
                onClick={saveLimits}
                disabled={!dirty || saving}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-40"
              >
                <Save className="w-4 h-4" /> Save limits
              </button>
            </div>
          </section>
        )}
      </main>
    </AppLayout>
  );
}
