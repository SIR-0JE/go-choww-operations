'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { RefreshCw, MapPin, ExternalLink, Trash2, Plus, CheckCircle2, AlertCircle, Navigation } from 'lucide-react';

interface SyncScheduleSettings {
  mode: 'scheduled' | 'always' | 'paused';
  startTime: string;
  endTime: string;
  timezone: string;
  intervalSeconds: number;
  daysOfWeek: number[];
  lastUpdated?: string;
}

interface OperationalStatus {
  isOperating: boolean;
  statusText: string;
}

interface CafeteriaLocationItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  campus?: string;
  description?: string;
  confirmedAt?: string;
  accuracyMeters?: number;
}

interface GeofenceSettings {
  enabled: boolean;
  radiusMeters: number;
  cafeterias: CafeteriaLocationItem[];
}

const DAYS = [
  { day: 1, short: 'Mon' },
  { day: 2, short: 'Tue' },
  { day: 3, short: 'Wed' },
  { day: 4, short: 'Thu' },
  { day: 5, short: 'Fri' },
  { day: 6, short: 'Sat' },
  { day: 0, short: 'Sun' },
];

const MODES: { key: SyncScheduleSettings['mode']; label: string }[] = [
  { key: 'scheduled', label: 'Set hours' },
  { key: 'always', label: 'All day' },
  { key: 'paused', label: 'Paused' },
];

const RADII = [100, 200, 300];

// Warn before replacing a pin with a spot this far away (likely a wrong tap)
const LARGE_MOVE_METERS = 500;
// A reading this rough is not worth saving without a warning
const ROUGH_ACCURACY_METERS = 50;

function to12h(time24: string) {
  const [h, m] = (time24 || '00:00').split(':').map((x) => parseInt(x, 10) || 0);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${period}`;
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

const formatDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

// Listen to GPS for a few seconds and keep the most accurate reading
function readBestPosition(maxWaitMs = 8000, goodEnoughMeters = 15): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot read location.'));
      return;
    }
    let best: GeolocationPosition | null = null;
    const finish = () => {
      navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(new Error('Could not get a location. Turn on Location and try again.'));
    };
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        if (pos.coords.accuracy <= goodEnoughMeters) finish();
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(timer);
          reject(new Error('Location is blocked for this site. Allow it in your browser settings.'));
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxWaitMs }
    );
    const timer = setTimeout(finish, maxWaitMs);
  });
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white border border-slate-200">
      <div className="px-4 sm:px-5 pt-4 sm:pt-5">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-4 sm:p-5 space-y-5">{children}</div>
    </section>
  );
}

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-1 bg-slate-100 p-1 rounded-lg" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          onClick={() => onChange(o.key)}
          className={`h-9 rounded-md text-sm font-medium ${value === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [sync, setSync] = useState<SyncScheduleSettings | null>(null);
  const [savedSync, setSavedSync] = useState<string>('');
  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [isSavingSync, setIsSavingSync] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  const [geo, setGeo] = useState<GeofenceSettings | null>(null);
  const [locatingId, setLocatingId] = useState<string | null>(null);
  const [newCafName, setNewCafName] = useState('');

  const [loadError, setLoadError] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const load = useCallback(async () => {
    try {
      const [syncRes, geoRes] = await Promise.all([
        fetch('/api/settings/sync', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/settings/geofence', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      if (!syncRes.success || !geoRes.success) throw new Error();
      setSync(syncRes.settings);
      setSavedSync(JSON.stringify(syncRes.settings));
      setStatus(syncRes.status);
      setGeo(geoRes.settings);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Order sync ──────────────────────────────────────────────────────────────
  const syncDirty = sync !== null && JSON.stringify(sync) !== savedSync;

  const saveSync = async () => {
    if (!sync) return;
    if (sync.mode === 'scheduled' && sync.daysOfWeek.length === 0) {
      showToast('Pick at least one day, or choose Paused.', 'error');
      return;
    }
    setIsSavingSync(true);
    try {
      const res = await fetch('/api/settings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sync),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSync(data.settings);
      setSavedSync(JSON.stringify(data.settings));
      setStatus(data.status);
      window.dispatchEvent(new CustomEvent('sync-settings-updated', { detail: { settings: data.settings, status: data.status } }));
      showToast('Sync hours saved.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Could not save. Try again.', 'error');
    } finally {
      setIsSavingSync(false);
    }
  };

  const syncNow = async () => {
    setIsSyncingNow(true);
    try {
      const res = await fetch('/api/sync-orders?force=true', { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message);
      const n = data.newlySyncedCount || 0;
      showToast(n > 0 ? `${n} new order${n === 1 ? '' : 's'} pulled in.` : 'Up to date. No new orders.', 'success');
    } catch (e: any) {
      showToast(e?.message || 'Sync failed. Try again.', 'error');
    } finally {
      setIsSyncingNow(false);
    }
  };

  const toggleDay = (day: number) => {
    if (!sync) return;
    const has = sync.daysOfWeek.includes(day);
    setSync({ ...sync, daysOfWeek: has ? sync.daysOfWeek.filter((d) => d !== day) : [...sync.daysOfWeek, day].sort() });
  };

  // ── Cafeteria pins: every change is saved straight away ──────────────────────
  const persistGeo = async (next: GeofenceSettings, successMessage?: string) => {
    const previous = geo;
    setGeo(next);
    try {
      const res = await fetch('/api/settings/geofence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next.enabled, radiusMeters: next.radiusMeters, cafeterias: next.cafeterias }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setGeo(data.settings);
      if (successMessage) showToast(successMessage, 'success');
    } catch (e: any) {
      setGeo(previous);
      showToast(e?.message || 'Could not save. Try again.', 'error');
    }
  };

  const updateCafeteria = (id: string, patch: Partial<CafeteriaLocationItem>, message?: string) => {
    if (!geo) return;
    persistGeo({ ...geo, cafeterias: geo.cafeterias.map((c) => (c.id === id ? { ...c, ...patch } : c)) }, message);
  };

  const setPinHere = async (cafe: CafeteriaLocationItem) => {
    setLocatingId(cafe.id);
    try {
      const pos = await readBestPosition();
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lng = parseFloat(pos.coords.longitude.toFixed(6));
      const accuracy = Math.round(pos.coords.accuracy);
      const moved = distanceMeters(cafe.lat, cafe.lng, lat, lng);

      if (cafe.confirmedAt && moved > LARGE_MOVE_METERS) {
        const ok = window.confirm(
          `You are ${formatDistance(moved)} from ${cafe.name}'s saved spot. Are you standing at ${cafe.name}? Tap OK to move its pin here.`
        );
        if (!ok) return;
      }
      if (accuracy > ROUGH_ACCURACY_METERS) {
        const ok = window.confirm(
          `Your phone's location is rough right now (within ${accuracy} m). Stepping outside usually helps. Save it anyway?`
        );
        if (!ok) return;
      }
      updateCafeteria(
        cafe.id,
        { lat, lng, confirmedAt: new Date().toISOString(), accuracyMeters: accuracy },
        `${cafe.name} pinned (within ${accuracy} m).`
      );
    } catch (e: any) {
      showToast(e?.message || 'Could not get your location.', 'error');
    } finally {
      setLocatingId(null);
    }
  };

  const removeCafeteria = (cafe: CafeteriaLocationItem) => {
    if (!geo) return;
    if (!window.confirm(`Remove ${cafe.name}? Riders assigned to it keep their other stations.`)) return;
    persistGeo({ ...geo, cafeterias: geo.cafeterias.filter((c) => c.id !== cafe.id) }, `${cafe.name} removed.`);
  };

  const addCafeteria = (e: React.FormEvent) => {
    e.preventDefault();
    if (!geo) return;
    const name = newCafName.trim();
    if (!name) return;
    if (geo.cafeterias.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      showToast(`${name} is already on the list.`, 'error');
      return;
    }
    const cafe: CafeteriaLocationItem = {
      id: `${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`,
      name,
      lat: 7.62,
      lng: 4.2,
      campus: 'Permanent Site',
    };
    persistGeo({ ...geo, cafeterias: [cafe, ...geo.cafeterias] }, `${name} added. Tap “I’m here” when you’re at it.`);
    setNewCafName('');
  };

  const confirmedCount = geo?.cafeterias.filter((c) => c.confirmedAt).length ?? 0;

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-5 pb-28">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">When orders sync, and where each cafeteria is.</p>
        </div>

        {loadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            Couldn&apos;t load settings.{' '}
            <button onClick={load} className="underline">
              Try again
            </button>
          </div>
        )}

        {/* ── Order sync ─────────────────────────────────────────────────────── */}
        <Card title="Order sync" subtitle="When new GoChow orders are pulled in. Runs every minute, even with nobody logged in.">
          {!sync ? (
            <div className="h-24 bg-slate-50 rounded-lg animate-pulse" />
          ) : (
            <>
              {status && (
                <div className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full ${status.isOperating ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  <span className="text-slate-700">{status.isOperating ? 'Syncing now' : 'Not syncing right now'}</span>
                  {!status.isOperating && sync.mode === 'scheduled' && (
                    <span className="text-slate-400">· starts {to12h(sync.startTime)}</span>
                  )}
                </div>
              )}

              <Segmented value={sync.mode} options={MODES} onChange={(mode) => setSync({ ...sync, mode })} />

              {sync.mode === 'scheduled' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm text-slate-600">From</span>
                      <input
                        type="time"
                        value={sync.startTime}
                        onChange={(e) => setSync({ ...sync, startTime: e.target.value })}
                        className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 text-base text-slate-900"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-600">Until</span>
                      <input
                        type="time"
                        value={sync.endTime}
                        onChange={(e) => setSync({ ...sync, endTime: e.target.value })}
                        className="mt-1 w-full h-11 rounded-lg border border-slate-200 px-3 text-base text-slate-900"
                      />
                    </label>
                  </div>
                  <div>
                    <span className="text-sm text-slate-600">Days</span>
                    <div className="mt-1 grid grid-cols-7 gap-1">
                      {DAYS.map((d) => {
                        const on = sync.daysOfWeek.includes(d.day);
                        return (
                          <button
                            key={d.day}
                            type="button"
                            onClick={() => toggleDay(d.day)}
                            aria-pressed={on}
                            className={`h-10 rounded-lg text-sm font-medium border ${
                              on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'
                            }`}
                          >
                            {d.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">
                    Orders placed outside these hours are picked up as soon as syncing starts again.
                  </p>
                </>
              )}
              {sync.mode === 'paused' && (
                <p className="text-sm text-amber-700">No new orders will come in until you switch this back on.</p>
              )}

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={syncNow}
                  disabled={isSyncingNow}
                  className="h-11 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingNow ? 'animate-spin' : ''}`} />
                  {isSyncingNow ? 'Syncing…' : 'Sync now'}
                </button>
                <button
                  type="button"
                  onClick={saveSync}
                  disabled={!syncDirty || isSavingSync}
                  className="h-11 px-5 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-40"
                >
                  {isSavingSync ? 'Saving…' : syncDirty ? 'Save changes' : 'Saved'}
                </button>
              </div>
            </>
          )}
        </Card>

        {/* ── Cafeteria pins ─────────────────────────────────────────────────── */}
        <Card
          title="Cafeteria pins"
          subtitle="Stand at a cafeteria and tap “I’m here” to save its exact spot. When a rider asks to take over an order, the rider holding it sees whether they’re really at the cafeteria."
        >
          {!geo ? (
            <div className="h-40 bg-slate-50 rounded-lg animate-pulse" />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  <span className="font-medium tabular-nums">{confirmedCount}</span> of{' '}
                  <span className="tabular-nums">{geo.cafeterias.length}</span> pinned on site
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  Check distance
                  <button
                    type="button"
                    role="switch"
                    aria-checked={geo.enabled}
                    onClick={() => persistGeo({ ...geo, enabled: !geo.enabled }, geo.enabled ? 'Distance check off.' : 'Distance check on.')}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors ${geo.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`}
                  >
                    <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${geo.enabled ? 'translate-x-5' : ''}`} />
                  </button>
                </label>
              </div>

              {geo.enabled && (
                <div>
                  <span className="text-sm text-slate-600">Counts as “at the cafeteria” within</span>
                  <div className="mt-1">
                    <Segmented
                      value={RADII.includes(geo.radiusMeters) ? geo.radiusMeters : 200}
                      options={RADII.map((r) => ({ key: r, label: `${r} m` }))}
                      onChange={(r) => persistGeo({ ...geo, radiusMeters: r }, `Set to ${r} m.`)}
                    />
                  </div>
                </div>
              )}

              <form onSubmit={addCafeteria} className="flex gap-2">
                <input
                  value={newCafName}
                  onChange={(e) => setNewCafName(e.target.value)}
                  placeholder="New cafeteria name"
                  className="flex-1 min-w-0 h-11 rounded-lg border border-slate-200 px-3 text-base sm:text-sm text-slate-900 placeholder-slate-400"
                />
                <button
                  type="submit"
                  disabled={!newCafName.trim()}
                  className="h-11 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </form>

              <ul className="space-y-3">
                {geo.cafeterias.map((cafe) => {
                  const locating = locatingId === cafe.id;
                  return (
                    <li key={cafe.id} className="rounded-lg border border-slate-200 p-3 space-y-3">
                      <div className="flex items-start gap-2">
                        <input
                          defaultValue={cafe.name}
                          onBlur={(e) => {
                            const name = e.target.value.trim();
                            if (name && name !== cafe.name) updateCafeteria(cafe.id, { name }, 'Name saved.');
                            else e.target.value = cafe.name;
                          }}
                          aria-label="Cafeteria name"
                          className="flex-1 min-w-0 text-base font-medium text-slate-900 bg-transparent border-b border-transparent focus:border-slate-300 focus:outline-none py-0.5"
                        />
                        <button
                          type="button"
                          onClick={() => removeCafeteria(cafe)}
                          className="p-1.5 -m-1 text-slate-300 hover:text-rose-600"
                          aria-label={`Remove ${cafe.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        {cafe.confirmedAt ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700">
                            <CheckCircle2 className="w-4 h-4" />
                            Pinned on site{' '}
                            {new Date(cafe.confirmedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            {typeof cafe.accuracyMeters === 'number' && (
                              <span className="text-slate-400">· within {cafe.accuracyMeters} m</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-700">
                            <AlertCircle className="w-4 h-4" />
                            Rough guess, not pinned on site
                          </span>
                        )}
                        <select
                          value={cafe.campus || 'Permanent Site'}
                          onChange={(e) => updateCafeteria(cafe.id, { campus: e.target.value })}
                          aria-label="Campus site"
                          className="text-sm text-slate-600 bg-transparent border-none p-0 pr-5 focus:ring-0"
                        >
                          <option value="Permanent Site">Permanent site</option>
                          <option value="Temporary Site">Temporary site</option>
                          <option value="Hostel Area">Hostel area</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-[1fr_auto] gap-2">
                        <button
                          type="button"
                          onClick={() => setPinHere(cafe)}
                          disabled={locatingId !== null}
                          className={`h-11 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50 ${
                            cafe.confirmedAt ? 'border border-slate-200 text-slate-700' : 'bg-slate-900 text-white'
                          }`}
                        >
                          {locating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                          {locating ? 'Finding your spot…' : cafe.confirmedAt ? 'I’m here, update spot' : 'I’m here, save this spot'}
                        </button>
                        <a
                          href={`https://www.google.com/maps?q=${cafe.lat},${cafe.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-11 px-3 rounded-lg border border-slate-200 text-sm text-slate-600 flex items-center gap-1.5"
                        >
                          <MapPin className="w-4 h-4" />
                          Map
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </main>

      {toast && (
        <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-6 sm:w-96 z-50">
          <div
            className={`rounded-lg px-4 py-3 text-sm shadow-lg border ${
              toast.type === 'success' ? 'bg-white border-slate-200 text-slate-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
