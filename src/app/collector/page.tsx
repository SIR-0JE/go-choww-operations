'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  Clock,
  LogOut,
  MessageCircle,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  Undo2,
  UserX,
  X,
} from 'lucide-react';
import { prettyPhone, telHref, whatsappNumber } from '@/lib/phone';

type Phase =
  | 'waiting_rider'
  | 'with_rider'
  | 'on_the_way'
  | 'handed'
  | 'with_collector'
  | 'not_reachable'
  | 'delivered'
  | 'returned';

interface Item {
  pack: number | null;
  name: string;
  quantity: number;
}

interface Order {
  id: string;
  orderId: string;
  createdAt: string;
  time: string;
  customerName: string;
  customerPhone?: string | null;
  cafeteriaName: string;
  deliveryAddress: string;
  gochowStatus?: string | null;
  pickupCode?: string | null;
  items?: Item[] | null;
  handedAt?: string | null;
  receivedAt?: string | null;
  notReachableAt?: string | null;
  collectorDoneAt?: string | null;
  rider?: { id: string; name: string; phone?: string | null } | null;
  phase: Phase;
}

interface Mode {
  active: boolean;
  setting: 'auto' | 'on' | 'off';
  startTime: string;
  endTime: string;
  days: number[];
  returnAfterMinutes: number;
  handoverAlertMinutes: number;
}

type Tab = 'coming' | 'confirm' | 'withme' | 'done';

const TAB_PHASES: Record<Tab, Phase[]> = {
  coming: ['waiting_rider', 'with_rider', 'on_the_way'],
  confirm: ['handed'],
  withme: ['with_collector', 'not_reachable'],
  done: ['delivered', 'returned'],
};

const PHASE_LABEL: Record<Phase, { text: string; dot: string; tone: string }> = {
  waiting_rider: { text: 'Waiting for a rider', dot: 'bg-slate-400', tone: 'text-slate-600' },
  with_rider: { text: 'Rider going to the cafeteria', dot: 'bg-orange-500', tone: 'text-orange-700' },
  on_the_way: { text: 'Rider on the way to you', dot: 'bg-blue-500', tone: 'text-blue-700' },
  handed: { text: 'Rider says they handed it to you', dot: 'bg-teal-500', tone: 'text-teal-700' },
  with_collector: { text: 'With you', dot: 'bg-teal-500', tone: 'text-teal-700' },
  not_reachable: { text: 'Customer not reachable', dot: 'bg-rose-500', tone: 'text-rose-700' },
  delivered: { text: 'Delivered', dot: 'bg-emerald-500', tone: 'text-emerald-700' },
  returned: { text: 'Given back to a rider', dot: 'bg-amber-500', tone: 'text-amber-700' },
};

// "15:00" -> "3:00 PM"
const clock12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const firstName = (n?: string | null) => (n || '').replace(/^mr\.?\s+/i, '').split(' ')[0] || 'Rider';
const minsSince = (iso?: string | null, now = Date.now()) => (iso ? Math.floor((now - new Date(iso).getTime()) / 60000) : 0);

export default function CollectorPage() {
  const router = useRouter();
  const [collector, setCollector] = useState<{ id: string; name: string; pointName: string; hostels: string[] } | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [tab, setTab] = useState<Tab>('coming');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirmNotReachable, setConfirmNotReachable] = useState<Order | null>(null);
  const tabTouched = useRef(false);

  const headers = useCallback((): Record<string, string> => {
    const id = typeof window !== 'undefined' ? localStorage.getItem('collector_id') : null;
    return id ? { 'x-collector-id': id } : {};
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/collector/orders', { headers: headers(), cache: 'no-store' });
      if (res.status === 401) {
        localStorage.removeItem('collector_id');
        localStorage.removeItem('collector_session');
        router.replace('/collector/login');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setCollector(data.collector);
        setMode(data.mode);
        setOrders(data.orders);
        setConnectionIssue(false);
        // Open on whatever needs the collector first
        if (!tabTouched.current) {
          const has = (t: Tab) => data.orders.some((o: Order) => TAB_PHASES[t].includes(o.phase));
          setTab(has('confirm') ? 'confirm' : has('withme') ? 'withme' : 'coming');
        }
      } else {
        setConnectionIssue(true);
      }
    } catch {
      setConnectionIssue(true);
    } finally {
      setLoading(false);
    }
  }, [headers, router]);

  useEffect(() => {
    if (!localStorage.getItem('collector_id')) {
      router.replace('/collector/login');
      return;
    }
    load();
    const poll = setInterval(load, 8000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const act = async (order: Order, action: string) => {
    setBusyId(order.id);
    try {
      const res = await fetch('/api/collector/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers() },
        body: JSON.stringify({ orderId: order.id, action }),
      });
      const data = await res.json();
      setToast({ text: data.message || data.error || (data.success ? 'Done' : 'Something went wrong'), ok: !!data.success });
      await load();
    } catch {
      setToast({ text: 'No connection. Please try again.', ok: false });
    } finally {
      setBusyId(null);
    }
  };

  const logout = async () => {
    await fetch('/api/collector/auth', { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem('collector_id');
    localStorage.removeItem('collector_session');
    router.replace('/collector/login');
  };

  const counts = useMemo(() => {
    const c = { coming: 0, confirm: 0, withme: 0, done: 0 } as Record<Tab, number>;
    for (const o of orders) for (const t of Object.keys(TAB_PHASES) as Tab[]) if (TAB_PHASES[t].includes(o.phase)) c[t]++;
    return c;
  }, [orders]);

  const q = query.trim().toLowerCase();
  const shown = orders
    .filter((o) =>
      q
        ? (o.pickupCode || '').toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone || '').replace(/\D/g, '').includes(q.replace(/\D/g, '') || '§')
        : TAB_PHASES[tab].includes(o.phase)
    )
    .sort((a, b) => {
      // Done: newest first. Everything else: oldest first (it has waited longest)
      const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return tab === 'done' && !q ? -d : d;
    });

  const modeText = mode
    ? mode.active
      ? mode.setting === 'on'
        ? 'Collector mode is on'
        : `Collector mode on until ${clock12(mode.endTime)}`
      : mode.setting === 'off'
        ? 'Collector mode is off'
        : `Next: ${mode.days.map((d) => DAY_NAMES[d]).join(', ')} ${clock12(mode.startTime)}–${clock12(mode.endTime)}`
    : '';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900 truncate">{collector?.pointName || 'Collector'}</p>
            <p className="text-xs text-slate-500 truncate">{collector?.name}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {mode && (
              <span
                className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border ${
                  mode.active ? 'bg-teal-50 border-teal-200 text-teal-800' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${mode.active ? 'bg-teal-500' : 'bg-slate-400'}`} />
                {mode.active ? 'On' : 'Off'}
              </span>
            )}
            <button
              onClick={logout}
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        {modeText && <p className="px-4 pb-2 -mt-1 text-xs text-slate-500">{modeText}</p>}
        <div className="px-4 pb-2.5 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              inputMode="search"
              placeholder="Find by pickup code, name or phone"
              className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-9 pr-9 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400" aria-label="Clear search">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {!q && (
            <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg" role="tablist">
              {([
                { key: 'coming', label: 'Coming' },
                { key: 'confirm', label: 'Confirm' },
                { key: 'withme', label: 'With me' },
                { key: 'done', label: 'Done' },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => {
                    tabTouched.current = true;
                    setTab(t.key);
                  }}
                  className={`h-10 rounded-md text-sm font-medium flex flex-col items-center justify-center leading-tight ${
                    tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`text-xs tabular-nums ${
                      t.key === 'confirm' && counts.confirm > 0 ? 'text-teal-600 font-semibold' : tab === t.key ? 'text-orange-600' : 'text-slate-400'
                    }`}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {toast && (
        <div
          className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${
            toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      <main className="flex-1 p-4 space-y-3 pb-10">
        {connectionIssue && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Reconnecting… showing your last updated orders.</span>
          </div>
        )}

        {q && <p className="text-sm text-slate-500">{shown.length} match{shown.length === 1 ? '' : 'es'}</p>}

        {loading && orders.length === 0 ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 bg-white border border-slate-200 rounded-xl" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="py-14 text-center border border-dashed border-slate-300 rounded-xl bg-white px-6">
            <PackageCheck className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-700">
              {q
                ? 'No order matches that'
                : tab === 'coming'
                  ? 'Nothing coming yet'
                  : tab === 'confirm'
                    ? 'Nothing to confirm'
                    : tab === 'withme'
                      ? 'You are not holding any orders'
                      : 'Nothing delivered yet'}
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
              {tab === 'coming' && !q
                ? `Orders for ${collector?.hostels?.join(', ') || 'your hostels'} show here as soon as they are placed.`
                : tab === 'confirm' && !q
                  ? 'When a rider hands you food, confirm it here.'
                  : ''}
            </p>
          </div>
        ) : (
          shown.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              mode={mode}
              now={now}
              busy={busyId === o.id}
              onAct={(a) => (a === 'not_reachable' ? setConfirmNotReachable(o) : act(o, a))}
            />
          ))
        )}
      </main>

      {confirmNotReachable && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center p-4" onClick={() => setConfirmNotReachable(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div>
              <p className="text-base font-semibold text-slate-900">Can&apos;t reach {confirmNotReachable.customerName}?</p>
              <p className="text-sm text-slate-500 mt-1">
                Keep the food and keep trying. After {mode?.returnAfterMinutes ?? 20} minutes you can give it back to a rider.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setConfirmNotReachable(null)} className="h-11 rounded-lg border border-slate-200 text-sm font-medium text-slate-700">
                Cancel
              </button>
              <button
                onClick={() => {
                  const o = confirmNotReachable;
                  setConfirmNotReachable(null);
                  act(o, 'not_reachable');
                }}
                className="h-11 rounded-lg bg-rose-600 text-white text-sm font-semibold"
              >
                Not reachable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order: o,
  mode,
  now,
  busy,
  onAct,
}: {
  order: Order;
  mode: Mode | null;
  now: number;
  busy: boolean;
  onAct: (action: string) => void;
}) {
  const label = PHASE_LABEL[o.phase];
  const late = o.phase === 'handed' && mode && minsSince(o.handedAt, now) >= mode.handoverAlertMinutes;
  const waitedNR = minsSince(o.notReachableAt, now);
  const returnIn = Math.max(0, (mode?.returnAfterMinutes ?? 20) - waitedNR);
  const items = (o.items || []).filter((i) => i && i.name);
  const multiPack = new Set(items.map((i) => i.pack).filter((p) => p !== null)).size > 1;
  const Spinner = <RefreshCw className="w-4 h-4 animate-spin" />;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${late ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}>
      <div className="px-4 pt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${late ? 'text-rose-700' : label.tone}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${late ? 'bg-rose-500' : label.dot}`} />
            {label.text}
            {o.phase === 'handed' && o.handedAt ? ` · ${minsSince(o.handedAt, now)} min ago` : ''}
          </span>
          <p className="text-base font-semibold text-slate-900 mt-1 truncate">{o.customerName}</p>
          <p className="text-sm text-slate-500 truncate">{o.deliveryAddress}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-500">Code</p>
          <p className="text-3xl font-bold font-mono tracking-[0.12em] text-slate-900 leading-tight">{o.pickupCode || '—'}</p>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {items.length > 0 && (
          <ul className="rounded-lg bg-slate-50 px-3 py-2 space-y-0.5">
            {items.map((it, i) => (
              <li key={i} className="text-sm text-slate-700 flex justify-between gap-3">
                <span className="min-w-0">
                  {it.quantity}× {it.name}
                </span>
                {multiPack && it.pack !== null && <span className="text-xs text-slate-400 shrink-0">pack {it.pack}</span>}
              </li>
            ))}
          </ul>
        )}

        {/* Contacts: customer, then rider */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{o.customerPhone ? prettyPhone(o.customerPhone) : o.customerName}</p>
            <p className="text-xs text-slate-500">Customer</p>
          </div>
          {o.customerPhone ? (
            <div className="flex gap-2 shrink-0">
              <a href={`https://wa.me/${whatsappNumber(o.customerPhone)}`} target="_blank" rel="noreferrer" className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-slate-200" aria-label="WhatsApp customer">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
              </a>
              <a href={telHref(o.customerPhone)} className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-800">
                <Phone className="w-4 h-4 text-emerald-600" /> Call
              </a>
            </div>
          ) : (
            <span className="text-xs text-slate-400">No phone</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="min-w-0 flex items-center gap-2">
            <Bike className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm text-slate-900 truncate">{o.rider ? o.rider.name : 'No rider yet'}</p>
              <p className="text-xs text-slate-500 truncate">from {o.cafeteriaName} · {o.time}</p>
            </div>
          </div>
          {o.rider?.phone && (
            <a href={telHref(o.rider.phone)} className="h-10 px-3.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 shrink-0">
              <Phone className="w-4 h-4 text-slate-500" /> Rider
            </a>
          )}
        </div>

        {o.phase === 'handed' && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <button
              onClick={() => onAct('receive')}
              disabled={busy}
              className="col-span-2 h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? Spinner : <PackageCheck className="w-4 h-4" />} I have it
            </button>
            <button
              onClick={() => onAct('not_received')}
              disabled={busy}
              className="h-12 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
            >
              Didn&apos;t get it
            </button>
          </div>
        )}

        {(o.phase === 'with_collector' || o.phase === 'not_reachable') && (
          <div className="space-y-2 pt-1">
            <button
              onClick={() => onAct('deliver')}
              disabled={busy}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? Spinner : <CheckCircle2 className="w-4 h-4" />} Delivered to {firstName(o.customerName)}
            </button>
            {o.phase === 'with_collector' ? (
              <button
                onClick={() => onAct('not_reachable')}
                disabled={busy}
                className="w-full h-10 rounded-lg text-rose-700 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-rose-50 disabled:opacity-50"
              >
                <UserX className="w-4 h-4" /> Customer not reachable
              </button>
            ) : returnIn > 0 ? (
              <p className="text-xs text-slate-500 text-center inline-flex w-full items-center justify-center gap-1.5 h-10">
                <Clock className="w-3.5 h-3.5" /> Keep trying · can give back to a rider in {returnIn} min
              </p>
            ) : (
              <button
                onClick={() => onAct('return_to_rider')}
                disabled={busy}
                className="w-full h-10 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-sm font-medium inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Undo2 className="w-4 h-4" /> Give back to a rider
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
