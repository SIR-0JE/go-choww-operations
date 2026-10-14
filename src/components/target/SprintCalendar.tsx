'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarDay, SprintCalendar as CalendarData } from '@/lib/sprint';
import { summariseMonth } from '@/lib/calendarSummary';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const monthOf = (key: string) => key.slice(0, 7); // YYYY-MM
const monthTitle = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const TONE: Record<CalendarDay['status'], string> = {
  hit: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  near: 'bg-amber-50 border-amber-200 text-amber-900',
  missed: 'bg-rose-50 border-rose-200 text-rose-900',
  today: 'bg-white border-slate-200 text-slate-900',
  future: 'bg-slate-50 border-transparent text-slate-300',
};

/** One month at a time across the whole sprint: orders against that day's own target. */
export function SprintCalendar() {
  const [data, setData] = useState<CalendarData | null>(null);
  const [month, setMonth] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/sprint/calendar', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.success) {
            setData(d.calendar);
            setFailed(false);
            setMonth((m) => m || monthOf(d.calendar.today));
          } else setFailed(true);
        })
        .catch(() => alive && setFailed(true));
    load();
    const t = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const byDate = useMemo(() => new Map((data?.days || []).map((d) => [d.date, d])), [data]);
  const summary = useMemo(() => {
    if (!data || !month) return null;
    const first = monthOf(data.config.startDate);
    const last = monthOf(data.config.endDate);
    const m = month < first ? first : month > last ? last : month;
    return summariseMonth(data.days, m, data.today);
  }, [data, month]);

  if (failed && !data) return <p className="rounded-xl bg-white border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Couldn&apos;t load the calendar.</p>;
  if (!data || !month) return <div className="h-80 rounded-xl bg-white border border-slate-200 animate-pulse" />;

  const first = monthOf(data.config.startDate);
  const last = monthOf(data.config.endDate);
  const m = month < first ? first : month > last ? last : month;

  // Monday-first grid for the month
  const firstOfMonth = new Date(`${m}-01T12:00:00Z`);
  const lead = (firstOfMonth.getUTCDay() + 6) % 7; // blanks before the 1st
  const daysInMonth = new Date(Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);

  return (
    <section className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5" aria-label="Target calendar">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{monthTitle(m)}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setMonth(shiftMonth(m, -1))}
            disabled={m <= first}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMonth(shiftMonth(m, 1))}
            disabled={m >= last}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {summary && (
        <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Month summary">
          {summary.finished === 0 ? (
            <p className="col-span-3 text-sm text-slate-500">No finished days in {monthTitle(m)} yet.</p>
          ) : (
            <>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-lg font-semibold tabular-nums text-slate-900">
                  {summary.hit}
                  <span className="text-sm font-normal text-slate-400"> of {summary.finished}</span>
                </div>
                <div className="text-xs text-slate-500">days hit</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-lg font-semibold tabular-nums text-slate-900">
                  {summary.streak}
                  <span className="text-sm font-normal text-slate-400"> {summary.streak === 1 ? 'day' : 'days'}</span>
                </div>
                <div className="text-xs text-slate-500">{summary.streakIsCurrent ? 'current streak' : 'longest streak'}</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="text-lg font-semibold tabular-nums text-slate-900">{summary.best?.orders ?? '—'}</div>
                <div className="text-xs text-slate-500">
                  best{summary.best ? ` · ${new Date(`${summary.best.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}` : ''}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} className="min-h-[3.75rem] sm:min-h-[4.5rem]" />;
          const day = byDate.get(date);
          const dayNo = Number(date.slice(8));
          if (!day) {
            // Inside this month but outside the sprint
            return (
              <div key={date} className="min-h-[3.75rem] sm:min-h-[4.5rem] rounded-lg p-1.5 text-xs text-slate-300">
                {dayNo}
              </div>
            );
          }
          const isToday = date === data.today;
          const body = (
            <>
              <span className={`text-xs ${day.status === 'future' ? 'text-slate-300' : 'opacity-70'}`}>{dayNo}</span>
              {day.status !== 'future' && (
                <span className="mt-0.5 block text-center leading-tight">
                  <span className="text-sm sm:text-base font-semibold tabular-nums">{day.orders}</span>
                  <span className="block text-[11px] opacity-70 tabular-nums">/ {day.target}</span>
                </span>
              )}
            </>
          );
          const cls = `min-h-[3.75rem] sm:min-h-[4.5rem] rounded-lg border p-1.5 flex flex-col ${TONE[day.status]} ${
            isToday ? 'ring-2 ring-slate-900' : ''
          }`;
          return day.status === 'future' ? (
            <div key={date} className={cls} title="Still to come">
              {body}
            </div>
          ) : (
            <Link
              key={date}
              href={`/orders?date=${date}`}
              className={`${cls} hover:brightness-95`}
              title={`${day.orders} orders · target ${day.target}${isToday ? ' (today, so far)' : ''}`}
            >
              {body}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-emerald-200" /> Target hit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-amber-200" /> 80–99%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded bg-rose-200" /> Missed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded ring-2 ring-slate-900 bg-white" /> Today
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Each day shows orders over its own target. The target is worked out every morning, so a past day shows the target it had then. Tap a day to see its orders. Today isn&apos;t counted in the summary until it&apos;s over.
      </p>
    </section>
  );
}
