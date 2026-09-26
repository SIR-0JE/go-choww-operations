'use client';

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface FleetRiderOrder {
  id: string;
  orderId: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryType: string;
  orderStatus: string;
  deliveryFee: number | string;
  totalAmountPaid: number | string;
  time: string;
  createdAt: string;
  customerPhone?: string | null;
}

export interface FleetRider {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  status: string;
  lastLat: number | null;
  lastLng: number | null;
  lastHeading?: number | null;
  lastSpeed?: number | null;
  lastLocationAt: string | null;
  minutesSinceUpdate: number | null;
  locationFreshness: 'live' | 'idle' | 'stale' | 'none';
  activeOrdersCount: number;
  activeOrders: FleetRiderOrder[];
}

export interface CafeteriaPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  campus?: string;
  description?: string;
}

interface LiveFleetMapProps {
  riders: FleetRider[];
  cafeterias: CafeteriaPoint[];
  geofenceRadiusMeters?: number;
  selectedRiderId?: string | null;
  onSelectRider?: (riderId: string) => void;
  focusedCoordinates?: { lat: number; lng: number } | null;
}

const BOWEN_PERMANENT_CENTER: [number, number] = [7.6188, 4.2040];
const BOWEN_TEMPORARY_CENTER: [number, number] = [7.6246, 4.1934];
const BOWEN_CAMPUS_DEFAULT: [number, number] = [7.6215, 4.1985];

export default function LiveFleetMap({
  riders,
  cafeterias,
  geofenceRadiusMeters = 200,
  selectedRiderId,
  onSelectRider,
  focusedCoordinates,
}: LiveFleetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const [mapLayer, setMapLayer] = React.useState<'google-hybrid' | 'google-streets' | 'osm'>('google-hybrid');
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const riderMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const cafeteriaMarkersRef = useRef<L.LayerGroup | null>(null);
  const geofenceCirclesRef = useRef<L.LayerGroup | null>(null);
  const onSelectRiderRef = useRef(onSelectRider);
  onSelectRiderRef.current = onSelectRider;
  const hasAutoFittedRef = useRef(false);

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: BOWEN_CAMPUS_DEFAULT,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    // Reposition zoom controls to bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Layer groups for cafeterias & geofences
    cafeteriaMarkersRef.current = L.layerGroup().addTo(map);
    geofenceCirclesRef.current = L.layerGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 1b. Update Base Tile Layer dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    let url = 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}'; // Default Google Hybrid
    let maxZoom = 20;

    if (mapLayer === 'google-streets') {
      url = 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}';
    } else if (mapLayer === 'osm') {
      url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      maxZoom = 19;
    }

    tileLayerRef.current = L.tileLayer(url, {
      maxZoom,
      subdomains: ['a', 'b', 'c'],
    }).addTo(map);
  }, [mapLayer]);

  const showGeofences = true;

  // 2. Render Cafeteria Markers & Geofence Perimeters
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !cafeteriaMarkersRef.current || !geofenceCirclesRef.current) return;

    cafeteriaMarkersRef.current.clearLayers();
    geofenceCirclesRef.current.clearLayers();

    cafeterias.forEach((caf) => {
      if (typeof caf.lat !== 'number' || typeof caf.lng !== 'number') return;

      // Circular Geofence Layer (clean, subtle, non-intrusive)
      if (showGeofences) {
        const circle = L.circle([caf.lat, caf.lng], {
          radius: geofenceRadiusMeters,
          color: '#2563eb',
          fillColor: '#3b82f6',
          fillOpacity: 0.05,
          weight: 1.2,
          dashArray: '4, 6',
        });
        geofenceCirclesRef.current?.addLayer(circle);
      }

      // Cafeteria Building Icon
      const isPermanent = caf.campus?.toLowerCase().includes('permanent');
      const badgeBg = isPermanent ? 'bg-indigo-600' : 'bg-emerald-600';
      const shortName = caf.name.split(' ')[0];

      const cafeteriaIcon = L.divIcon({
        className: 'custom-cafeteria-pin',
        html: `
          <div class="flex flex-col items-center group cursor-pointer" style="transform: translate(-50%, -100%);">
            <div class="px-2 py-0.5 rounded-full text-xs font-semibold text-white ${badgeBg} shadow-sm border border-white/90 whitespace-nowrap mb-0.5 tracking-tight">
              ${shortName}
            </div>
            <div class="w-6 h-6 rounded-full ${badgeBg} border-2 border-white shadow-sm flex items-center justify-center text-white text-xs">
              🏪
            </div>
            <div class="w-1.5 h-1.5 bg-slate-900 rounded-full mt-0.5"></div>
          </div>
        `,
        iconSize: [28, 40],
        iconAnchor: [14, 40],
      });

      const marker = L.marker([caf.lat, caf.lng], { icon: cafeteriaIcon });
      marker.bindPopup(`
        <div class="p-2.5 font-sans min-w-[210px]">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-sm">🏪</span>
            <strong class="text-sm font-semibold text-slate-900">${caf.name}</strong>
          </div>
          <div class="text-xs text-slate-600 mb-2">
            <span class="font-semibold text-slate-700">${caf.campus || 'Campus Cafeteria'}</span>
            ${caf.description ? ` • ${caf.description}` : ''}
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-1.5 text-xs text-blue-800 flex items-center justify-between">
            <span>📍 Geofence Radius:</span>
            <strong>${geofenceRadiusMeters}m</strong>
          </div>
        </div>
      `);

      cafeteriaMarkersRef.current?.addLayer(marker);
    });
  }, [cafeterias, geofenceRadiusMeters, showGeofences]);

  // 3. Render / Update Live Rider Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentRiderIds = new Set<string>();

    riders.forEach((rider) => {
      if (typeof rider.lastLat !== 'number' || typeof rider.lastLng !== 'number') return;
      currentRiderIds.add(rider.id);

      const isLive = rider.locationFreshness === 'live';
      const isIdle = rider.locationFreshness === 'idle';
      const isSelected = selectedRiderId === rider.id;

      let statusColor = '#94a3b8'; // Grey (Stale/Offline)
      let pulseRing = '';
      let statusLabel = 'Offline / Stale';

      if (rider.isOnline) {
        if (isLive) {
          statusColor = '#10b981'; // Green
          pulseRing = 'animate-ping opacity-75';
          statusLabel = 'Live Moving';
        } else if (isIdle) {
          statusColor = '#f59e0b'; // Amber / Orange
          statusLabel = `Idle (${rider.minutesSinceUpdate}m ago)`;
        } else {
          statusColor = '#64748b'; // Slate
          statusLabel = `Stale (${rider.minutesSinceUpdate || '>10'}m ago)`;
        }
      }

      const orderBadge = rider.activeOrdersCount > 0
        ? `<span class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full text-xs font-semibold flex items-center justify-center border-2 border-white shadow">${rider.activeOrdersCount}</span>`
        : '';

      const riderIcon = L.divIcon({
        className: 'custom-rider-pin',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer" style="transform: translate(-50%, -100%);">
            <div class="px-2 py-0.5 rounded-full text-xs font-semibold text-white shadow-sm border border-white whitespace-nowrap mb-0.5" style="background-color: ${statusColor};">
              ${rider.name.replace(/^mr\.?\s+/i, '').split(' ')[0]}
            </div>
            <div class="relative">
              ${isLive ? `<span class="absolute inset-0 rounded-full bg-emerald-400 ${pulseRing}"></span>` : ''}
              <div class="w-8 h-8 rounded-full border-2 ${isSelected ? 'border-slate-900 ring-4 ring-white' : 'border-white'} shadow-xl flex items-center justify-center text-white text-sm font-semibold relative z-10" style="background-color: ${statusColor};">
                🚴
              </div>
              ${orderBadge}
            </div>
            <div class="w-2 h-2 bg-slate-900 rounded-full mt-0.5"></div>
          </div>
        `,
        iconSize: [36, 48],
        iconAnchor: [18, 48],
      });

      let marker = riderMarkersRef.current.get(rider.id);

      if (marker) {
        marker.setLatLng([rider.lastLat, rider.lastLng]);
        marker.setIcon(riderIcon);
      } else {
        marker = L.marker([rider.lastLat, rider.lastLng], { icon: riderIcon });
        const riderId = rider.id;
        marker.on('click', () => onSelectRiderRef.current?.(riderId));
        marker.addTo(map);
        riderMarkersRef.current.set(rider.id, marker);
      }
      marker.setZIndexOffset(isSelected ? 1000 : 0);

    });

    // Remove markers for riders who are no longer active or tracked
    riderMarkersRef.current.forEach((marker, id) => {
      if (!currentRiderIds.has(id)) {
        marker.remove();
        riderMarkersRef.current.delete(id);
      }
    });

    // First time riders arrive, frame all of them so you can see everyone at once
    if (!hasAutoFittedRef.current && currentRiderIds.size > 0) {
      hasAutoFittedRef.current = true;
      fitAllRiders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riders, selectedRiderId]);

  // 4. Focus / Pan Camera Handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !focusedCoordinates) return;
    map.flyTo([focusedCoordinates.lat, focusedCoordinates.lng], 17, {
      animate: true,
      duration: 1.2,
    });
  }, [focusedCoordinates]);

  // Quick Site Camera Jump Actions
  const jumpToSite = (coords: [number, number], zoom = 17) => {
    mapInstanceRef.current?.flyTo(coords, zoom, { animate: true, duration: 1 });
  };

  function fitAllRiders() {
    const map = mapInstanceRef.current;
    if (!map) return;

    const validCoords = riders
      .filter((r) => typeof r.lastLat === 'number' && typeof r.lastLng === 'number')
      .map((r) => [r.lastLat!, r.lastLng!] as [number, number]);

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 17 });
    } else {
      map.flyTo(BOWEN_CAMPUS_DEFAULT, 16);
    }
  }

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-slate-200">
      {/* Map DOM Canvas */}
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Controls: a few big, clear buttons so they work with a thumb */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1 bg-white/95 p-1 rounded-lg shadow-sm border border-slate-200 pointer-events-auto text-xs font-medium text-slate-700">
          <button onClick={fitAllRiders} className="h-8 px-2.5 rounded-md bg-slate-900 text-white">
            All riders
          </button>
          <button onClick={() => jumpToSite(BOWEN_TEMPORARY_CENTER)} className="h-8 px-2.5 rounded-md hover:bg-slate-100">
            Temp site
          </button>
          <button onClick={() => jumpToSite(BOWEN_PERMANENT_CENTER)} className="h-8 px-2.5 rounded-md hover:bg-slate-100">
            Perm site
          </button>
        </div>
        <button
          onClick={() => setMapLayer(mapLayer === 'google-hybrid' ? 'google-streets' : 'google-hybrid')}
          className="h-10 px-3 rounded-lg bg-white/95 shadow-sm border border-slate-200 pointer-events-auto text-xs font-medium text-slate-700"
          title="Switch between satellite and street map"
        >
          {mapLayer === 'google-hybrid' ? 'Street' : 'Satellite'}
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2.5 left-2.5 z-20 bg-white/95 px-2.5 py-1.5 rounded-lg shadow-sm border border-slate-200 text-xs text-slate-600 flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Live
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          2–10 min ago
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-slate-400" />
          Older / off
        </span>
      </div>
    </div>
  );
}
