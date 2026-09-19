'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
  Bike,
  Radio,
  RefreshCw,
  Search,
  Filter,
  Phone,
  MessageSquare,
  Navigation,
  CheckCircle2,
  Clock,
  MapPin,
  Flame,
  AlertCircle,
  Package,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import type { FleetRider, CafeteriaPoint } from '@/components/fleet/LiveFleetMap';

// Dynamically import Leaflet Map with SSR disabled
const LiveFleetMap = dynamic(
  () => import('@/components/fleet/LiveFleetMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full min-h-[500px] bg-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-400 gap-3 border border-slate-200">
        <Radio className="w-8 h-8 animate-pulse text-brand-500" />
        <span className="text-sm font-semibold">Loading Campus Fleet Radar &amp; Geofences...</span>
      </div>
    ),
  }
);

export default function FleetRadarPage() {
  const [riders, setRiders] = useState<FleetRider[]>([]);
  const [cafeterias, setCafeterias] = useState<CafeteriaPoint[]>([]);
  const [geofenceRadius, setGeofenceRadius] = useState<number>(200);
  const [summary, setSummary] = useState({
    totalRiders: 0,
    onlineRiders: 0,
    liveMovingRiders: 0,
    idleRiders: 0,
    totalOrdersInTransit: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'idle' | 'off'>('all');
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [focusedCoords, setFocusedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // 1. Fetch Fleet Telemetry Data
  const fetchFleetData = useCallback(async (isBackground = false) => {
    if (!isBackground) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/fleet/live?_t=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setRiders(data.riders || []);
        setCafeterias(data.cafeterias || []);
        if (data.geofenceRadiusMeters) setGeofenceRadius(data.geofenceRadiusMeters);
        if (data.summary) setSummary(data.summary);
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.error('Failed to fetch fleet telemetry:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 2. Initial Fetch & Auto-Polling (every 10s)
  useEffect(() => {
    fetchFleetData(false);
    const interval = setInterval(() => {
      fetchFleetData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchFleetData]);

  // 3. Filter Riders
  const filteredRiders = riders.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.phone.includes(searchQuery);

    if (!matchesSearch) return false;

    if (statusFilter === 'live') return r.isOnline && r.locationFreshness === 'live';
    if (statusFilter === 'idle') return r.isOnline && r.locationFreshness === 'idle';
    if (statusFilter === 'off') return !r.isOnline;

    return true;
  });

  const handleFocusRider = (rider: FleetRider) => {
    setSelectedRiderId(rider.id);
    if (typeof rider.lastLat === 'number' && typeof rider.lastLng === 'number') {
      setFocusedCoords({ lat: rider.lastLat, lng: rider.lastLng });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* ── Page Header & Metric Bar ─────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
                <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Live Fleet Radar</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Live Telemetry
                  </span>
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Real-time GPS tracking for active delivery riders &amp; campus cafeteria geofences
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-[11px] font-semibold text-slate-400">Auto-Refresh</div>
              <div className="text-xs font-bold text-slate-700">
                {lastSyncTime ? `Updated ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Syncing...'}
              </div>
            </div>

            <button
              onClick={() => fetchFleetData(false)}
              disabled={isRefreshing}
              className="px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* ── Metric Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Moving</div>
              <div className="text-2xl font-black text-emerald-600 mt-0.5">{summary.liveMovingRiders}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">&lt;2 min telemetry</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Bike className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Stationary / Idle</div>
              <div className="text-2xl font-black text-amber-600 mt-0.5">{summary.idleRiders}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Waiting at hub</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Orders in Transit</div>
              <div className="text-2xl font-black text-brand-600 mt-0.5">{summary.totalOrdersInTransit}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Active delivery load</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-brand-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Fleet</div>
              <div className="text-2xl font-black text-slate-900 mt-0.5">
                {summary.onlineRiders} <span className="text-xs text-slate-400 font-normal">/ {summary.totalRiders}</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Riders on duty</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Radio className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* ── Main Radar Workspace (Map + Roster) ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Canvas: Live Map (8 cols) */}
          <div className="lg:col-span-8 bg-white p-3.5 rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[650px]">
            <div className="flex items-center justify-between pb-3 px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-bold text-slate-800">Campus Live Map</span>
                <span className="text-[11px] text-slate-400">• Bowen University</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                Geofence: <strong className="text-slate-800 font-bold">{geofenceRadius}m</strong>
              </div>
            </div>

            <div className="flex-1 w-full h-full relative">
              <LiveFleetMap
                riders={riders}
                cafeterias={cafeterias}
                geofenceRadiusMeters={geofenceRadius}
                selectedRiderId={selectedRiderId}
                onSelectRider={(id) => setSelectedRiderId(id)}
                focusedCoordinates={focusedCoords}
              />
            </div>
          </div>

          {/* Right Panel: Live Rider Roster (4 cols) */}
          <div className="lg:col-span-4 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-[650px] overflow-hidden">
            {/* Header & Search */}
            <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                  <Bike className="w-4 h-4 text-slate-700" />
                  <span>Fleet Roster ({filteredRiders.length})</span>
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {summary.onlineRiders} Online
                </span>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by rider name or phone..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Status Filter Tabs */}
              <div className="grid grid-cols-4 gap-1 bg-slate-200/70 p-1 rounded-xl text-[11px] font-bold text-slate-600">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`py-1 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setStatusFilter('live')}
                  className={`py-1 rounded-lg transition-all ${statusFilter === 'live' ? 'bg-white text-emerald-700 shadow-sm' : 'hover:text-emerald-700'}`}
                >
                  Live
                </button>
                <button
                  onClick={() => setStatusFilter('idle')}
                  className={`py-1 rounded-lg transition-all ${statusFilter === 'idle' ? 'bg-white text-amber-700 shadow-sm' : 'hover:text-amber-700'}`}
                >
                  Idle
                </button>
                <button
                  onClick={() => setStatusFilter('off')}
                  className={`py-1 rounded-lg transition-all ${statusFilter === 'off' ? 'bg-white text-slate-800 shadow-sm' : 'hover:text-slate-800'}`}
                >
                  Off
                </button>
              </div>
            </div>

            {/* Rider List Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
              {filteredRiders.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Bike className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-semibold">No riders match filter</p>
                </div>
              ) : (
                filteredRiders.map((r) => {
                  const isSelected = selectedRiderId === r.id;
                  const hasGps = typeof r.lastLat === 'number' && typeof r.lastLng === 'number';

                  let statusBadge = (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      Off Duty
                    </span>
                  );

                  if (r.isOnline) {
                    if (r.locationFreshness === 'live') {
                      statusBadge = (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Moving
                        </span>
                      );
                    } else if (r.locationFreshness === 'idle') {
                      statusBadge = (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Idle ({r.minutesSinceUpdate}m)
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          Stale GPS
                        </span>
                      );
                    }
                  }

                  const phoneClean = (r.phone || '').replace(/[^0-9]/g, '');
                  const waNumber = phoneClean.startsWith('0') ? '234' + phoneClean.slice(1) : phoneClean;

                  return (
                    <div
                      key={r.id}
                      onClick={() => handleFocusRider(r)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-slate-900 bg-slate-50/80 shadow-sm ring-1 ring-slate-900'
                          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-xs text-slate-900">{r.name}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{r.phone || 'No phone'}</div>
                        </div>
                        <div>{statusBadge}</div>
                      </div>

                      {/* Active Orders Summary */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-slate-600 font-semibold text-[11px]">
                          <Package className="w-3.5 h-3.5 text-slate-400" />
                          <span>{r.activeOrdersCount} order{r.activeOrdersCount !== 1 ? 's' : ''} on route</span>
                        </div>

                        {hasGps && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFocusRider(r);
                            }}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center gap-1 transition-colors"
                          >
                            <Navigation className="w-3 h-3 text-slate-600" />
                            <span>Locate</span>
                          </button>
                        )}
                      </div>

                      {/* Quick Contact Bar */}
                      {r.phone && (
                        <div className="mt-2 grid grid-cols-2 gap-1 pt-1.5 border-t border-slate-100/60">
                          <a
                            href={`https://wa.me/${waNumber}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold text-center flex items-center justify-center gap-1"
                          >
                            <MessageSquare className="w-3 h-3" />
                            <span>WhatsApp</span>
                          </a>
                          <a
                            href={`tel:${r.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="py-1 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold text-center flex items-center justify-center gap-1"
                          >
                            <Phone className="w-3 h-3" />
                            <span>Call</span>
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
