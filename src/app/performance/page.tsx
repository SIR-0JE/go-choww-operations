'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';

interface Cafeteria {
  rank: number;
  cafeteria: string;
  orders: number;
  avgReady: number | null;
  medianReady: number | null;
  slowest10: number | null;
  avgStart: number | null;
}
interface Rider {
  rank: number | null;
  name: string;
  delivered: number;
  measured: number;
  avgPickup: number | null;
  medianPickup: number | null;
  avgRide: number | null;
  medianRide: number | null;
  avgTotal: number | null;
  medianTotal: number | null;
  drops: number;
  quickTaps: number;
}
interface Data {
  from: string;
  to: string;
  quickTapMinutes: number;
  maxPrepMinutes: number;
  team: { ready: number | null; pickup: number | null; ride: number | null; total: number | null };
  cafeterias: Cafeteria[];
  riders: Rider[];
  cafeteriaTimesSince: string | null;
  riderTimesSince: string | null;
}

const lagosToday = () => new Date(Date.now() + 3600000).toISOString().slice(0, 10);
const shiftKey = (key: string, by: number) => new Date(Date.parse(`${key}T00:00:00Z`) + by * 86400000).toISOString().slice(0, 10);
const niceDate = (key: string) => new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const mins = (n: number | null) => (n === null ? '—' : n < 1 ? '<1' : n < 10 ? n.toFixed(1) : String(Math.round(n)));
const vsAverage = (value: number | null, avg: number | null) => {
  if (value === null || avg === null) return '';
  const d = value - avg;
  if (Math.abs(d) < 0.5) return 'at average';
  return `${d < 0 ? '' : '+'}${d.toFixed(1)} min`;
};

/** A plain bar: how long, compared with the slowest in the list. No colours that judge. */
function Bar({ value, max }: { value: number | null; max: number }) {
  const w = value === null || max <= 0 ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
      <div className="h-full rounded-full bg-slate-400" style={{ width: `${w}%` }} />
    </div>
  );
}

export default function PerformancePage() {
  const [to, setTo] = useState(lagosToday());
  const [from, setFrom] = useState(shiftKey(lagosToday(), -6));
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = React.useRef(0);

  const load = useCallback(async () => {
    const mine = ++latest.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/performance?from=${from}&to=${to}`, { cache: 'no-store' });
      const json = await res.json();
      if (mine !== latest.current) return;
      if (json.success) {
        setData(json);
        setError('');
      } else setError(json.error || 'Could not load.');
    } catch {
      if (mine === latest.current) setError('No connection. Try again.');
    } finally {
      if (mine === latest.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const preset = (days: number) => {
    const t = lagosToday();
    setTo(t);
    setFrom(shiftKey(t, -(days - 1)));
  };
  const today = lagosToday();
  const active = (days: number) => to === today && from === shiftKey(today, -(days - 1));

  const maxReady = Math.max(0, ...(data?.cafeterias.map((c) => c.avgReady ?? 0) || [0]));
  const maxTotal = Math.max(0, ...(data?.riders.map((r) => r.avgTotal ?? 0) || [0]));
  const dateCls = 'h-9 bg-white border border-slate-200 rounded-lg px-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/10';

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Performance</h1>
          <p className="text-sm text-slate-500 mt-1">How fast each cafeteria and each rider is, ranked fastest first. Times are in minutes.</p>
        </div>

        {/* Date range */}
        <div className="rounded-xl bg-white border border-slate-200 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <label className="text-xs text-slate-500">
              From
              <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${dateCls} mt-1 w-full`} />
            </label>
            <label className="text-xs text-slate-500">
              To
              <input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && setTo(e.target.value)} className={`${dateCls} mt-1 w-full`} />
            </label>
          </div>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg self-start sm:ml-auto">
            {[
              { days: 1, label: 'Today' },
              { days: 7, label: '7 days' },
              { days: 30, label: '30 days' },
            ].map((r) => (
              <button
                key={r.days}
                onClick={() => preset(r.days)}
                className={`h-7 px-3 rounded-md text-sm font-medium ${active(r.days) ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {loading && !data ? (
          <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />
        ) : (
          data && (
            <div className={loading ? 'opacity-60 transition-opacity space-y-5' : 'space-y-5'}>
              {/* Team averages */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'Cafeteria: order to Ready', v: data.team.ready },
                  { label: 'Rider: accept to pick up', v: data.team.pickup },
                  { label: 'Rider: pick up to delivered', v: data.team.ride },
                  { label: 'Rider: accept to delivered', v: data.team.total },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                    <p className="text-xl font-semibold tabular-nums text-slate-900">
                      {mins(s.v)} <span className="text-sm font-normal text-slate-400">min</span>
                    </p>
                    <p className="text-xs text-slate-500 leading-tight">{s.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">team average</p>
                  </div>
                ))}
              </div>

              {/* Cafeterias */}
              <section className="rounded-xl bg-white border border-slate-200 overflow-hidden" aria-label="Cafeterias">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-900">Cafeterias</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    From the order coming in to GoChow showing it Ready, {niceDate(data.from)} to {niceDate(data.to)}.
                  </p>
                </div>
                {data.cafeterias.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">
                    No cafeteria times in this period.
                    {data.cafeteriaTimesSince && ` They are recorded since ${niceDate(data.cafeteriaTimesSince.slice(0, 10))}.`}
                  </p>
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="text-left font-medium px-4 py-2 w-10">#</th>
                            <th className="text-left font-medium px-2 py-2">Cafeteria</th>
                            <th className="text-right font-medium px-3 py-2">Orders</th>
                            <th className="text-right font-medium px-3 py-2">Time to start</th>
                            <th className="text-right font-medium px-3 py-2">Average to Ready</th>
                            <th className="text-right font-medium px-3 py-2">Typical (middle)</th>
                            <th className="text-right font-medium px-3 py-2">Slowest 10%</th>
                            <th className="text-left font-medium px-4 py-2 w-40">vs team average</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.cafeterias.map((c) => (
                            <tr key={c.cafeteria}>
                              <td className="px-4 py-2.5 text-slate-400 tabular-nums">{c.rank}</td>
                              <td className="px-2 py-2.5 font-medium text-slate-900">{c.cafeteria}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.orders}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{mins(c.avgStart)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{mins(c.avgReady)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{mins(c.medianReady)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{mins(c.slowest10)}</td>
                              <td className="px-4 py-2.5">
                                <Bar value={c.avgReady} max={maxReady} />
                                <p className="text-[11px] text-slate-400 mt-1">{vsAverage(c.avgReady, data.team.ready)}</p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="md:hidden divide-y divide-slate-100">
                      {data.cafeterias.map((c) => (
                        <li key={c.cafeteria} className="px-4 py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">
                              <span className="text-slate-400 tabular-nums mr-1.5">{c.rank}</span>
                              {c.cafeteria}
                            </p>
                            <p className="text-sm text-slate-500 tabular-nums">{c.orders} orders</p>
                          </div>
                          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                            {mins(c.avgReady)} <span className="text-sm font-normal text-slate-400">min to Ready</span>
                          </p>
                          <Bar value={c.avgReady} max={maxReady} />
                          <p className="mt-1.5 text-xs text-slate-500">
                            Starts after {mins(c.avgStart)} · typical {mins(c.medianReady)} · slowest 10% {mins(c.slowest10)}
                            {vsAverage(c.avgReady, data.team.ready) && ` · ${vsAverage(c.avgReady, data.team.ready)} vs average`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              {/* Riders */}
              <section className="rounded-xl bg-white border border-slate-200 overflow-hidden" aria-label="Riders">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-900">Riders</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Only orders the rider accepted, picked up and delivered themselves, never dropped or passed on. Ranked by accept to delivered.
                  </p>
                </div>
                {data.riders.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-slate-500">No rider deliveries in this period.</p>
                ) : (
                  <>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="text-left font-medium px-4 py-2 w-10">#</th>
                            <th className="text-left font-medium px-2 py-2">Rider</th>
                            <th className="text-right font-medium px-3 py-2">Delivered</th>
                            <th className="text-right font-medium px-3 py-2">Measured</th>
                            <th className="text-right font-medium px-3 py-2">Accept → pick up</th>
                            <th className="text-right font-medium px-3 py-2">Pick up → delivered</th>
                            <th className="text-right font-medium px-3 py-2">Accept → delivered</th>
                            <th className="text-right font-medium px-3 py-2">Drops</th>
                            <th className="text-left font-medium px-4 py-2 w-40">vs team average</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.riders.map((r) => (
                            <tr key={r.name}>
                              <td className="px-4 py-2.5 text-slate-400 tabular-nums">{r.rank ?? '–'}</td>
                              <td className="px-2 py-2.5 font-medium text-slate-900">{r.name}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.delivered}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                                {r.measured}
                                {r.quickTaps > 0 && (
                                  <span className="block text-[11px] text-slate-400" title={`Pick up and delivered under ${data.quickTapMinutes} minutes apart, so the ride time may not be real`}>
                                    {r.quickTaps} very quick
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{mins(r.avgPickup)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{mins(r.avgRide)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-900">{mins(r.avgTotal)}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.drops}</td>
                              <td className="px-4 py-2.5">
                                {r.measured > 0 ? (
                                  <>
                                    <Bar value={r.avgTotal} max={maxTotal} />
                                    <p className="text-[11px] text-slate-400 mt-1">{vsAverage(r.avgTotal, data.team.total)}</p>
                                  </>
                                ) : (
                                  <p className="text-[11px] text-slate-400">No measured orders</p>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="md:hidden divide-y divide-slate-100">
                      {data.riders.map((r) => (
                        <li key={r.name} className="px-4 py-3">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">
                              <span className="text-slate-400 tabular-nums mr-1.5">{r.rank ?? '–'}</span>
                              {r.name}
                            </p>
                            <p className="text-sm text-slate-500 tabular-nums">{r.delivered} delivered</p>
                          </div>
                          {r.measured > 0 ? (
                            <>
                              <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                                {mins(r.avgTotal)} <span className="text-sm font-normal text-slate-400">min accept → delivered</span>
                              </p>
                              <Bar value={r.avgTotal} max={maxTotal} />
                              <p className="mt-1.5 text-xs text-slate-500">
                                Accept → pick up {mins(r.avgPickup)} · pick up → delivered {mins(r.avgRide)}
                                {vsAverage(r.avgTotal, data.team.total) && ` · ${vsAverage(r.avgTotal, data.team.total)} vs average`}
                              </p>
                              <p className="text-xs text-slate-400">
                                {r.measured} measured{r.quickTaps > 0 ? ` (${r.quickTaps} very quick)` : ''} · {r.drops} drop{r.drops === 1 ? '' : 's'}
                              </p>
                            </>
                          ) : (
                            <p className="mt-1 text-xs text-slate-400">No measured orders · {r.drops} drop{r.drops === 1 ? '' : 's'}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <div className="text-xs text-slate-400 space-y-1">
                <p>
                  <strong className="font-medium text-slate-500">Cafeteria times</strong> are the minute our sync first saw GoChow show the order Ready, so they are right to about a minute
                  {data.cafeteriaTimesSince && ` and are recorded since ${niceDate(data.cafeteriaTimesSince.slice(0, 10))}`}. Times over {Math.round(data.maxPrepMinutes / 60)} hours are treated as forgotten updates and left out.
                </p>
                <p>
                  <strong className="font-medium text-slate-500">Rider times</strong> come from when riders tap Accept, Picked up and Delivered
                  {data.riderTimesSince && `, recorded since ${niceDate(data.riderTimesSince.slice(0, 10))}`}. A rider who taps Picked up and Delivered together will show a very short ride, flagged as &quot;very quick&quot;.
                  &quot;Measured&quot; is the number of orders behind the averages. A small number means the average is not reliable yet.
                </p>
              </div>
            </div>
          )
        )}
      </main>
    </AppLayout>
  );
}
