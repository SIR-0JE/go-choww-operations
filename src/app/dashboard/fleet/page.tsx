'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Radio, RefreshCw, Phone, MessageSquare, MapPinOff, X } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import type { FleetRider, CafeteriaPoint } from '@/components/fleet/LiveFleetMap';

// Leaflet touches `window`, so the map only renders in the browser
const LiveFleetMap = dynamic(() => import('@/components/fleet/LiveFleetMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 gap-2 border border-slate-200">
      <Radio className="w-6 h-6 animate-pulse" />
      <span className="text-sm">Loading map…</span>
    </div>
  ),
});

type Summary = {
  totalRiders: number;
  onlineRiders: number;
  freeRiders: number;
  totalOrdersInTransit: number;
};

const minutesAgo = (iso: string | null | undefined) => {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
};

const agoLabel = (mins: number | null) => {
  if (mins === null) return 'never';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
};

// What the admin needs to know: can I trust the dot on the map?
function locationStatus(r: FleetRider) {
  const hasGps = typeof r.lastLat === 'number' && typeof r.lastLng === 'number';
  if (!r.isOnline) return { dot: 'bg-slate-300', text: 'Offline', hasGps };
  if (!hasGps) return { dot: 'bg-rose-500', text: 'Online · no location yet', hasGps };
  if (r.locationFreshness === 'live') return { dot: 'bg-emerald-500', text: 'Online · location live', hasGps };
  const seen = agoLabel(r.minutesSinceUpdate);
  if (r.locationFreshness === 'idle') return { dot: 'bg-amber-500', text: `Online · location ${seen}`, hasGps };
  return { dot: 'bg-rose-500', text: `Online · location ${seen}`, hasGps };
}

const whatsappNumber = (phone: string) => {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  return digits.startsWith('0') ? '234' + digits.slice(1) : digits;
};

// Online riders first, then busiest, then by name
const riderOrder = (a: FleetRider, b: FleetRider) =>
  Number(b.isOnline) - Number(a.isOnline) || b.activeOrdersCount - a.activeOrdersCount || a.name.localeCompare(b.name);

function RiderDetail({ rider, onClose }: { rider: FleetRider; onClose: () => void }) {
  const status = locationStatus(rider);
  return (
    <div className="rounded-xl bg-white border border-slate-200">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-slate-900 truncate">{rider.name}</div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
            <span className={`w-2 h-2 rounded-full ${status.dot}`} />
            {status.text}
          </div>
          {!status.hasGps && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 mt-1">
              <MapPinOff className="w-3.5 h-3.5" />
              Not on the map. Their phone hasn&apos;t shared a location.
            </div>
          )}
        </div>
        <button onClick={onClose} className="p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {rider.phone && (
        <div className="px-4 pb-4 grid grid-cols-2 gap-2">
          <a
            href={`tel:${rider.phone}`}
            className="h-11 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center justify-center gap-2"
          >
            <Phone className="w-4 h-4" />
            Call
          </a>
          <a
            href={`https://wa.me/${whatsappNumber(rider.phone)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="h-11 rounded-lg border border-slate-200 text-slate-800 text-sm font-medium flex items-center justify-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            WhatsApp
          </a>
        </div>
      )}

      <div className="border-t border-slate-100">
        <div className="px-4 pt-3 pb-1 text-sm font-medium text-slate-900">
          {rider.activeOrdersCount === 0
            ? 'No orders with this rider'
            : `${rider.activeOrdersCount} order${rider.activeOrdersCount === 1 ? '' : 's'} with this rider`}
        </div>
        {rider.activeOrders.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {rider.activeOrders.map((o) => {
              const onTheWay = ['in transit', 'dispatched'].includes((o.orderStatus || '').toLowerCase());
              return (
                <li key={o.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-900 min-w-0 truncate">
                      {o.cafeteriaName} <span className="text-slate-400">→</span> {o.deliveryAddress}
                    </div>
                    <span className={`text-xs font-medium shrink-0 ${onTheWay ? 'text-blue-700' : 'text-orange-700'}`}>
                      {onTheWay ? 'On the way' : 'To pick up'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {o.customerName} · ordered {agoLabel(minutesAgo(o.createdAt))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="h-2" />
      </div>
    </div>
  );
}

export default function FleetRadarPage() {
  const [riders, setRiders] = useState<FleetRider[]>([]);
  const [cafeterias, setCafeterias] = useState<CafeteriaPoint[]>([]);
  const [geofenceRadius, setGeofenceRadius] = useState<number>(200);
  const [summary, setSummary] = useState<Summary>({ totalRiders: 0, onlineRiders: 0, freeRiders: 0, totalOrdersInTransit: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [focusedCoords, setFocusedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);

  const fetchFleetData = useCallback(async (isBackground = false) => {
    if (!isBackground) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/fleet/live?_t=${Date.now()}`, { cache: 'no-store' });
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

  // Refresh every 10s while the page is open
  useEffect(() => {
    fetchFleetData(false);
    const interval = setInterval(() => fetchFleetData(true), 10000);
    return () => clearInterval(interval);
  }, [fetchFleetData]);

  const selectRider = useCallback(
    (id: string, fromList: boolean) => {
      setSelectedRiderId(id);
      const r = riders.find((x) => x.id === id);
      if (r && typeof r.lastLat === 'number' && typeof r.lastLng === 'number') {
        setFocusedCoords({ lat: r.lastLat, lng: r.lastLng });
      }
      // Tapping a name further down the page brings the map and their details back into view
      if (fromList) mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [riders]
  );

  const handleMapSelect = useCallback((id: string) => selectRider(id, false), [selectRider]);

  const sortedRiders = [...riders].sort(riderOrder);
  const selectedRider = riders.find((r) => r.id === selectedRiderId) || null;

  return (
    <AppLayout>
      <div className="space-y-4 pb-12">
        {/* Header + one-line status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Live fleet</h1>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-medium text-slate-900 tabular-nums">{summary.onlineRiders}</span> online ·{' '}
              <span className="font-medium text-slate-900 tabular-nums">{summary.totalOrdersInTransit}</span> orders out ·{' '}
              <span className="font-medium text-slate-900 tabular-nums">{summary.freeRiders}</span> free
            </p>
          </div>
          <button
            onClick={() => fetchFleetData(false)}
            disabled={isRefreshing}
            className="h-9 px-3 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium flex items-center gap-2 shrink-0 disabled:opacity-50"
            title={lastSyncTime ? `Updated ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Updating…'}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {lastSyncTime ? `Updated ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Map */}
          <div ref={mapRef} className="lg:col-span-8 h-[55vh] min-h-[320px] lg:h-[640px] scroll-mt-20">
            <LiveFleetMap
              riders={riders}
              cafeterias={cafeterias}
              geofenceRadiusMeters={geofenceRadius}
              selectedRiderId={selectedRiderId}
              onSelectRider={handleMapSelect}
              focusedCoordinates={focusedCoords}
            />
          </div>

          <div className="lg:col-span-4 space-y-4">
            {/* Tapped rider */}
            {selectedRider ? (
              <RiderDetail rider={selectedRider} onClose={() => setSelectedRiderId(null)} />
            ) : (
              <p className="text-sm text-slate-500 px-1">Tap a rider on the map or in the list to see their orders.</p>
            )}

            {/* Everyone */}
            <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 text-sm font-medium text-slate-900">
                Riders <span className="text-slate-400 font-normal">· {riders.length}</span>
              </div>
              {isLoading ? (
                <div className="divide-y divide-slate-100">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="px-4 py-4 animate-pulse">
                      <div className="h-4 bg-slate-100 rounded w-2/3" />
                    </div>
                  ))}
                </div>
              ) : sortedRiders.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-500">No active riders.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {sortedRiders.map((r) => {
                    const status = locationStatus(r);
                    const isSelected = r.id === selectedRiderId;
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => selectRider(r.id, true)}
                          className={`w-full text-left px-4 py-3 flex items-center gap-3 ${isSelected ? 'bg-slate-50' : 'hover:bg-slate-50'}`}
                        >
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.dot}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900 truncate">{r.name}</span>
                            <span className="block text-xs text-slate-500 truncate">{status.text}</span>
                          </span>
                          <span
                            className={`text-xs tabular-nums shrink-0 px-2 py-0.5 rounded-full ${
                              r.activeOrdersCount > 0 ? 'bg-orange-50 text-orange-700' : 'text-slate-400'
                            }`}
                          >
                            {r.activeOrdersCount > 0 ? `${r.activeOrdersCount} order${r.activeOrdersCount === 1 ? '' : 's'}` : 'none'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
