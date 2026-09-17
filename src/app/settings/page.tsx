'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import {
  Clock,
  Settings,
  Sliders,
  Calendar,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  SunMedium,
  Moon,
  Sparkles,
  Zap,
  Globe,
  Save,
  RotateCcw,
} from 'lucide-react';

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
  mode: string;
  statusText: string;
  badgeText: string;
  currentTimeFormatted: string;
  startFormatted: string;
  endFormatted: string;
  nextWindowText: string;
}

const DAYS_OF_WEEK = [
  { day: 1, name: 'Monday', short: 'Mon' },
  { day: 2, name: 'Tuesday', short: 'Tue' },
  { day: 3, name: 'Wednesday', short: 'Wed' },
  { day: 4, name: 'Thursday', short: 'Thu' },
  { day: 5, name: 'Friday', short: 'Fri' },
  { day: 6, name: 'Saturday', short: 'Sat' },
  { day: 0, name: 'Sunday', short: 'Sun' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<SyncScheduleSettings>({
    mode: 'scheduled',
    startTime: '08:00',
    endTime: '22:00',
    timezone: 'Africa/Lagos',
    intervalSeconds: 15,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  });

  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Show Toast Helper ────────────────────────────────────────────────────────
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // ── Fetch Current Settings & Status ──────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/sync');
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setStatus(data.status);
      }
    } catch {
      showToast('Could not fetch settings from server.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // ── Periodic Clock / Status Refresh ─────────────────────────────────────────
  useEffect(() => {
    const clockInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/settings/sync');
        const data = await res.json();
        if (data.success && data.status) {
          setStatus(data.status);
        }
      } catch {
        // ignore
      }
    }, 15000);

    return () => clearInterval(clockInterval);
  }, []);

  // ── Save Settings ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();

      if (data.success) {
        setSettings(data.settings);
        setStatus(data.status);
        showToast('Operating schedule updated and applied successfully!', 'success');

        // Broadcast to other components (e.g. Header)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('sync-settings-updated', {
              detail: { settings: data.settings, status: data.status },
            })
          );
        }
      } else {
        showToast(data.error || 'Failed to save settings', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error while saving', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Force Sync / Test Connection ────────────────────────────────────────────
  const handleTestSync = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/sync-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await res.json();

      if (data.success) {
        const msg = data.message || `Checked GoChow: ${data.totalFetched ?? 0} orders scanned.`;
        setTestResult(`✅ ${msg}`);
        showToast('On-demand sync executed successfully!', 'success');
      } else {
        setTestResult(`❌ Sync test failed: ${data.error || 'Unknown error'}`);
        showToast(data.error || 'Test sync failed', 'error');
      }
    } catch (err: any) {
      setTestResult(`❌ Network error: ${err?.message || 'Connection failed'}`);
      showToast('Network error during test sync', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  // ── Toggle Day of Week ──────────────────────────────────────────────────────
  const toggleDay = (day: number) => {
    const current = settings.daysOfWeek || [];
    if (current.includes(day)) {
      if (current.length === 1) {
        showToast('At least one operational day must remain active.', 'error');
        return;
      }
      setSettings({ ...settings, daysOfWeek: current.filter((d) => d !== day) });
    } else {
      setSettings({ ...settings, daysOfWeek: [...current, day].sort() });
    }
  };

  // ── Reset Defaults ──────────────────────────────────────────────────────────
  const handleResetDefaults = () => {
    setSettings({
      mode: 'scheduled',
      startTime: '08:00',
      endTime: '22:00',
      timezone: 'Africa/Lagos',
      intervalSeconds: 15,
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    });
    showToast('Reset to default schedule (08:00 AM – 10:00 PM, 7 days). Click Save to apply.', 'success');
  };

  return (
    <AppLayout>
      <Header />

      <main className="p-4 sm:p-8 max-w-6xl mx-auto space-y-6">
        {/* ── Toast Banner ─────────────────────────────────────────────────────── */}
        {toast && (
          <div
            className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between shadow-lg transition-all animate-in fade-in slide-in-from-top-3 duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              )}
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Page Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <span>Operations</span>
              <span>/</span>
              <span className="text-brand-600">Settings</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-3">
              <span>Auto-Sync Operating Schedule</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-900 text-white shadow-sm">
                System Control
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Set automated daily operating hours for order synchronization. Background sync automatically turns
              <strong className="text-slate-800"> ON</strong> when cafeterias open and goes to
              <strong className="text-slate-800"> SLEEP</strong> when closed to prevent off-hours polling.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleResetDefaults}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Reset to recommended defaults"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Defaults</span>
            </button>

            <button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-slate-950/10 active:scale-95 transition-all disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving Changes...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>

        {/* ── LIVE STATUS BEACON HERO CARD ─────────────────────────────────────── */}
        <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-950 text-white shadow-xl border border-slate-800 relative overflow-hidden">
          {/* Subtle glow background */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                {status?.isOperating ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>🟢 Auto-Sync is ACTIVE</span>
                  </span>
                ) : settings.mode === 'paused' ? (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>🔴 Auto-Sync is PAUSED</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span>🟡 Auto-Sync is SLEEPING (Off-Hours)</span>
                  </span>
                )}

                <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  <span>Nigeria Campus Time (WAT)</span>
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {status?.statusText || 'Evaluating operating window…'}
              </h2>

              <p className="text-xs text-slate-400 max-w-xl">
                {status?.nextWindowText || 'Orders will sync automatically during active hours.'}
              </p>
            </div>

            {/* Current Time Clock Display */}
            <div className="bg-slate-900/80 p-4 rounded-2xl border border-slate-800 shrink-0 text-center md:text-right">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Current Time
              </div>
              <div className="text-2xl font-black text-white tracking-tight tabular-nums mt-0.5">
                {status?.currentTimeFormatted || '--:-- WAT'}
              </div>
              <div className="text-[11px] font-medium text-slate-400 mt-0.5">
                Schedule: {status?.startFormatted || '08:00 AM'} – {status?.endFormatted || '10:00 PM'}
              </div>
            </div>
          </div>
        </div>

        {/* ── SETTINGS CONFIGURATION GRID ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left 2 Columns: Schedule Config */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Operating Mode */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">1. Operating Mode</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Scheduled Window */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, mode: 'scheduled' })}
                  className={`p-4 rounded-2xl border text-left transition-all relative ${
                    settings.mode === 'scheduled'
                      ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                      <Clock className="w-4 h-4" />
                    </div>
                    {settings.mode === 'scheduled' && (
                      <span className="w-2 h-2 rounded-full bg-brand-600" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900">Scheduled Window</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Auto-on at start time, auto-off at end time every day.
                  </div>
                </button>

                {/* Always Active */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, mode: 'always' })}
                  className={`p-4 rounded-2xl border text-left transition-all relative ${
                    settings.mode === 'always'
                      ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                      <Zap className="w-4 h-4" />
                    </div>
                    {settings.mode === 'always' && (
                      <span className="w-2 h-2 rounded-full bg-brand-600" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900">Always Active (24/7)</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Syncs around the clock continuously without pausing.
                  </div>
                </button>

                {/* Manually Paused */}
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, mode: 'paused' })}
                  className={`p-4 rounded-2xl border text-left transition-all relative ${
                    settings.mode === 'paused'
                      ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-500/20 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center font-bold">
                      <Pause className="w-4 h-4" />
                    </div>
                    {settings.mode === 'paused' && (
                      <span className="w-2 h-2 rounded-full bg-brand-600" />
                    )}
                  </div>
                  <div className="text-xs font-bold text-slate-900">Manually Paused</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Halts all background syncing until you resume it.
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Start and End Times */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SunMedium className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-900">2. Operating Window Hours</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">24h format (HH:MM)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Start Time Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Daily Start Time (Cafeteria Opens)
                  </label>
                  <div className="relative">
                    <input
                      type="time"
                      value={settings.startTime}
                      onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-slate-900 font-bold text-base focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-medium">Presets:</span>
                    {['07:00', '08:00', '08:30', '09:00'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSettings({ ...settings, startTime: t })}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold transition-all ${
                          settings.startTime === t
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* End Time Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Daily End Time (Cafeteria Closes)
                  </label>
                  <div className="relative">
                    <input
                      type="time"
                      value={settings.endTime}
                      onChange={(e) => setSettings({ ...settings, endTime: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-slate-900 font-bold text-base focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-medium">Presets:</span>
                    {['21:00', '22:00', '22:30', '23:00', '23:59'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSettings({ ...settings, endTime: t })}
                        className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold transition-all ${
                          settings.endTime === t
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Days of the Week */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-brand-600" />
                  <h3 className="text-sm font-bold text-slate-900">3. Operational Days of the Week</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })}
                    className="text-[11px] font-semibold text-brand-600 hover:underline"
                  >
                    All Days
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, daysOfWeek: [1, 2, 3, 4, 5] })}
                    className="text-[11px] font-semibold text-brand-600 hover:underline"
                  >
                    Mon–Fri
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {DAYS_OF_WEEK.map((d) => {
                  const isChecked = settings.daysOfWeek?.includes(d.day);
                  return (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => toggleDay(d.day)}
                      className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center gap-1 ${
                        isChecked
                          ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                          : 'border-slate-200 bg-slate-50/50 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                      }`}
                    >
                      <span className="text-xs font-bold">{d.short}</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isChecked ? 'bg-brand-400' : 'bg-transparent'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Speed & Diagnostics */}
          <div className="space-y-6">
            {/* 4. Polling Frequency */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">4. Auto-Sync Frequency</h3>
              </div>

              <p className="text-xs text-slate-500">
                How often the dashboard checks GoChow for newly placed student food orders during active hours.
              </p>

              <div className="space-y-2">
                {[
                  { sec: 10, label: 'Every 10 seconds', desc: 'Ultra-fast order discovery' },
                  { sec: 15, label: 'Every 15 seconds (Recommended)', desc: 'Balanced speed & efficiency' },
                  { sec: 30, label: 'Every 30 seconds', desc: 'Lightweight bandwidth usage' },
                  { sec: 60, label: 'Every 60 seconds', desc: 'Low resource polling' },
                ].map((opt) => (
                  <label
                    key={opt.sec}
                    onClick={() => setSettings({ ...settings, intervalSeconds: opt.sec })}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      settings.intervalSeconds === opt.sec
                        ? 'border-brand-500 bg-brand-50/50 text-slate-900 font-bold ring-1 ring-brand-500/30'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-xs">{opt.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{opt.desc}</div>
                    </div>
                    <input
                      type="radio"
                      name="interval"
                      checked={settings.intervalSeconds === opt.sec}
                      onChange={() => setSettings({ ...settings, intervalSeconds: opt.sec })}
                      className="text-brand-600 focus:ring-brand-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* 5. On-Demand Diagnostic Test */}
            <div className="p-6 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">Manual Override Test</h3>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Admins can trigger a manual sync anytime, even when the scheduled window is sleeping.
              </p>

              <button
                type="button"
                onClick={handleTestSync}
                disabled={isTesting}
                className="w-full py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm active:scale-95 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                <span>{isTesting ? 'Scanning GoChow API...' : 'Test Sync Now (Bypass Schedule)'}</span>
              </button>

              {testResult && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 font-medium">
                  {testResult}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BOTTOM STICKY SAVE ACTION ────────────────────────────────────────── */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-20">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Settings apply across Executive Dashboard, Raw Data ledger, and background processes.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={handleResetDefaults}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
            >
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-slate-950/10 active:scale-95 transition-all"
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving...' : 'Save Operating Schedule'}</span>
            </button>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
