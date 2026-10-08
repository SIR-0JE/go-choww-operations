'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';

interface Activity {
  id: string;
  createdAt: string;
  type: string;
  riderName: string | null;
  customerName: string | null;
  cafeteriaName: string | null;
  deliveryAddress: string | null;
  orderNumber: string | null;
  detail: string | null;
}

interface Live {
  inPool: number;
  accepted: number;
  onTheWay: number;
  deliveredToday: number;
}

type Filter = 'all' | 'claim' | 'pickup' | 'deliver' | 'new_orders' | 'reps' | 'other';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'claim', label: 'Accepted' },
  { key: 'pickup', label: 'Picked up' },
  { key: 'deliver', label: 'Delivered' },
  { key: 'new_orders', label: 'New orders' },
  { key: 'reps', label: 'Reps' },
  { key: 'other', label: 'Other' },
];

// Per device: what's been seen / cleared on this browser
const SEEN_KEY = 'gochoww_activity_seen';
const CLEARED_KEY = 'gochoww_activity_cleared';

const readTime = (key: string) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};
const writeTime = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event('notifications-updated'));
};

const DOT: Record<string, string> = {
  claim: 'bg-orange-500',
  pickup: 'bg-blue-500',
  deliver: 'bg-emerald-500',
  new_orders: 'bg-slate-900',
  drop: 'bg-rose-500',
  transfer: 'bg-violet-500',
  handover_request: 'bg-amber-500',
  handover_accept: 'bg-violet-500',
  collector_handed: 'bg-teal-500',
  collector_received: 'bg-teal-500',
  collector_delivered: 'bg-emerald-500',
  collector_not_reachable: 'bg-rose-500',
  collector_returned: 'bg-amber-500',
};

function describe(a: Activity): { title: React.ReactNode; sub: string | null } {
  const rider = <strong className="font-semibold">{a.riderName || 'A rider'}</strong>;
  const customer = a.customerName ? <strong className="font-semibold">{a.customerName}</strong> : 'an order';
  const route = [a.cafeteriaName, a.deliveryAddress].filter(Boolean).join(' → ') || null;
  switch (a.type) {
    case 'claim':
      return { title: <>{rider} accepted {customer}&apos;s order</>, sub: route };
    case 'pickup':
      return {
        title: <>{rider} picked up {customer}&apos;s order{a.cafeteriaName ? ` from ${a.cafeteriaName}` : ''}</>,
        sub: a.deliveryAddress ? `On the way to ${a.deliveryAddress}` : null,
      };
    case 'deliver':
      return { title: <>{rider} delivered {customer}&apos;s order</>, sub: a.deliveryAddress ? `to ${a.deliveryAddress}` : null };
    case 'drop':
      return { title: <>{rider} put {customer}&apos;s order back in the pool</>, sub: route };
    case 'transfer':
      return { title: <>{rider} passed {customer}&apos;s order {a.detail}</>, sub: route };
    case 'handover_request':
      return {
        title: <>{rider} asked to take {customer}&apos;s order</>,
        sub: [a.cafeteriaName, a.detail].filter(Boolean).join(' · ') || null,
      };
    case 'handover_accept':
      return { title: <>{rider} handed {customer}&apos;s order {a.detail}</>, sub: route };
    case 'collector_handed':
      return { title: <>{rider} handed {customer}&apos;s order to {a.detail || 'the rep'}</>, sub: route };
    case 'collector_received':
      return { title: <>{rider} (rep) received {customer}&apos;s order</>, sub: a.detail || route };
    case 'collector_delivered':
      return { title: <>{rider} (rep) delivered {customer}&apos;s order</>, sub: a.deliveryAddress ? `at ${a.deliveryAddress}` : null };
    case 'collector_not_reachable':
      return { title: <>{rider} (rep) couldn&apos;t reach {customer}</>, sub: route };
    case 'collector_returned':
      return { title: <>{rider} (rep) gave {customer}&apos;s order back to the riders</>, sub: route };
    case 'new_orders':
      return { title: <><strong className="font-semibold">{a.detail || 'New orders'}</strong> came in</>, sub: null };
    default:
      return { title: <>{rider} updated an order</>, sub: route };
  }
}

const timeAgo = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h} h ago`;
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

export default function NotificationsPage() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [seenAt, setSeenAt] = useState('');
  const [clearedAt, setClearedAt] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/activity', { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error();
      setActivities(data.activities);
      setLive(data.live);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    setSeenAt(readTime(SEEN_KEY));
    setClearedAt(readTime(CLEARED_KEY));
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  const markAllRead = () => {
    const now = new Date().toISOString();
    writeTime(SEEN_KEY, now);
    setSeenAt(now);
  };
  const clearAll = () => {
    const now = new Date().toISOString();
    writeTime(CLEARED_KEY, now);
    writeTime(SEEN_KEY, now);
    setClearedAt(now);
    setSeenAt(now);
  };

  const visible = (activities || [])
    .filter((a) => !clearedAt || a.createdAt > clearedAt)
    .filter((a) =>
      filter === 'all'
        ? true
        : filter === 'reps'
        ? a.type.startsWith('collector_')
        : filter === 'other'
        ? !['claim', 'pickup', 'deliver', 'new_orders'].includes(a.type) && !a.type.startsWith('collector_')
        : a.type === filter
    );
  const unread = (activities || []).filter((a) => (!clearedAt || a.createdAt > clearedAt) && (!seenAt || a.createdAt > seenAt)).length;

  return (
    <AppLayout>
      <Header />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500 mt-1">What riders are doing, live. Last 24 hours.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 flex items-center gap-1.5 disabled:opacity-40"
            >
              <CheckCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Mark all read</span>
            </button>
            <button
              onClick={clearAll}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-500 flex items-center gap-1.5"
              aria-label="Clear all"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          </div>
        </div>

        {/* Right now */}
        <section className="grid grid-cols-4 rounded-xl bg-white border border-slate-200 divide-x divide-slate-100">
          {[
            ['In pool', live?.inPool, 'text-slate-900'],
            ['Accepted', live?.accepted, 'text-orange-600'],
            ['On the way', live?.onTheWay, 'text-blue-600'],
            ['Delivered today', live?.deliveredToday, 'text-emerald-600'],
          ].map(([label, value, color]) => (
            <div key={label as string} className="px-2 sm:px-4 py-3 text-center sm:text-left">
              <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value ?? '–'}</div>
              <div className="text-xs text-slate-500 leading-tight">{label}</div>
            </div>
          ))}
        </section>

        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`h-8 px-3 rounded-full text-sm font-medium whitespace-nowrap border ${
                filter === f.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          {error && !activities ? (
            <p className="px-4 py-12 text-center text-sm text-slate-500">
              Couldn&apos;t load notifications.{' '}
              <button onClick={load} className="underline text-slate-900">
                Try again
              </button>
            </p>
          ) : !activities ? (
            <div className="divide-y divide-slate-100">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Bell className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Nothing yet</p>
              <p className="text-sm text-slate-500 mt-1">When a rider accepts, picks up or delivers an order, it shows here.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visible.map((a) => {
                const { title, sub } = describe(a);
                const isNew = !seenAt || a.createdAt > seenAt;
                return (
                  <li key={a.id} className={`px-4 py-3 flex gap-3 ${isNew ? 'bg-orange-50/40' : ''}`}>
                    <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${DOT[a.type] || 'bg-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{title}</p>
                      {sub && <p className="text-xs text-slate-500 mt-0.5 truncate">{sub}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-slate-500">{timeAgo(a.createdAt)}</div>
                      <div className="text-xs text-slate-400 tabular-nums">{clock(a.createdAt)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
