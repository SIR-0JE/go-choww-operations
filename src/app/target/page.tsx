'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import type { SprintStatus } from '@/lib/sprint';

const longDate = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (key: string) =>
  new Date(`${key}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Bar({ percent, tone = 'brand' }: { percent: number; tone?: 'brand' | 'emerald' }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-500' : 'bg-brand-500'}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

export default function TargetPage() {
  const [sprint, setSprint] = useState<SprintStatus | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ targetAmount: '', startDate: '', endDate: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/sprint', { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error();
      setSprint(data.sprint);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [load]);

  const openEditor = () => {
    if (!sprint) return;
    setForm({
      targetAmount: String(sprint.config.targetAmount),
      startDate: sprint.config.startDate,
      endDate: sprint.config.endDate,
    });
    setMessage(null);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch('/api/sprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetAmount: Number(form.targetAmount.replace(/[^\d]/g, '')),
          startDate: form.startDate,
          endDate: form.endDate,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSprint(data.sprint);
      setEditing(false);
      setMessage({ text: 'Sprint saved for everyone. Targets updated.' });
    } catch (err: any) {
      setMessage({ text: err?.message || 'Could not save. Try again.', error: true });
    } finally {
      setIsSaving(false);
    }
  };

  const s = sprint;
  const todayPct = s && s.dailyTargetOrders > 0 ? (s.todayOrders / s.dailyTargetOrders) * 100 : 0;
  const hitToday = s ? s.dailyTargetOrders > 0 && s.todayOrders >= s.dailyTargetOrders : false;
  const onTrack = s ? s.paceOrdersPerDay >= s.dailyTargetOrders : false;
  const finishBeforeDeadline = s?.projectedFinishDate ? s.projectedFinishDate <= s.config.endDate : false;

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sprint target</h1>
            <p className="text-sm text-slate-500 mt-1">
              {s
                ? `${formatNaira(s.config.targetAmount)} from ${shortDate(s.config.startDate)} to ${shortDate(s.config.endDate)}`
                : 'Loading…'}
            </p>
          </div>
          {s && !editing && (
            <button
              onClick={openEditor}
              className="h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 shrink-0"
            >
              Edit sprint
            </button>
          )}
        </div>

        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm border ${
              message.error ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {loadError && !s && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Couldn&apos;t load the sprint.{' '}
            <button onClick={load} className="underline">
              Try again
            </button>
          </div>
        )}

        {editing && s && (
          <form onSubmit={save} className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Edit sprint</h2>
            <label className="block">
              <span className="text-sm text-slate-600">Amount to raise (₦)</span>
              <input
                inputMode="numeric"
                value={form.targetAmount}
                onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
                className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 text-base text-slate-900 tabular-nums"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm text-slate-600">Counts from</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 text-base text-slate-900"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-slate-600">Deadline</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 text-base text-slate-900"
                  required
                />
              </label>
            </div>
            <p className="text-sm text-slate-500">
              Orders and expenses from the start date onwards count. Saved for everyone, and today&apos;s target updates straight away.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="h-11 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="h-11 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50">
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}

        {!s ? (
          !loadError && <div className="h-64 rounded-xl bg-white border border-slate-200 animate-pulse" />
        ) : s.status === 'reached' ? (
          <section className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
            <h2 className="text-lg font-semibold text-emerald-900">Target reached</h2>
            <p className="text-sm text-emerald-800 mt-1">
              {formatNaira(s.earned)} raised against {formatNaira(s.config.targetAmount)}. Set a new sprint when you&apos;re ready.
            </p>
          </section>
        ) : (
          <>
            {/* Today */}
            <section className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5">
              <div className="text-sm text-slate-500">Today&apos;s target</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight text-slate-900 tabular-nums">{s.dailyTargetOrders}</span>
                <span className="text-base text-slate-500">orders</span>
              </div>
              <div className="mt-4">
                <Bar percent={todayPct} tone={hitToday ? 'emerald' : 'brand'} />
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-slate-700">
                    <span className="font-medium tabular-nums">{s.todayOrders}</span> so far today
                  </span>
                  <span className={hitToday ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                    {hitToday ? 'Target hit' : `${s.dailyTargetOrders - s.todayOrders} to go`}
                  </span>
                </div>
              </div>
              <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600 leading-relaxed">
                <span className="font-medium text-slate-900">{formatNaira(s.remainingAtStartOfToday)}</span> left at the start of today ÷{' '}
                <span className="font-medium text-slate-900">{s.daysLeft} days</span> ={' '}
                <span className="font-medium text-slate-900">{formatNaira(s.neededPerDay)}</span> a day ÷{' '}
                <span className="font-medium text-slate-900">{formatNaira(s.feePerOrder)}</span> per order (average fee, last 14 days)
              </div>
            </section>

            {/* Progress */}
            <section className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5 space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm text-slate-500">Raised so far</div>
                  <div className="text-sm text-slate-500 tabular-nums">{s.progressPercent.toFixed(1)}%</div>
                </div>
                <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                  {formatNaira(s.earned)} <span className="text-base font-normal text-slate-400">of {formatNaira(s.config.targetAmount)}</span>
                </div>
                <div className="mt-3">
                  <Bar percent={s.progressPercent} tone="emerald" />
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {formatNaira(s.feesSinceStart)} in delivery fees − {formatNaira(s.expensesSinceStart)} logged expenses since{' '}
                  {shortDate(s.config.startDate)}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-slate-100 pt-4">
                <div>
                  <dt className="text-sm text-slate-500">Still to raise</dt>
                  <dd className="text-lg font-semibold text-slate-900 tabular-nums">{formatNaira(s.remaining)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Days left</dt>
                  <dd className="text-lg font-semibold text-slate-900 tabular-nums">
                    {s.daysLeft} <span className="text-sm font-normal text-slate-400">to {shortDate(s.config.endDate)}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Your pace</dt>
                  <dd className="text-lg font-semibold text-slate-900 tabular-nums">
                    {s.paceOrdersPerDay} <span className="text-sm font-normal text-slate-400">orders/day, last 7 days</span>
                  </dd>
                  <dd className={`text-sm ${onTrack ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {onTrack ? 'At or above target' : `${Math.ceil(s.dailyTargetOrders - s.paceOrdersPerDay)} a day short`}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-slate-500">Finish date at this rate</dt>
                  <dd className="text-lg font-semibold text-slate-900">
                    {s.projectedFinishDate ? shortDate(s.projectedFinishDate) : '—'}
                  </dd>
                  {s.projectedFinishDate && (
                    <dd className={`text-sm ${finishBeforeDeadline ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {finishBeforeDeadline ? 'Before the deadline' : `After the ${shortDate(s.config.endDate)} deadline`}
                    </dd>
                  )}
                </div>
              </dl>
              <p className="text-xs text-slate-400">
                Finish date assumes the last 7 days&apos; pace continues. Since {longDate(s.config.startDate)} you&apos;ve averaged{' '}
                {formatNaira(s.averageEarnedPerDay)} a day. Expenses count as soon as they&apos;re logged.
              </p>
            </section>
          </>
        )}
      </main>
    </AppLayout>
  );
}
