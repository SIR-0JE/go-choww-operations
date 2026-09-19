'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
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
  MapPin,
  Compass,
  Navigation,
  ExternalLink,
  Plus,
  Trash2,
  ShieldCheck,
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

interface CafeteriaLocationItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  campus?: string;
  description?: string;
}

interface GeofenceSettings {
  enabled: boolean;
  radiusMeters: number;
  cafeterias: CafeteriaLocationItem[];
  lastUpdated?: string;
}

function formatTimeTo12h(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24 || '08:00 AM';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
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
  const [activeTab, setActiveTab] = useState<'sync' | 'geofence'>('sync');

  // ── Sync Schedule States ──────────────────────────────────────────────────
  const [syncSettings, setSyncSettings] = useState<SyncScheduleSettings>({
    mode: 'scheduled',
    startTime: '08:00',
    endTime: '22:00',
    timezone: 'Africa/Lagos',
    intervalSeconds: 15,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  });

  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [isSyncSaving, setIsSyncSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // ── Geofence & GPS States ─────────────────────────────────────────────────
  const [geofenceSettings, setGeofenceSettings] = useState<GeofenceSettings>({
    enabled: true,
    radiusMeters: 200,
    cafeterias: [],
  });
  const [isGeofenceSaving, setIsGeofenceSaving] = useState(false);
  const [detectingLocationIndex, setDetectingLocationIndex] = useState<number | null>(null);

  // ── Common States ─────────────────────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Show Toast Helper ─────────────────────────────────────────────────────
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // ── Load All Settings ─────────────────────────────────────────────────────
  const loadAllSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Sync Schedule Settings
      const syncRes = await fetch('/api/settings/sync', { cache: 'no-store' });
      const syncData = await syncRes.json();
      if (syncData.success) {
        setSyncSettings(syncData.settings);
        setStatus(syncData.status);
      }

      // 2. Fetch Geofence & GPS Settings
      const geoRes = await fetch('/api/settings/geofence', { cache: 'no-store' });
      const geoData = await geoRes.json();
      if (geoData.success && geoData.settings) {
        setGeofenceSettings(geoData.settings);
      }
    } catch {
      showToast('Could not fetch settings from server.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllSettings();
  }, [loadAllSettings]);

  // ── Save Sync Schedule ────────────────────────────────────────────────────
  const handleSaveSync = async () => {
    setIsSyncSaving(true);
    try {
      const res = await fetch('/api/settings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(syncSettings),
      });
      const data = await res.json();
      if (data.success) {
        setSyncSettings(data.settings);
        setStatus(data.status);
        showToast('Operating schedule saved successfully!', 'success');
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
    } catch {
      showToast('Network error while saving settings.', 'error');
    } finally {
      setIsSyncSaving(false);
    }
  };

  // ── Save Geofence & Cafeteria Coordinates ─────────────────────────────────
  const handleSaveGeofence = async () => {
    setIsGeofenceSaving(true);
    try {
      const res = await fetch('/api/settings/geofence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geofenceSettings),
      });
      const data = await res.json();
      if (data.success) {
        setGeofenceSettings(data.settings);
        showToast('Cafeteria GPS coordinates & geofence saved successfully!', 'success');
      } else {
        showToast(data.error || 'Failed to save geofence settings', 'error');
      }
    } catch {
      showToast('Network error while saving geofence settings.', 'error');
    } finally {
      setIsGeofenceSaving(false);
    }
  };

  // ── Reset Geofence to Defaults ────────────────────────────────────────────
  const handleResetGeofence = async () => {
    setIsGeofenceSaving(true);
    try {
      const res = await fetch('/api/settings/geofence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_defaults' }),
      });
      const data = await res.json();
      if (data.success) {
        setGeofenceSettings(data.settings);
        showToast(data.message || 'Restored default cafeteria coordinates!', 'success');
      }
    } catch {
      showToast('Error resetting geofence settings.', 'error');
    } finally {
      setIsGeofenceSaving(false);
    }
  };

  // ── Auto-Detect Admin's Current Location for a specific row ────────────────
  const handleDetectLocation = (index: number) => {
    if (!navigator.geolocation) {
      showToast('Geolocation is not supported by your browser', 'error');
      return;
    }

    setDetectingLocationIndex(index);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));
        
        setGeofenceSettings((prev) => {
          const updated = [...prev.cafeterias];
          updated[index] = {
            ...updated[index],
            lat,
            lng,
          };
          return { ...prev, cafeterias: updated };
        });

        setDetectingLocationIndex(null);
        showToast(`Auto-detected GPS: ${lat}, ${lng}`, 'success');
      },
      (error) => {
        setDetectingLocationIndex(null);
        showToast(`GPS error: ${error.message}. Please allow location access.`, 'error');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ── Add New Cafeteria Row ──────────────────────────────────────────────────
  const handleAddCafeteria = () => {
    const newId = `spot_${Date.now().toString(36)}`;
    setGeofenceSettings((prev) => ({
      ...prev,
      cafeterias: [
        ...prev.cafeterias,
        {
          id: newId,
          name: 'New Food Vendor',
          lat: 7.6325,
          lng: 4.1825,
          campus: 'Permanent Site',
        },
      ],
    }));
  };

  // ── Remove Cafeteria Row ───────────────────────────────────────────────────
  const handleRemoveCafeteria = (index: number) => {
    setGeofenceSettings((prev) => ({
      ...prev,
      cafeterias: prev.cafeterias.filter((_, i) => i !== index),
    }));
  };

  // ── Toggle Day Helper ──────────────────────────────────────────────────────
  const toggleDay = (day: number) => {
    const current = syncSettings.daysOfWeek || [];
    const exists = current.includes(day);
    const updated = exists ? current.filter((d) => d !== day) : [...current, day].sort();
    setSyncSettings({ ...syncSettings, daysOfWeek: updated });
  };

  // ── Test Sync ──────────────────────────────────────────────────────────────
  const handleTestSync = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/sync-orders?force=true', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setTestResult(
          `✓ Manual sync successful! Fetched ${data.totalFetched || 0} orders, ${data.newlySyncedCount || 0} newly saved.`
        );
        showToast('Manual sync test succeeded!', 'success');
      } else {
        setTestResult(`⚠ Notice: ${data.error || data.message || 'Check failed.'}`);
        showToast(data.error || 'Sync test returned an error', 'error');
      }
    } catch {
      setTestResult('✕ Failed to connect to /api/sync-orders.');
      showToast('Failed to execute sync test.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <AppLayout>
      <main className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
        {/* Top Header Card */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                <Sliders className="w-6 h-6 text-brand-400" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Operations &amp; System Settings
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  Configure GoChow API synchronization schedules, campus cafeteria GPS coordinates, and rider geofence rules.
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center p-1.5 rounded-2xl bg-slate-100 border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('sync')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'sync'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Auto-Sync Schedule</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('geofence')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'geofence'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>Cafeteria GPS &amp; Geofencing</span>
              </button>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: ORDER AUTO-SYNC SCHEDULE                                        */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'sync' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-200">
            {/* Left 2 Columns */}
            <div className="lg:col-span-2 space-y-6">
              {/* 1. Operational Mode */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-600" />
                  <h3 className="text-sm font-bold text-slate-900">1. Operational Schedule Mode</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'scheduled',
                      title: 'Scheduled Window',
                      desc: 'Runs only during designated hours (Recommended).',
                      icon: SunMedium,
                      color: 'text-brand-600 bg-brand-50 border-brand-200',
                    },
                    {
                      id: 'always',
                      title: '24/7 Always Active',
                      desc: 'Polls continuously around the clock.',
                      icon: Zap,
                      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
                    },
                    {
                      id: 'paused',
                      title: 'Manually Paused',
                      desc: 'Temporarily halts background polling.',
                      icon: Pause,
                      color: 'text-rose-600 bg-rose-50 border-rose-200',
                    },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSelected = syncSettings.mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSyncSettings({ ...syncSettings, mode: m.id as any })}
                        className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between gap-3 ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900 text-white shadow-md'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center border ${
                              isSelected ? 'bg-slate-800 border-slate-700 text-brand-400' : m.color
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          {isSelected && <span className="w-2 h-2 rounded-full bg-brand-400" />}
                        </div>
                        <div>
                          <div className="text-xs font-bold">{m.title}</div>
                          <div className={`text-[11px] mt-0.5 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                            {m.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Operating Hours */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-6">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-brand-600" />
                  <h3 className="text-sm font-bold text-slate-900">2. Active Operating Window</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Start Time */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <SunMedium className="w-3.5 h-3.5 text-amber-500" />
                      <span>Start Time (Opening)</span>
                    </label>
                    <input
                      type="time"
                      value={syncSettings.startTime}
                      onChange={(e) => setSyncSettings({ ...syncSettings, startTime: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                  </div>

                  {/* End Time */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Moon className="w-3.5 h-3.5 text-indigo-500" />
                      <span>End Time (Closing)</span>
                    </label>
                    <input
                      type="time"
                      value={syncSettings.endTime}
                      onChange={(e) => setSyncSettings({ ...syncSettings, endTime: e.target.value })}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Days of the Week */}
              <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-bold text-slate-900">3. Operational Days of the Week</h3>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {DAYS_OF_WEEK.map((d) => {
                    const isChecked = syncSettings.daysOfWeek?.includes(d.day);
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
                        <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-brand-400' : 'bg-transparent'}`} />
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

                <div className="space-y-2">
                  {[
                    { sec: 10, label: 'Every 10 seconds', desc: 'Ultra-fast order discovery' },
                    { sec: 15, label: 'Every 15 seconds (Recommended)', desc: 'Balanced speed & efficiency' },
                    { sec: 30, label: 'Every 30 seconds', desc: 'Lightweight bandwidth usage' },
                  ].map((opt) => (
                    <label
                      key={opt.sec}
                      onClick={() => setSyncSettings({ ...syncSettings, intervalSeconds: opt.sec })}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer transition-all ${
                        syncSettings.intervalSeconds === opt.sec
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
                        checked={syncSettings.intervalSeconds === opt.sec}
                        onChange={() => setSyncSettings({ ...syncSettings, intervalSeconds: opt.sec })}
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
        )}

        {/* ══════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: CAFETERIA GPS & GEOFENCING MANAGER                              */}
        {/* ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'geofence' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Geofence Master Controls */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Geofence Handover Verification</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ensures a rider is physically present at the cafeteria building before they can request or accept an order handover.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer self-start sm:self-auto">
                  <span className="text-xs font-bold text-slate-700">
                    {geofenceSettings.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <div
                    onClick={() =>
                      setGeofenceSettings({ ...geofenceSettings, enabled: !geofenceSettings.enabled })
                    }
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out ${
                      geofenceSettings.enabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ease-in-out ${
                        geofenceSettings.enabled ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </label>
              </div>

              {/* Radius Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-brand-600" />
                    <span>Allowable Proximity Radius (Meters)</span>
                  </label>
                  <p className="text-[11px] text-slate-500">
                    Maximum allowed distance between rider's GPS and cafeteria coordinates. 200m covers dining halls, queues, and bike parking.
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="50"
                    max="600"
                    step="25"
                    value={geofenceSettings.radiusMeters}
                    onChange={(e) =>
                      setGeofenceSettings({
                        ...geofenceSettings,
                        radiusMeters: parseInt(e.target.value, 10) || 200,
                      })
                    }
                    className="flex-1 accent-slate-900 cursor-pointer"
                  />
                  <div className="w-24 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-center font-black text-sm text-slate-900 shrink-0">
                    {geofenceSettings.radiusMeters}m
                  </div>
                </div>
              </div>
            </div>

            {/* Registered Cafeteria GPS Coordinates Ledger */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    <span>Campus Cafeteria Coordinate Registry</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                      {geofenceSettings.cafeterias.length} Vendors
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pinpoint coordinates for campus food pickup points. Click <strong>"📍 Detect My Location"</strong> when standing on-site to auto-fill.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddCafeteria}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Cafeteria / Spot</span>
                </button>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Vendor / Cafeteria Name</th>
                      <th className="py-3 px-4">Campus Site</th>
                      <th className="py-3 px-4">Latitude</th>
                      <th className="py-3 px-4">Longitude</th>
                      <th className="py-3 px-4 text-center">Auto-Detect</th>
                      <th className="py-3 px-4 text-center">Verify Map</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {geofenceSettings.cafeterias.map((cafe, idx) => {
                      const isDetecting = detectingLocationIndex === idx;

                      return (
                        <tr key={cafe.id || idx} className="hover:bg-slate-50/70 transition-colors">
                          {/* Name */}
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={cafe.name}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGeofenceSettings((prev) => {
                                  const list = [...prev.cafeterias];
                                  list[idx] = { ...list[idx], name: val };
                                  return { ...prev, cafeterias: list };
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-slate-900 w-full min-w-[160px] text-xs focus:ring-2 focus:ring-slate-900/10"
                            />
                          </td>

                          {/* Campus Site */}
                          <td className="py-3 px-4">
                            <select
                              value={cafe.campus || 'Permanent Site'}
                              onChange={(e) => {
                                const val = e.target.value;
                                setGeofenceSettings((prev) => {
                                  const list = [...prev.cafeterias];
                                  list[idx] = { ...list[idx], campus: val };
                                  return { ...prev, cafeterias: list };
                                });
                              }}
                              className="px-2 py-1.5 rounded-lg border border-slate-200 font-medium text-slate-700 bg-white text-xs"
                            >
                              <option value="Permanent Site">Permanent Site</option>
                              <option value="Temporary Site">Temporary Site</option>
                              <option value="Hostel Area">Hostel Area</option>
                            </select>
                          </td>

                          {/* Latitude */}
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step="0.000001"
                              value={cafe.lat}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setGeofenceSettings((prev) => {
                                  const list = [...prev.cafeterias];
                                  list[idx] = { ...list[idx], lat: val };
                                  return { ...prev, cafeterias: list };
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono font-bold text-slate-900 w-28 text-xs"
                            />
                          </td>

                          {/* Longitude */}
                          <td className="py-3 px-4">
                            <input
                              type="number"
                              step="0.000001"
                              value={cafe.lng}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                setGeofenceSettings((prev) => {
                                  const list = [...prev.cafeterias];
                                  list[idx] = { ...list[idx], lng: val };
                                  return { ...prev, cafeterias: list };
                                });
                              }}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 font-mono font-bold text-slate-900 w-28 text-xs"
                            />
                          </td>

                          {/* Auto-Detect */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleDetectLocation(idx)}
                              disabled={isDetecting}
                              title="Capture current phone/laptop GPS coordinates"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[11px] transition-colors border border-emerald-200"
                            >
                              <Navigation className={`w-3 h-3 ${isDetecting ? 'animate-spin' : ''}`} />
                              <span>{isDetecting ? 'Detecting...' : 'Detect GPS'}</span>
                            </button>
                          </td>

                          {/* Google Maps Link */}
                          <td className="py-3 px-4 text-center">
                            <a
                              href={`https://www.google.com/maps?q=${cafe.lat},${cafe.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-semibold text-[11px]"
                            >
                              <span>View Map</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>

                          {/* Delete */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveCafeteria(idx)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete vendor"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── BOTTOM STICKY SAVE ACTION ────────────────────────────────────────── */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 sticky bottom-4 z-20">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              {activeTab === 'sync'
                ? 'Sync schedule updates apply to live background polling engines.'
                : 'Geofence updates apply instantly to all rider order claim & handover checks.'}
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {activeTab === 'geofence' && (
              <button
                type="button"
                onClick={handleResetGeofence}
                disabled={isGeofenceSaving}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            )}

            <button
              type="button"
              onClick={activeTab === 'sync' ? handleSaveSync : handleSaveGeofence}
              disabled={isSyncSaving || isGeofenceSaving}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-slate-950/10 active:scale-95 transition-all"
            >
              <Save className={`w-3.5 h-3.5 ${isSyncSaving || isGeofenceSaving ? 'animate-spin' : ''}`} />
              <span>
                {isSyncSaving || isGeofenceSaving
                  ? 'Saving...'
                  : activeTab === 'sync'
                  ? 'Save Operating Schedule'
                  : 'Save Geofence & GPS Settings'}
              </span>
            </button>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5">
            <div
              className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold border ${
                toast.type === 'success'
                  ? 'bg-emerald-900 text-white border-emerald-700'
                  : 'bg-rose-900 text-white border-rose-700'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
