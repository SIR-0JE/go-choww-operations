'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Copy, Package, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { prettyPhone, telHref } from '@/lib/phone';

interface Runner {
  id: string;
  name: string;
  phone: string;
  status: string;
  cafeteria: string;
}
interface BoardRow {
  runnerId: string;
  toPack: number;
  oldestMinutes: number;
  late: number;
  packedToday: number;
  avgPackMinutes: number | null;
}
interface Data {
  settings: { alertMinutes: number };
  runners: Runner[];
  board: BoardRow[];
  cafeterias: string[];
}

export default function RunnersPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [editing, setEditing] = useState<(Partial<Runner> & { pin?: string }) | null>(null);
  const [alertMinutes, setAlertMinutes] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/runners', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setData(json);
        setAlertMinutes((m) => m ?? json.settings.alertMinutes);
        setError('');
      } else setError(json.error || 'Could not load runners.');
    } catch {
      setError('No connection. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    return res ? await res.json().catch(() => null) : null;
  };

  const saveRunner = async () => {
    if (!editing) return;
    const isNew = !editing.id;
    const body: Record<string, unknown> = { name: editing.name, phone: editing.phone, cafeteria: editing.cafeteria };
    if (isNew || editing.pin) body.pin = editing.pin || '1234';
    const json = await call(isNew ? '/api/runners' : `/api/runners/${editing.id}`, isNew ? 'POST' : 'PATCH', body);
    if (json?.success) {
      setEditing(null);
      setNotice({ text: isNew ? `${editing.name} added. They sign in at /runner.` : 'Saved.', ok: true });
      load();
    } else setNotice({ text: json?.error || 'Could not save.', ok: false });
  };

  const setStatus = async (r: Runner, status: 'Active' | 'Inactive') => {
    const json = await call(`/api/runners/${r.id}`, 'PATCH', { status });
    setNotice({ text: json?.success ? (status === 'Active' ? `${r.name} switched on.` : `${r.name} switched off.`) : json?.error || 'Could not save.', ok: !!json?.success });
    load();
  };

  const remove = async (r: Runner) => {
    if (!window.confirm(`Remove ${r.name}? Orders they packed keep their name.`)) return;
    const json = await call(`/api/runners/${r.id}`, 'DELETE');
    setNotice({ text: json?.success ? `${r.name} removed.` : json?.error || 'Could not remove.', ok: !!json?.success });
    load();
  };

  const saveSettings = async () => {
    const json = await call('/api/runners/settings', 'PUT', { alertMinutes });
    setNotice({ text: json?.success ? `Saved. Orders not packed after ${json.settings.alertMinutes} min are flagged.` : json?.error || 'Could not save.', ok: !!json?.success });
    if (json?.success) load();
  };

  const covered = new Set((data?.runners || []).filter((r) => r.status === 'Active').map((r) => r.cafeteria.toLowerCase()));
  const uncovered = (data?.cafeterias || []).filter((c) => !covered.has(c.toLowerCase()));
  const inputCls = 'h-10 w-full bg-white border border-slate-200 rounded-lg px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10';

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Runners</h1>
            <p className="text-sm text-slate-500 mt-1">One runner at each cafeteria packs new orders early and taps Ready.</p>
          </div>
          <button
            onClick={() => setEditing({ name: '', phone: '', pin: '', cafeteria: uncovered[0] || '' })}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Add runner
          </button>
        </div>

        {notice && (
          <div className={`px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 border ${notice.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
            {!notice.ok && <AlertCircle className="w-4 h-4 shrink-0" />}
            {notice.text}
          </div>
        )}
        {error && (
          <div className="px-4 py-3 rounded-xl text-sm bg-rose-50 border border-rose-200 text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {/* Flag time */}
        {alertMinutes !== null && data && (
          <section className="rounded-xl bg-white border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Flag an order that isn&apos;t packed</p>
              <p className="text-xs text-slate-500 mt-0.5">After this many minutes it turns red on the Dispatch card on the dashboard.</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={240}
                value={alertMinutes}
                onChange={(e) => setAlertMinutes(Number(e.target.value))}
                className={`${inputCls} w-24`}
                aria-label="Minutes before an order is flagged"
              />
              <span className="text-sm text-slate-500">min</span>
              <button
                onClick={saveSettings}
                disabled={alertMinutes === data.settings.alertMinutes}
                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-40"
              >
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </section>
        )}

        {loading && !data ? (
          <div className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />
        ) : data && data.runners.length === 0 ? (
          <div className="rounded-xl bg-white border border-dashed border-slate-300 px-6 py-12 text-center">
            <Package className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-700">No runners yet</p>
            <p className="text-xs text-slate-500 mt-1">Add one for each cafeteria. They sign in on their phone at /runner.</p>
          </div>
        ) : (
          data?.runners.map((r) => {
            const b = data.board.find((x) => x.runnerId === r.id);
            const on = r.status === 'Active';
            return (
              <div key={r.id} className={`rounded-xl bg-white border overflow-hidden ${on && b?.late ? 'border-rose-300' : 'border-slate-200'}`}>
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900 flex items-center gap-2">
                      {r.cafeteria}
                      {!on && <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Off duty</span>}
                    </p>
                    <p className="text-sm text-slate-600 truncate">
                      {r.name} · <a href={telHref(r.phone)} className="underline decoration-slate-300">{prettyPhone(r.phone)}</a>
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing({ ...r, pin: '' })} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={`Edit ${r.name}`}>
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setStatus(r, on ? 'Inactive' : 'Active')} className="h-8 px-2.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      {on ? 'Switch off' : 'Switch on'}
                    </button>
                    <button onClick={() => remove(r)} className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50" aria-label={`Remove ${r.name}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {on && b && (
                  <div className="grid grid-cols-4 border-t border-slate-100">
                    {[
                      { label: 'To pack', value: String(b.toPack), tone: b.late ? 'text-rose-600' : 'text-slate-900' },
                      { label: 'Oldest', value: b.toPack ? `${b.oldestMinutes} min` : '—', tone: b.late ? 'text-rose-600' : 'text-slate-900' },
                      { label: 'Packed today', value: String(b.packedToday), tone: 'text-emerald-700' },
                      { label: 'Avg time to pack', value: b.avgPackMinutes === null ? '—' : `${b.avgPackMinutes} min`, tone: 'text-slate-900' },
                    ].map((s) => (
                      <div key={s.label} className="px-3 py-2.5 border-r last:border-r-0 border-slate-100">
                        <p className={`text-lg font-semibold tabular-nums ${s.tone}`}>{s.value}</p>
                        <p className="text-xs text-slate-500 leading-tight">{s.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}

        {data && data.runners.length > 0 && uncovered.length > 0 && (
          <p className="text-xs text-slate-500">
            No runner on duty at: <span className="text-slate-700">{uncovered.join(', ')}</span>
          </p>
        )}
        {data && data.runners.length > 0 && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
            Runners sign in at
            <button
              onClick={() => {
                navigator.clipboard?.writeText(`${window.location.origin}/runner`).catch(() => {});
                setNotice({ text: 'Link copied.', ok: true });
              }}
              className="inline-flex items-center gap-1 font-medium text-slate-700 underline decoration-slate-300"
            >
              {typeof window !== 'undefined' ? window.location.host : ''}/runner <Copy className="w-3 h-3" />
            </button>
            with their phone number and PIN.
          </p>
        )}
      </main>

      {editing && data && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setEditing(null)}>
          <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={editing.id ? 'Edit runner' : 'Add runner'}>
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{editing.id ? `Edit ${editing.name}` : 'Add runner'}</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 text-slate-400 hover:text-slate-700" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3 overflow-y-auto">
              <label className="block text-xs text-slate-500">
                Name
                <input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-500">
                  Phone
                  <input type="tel" value={editing.phone || ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} className={`${inputCls} mt-1`} />
                </label>
                <label className="text-xs text-slate-500">
                  {editing.id ? 'New PIN (empty keeps it)' : 'PIN (4 digits)'}
                  <input
                    inputMode="numeric"
                    maxLength={4}
                    value={editing.pin || ''}
                    onChange={(e) => setEditing({ ...editing, pin: e.target.value.replace(/\D/g, '') })}
                    placeholder={editing.id ? '••••' : '1234'}
                    className={`${inputCls} mt-1 font-mono`}
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-500">
                Cafeteria
                <input
                  list="runner-cafeterias"
                  value={editing.cafeteria || ''}
                  onChange={(e) => setEditing({ ...editing, cafeteria: e.target.value })}
                  placeholder="Pick or type the cafeteria"
                  className={`${inputCls} mt-1`}
                />
                <datalist id="runner-cafeterias">
                  {data.cafeterias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
              <p className="text-xs text-slate-400">One runner on duty per cafeteria. Switch the old one off before adding a replacement.</p>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="h-10 px-4 rounded-lg border border-slate-200 text-sm text-slate-700">
                Cancel
              </button>
              <button onClick={saveRunner} className="h-10 px-4 rounded-lg bg-slate-900 text-white text-sm font-medium">
                {editing.id ? 'Save' : 'Add runner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
