'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Store } from 'lucide-react';
import { gochowStatusView, TONE_DOT } from '@/lib/orderStatus';

interface Row {
  cafeteria: string;
  total: number;
  noRider: number;
  byStatus: Record<string, number>;
}

interface Summary {
  date: string;
  isToday: boolean;
  statuses: string[];
  totals: Row;
  cafeterias: Row[];
}

export interface BoardPick {
  date: string;
  cafeteria: string; // '' = all cafeterias
  gochowStatus: string; // 'All' | 'open' | a GoChow status
  noRider: boolean;
}

function shiftDay(day: string, by: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

function dayLabel(day: string, isToday: boolean) {
  if (isToday) return 'Today';
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Per-cafeteria view of one day's orders: how many are at each GoChow status and
 * how many still have no rider. Tapping a number filters the order list to exactly those orders.
 */
export function CafeteriaBoard({
  refreshKey,
  active,
  onPick,
}: {
  refreshKey: number;
  active: BoardPick | null;
  onPick: (p: BoardPick) => void;
}) {
  const [day, setDay] = useState<string>('');
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/by-cafeteria${day ? `?date=${day}` : ''}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setFailed(false);
        if (!day) setDay(json.date);
      } else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const statuses = data?.statuses || ['Confirmed', 'Preparing', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'];
  const date = data?.date || day;

  const isActive = (cafeteria: string, gochowStatus: string, noRider = false) =>
    !!active &&
    active.date === date &&
    active.cafeteria.toLowerCase() === cafeteria.toLowerCase() &&
    active.gochowStatus === gochowStatus &&
    active.noRider === noRider;

  const pick = (cafeteria: string, gochowStatus: string, noRider = false) =>
    onPick({ date, cafeteria, gochowStatus, noRider });

  const Num = ({
    n,
    cafeteria,
    status,
    noRider = false,
    strong = false,
    warn = false,
  }: {
    n: number;
    cafeteria: string;
    status: string;
    noRider?: boolean;
    strong?: boolean;
    warn?: boolean;
  }) => {
    const on = isActive(cafeteria, status, noRider);
    if (!n) return <span className="text-slate-300 tabular-nums">0</span>;
    return (
      <button
        onClick={() => pick(cafeteria, status, noRider)}
        className={`min-w-[2rem] h-7 px-2 rounded-md tabular-nums text-sm transition-colors ${
          on
            ? 'bg-slate-900 text-white'
            : warn
              ? 'bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100'
              : strong
                ? 'font-semibold text-slate-900 hover:bg-slate-100'
                : 'text-slate-700 hover:bg-slate-100'
        }`}
      >
        {n}
      </button>
    );
  };

  const rows = data?.cafeterias || [];

  return (
    <section className="rounded-xl bg-white border border-slate-200 overflow-hidden" aria-label="Orders by cafeteria">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Store className="w-4 h-4 text-slate-400" /> By cafeteria
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">GoChow status of each order · tap a number to see those orders</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => date && setDay(shiftDay(date, -1))}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <label className="relative h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50">
            {date ? dayLabel(date, !!data?.isToday && data.date === date) : '…'}
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDay(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Pick a day"
            />
          </label>
          <button
            onClick={() => date && setDay(shiftDay(date, 1))}
            disabled={!!data?.isToday}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            aria-label="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="p-4 space-y-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-slate-100 rounded" />
          ))}
        </div>
      ) : failed && !data ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">Couldn&apos;t load the cafeteria summary.</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-500">No orders on this day.</p>
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : ''}>
          {/* Desktop: one table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-slate-100">
                  <th className="text-left font-medium px-4 py-2">Cafeteria</th>
                  <th className="text-center font-medium px-2 py-2">Total</th>
                  {statuses.map((s) => (
                    <th key={s} className="text-center font-medium px-2 py-2 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[gochowStatusView(s).tone]}`} />
                        {s}
                      </span>
                    </th>
                  ))}
                  <th className="text-center font-medium px-2 py-2 whitespace-nowrap">No rider</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.cafeteria}>
                    <td className="px-4 py-1.5">
                      <button
                        onClick={() => pick(r.cafeteria, 'All')}
                        className={`font-medium text-left hover:underline ${isActive(r.cafeteria, 'All') ? 'text-orange-600' : 'text-slate-900'}`}
                      >
                        {r.cafeteria}
                      </button>
                    </td>
                    <td className="text-center px-2 py-1.5">
                      <Num n={r.total} cafeteria={r.cafeteria} status="All" strong />
                    </td>
                    {statuses.map((s) => (
                      <td key={s} className="text-center px-2 py-1.5">
                        <Num n={r.byStatus[s] || 0} cafeteria={r.cafeteria} status={s} />
                      </td>
                    ))}
                    <td className="text-center px-2 py-1.5">
                      <Num n={r.noRider} cafeteria={r.cafeteria} status="open" noRider warn />
                    </td>
                  </tr>
                ))}
              </tbody>
              {data && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/60">
                    <td className="px-4 py-2 font-semibold text-slate-900">All cafeterias</td>
                    <td className="text-center px-2 py-2">
                      <Num n={data.totals.total} cafeteria="" status="All" strong />
                    </td>
                    {statuses.map((s) => (
                      <td key={s} className="text-center px-2 py-2">
                        <Num n={data.totals.byStatus[s] || 0} cafeteria="" status={s} strong />
                      </td>
                    ))}
                    <td className="text-center px-2 py-2">
                      <Num n={data.totals.noRider} cafeteria="" status="open" noRider warn />
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Phone: totals strip + one card per cafeteria */}
          <div className="md:hidden">
            {data && (
              <div className="px-4 py-3 bg-slate-50/60 border-b border-slate-100">
                <StatusChips row={data.totals} cafeteria="" statuses={statuses} isActive={isActive} pick={pick} label="All cafeterias" />
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.cafeteria} className="px-4 py-3">
                  <StatusChips row={r} cafeteria={r.cafeteria} statuses={statuses} isActive={isActive} pick={pick} label={r.cafeteria} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function StatusChips({
  row,
  cafeteria,
  statuses,
  label,
  isActive,
  pick,
}: {
  row: Row;
  cafeteria: string;
  statuses: string[];
  label: string;
  isActive: (c: string, s: string, noRider?: boolean) => boolean;
  pick: (c: string, s: string, noRider?: boolean) => void;
}) {
  const chip = (text: React.ReactNode, n: number, status: string, noRider = false, dot?: string, warn = false) => {
    const on = isActive(cafeteria, status, noRider);
    return (
      <button
        key={`${status}-${noRider}`}
        onClick={() => pick(cafeteria, status, noRider)}
        className={`inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs border ${
          on
            ? 'bg-slate-900 border-slate-900 text-white'
            : warn
              ? 'bg-rose-50 border-rose-100 text-rose-700'
              : 'bg-white border-slate-200 text-slate-600'
        }`}
      >
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
        {text}
        <span className={`tabular-nums font-semibold ${on ? 'text-white' : warn ? 'text-rose-700' : 'text-slate-900'}`}>{n}</span>
      </button>
    );
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <button onClick={() => pick(cafeteria, 'All')} className="text-sm font-semibold text-slate-900 text-left truncate">
          {label}
        </button>
        <span className="text-sm text-slate-500 shrink-0">
          <span className="font-semibold text-slate-900 tabular-nums">{row.total}</span> orders
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {statuses
          .filter((s) => row.byStatus[s])
          .map((s) => chip(s, row.byStatus[s], s, false, TONE_DOT[gochowStatusView(s).tone]))}
        {row.noRider > 0 && chip('No rider', row.noRider, 'open', true, undefined, true)}
      </div>
    </div>
  );
}
