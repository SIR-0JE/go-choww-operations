'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, LogOut, Package, RefreshCw, Store, Undo2 } from 'lucide-react';
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner';
import { playAlertChime, unlockAudioOnFirstInteraction } from '@/lib/voiceNotifications';

interface Item {
  pack: number | null;
  name: string;
  quantity: number;
}
interface Order {
  id: string;
  orderId: string;
  createdAt: string;
  customerName: string;
  deliveryAddress: string;
  deliveryType: string;
  orderStatus: string;
  gochowStatus?: string | null;
  pickupCode?: string | null;
  items?: Item[] | null;
  rider?: { name: string } | null;
  packedAt?: string | null;
  packedBy?: string | null;
}

type Tab = 'topack' | 'packed';

const minsSince = (iso?: string | null, now = Date.now()) => (iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Lagos' });
const isPickup = (t: string) => /pick/i.test(t);

export default function RunnerPage() {
  const router = useRouter();
  const [runner, setRunner] = useState<{ id: string; name: string; cafeteria: string } | null>(null);
  const [toPack, setToPack] = useState<Order[]>([]);
  const [packed, setPacked] = useState<Order[]>([]);
  const [alertMinutes, setAlertMinutes] = useState(10);
  const [undoMinutes, setUndoMinutes] = useState(10);
  const [tab, setTab] = useState<Tab>('topack');
  const [loading, setLoading] = useState(true);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [now, setNow] = useState(Date.now());
  const knownIds = useRef<Set<string> | null>(null);

  const signedOut = useCallback(() => {
    localStorage.removeItem('runner_id');
    router.replace('/runner/login');
  }, [router]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/runner/orders', { cache: 'no-store' });
      if (res.status === 401) return signedOut();
      const data = await res.json();
      if (!data.success) return setConnectionIssue(true);
      setRunner(data.runner);
      setAlertMinutes(data.alertMinutes);
      setUndoMinutes(data.undoMinutes);
      setToPack(data.toPack);
      setPacked(data.packed);
      setConnectionIssue(false);

      // New order since the last look: sound, buzz and a note (not on the very first load)
      const ids = new Set<string>(data.toPack.map((o: Order) => o.id));
      if (knownIds.current && data.toPack.some((o: Order) => !knownIds.current!.has(o.id))) {
        playAlertChime();
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          // not supported
        }
        setToast({ text: 'New order to pack', ok: true });
      }
      knownIds.current = ids;
    } catch {
      setConnectionIssue(true);
    } finally {
      setLoading(false);
    }
  }, [signedOut]);

  useEffect(() => {
    if (!localStorage.getItem('runner_id')) {
      router.replace('/runner/login');
      return;
    }
    unlockAudioOnFirstInteraction();
    load();
    const poll = setInterval(load, 6000);
    const tick = setInterval(() => setNow(Date.now()), 20000);
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
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const act = async (order: Order, action: 'ready' | 'undo') => {
    setBusyId(order.id);
    try {
      const res = await fetch('/api/runner/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, action }),
      });
      if (res.status === 401) return signedOut();
      const data = await res.json();
      setToast({ text: data.message || data.error || (data.success ? 'Done' : 'Something went wrong'), ok: !!data.success });
      await load();
    } catch {
      setToast({ text: 'No connection. Try again.', ok: false });
    } finally {
      setBusyId(null);
    }
  };

  const logout = async () => {
    await fetch('/api/runner/auth', { method: 'DELETE' }).catch(() => {});
    signedOut();
  };

  const lateCount = useMemo(() => toPack.filter((o) => minsSince(o.createdAt, now) >= alertMinutes).length, [toPack, now, alertMinutes]);
  const list = tab === 'topack' ? toPack : packed;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 truncate flex items-center gap-2">
              <Store className="w-5 h-5 text-orange-500 shrink-0" />
              {runner?.cafeteria || 'Runner'}
            </p>
            <p className="text-xs text-slate-500 truncate">{runner?.name}</p>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 pb-2.5">
          <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg" role="tablist">
            {([
              { key: 'topack', label: 'To pack', n: toPack.length },
              { key: 'packed', label: 'Packed', n: packed.length },
            ] as const).map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`h-11 rounded-md text-sm font-medium flex items-center justify-center gap-2 ${
                  tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t.label}
                <span
                  className={`text-xs tabular-nums rounded-full px-2 py-0.5 ${
                    t.key === 'topack' && t.n > 0 ? (lateCount > 0 ? 'bg-rose-600 text-white' : 'bg-orange-500 text-white') : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {t.n}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {toast && (
        <div
          className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${
            toast.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
          {toast.text}
        </div>
      )}

      <main className="flex-1 p-4 space-y-3 pb-10">
        {connectionIssue && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            Reconnecting… showing the last orders.
          </div>
        )}
        {runner && <NotificationPermissionBanner userType="runner" riderId={runner.id} />}

        {loading && toPack.length + packed.length === 0 ? (
          <div className="space-y-3 animate-pulse">
            {[0, 1].map((i) => (
              <div key={i} className="h-56 bg-white border border-slate-200 rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-300 rounded-xl bg-white px-6">
            <Package className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-700">{tab === 'topack' ? 'Nothing to pack' : 'Nothing packed yet'}</p>
            <p className="text-xs text-slate-500 mt-1">{tab === 'topack' ? 'New orders for your cafeteria show here with a sound.' : 'Orders you mark Ready show here.'}</p>
          </div>
        ) : (
          list.map((o) => {
            const waited = minsSince(o.createdAt, now);
            const late = tab === 'topack' && waited >= alertMinutes;
            const items = (o.items || []).filter((i) => i && i.name);
            const multiPack = new Set(items.map((i) => i.pack).filter((p) => p !== null)).size > 1;
            const canUndo = tab === 'packed' && o.packedAt && minsSince(o.packedAt, now) < undoMinutes && !/^(in transit|completed|delivered)/i.test(o.orderStatus);
            return (
              <div key={o.id} className={`bg-white rounded-xl border overflow-hidden ${late ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200'}`}>
                <div className="px-4 pt-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${late ? 'text-rose-700' : 'text-slate-600'}`}>
                      <Clock className="w-4 h-4" />
                      {tab === 'topack' ? `${waited} min ago` : `Packed ${o.packedAt ? clock(o.packedAt) : ''}`}
                    </span>
                    <p className="text-base font-semibold text-slate-900 mt-1 truncate">{o.customerName}</p>
                    <p className="text-sm text-slate-500 truncate">
                      {isPickup(o.deliveryType) ? (
                        <span className="inline-block rounded bg-slate-100 text-slate-700 px-1.5 py-0.5 text-xs font-medium">Pick-up</span>
                      ) : (
                        o.deliveryAddress
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-500">Code</p>
                    <p className="text-3xl font-bold font-mono tracking-[0.12em] text-slate-900 leading-tight">{o.pickupCode || '—'}</p>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {items.length > 0 ? (
                    <ul className="rounded-lg bg-slate-50 px-3 py-2.5 space-y-1">
                      {items.map((it, i) => (
                        <li key={i} className="text-base text-slate-800 flex justify-between gap-3">
                          <span className="min-w-0">
                            <span className="font-semibold tabular-nums">{it.quantity}×</span> {it.name}
                          </span>
                          {multiPack && it.pack !== null && <span className="text-xs text-slate-400 shrink-0 self-center">pack {it.pack}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">Items not available for this order yet.</p>
                  )}

                  {tab === 'topack' ? (
                    <>
                      {o.gochowStatus && /^(ready|dispatched)$/i.test(o.gochowStatus) && (
                        <p className="text-xs text-slate-500">GoChow already shows this as {o.gochowStatus}.</p>
                      )}
                      <button
                        onClick={() => act(o, 'ready')}
                        disabled={busyId === o.id}
                        className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-base inline-flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {busyId === o.id ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                        Ready
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-500 truncate">
                        {/^(in transit)/i.test(o.orderStatus) ? 'Picked up by the rider' : o.rider?.name ? `Rider: ${o.rider.name}` : isPickup(o.deliveryType) ? 'Customer collects' : 'Waiting for a rider'}
                      </p>
                      {canUndo && (
                        <button
                          onClick={() => act(o, 'undo')}
                          disabled={busyId === o.id}
                          className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                        >
                          <Undo2 className="w-4 h-4" /> Undo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </main>
    </div>
  );
}
