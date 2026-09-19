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
  const riderMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const cafeteriaMarkersRef = useRef<L.LayerGroup | null>(null);
  const geofenceCirclesRef = useRef<L.LayerGroup | null>(null);

  // 1. Initialize Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: BOWEN_CAMPUS_DEFAULT,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
    });

    // Add clean CartoDB Voyager / OpenStreetMap standard tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

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

  // 2. Render Cafeteria Markers & Geofence Perimeters
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !cafeteriaMarkersRef.current || !geofenceCirclesRef.current) return;

    cafeteriaMarkersRef.current.clearLayers();
    geofenceCirclesRef.current.clearLayers();

    cafeterias.forEach((caf) => {
      if (typeof caf.lat !== 'number' || typeof caf.lng !== 'number') return;

      // Circular Geofence Layer
      const circle = L.circle([caf.lat, caf.lng], {
        radius: geofenceRadiusMeters,
        color: '#3b82f6',
        fillColor: '#60a5fa',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '4, 4',
      });
      geofenceCirclesRef.current?.addLayer(circle);

      // Cafeteria Building Icon
      const isPermanent = caf.campus?.toLowerCase().includes('permanent');
      const badgeBg = isPermanent ? 'bg-indigo-600' : 'bg-emerald-600';

      const cafeteriaIcon = L.divIcon({
        className: 'custom-cafeteria-pin',
        html: `
          <div class="flex flex-col items-center group cursor-pointer" style="transform: translate(-50%, -100%);">
            <div class="px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${badgeBg} shadow-md border border-white whitespace-nowrap mb-0.5">
              ${caf.name.split(' ')[0]}
            </div>
            <div class="w-7 h-7 rounded-full ${badgeBg} border-2 border-white shadow-lg flex items-center justify-center text-white text-xs">
              🏪
            </div>
            <div class="w-1.5 h-1.5 bg-slate-800 rounded-full mt-0.5"></div>
          </div>
        `,
        iconSize: [30, 42],
        iconAnchor: [15, 42],
      });

      const marker = L.marker([caf.lat, caf.lng], { icon: cafeteriaIcon });
      marker.bindPopup(`
        <div class="p-2.5 font-sans min-w-[200px]">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="text-sm">🏪</span>
            <strong class="text-sm font-bold text-slate-900">${caf.name}</strong>
          </div>
          <div class="text-[11px] text-slate-600 mb-2">
            <span class="font-semibold text-slate-700">${caf.campus || 'Campus Cafeteria'}</span>
            ${caf.description ? ` • ${caf.description}` : ''}
          </div>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-1.5 text-[10px] text-blue-800">
            📍 <strong>${geofenceRadiusMeters}m</strong> Geofence perimeter active
          </div>
        </div>
      `);

      cafeteriaMarkersRef.current?.addLayer(marker);
    });
  }, [cafeterias, geofenceRadiusMeters]);

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
        ? `<span class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-600 text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow">${rider.activeOrdersCount}</span>`
        : '';

      const riderIcon = L.divIcon({
        className: 'custom-rider-pin',
        html: `
          <div class="relative flex flex-col items-center cursor-pointer transition-transform duration-200 ${isSelected ? 'scale-125 z-50' : 'hover:scale-110'}" style="transform: translate(-50%, -100%);">
            <div class="px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow-md border border-white whitespace-nowrap mb-0.5" style="background-color: ${statusColor};">
              ${rider.name.split(' ')[0]}
            </div>
            <div class="relative">
              ${isLive ? `<span class="absolute inset-0 rounded-full bg-emerald-400 ${pulseRing}"></span>` : ''}
              <div class="w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center text-white text-sm font-bold relative z-10" style="background-color: ${statusColor};">
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
        marker.addTo(map);
        riderMarkersRef.current.set(rider.id, marker);
      }

      // Popup Content
      const phoneClean = (rider.phone || '').replace(/[^0-9]/g, '');
      const waNumber = phoneClean.startsWith('0')
        ? '234' + phoneClean.slice(1)
        : phoneClean;

      const ordersListHtml = rider.activeOrders.length > 0
        ? rider.activeOrders.map((o) => `
            <div class="p-2 rounded-lg bg-slate-50 border border-slate-200 mb-1.5 text-[11px]">
              <div class="flex items-center justify-between font-bold text-slate-800">
                <span>#${o.orderId}</span>
                <span class="text-amber-600 font-extrabold">₦${Number(o.deliveryFee || 0).toLocaleString()}</span>
              </div>
              <div class="text-slate-600 truncate">👤 ${o.customerName}</div>
              <div class="text-slate-500 text-[10px] flex items-center justify-between mt-0.5">
                <span>🏪 ${o.cafeteriaName}</span>
                <span>📍 ${o.deliveryAddress}</span>
              </div>
            </div>
          `).join('')
        : '<div class="text-center py-2 text-slate-400 text-xs italic">No active orders assigned</div>';

      const popupHtml = `
        <div class="p-2.5 font-sans min-w-[240px] max-w-[280px]">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div>
              <div class="font-black text-sm text-slate-900">${rider.name}</div>
              <div class="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                <span class="w-2 h-2 rounded-full" style="background-color: ${statusColor};"></span>
                <span>${statusLabel}</span>
              </div>
            </div>
            <div class="text-right">
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${rider.isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
                ${rider.isOnline ? 'On Duty' : 'Off Duty'}
              </span>
            </div>
          </div>

          <div class="mb-2">
            <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Active Deliveries (${rider.activeOrdersCount})
            </div>
            ${ordersListHtml}
          </div>

          <div class="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100">
            ${rider.phone ? `
              <a href="https://wa.me/${waNumber}" target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold text-center no-underline shadow-sm">
                💬 WhatsApp
              </a>
              <a href="tel:${rider.phone}" class="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold text-center no-underline shadow-sm">
                📞 Call
              </a>
            ` : '<div class="col-span-2 text-center text-[10px] text-slate-400">No phone attached</div>'}
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml);

      marker.on('click', () => {
        if (onSelectRider) onSelectRider(rider.id);
      });
    });

    // Remove markers for riders who are no longer active or tracked
    riderMarkersRef.current.forEach((marker, id) => {
      if (!currentRiderIds.has(id)) {
        marker.remove();
        riderMarkersRef.current.delete(id);
      }
    });
  }, [riders, selectedRiderId, onSelectRider]);

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

  const fitAllRiders = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const validCoords = riders
      .filter((r) => typeof r.lastLat === 'number' && typeof r.lastLng === 'number')
      .map((r) => [r.lastLat!, r.lastLng!] as [number, number]);

    if (validCoords.length > 0) {
      const bounds = L.latLngBounds(validCoords);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
    } else {
      map.flyTo(BOWEN_CAMPUS_DEFAULT, 16);
    }
  };

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-2xl overflow-hidden shadow-inner border border-slate-200">
      {/* Map DOM Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[500px] z-0" />

      {/* Floating Campus Quick Jump Bar */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl shadow-lg border border-slate-200/80">
        <button
          onClick={() => jumpToSite(BOWEN_TEMPORARY_CENTER)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 transition-colors flex items-center gap-1.5"
        >
          <span>🏫</span>
          <span>Temporary Site</span>
        </button>
        <button
          onClick={() => jumpToSite(BOWEN_PERMANENT_CENTER)}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 transition-colors flex items-center gap-1.5"
        >
          <span>🏛️</span>
          <span>Permanent Site</span>
        </button>
        <button
          onClick={fitAllRiders}
          className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <span>🎯</span>
          <span>Fit All Riders</span>
        </button>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200/80 text-[11px] flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-semibold text-slate-700">Live Moving</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span className="font-semibold text-slate-700">Idle (&gt;2m)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
          <span className="font-semibold text-slate-700">Off-duty/Stale</span>
        </div>
        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
          <span className="w-2.5 h-2.5 rounded-full border border-blue-500 bg-blue-100"></span>
          <span className="font-semibold text-slate-700">200m Geofence</span>
        </div>
      </div>
    </div>
  );
}
