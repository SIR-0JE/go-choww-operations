'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  PackageCheck,
  Pencil,
  Phone,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { prettyPhone, telHref } from '@/lib/phone';

interface Settings {
  mode: 'auto' | 'on' | 'off';
  days: number[];
  startTime: string;
  endTime: string;
  riderLimitNormal: number;
  riderLimitCollector: number;
  returnAfterMinutes: number;
  handoverAlertMinutes: number;
}

interface Rep {
  id: string;
  name: string;
  phone: string;
  status: string;
  pointName: string;
  hostels: string[];
}

interface BoardOrder {
  id: string;
  orderId: string;
  time: string;
  customerName: string;
  customerPhone?: string | null;
  cafeteriaName: string;
  deliveryAddress: string;
  pickupCode?: string | null;
  phase: string;
  late: boolean;
  handedAt?: string | null;
  rider?: { name: string; phone?: string | null } | null;
}

interface BoardRow {
  collectorId: string;
  total: number;
  waitingRider: number;
  withRider: number;
  handed: number;
  handedLate: number;
  withCollector: number;
  notReachable: number;
  delivered: number;
  returned: number;
  orders: BoardOrder[];
}

interface Data {
  date: string;
  isToday: boolean;
  settings: Settings;
  modeActive: boolean;
  collectors: Rep[];
  board: BoardRow[];
  addresses: { address: string; orders: number }[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// The three hostel groups we planned around; one tap fills the form
const PRESETS: { pointName: string; hostels: string[] }[] = [
  {
    pointName: 'Mathew, Mark, Luke, John',
    hostels: ['Mathew hostel', 'Mark hostel', 'Luke hostel', 'John hostel', 'Mathew, Mark, Luke, John hostels'],
  },
  { pointName: 'NH girls', hostels: ['NH girls hostel'] },
  { pointName: '288', hostels: ['288 girls hostel'] },
];

const PHASE: Record<string, { label: string; dot: string }> = {
  waiting_rider: { label: 'Waiting for rider', dot: 'bg-slate-400' },
  with_rider: { label: 'Rider going to cafeteria', dot: 'bg-orange-500' },
  on_the_way: { label: 'On the way', dot: 'bg-blue-500' },
  handed: { label: 'Handed, not confirmed', dot: 'bg-teal-500' },
  with_collector: { label: 'With rep', dot: 'bg-teal-600' },
  not_reachable: { label: 'Not reachable', dot: 'bg-rose-500' },
  delivered: { label: 'Delivered', dot: 'bg-emerald-500' },
  returned: { label: 'Given back to riders', dot: 'bg-amber-500' },
};

const clock12 = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
const shiftDay = (day: string, by: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

export default function CollectorsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [day, setDay] = useState('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<Partial<Rep> & { pin?: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [phaseFilter, setPhaseFilter] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/collectors${day ? `?date=${day}` : ''}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setData(json);
        setFailed(false);
        setDraft((d) => d ?? json.settings);
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
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const saveSettings = async (patch?: Partial<Settings>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setSavingSettings(true);
    try {
      const res = await fetch('/api/collectors/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const json = await res.json();
      if (json.success) {
        setDraft(json.settings);
        setNotice({ text: json.modeActive ? 'Saved. Rep mode is on now.' : 'Saved. Rep mode is off right now.', ok: true });
        load();
      } else setNotice({ text: json.error || 'Could not save.', ok: false });
    } catch {
      setNotice({ text: 'No connection. Try again.', ok: false });
    } finally {
      setSavingSettings(false);
    }
  };

  const orderAction = async (orderId: string, action: string) => {
    const res = await fetch('/api/collectors/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, action }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setNotice({ text: json?.success ? 'Done.' : json?.error || 'Could not save that.', ok: !!json?.success });
    load();
  };

  const saveCollector = async () => {
    if (!editing) return;
    const isNew = !editing.id;
    const body: Record<string, unknown> = {
      name: editing.name,
      phone: editing.phone,
      pointName: editing.pointName,
      hostels: editing.hostels,
    };
    if (isNew || editing.pin) body.pin = editing.pin || '1234';
    const res = await fetch(isNew ? '/api/collectors' : `/api/collectors/${editing.id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    if (json?.success) {
      setEditing(null);
      setNotice({ text: isNew ? `${editing.name} added. They sign in at /rep.` : 'Saved.', ok: true });
      load();
    } else {
      setNotice({ text: json?.error || 'Could not save.', ok: false });
    }
  };

  const setStatus = async (c: Rep, status: 'Active' | 'Inactive') => {
    const res = await fetch(`/api/collectors/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setNotice({ text: json?.success ? (status === 'Active' ? `${c.name} switched on.` : `${c.name} switched off.`) : json?.error || 'Could not save.', ok: !!json?.success });
    load();
  };

  const remove = async (c: Rep) => {
    if (!window.confirm(`Remove ${c.name}? Their past orders keep their name.`)) return;
    const res = await fetch(`/api/collectors/${c.id}`, { method: 'DELETE' }).catch(() => null);
    const json = res ? await res.json().catch(() => null) : null;
    setNotice({ text: json?.success ? `${c.name} removed.` : json?.error || 'Could not remove.', ok: !!json?.success });
    load();
  };

  const settingsDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(data?.settings ? { ...data.settings } : null), [draft, data]);

  const totals = useMemo(() => {
    const t = { total: 0, coming: 0, handed: 0, late: 0, withCollector: 0, notReachable: 0, delivered: 0 };
    for (const b of data?.board || []) {
      t.total += b.total;
      t.coming += b.waitingRider + b.withRider;
      t.handed += b.handed;
      t.late += b.handedLate;
      t.withCollector += b.withCollector;
      t.notReachable += b.notReachable;
      t.delivered += b.delivered;
    }
    return t;
  }, [data]);

  const inputCls =
    'h-10 w-full bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10';

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reps</h1>
            <p className="text-sm text-slate-500 mt-1">
              During busy windows riders hand hostel orders to a rep, who delivers them.
            </p>
          </div>
          <button
            onClick={() => setEditing({ name: '', phone: '', pin: '', pointName: '', hostels: [] })}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add rep
          </button>
        </div>

        {notice && (
          <div
            className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${
              notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {!notice.ok && <AlertCircle className="w-4 h-4 shrink-0" />}
            {notice.text}
          </div>
        )}

        {/* ── Rep mode ───────────────────────────────────────────── */}
        {draft && data && (
          <section className="rounded-xl bg-white border border-slate-200">
            <div className="px-4 sm:px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                  Rep mode
                  <span
                    className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs font-medium ${
                      data.modeActive ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${data.modeActive ? 'bg-teal-500' : 'bg-slate-400'}`} />
                    {data.modeActive ? 'On now' : 'Off now'}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  {draft.mode === 'auto'
                    ? `Turns on by itself ${draft.days.map((d) => DAYS[d]).join(', ') || '(no days picked)'} ${clock12(draft.startTime)}–${clock12(draft.endTime)}`
                    : draft.mode === 'on'
                      ? 'On until you switch it off'
                      : 'Off until you switch it on or pick Schedule'}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg w-full sm:w-auto" role="radiogroup" aria-label="Rep mode">
                {([
                  { key: 'off', label: 'Off' },
                  { key: 'auto', label: 'Schedule' },
                  { key: 'on', label: 'On' },
                ] as const).map((m) => (
                  <button
                    key={m.key}
                    role="radio"
                    aria-checked={draft.mode === m.key}
                    disabled={savingSettings}
                    onClick={() => saveSettings({ mode: m.key })}
                    className={`h-9 px-4 rounded-md text-sm font-medium ${
                      draft.mode === m.key ? (m.key === 'on' ? 'bg-teal-600 text-white' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-500'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 sm:p-5 grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-900">Schedule</p>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = draft.days.includes(i);
                    return (
                      <button
                        key={d}
                        onClick={() => setDraft({ ...draft, days: on ? draft.days.filter((x) => x !== i) : [...draft.days, i].sort() })}
                        className={`h-9 w-12 rounded-lg text-sm font-medium border ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-500">
                    From
                    <input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} className={`${inputCls} mt-1`} />
                  </label>
                  <label className="text-xs text-slate-500">
                    Until
                    <input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} className={`${inputCls} mt-1`} />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-900">Rider order limit</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-500">
                    Normal times
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draft.riderLimitNormal}
                      onChange={(e) => setDraft({ ...draft, riderLimitNormal: Number(e.target.value) })}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    During rep mode
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={draft.riderLimitCollector}
                      onChange={(e) => setDraft({ ...draft, riderLimitCollector: Number(e.target.value) })}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Give back to riders after (min)
                    <input
                      type="number"
                      min={0}
                      max={240}
                      value={draft.returnAfterMinutes}
                      onChange={(e) => setDraft({ ...draft, returnAfterMinutes: Number(e.target.value) })}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Unconfirmed handover turns red after (min)
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={draft.handoverAlertMinutes}
                      onChange={(e) => setDraft({ ...draft, handoverAlertMinutes: Number(e.target.value) })}
                      className={`${inputCls} mt-1`}
                    />
                  </label>
                </div>
              </div>
            </div>
            {settingsDirty && (
              <div className="px-4 sm:px-5 pb-4 flex justify-end gap-2">
                <button onClick={() => setDraft(data.settings)} className="h-9 px-3.5 rounded-lg border border-slate-200 text-sm text-slate-700">
                  Undo changes
                </button>
                <button
                  onClick={() => saveSettings()}
                  disabled={savingSettings}
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Live board ───────────────────────────────────────────────── */}
        <section className="space-y-3" aria-label="Rep board">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Board</h2>
              {data && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {totals.total} orders · {totals.coming} coming · {totals.withCollector + totals.notReachable} with reps · {totals.delivered} delivered
                  {totals.late > 0 && <span className="text-rose-600 font-medium"> · {totals.late} handover{totals.late === 1 ? '' : 's'} not confirmed</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => day && setDay(shiftDay(day, -1))}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
                aria-label="Previous day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="h-8 px-2.5 inline-flex items-center rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700">
                {data?.isToday
                  ? 'Today'
                  : day
                    ? new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
                    : '…'}
              </span>
              <button
                onClick={() => day && setDay(shiftDay(day, 1))}
                disabled={!!data?.isToday}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
                aria-label="Next day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading && !data ? (
            <div className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ) : failed && !data ? (
            <p className="rounded-xl bg-white border border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Couldn&apos;t load reps.</p>
          ) : !data?.collectors.length ? (
            <div className="rounded-xl bg-white border border-dashed border-slate-300 px-6 py-12 text-center">
              <PackageCheck className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
              <p className="text-sm font-semibold text-slate-700">No reps yet</p>
              <p className="text-xs text-slate-500 mt-1">Add one for each hostel group. They sign in on their phone at /rep.</p>
            </div>
          ) : (
            data.collectors.map((c) => {
              const b = data.board.find((x) => x.collectorId === c.id);
              const isOpen = open[c.id] ?? false;
              const filter = phaseFilter[c.id] ?? null;
              const stats: { key: string; label: string; n: number; phases: string[]; tone: string }[] = [
                { key: 'coming', label: 'Coming', n: (b?.waitingRider || 0) + (b?.withRider || 0), phases: ['waiting_rider', 'with_rider', 'on_the_way'], tone: 'text-slate-900' },
                { key: 'handed', label: 'To confirm', n: b?.handed || 0, phases: ['handed'], tone: b?.handedLate ? 'text-rose-600' : 'text-teal-700' },
                { key: 'with', label: 'With rep', n: b?.withCollector || 0, phases: ['with_collector'], tone: 'text-teal-700' },
                { key: 'nr', label: 'Not reachable', n: b?.notReachable || 0, phases: ['not_reachable'], tone: b?.notReachable ? 'text-rose-600' : 'text-slate-900' },
                { key: 'done', label: 'Delivered', n: b?.delivered || 0, phases: ['delivered'], tone: 'text-emerald-700' },
                { key: 'ret', label: 'Given back', n: b?.returned || 0, phases: ['returned'], tone: 'text-amber-700' },
              ];
              const activeStat = stats.find((s) => s.key === filter);
              const list = (b?.orders || []).filter((o) => !activeStat || activeStat.phases.includes(o.phase));
              return (
                <div key={c.id} className={`rounded-xl bg-white border overflow-hidden ${b?.handedLate ? 'border-rose-300' : 'border-slate-200'}`}>
                  <div className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
                        {c.pointName}
                        {c.status !== 'Active' && <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Off</span>}
                      </p>
                      <p className="text-sm text-slate-600 truncate">
                        {c.name} · <a href={telHref(c.phone)} className="underline decoration-slate-300">{prettyPhone(c.phone)}</a>
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{c.hostels.join(' · ')}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setEditing({ ...c, pin: '' })}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                        aria-label={`Edit ${c.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setStatus(c, c.status === 'Active' ? 'Inactive' : 'Active')}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {c.status === 'Active' ? 'Switch off' : 'Switch on'}
                      </button>
                      <button
                        onClick={() => remove(c)}
                        className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        aria-label={`Remove ${c.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 border-t border-slate-100">
                    {stats.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => {
                          setPhaseFilter({ ...phaseFilter, [c.id]: filter === s.key ? null : s.key });
                          setOpen({ ...open, [c.id]: true });
                        }}
                        className={`px-3 py-2.5 text-left border-slate-100 border-r border-b sm:border-b-0 ${filter === s.key ? 'bg-slate-900' : 'hover:bg-slate-50'}`}
                      >
                        <p className={`text-xl font-semibold tabular-nums ${filter === s.key ? 'text-white' : s.tone}`}>{s.n}</p>
                        <p className={`text-xs ${filter === s.key ? 'text-slate-300' : 'text-slate-500'}`}>
                          {s.label}
                          {s.key === 'handed' && !!b?.handedLate && ` · ${b.handedLate} late`}
                        </p>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => setOpen({ ...open, [c.id]: !isOpen })}
                    className="w-full px-4 py-2 border-t border-slate-100 text-xs font-medium text-slate-600 flex items-center justify-center gap-1 hover:bg-slate-50"
                  >
                    {isOpen ? 'Hide orders' : `Show ${b?.total || 0} orders`}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {list.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">No orders here.</li>}
                      {list.map((o) => {
                        const p = PHASE[o.phase] || { label: o.phase, dot: 'bg-slate-400' };
                        return (
                          <li key={o.id} className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${o.late ? 'bg-rose-50/60' : ''}`}>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-900">
                                <span className="font-mono font-semibold mr-2">{o.pickupCode || '—'}</span>
                                <span className="font-medium">{o.customerName}</span>
                                <span className="text-slate-400"> · {o.deliveryAddress}</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span className={`w-1.5 h-1.5 rounded-full ${o.late ? 'bg-rose-500' : p.dot}`} />
                                <span className={o.late ? 'text-rose-700 font-medium' : ''}>
                                  {o.late && o.handedAt
                                    ? `Handed ${Math.floor((Date.now() - new Date(o.handedAt).getTime()) / 60000)} min ago, not confirmed`
                                    : p.label}
                                </span>
                                <span>· {o.rider?.name || 'no rider'} · {o.cafeteriaName} · {o.time}</span>
                              </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              {o.customerPhone && (
                                <a href={telHref(o.customerPhone)} className="h-8 px-2.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 text-xs text-slate-700">
                                  <Phone className="w-3.5 h-3.5" /> Customer
                                </a>
                              )}
                              {o.phase === 'handed' && (
                                <button onClick={() => orderAction(o.id, 'confirm_handover')} className="h-8 px-2.5 rounded-lg bg-teal-600 text-white text-xs font-medium">
                                  Confirm handover
                                </button>
                              )}
                              {(o.phase === 'with_collector' || o.phase === 'not_reachable') && (
                                <button onClick={() => orderAction(o.id, 'back_to_riders')} className="h-8 px-2.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs font-medium">
                                  Give back to riders
                                </button>
                              )}
                              {['waiting_rider', 'with_rider', 'on_the_way', 'handed'].includes(o.phase) && (
                                <button onClick={() => orderAction(o.id, 'deliver_direct')} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600">
                                  Skip rep
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })
          )}

          {data && data.collectors.length > 0 && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              Reps sign in at
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/rep`).catch(() => {});
                  setNotice({ text: 'Link copied.', ok: true });
                }}
                className="inline-flex items-center gap-1 font-medium text-slate-700 underline decoration-slate-300"
              >
                {typeof window !== 'undefined' ? window.location.host : ''}/rep <Copy className="w-3 h-3" />
              </button>
              with their phone number and PIN.
            </p>
          )}
        </section>
      </main>

      {editing && data && (
        <CollectorForm
          value={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveCollector}
          collectors={data.collectors}
          addresses={data.addresses}
          inputCls={inputCls}
        />
      )}
    </AppLayout>
  );
}

function CollectorForm({
  value,
  onChange,
  onClose,
  onSave,
  collectors,
  addresses,
  inputCls,
}: {
  value: Partial<Rep> & { pin?: string };
  onChange: (v: Partial<Rep> & { pin?: string }) => void;
  onClose: () => void;
  onSave: () => void;
  collectors: Rep[];
  addresses: { address: string; orders: number }[];
  inputCls: string;
}) {
  const [saving, setSaving] = useState(false);
  const isNew = !value.id;
  const hostels = value.hostels || [];
  // Hostels another active collector already covers
  const takenBy = new Map<string, string>();
  for (const c of collectors) if (c.id !== value.id && c.status === 'Active') for (const h of c.hostels) takenBy.set(h, c.name);
  // Known addresses first, plus any preset hostel that hasn't had orders yet
  const all = [...addresses];
  for (const p of PRESETS) for (const h of p.hostels) if (!all.some((a) => a.address === h)) all.push({ address: h, orders: 0 });
  for (const h of hostels) if (!all.some((a) => a.address === h)) all.push({ address: h, orders: 0 });

  const toggle = (h: string) => onChange({ ...value, hostels: hostels.includes(h) ? hostels.filter((x) => x !== h) : [...hostels, h] });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={isNew ? 'Add rep' : 'Edit rep'}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{isNew ? 'Add rep' : `Edit ${value.name}`}</h3>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs text-slate-500">
              Name
              <input value={value.name || ''} onChange={(e) => onChange({ ...value, name: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs text-slate-500">
              Phone
              <input type="tel" value={value.phone || ''} onChange={(e) => onChange({ ...value, phone: e.target.value })} className={`${inputCls} mt-1`} />
            </label>
            <label className="text-xs text-slate-500">
              {isNew ? 'PIN (4 digits)' : 'New PIN (leave empty to keep)'}
              <input
                inputMode="numeric"
                maxLength={4}
                value={value.pin || ''}
                onChange={(e) => onChange({ ...value, pin: e.target.value.replace(/\D/g, '') })}
                placeholder={isNew ? '1234' : '••••'}
                className={`${inputCls} mt-1 font-mono`}
              />
            </label>
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-1.5">Quick fill</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.pointName}
                  onClick={() => onChange({ ...value, pointName: p.pointName, hostels: p.hostels.filter((h) => !takenBy.has(h)) })}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {p.pointName}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-xs text-slate-500">
            Location name
            <input value={value.pointName || ''} onChange={(e) => onChange({ ...value, pointName: e.target.value })} className={`${inputCls} mt-1`} placeholder="e.g. NH girls" />
          </label>

          <div>
            <p className="text-xs text-slate-500 mb-1.5">
              Hostels they cover <span className="text-slate-400">· orders in the last 60 days</span>
            </p>
            <ul className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {all.map((a) => {
                const taken = takenBy.get(a.address);
                const on = hostels.includes(a.address);
                return (
                  <li key={a.address}>
                    <label className={`flex items-center gap-3 px-3 py-2 text-sm ${taken ? 'opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={on} disabled={!!taken} onChange={() => toggle(a.address)} className="w-4 h-4 accent-slate-900" />
                      <span className="flex-1 min-w-0 truncate text-slate-800">{a.address}</span>
                      <span className="text-xs text-slate-400 shrink-0">{taken ? `${taken}` : a.orders}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-slate-200 text-sm text-slate-700">
            Cancel
          </button>
          <button
            onClick={async () => {
              setSaving(true);
              await onSave();
              setSaving(false);
            }}
            disabled={saving}
            className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isNew ? 'Add rep' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
