'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bike,
  LogOut,
  Volume2,
  VolumeX,
  Phone,
  Store,
  MapPin,
  User,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  AlertCircle,
  Sparkles,
  Hash,
  WifiOff,
  Wifi,
  Clock,
  ShieldAlert,
  ArrowRightLeft,
  Users,
  X,
  Zap,
  Filter,
  RotateCcw,
  HandHelping,
  MapPinOff,
  HelpCircle,
  Compass,
} from 'lucide-react';
import { pushNotification, buildRiderNotification } from '@/lib/notifications';
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner';
import { GpsPermissionModal } from '@/components/GpsPermissionModal';

interface RiderOrder {
  id: string;
  orderId: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryType: string;
  orderStatus: string;
  createdAt: string;
  time: string;
  customerPhone?: string | null;
  pickupCode?: string | null;
  riderId?: string | null;
  isAssignedStation?: boolean;
  rider?: {
    id: string;
    name: string;
    phone?: string;
  } | null;
  handoverRequestedById?: string | null;
  handoverRequestedByName?: string | null;
  handoverDistance?: number | null;
}

interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  assignedCafeterias?: string[];
}

interface OtherRider {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
  activeCount: number;
}

const MAX_ACTIVE_ORDERS = 5;

export default function RiderPortalPage() {
  const router = useRouter();

  // State
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [availableOrders, setAvailableOrders] = useState<RiderOrder[]>([]);
  const [activeTasks, setActiveTasks] = useState<RiderOrder[]>([]);
  const [completedToday, setCompletedToday] = useState<RiderOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'completed'>('available');

  const [isOnline, setIsOnline] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Peer-to-Peer Transfer States
  const [otherRiders, setOtherRiders] = useState<OtherRider[]>([]);
  const [transferModalOrder, setTransferModalOrder] = useState<RiderOrder | null>(null);
  const [selectedTargetRiderId, setSelectedTargetRiderId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Drop Order Modal State
  const [dropModalOrder, setDropModalOrder] = useState<RiderOrder | null>(null);
  const [isDropping, setIsDropping] = useState(false);

  // Cafeteria Filter & Takeover States
  const [selectedCafeteria, setSelectedCafeteria] = useState<string>('all');
  const [takeoverModalOrder, setTakeoverModalOrder] = useState<RiderOrder | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);

  // GPS Telemetry Heartbeat State
  const [isGoingOnline, setIsGoingOnline] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'active' | 'connecting' | 'idle' | 'off' | 'denied'>('off');
  const [showGpsHelpModal, setShowGpsHelpModal] = useState(false);
  const [isRetryingGps, setIsRetryingGps] = useState(false);

  const prevAvailableIdsRef = useRef<Set<string>>(new Set());
  const prevActiveIdsRef = useRef<Set<string>>(new Set());
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 4000);
  };

  const retryGpsPermission = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      showToast('Geolocation is not supported by your browser.', 'error');
      return;
    }
    if (window.isSecureContext === false && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      showToast('🔒 HTTPS Required: Chrome blocks GPS on insecure HTTP connections.', 'error');
      setShowGpsHelpModal(true);
      return;
    }
    setIsRetryingGps(true);
    setGpsStatus('connecting');

    const handleSuccess = async (position: GeolocationPosition) => {
      setIsRetryingGps(false);
      setGpsStatus('active');
      setShowGpsHelpModal(false);
      showToast('📍 GPS Location enabled and transmitting!', 'success');
      if (rider?.id) {
        try {
          await fetch('/api/rider/location', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              riderId: rider.id,
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              heading: position.coords.heading,
              speed: position.coords.speed,
            }),
          });
        } catch (err) {
          console.warn('[GPS Retry] Transmit error:', err);
        }
      }
    };

    const handleFailure = (err: GeolocationPositionError) => {
      setIsRetryingGps(false);
      if (err.code === err.PERMISSION_DENIED) {
        setGpsStatus('denied');
        showToast('Location still blocked. Check master Phone Location & Chrome site permissions.', 'error');
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setGpsStatus('denied');
        showToast('Phone GPS is OFF. Turn ON "Location" in phone notification tray.', 'error');
      } else {
        setGpsStatus('idle');
        showToast(`GPS Notice: ${err.message}`, 'error');
      }
    };

    // Stage 1: High Accuracy
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => {
        // Stage 2: Fallback to standard network positioning
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
          navigator.geolocation.getCurrentPosition(
            handleSuccess,
            handleFailure,
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
          );
        } else {
          handleFailure(err);
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
    );
  };

  // ── Web Audio Chime ──────────────────────────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initOrResumeAudio = useCallback(() => {
    try {
      if (typeof window === 'undefined') return null;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      return audioCtxRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const unlock = () => initOrResumeAudio();
    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [initOrResumeAudio]);

  const playAlertChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = initOrResumeAudio();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.25, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.14);
      gain2.gain.setValueAtTime(0.3, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.6);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (e) {
      console.warn('Audio chime notice:', e);
    }
  }, [soundEnabled, initOrResumeAudio]);

  // Urgent station chime (3 rapid ascending chimes for assigned cafeteria orders)
  const playUrgentStationChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = initOrResumeAudio();
      if (!ctx) return;
      const now = ctx.currentTime;
      [0, 0.12, 0.24].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(784 + idx * 261, now + offset); // G5 -> C6 -> E6
        gain.gain.setValueAtTime(0.4, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.14);
      });
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([300, 100, 300, 100, 400]);
      }
    } catch (e) {
      console.warn('Urgent station chime notice:', e);
    }
  }, [soundEnabled, initOrResumeAudio]);

  // ── Restore session from localStorage ───────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('rider_session');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setRider(parsed);
          setIsOnline(Boolean(parsed.isOnline));
        } catch { /* ignore */ }
      }
    }
  }, []);

  // ── High-Precision GPS Telemetry (watchPosition + WakeLock + VisibilitySync) ─
  useEffect(() => {
    if (!rider?.id || !isOnline) {
      setGpsStatus('off');
      return;
    }

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }

    let isMounted = true;
    let watchId: number | null = null;
    let wakeLockSentinel: any = null;
    let lastTransmittedTime = 0;
    const MIN_TRANSMIT_INTERVAL_MS = 12000; // Throttle transmissions to at most once per 12s

    setGpsStatus('connecting');

    // 1. Send telemetry to backend
    const sendTelemetry = async (coords: {
      latitude: number;
      longitude: number;
      heading: number | null;
      speed: number | null;
    }) => {
      if (!isMounted || !rider?.id) return;
      setGpsStatus('active');
      lastTransmittedTime = Date.now();
      try {
        await fetch('/api/rider/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            riderId: rider.id,
            lat: coords.latitude,
            lng: coords.longitude,
            heading: coords.heading,
            speed: coords.speed,
          }),
        });
      } catch (err) {
        console.warn('[GPS Heartbeat] Transmit error:', err);
      }
    };

    // 2. Hardware GPS stream listener (watchPosition)
    try {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          if (!isMounted) return;
          const now = Date.now();
          if (now - lastTransmittedTime >= MIN_TRANSMIT_INTERVAL_MS) {
            sendTelemetry(position.coords);
          } else {
            setGpsStatus('active');
          }
        },
        (err) => {
          if (!isMounted) return;
          console.warn('[GPS Watch] Notice:', err.message);
          if (err.code === err.PERMISSION_DENIED) {
            setGpsStatus('denied');
          } else {
            setGpsStatus('idle');
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch (e) {
      console.warn('[GPS Watch] Init error:', e);
    }

    // 3. Fallback on-demand transmission on interval & app resume / tab focus
    const triggerImmediatePosition = () => {
      if (!isMounted) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => sendTelemetry(pos.coords),
        (err) => {
          if (!isMounted) return;
          if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
            // Stage 2 fallback to standard network/cellular positioning
            navigator.geolocation.getCurrentPosition(
              (pos2) => sendTelemetry(pos2.coords),
              (err2) => {
                if (!isMounted) return;
                if (err2.code === err2.PERMISSION_DENIED) setGpsStatus('denied');
                else setGpsStatus('idle');
              },
              { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
            );
          } else if (err.code === err.PERMISSION_DENIED) {
            setGpsStatus('denied');
          }
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
      );
    };

    triggerImmediatePosition();
    const fallbackInterval = setInterval(triggerImmediatePosition, 25000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerImmediatePosition();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', triggerImmediatePosition);

    // 4. Keep Screen Awake while On Duty (WakeLock API)
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator && (navigator as any).wakeLock) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        }
      } catch {
        // WakeLock request denied or unsupported
      }
    };
    requestWakeLock();

    return () => {
      isMounted = false;
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      clearInterval(fallbackInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', triggerImmediatePosition);
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch { /* ignore */ }
      }
    };
  }, [rider?.id, isOnline]);

  // ── Fetch Rider Profile & Orders ─────────────────────────────────────────────
  const fetchPortalData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setIsRefreshing(true);
      const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
      try {
        const headers: Record<string, string> = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        };
        if (localRiderId) headers['x-rider-id'] = localRiderId;
        const res = await fetch(`/api/rider/orders?_t=${Date.now()}`, {
          headers,
          cache: 'no-store',
        });
        if (res.status === 401) {
          if (!isBackground && !localRiderId) router.push('/rider/login');
          return;
        }
        if (!res.ok) {
          // Server busy: keep the current lists on screen and retry on the next poll
          setConnectionIssue(true);
          return;
        }
        const data = await res.json();
        if (data.success) {
          setConnectionIssue(false);
          if (data.rider) {
            setRider(data.rider);
            setIsOnline(Boolean(data.rider.isOnline));
            if (typeof window !== 'undefined') {
              localStorage.setItem('rider_session', JSON.stringify(data.rider));
              localStorage.setItem('rider_id', data.rider.id);
            }
          }
          const newAvailable: RiderOrder[] = data.available || [];
          const newActive: RiderOrder[] = data.active || [];
          const newCompleted: RiderOrder[] = data.completedToday || [];

          if (isBackground && prevAvailableIdsRef.current.size > 0) {
            const newArrivals = newAvailable.filter((ord) => !prevAvailableIdsRef.current.has(ord.orderId));
            if (newArrivals.length > 0) {
              const stationArrival = newArrivals.find((o) => o.isAssignedStation);
              if (stationArrival) {
                playUrgentStationChime();
                showToast(`⭐ URGENT: New order at your assigned station (${stationArrival.cafeteriaName})!`, 'success');
              } else {
                playAlertChime();
                showToast('🔔 New order available in the dispatch pool!', 'success');
              }
            }
          }
          prevAvailableIdsRef.current = new Set(newAvailable.map((o) => o.orderId));

          setAvailableOrders(newAvailable);
          setActiveTasks(newActive);
          setCompletedToday(newCompleted);
          if (data.otherRiders) {
            setOtherRiders(data.otherRiders);
          }
        }
      } catch (err: any) {
        console.error('Failed to load rider orders:', err);
        setConnectionIssue(true);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [router, playAlertChime, playUrgentStationChime]
  );

  // ── High-Speed Real-Time Synchronization (3.5s cycle + BroadcastChannel) ────
  useEffect(() => {
    let inFlightFetch = false;

    // Fast local portal data fetch (Direct database, sub-30ms)
    const fetchFast = async () => {
      if (inFlightFetch) return;
      inFlightFetch = true;
      try {
        await fetchPortalData(true);
      } finally {
        inFlightFetch = false;
      }
    };

    // Initial load
    fetchPortalData(false);

    // Fast 3.5s poll for instant state transitions across riders
    const fastInterval = setInterval(fetchFast, 3500);

    // Instant sync on screen unlock / tab focus
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchFast();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // Cross-tab / Cross-window Real-Time BroadcastChannel listener
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        channel = new BroadcastChannel('gochow_rider_sync');
        channel.onmessage = (event) => {
          if (event.data?.type === 'rider_action_update' || event.data?.type === 'orders_synced') {
            fetchFast();
          }
        };
      }
    } catch {
      // ignore
    }

    return () => {
      clearInterval(fastInterval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      if (channel) channel.close();
    };
  }, [fetchPortalData]);

  // ── Pull new GoChow orders while this rider is online ──────────────────────
  // Keeps the pool filling even when no admin dashboard is open; the server
  // throttles and de-duplicates syncs so several riders don't multiply the load.
  useEffect(() => {
    if (!isOnline) return;
    let inFlight = false;
    const triggerSync = async () => {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const res = await fetch('/api/sync-orders', { method: 'POST', cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (data?.hasChanges) fetchPortalData(true);
      } catch {
        // ignore — the next tick retries
      } finally {
        inFlight = false;
      }
    };
    triggerSync();
    const syncInterval = setInterval(triggerSync, 15000);
    return () => clearInterval(syncInterval);
  }, [isOnline, fetchPortalData]);

  // ── Online / Offline Toggle ──────────────────────────────────────────────────
  // One location reading: precise first, then a quicker network-based fix.
  // Gives up after 25s, e.g. when the permission prompt is left unanswered.
  const getPositionOnce = () =>
    new Promise<GeolocationPosition>((resolveRaw, rejectRaw) => {
      if (typeof window === 'undefined' || !navigator.geolocation) {
        rejectRaw(new Error('unsupported'));
        return;
      }
      let settled = false;
      const giveUp = setTimeout(() => reject(new Error('timeout')), 25000);
      function resolve(p: GeolocationPosition) {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        resolveRaw(p);
      }
      function reject(e: unknown) {
        if (settled) return;
        settled = true;
        clearTimeout(giveUp);
        rejectRaw(e);
      }
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            reject(err);
            return;
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 60000,
          });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });

  const toggleOnlineStatus = async () => {
    const nextStatus = !isOnline;
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;

    // Going online needs a working location, so dispatch can see every online rider on the map
    if (nextStatus) {
      setIsGoingOnline(true);
      try {
        const position = await getPositionOnce();
        const locRes = await fetch('/api/rider/location', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            riderId: rider?.id || localRiderId,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
          }),
        });
        if (!locRes.ok) throw new Error('location not saved');
        setGpsStatus('active');
      } catch (err: any) {
        setIsGoingOnline(false);
        const denied = err && typeof err.code === 'number' && err.code === 1;
        setGpsStatus(denied ? 'denied' : 'idle');
        setShowGpsHelpModal(true);
        showToast(
          denied
            ? 'Location is blocked. Allow location for this site, then tap Go online again.'
            : 'Could not get your location. Turn on Location on your phone, then try again.',
          'error'
        );
        return;
      }
      setIsGoingOnline(false);
    }

    setIsOnline(nextStatus);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/status', {
        method: 'POST',
        headers,
        body: JSON.stringify({ isOnline: nextStatus, riderId: rider?.id || localRiderId }),
      });
      const data = await res.json();
      if (data.success) {
        setIsOnline(Boolean(data.isOnline));
        if (rider) {
          const updated = { ...rider, isOnline: Boolean(data.isOnline) };
          setRider(updated);
          if (typeof window !== 'undefined') {
            localStorage.setItem('rider_session', JSON.stringify(updated));
          }
        }
        showToast(nextStatus ? '🟢 You are now On Duty!' : '⏸️ You are now Off Duty.', 'success');
      } else {
        setIsOnline(!nextStatus);
        if (data.needsLocation) setShowGpsHelpModal(true);
        showToast(data.error || 'Could not update status.', 'error');
      }
      await fetchPortalData(true);
    } catch {
      setIsOnline(!nextStatus);
      showToast('Could not update status. Check your connection.', 'error');
    }
  };

  // ── Logout ────────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await fetch('/api/rider/auth', { method: 'DELETE' });
    } catch { /* ignore */ } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('rider_session');
        localStorage.removeItem('rider_id');
      }
      router.push('/rider/login');
    }
  };

  // ── Real-Time Broadcast Helper ──────────────────────────────────────────────
  const broadcastRiderUpdate = (action: string, orderId: string, orderDetails?: any) => {
    if (typeof window !== 'undefined') {
      try {
        if ('BroadcastChannel' in window) {
          const ch = new BroadcastChannel('gochow_rider_sync');
          ch.postMessage({ type: 'rider_action_update', action, orderId });
          ch.close();
        }
        window.dispatchEvent(
          new CustomEvent('rider-activity', {
            detail: {
              action,
              riderName: rider?.name || 'A rider',
              orderId,
              orderDetails: orderDetails || null,
            },
          })
        );
      } catch {
        // ignore
      }
    }
  };

  // ── Order Actions ─────────────────────────────────────────────────────────────
  const handleOrderAction = async (orderId: string, action: 'claim' | 'pickup' | 'deliver') => {
    // Client-side 5-order cap guard
    if (action === 'claim' && activeTasks.length >= MAX_ACTIVE_ORDERS) {
      showToast(`You already have ${MAX_ACTIVE_ORDERS} active orders. Deliver one before accepting more.`, 'error');
      return;
    }

    const targetOrder = availableOrders.find((o) => o.id === orderId || o.orderId === orderId);
    const targetCaf = targetOrder?.cafeteriaName;

    setActionLoadingId(orderId);
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === 'claim') {
          // Check if there are other available orders from this same cafeteria
          const remainingSiblings = targetCaf
            ? availableOrders.filter(
                (o) =>
                  o.id !== orderId &&
                  o.orderId !== orderId &&
                  (o.cafeteriaName || '').trim().toLowerCase() === targetCaf.trim().toLowerCase()
              )
            : [];

          if (remainingSiblings.length > 0) {
            showToast(
              `✅ Accepted! 💡 ${remainingSiblings.length} more order(s) available at ${targetCaf}. Claim them together to save trips!`,
              'success'
            );
          } else {
            showToast(data.message || '✅ Order accepted and added to your Active tasks!', 'success');
          }
          // Intentionally stay on the Pool tab so the rider can continue batch-claiming orders
        } else if (action === 'deliver') {
          showToast(data.message || '✅ Order delivered successfully and moved to Done!', 'success');
          // Intentionally stay on Active tab so rider can continue with remaining deliveries
        } else {
          showToast(data.message, 'success');
        }

        await fetchPortalData(false);
        
        // Broadcast to all other tabs/windows in real time
        broadcastRiderUpdate(action, orderId, data.order);

        // Persist notification to localStorage for the Notifications page
        pushNotification(
          buildRiderNotification(
            action,
            rider?.name || 'A rider',
            data.order?.orderId || orderId
          )
        );
      } else {
        showToast(data.error || 'Action could not be completed.', 'error');
        await fetchPortalData(false);
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Peer-to-Peer Order Transfer ──────────────────────────────────────────────
  const handleTransferOrder = async () => {
    if (!transferModalOrder || !selectedTargetRiderId) {
      showToast('Please select an active rider to receive this delivery.', 'error');
      return;
    }

    setIsTransferring(true);
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderId: transferModalOrder.id || transferModalOrder.orderId,
          action: 'transfer',
          targetRiderId: selectedTargetRiderId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Order successfully handed over!', 'success');
        broadcastRiderUpdate('transfer', transferModalOrder.orderId, data.order);
        setTransferModalOrder(null);
        setSelectedTargetRiderId('');
        await fetchPortalData(false);
      } else {
        showToast(data.error || 'Could not transfer order.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error.', 'error');
    } finally {
      setIsTransferring(false);
    }
  };

  // ── On-Demand Device GPS Location Helper ───────────────────────────────────
  const getDeviceLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('geolocation' in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          console.warn('GPS location reading notice:', err?.message);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 6000,
          maximumAge: 15000,
        }
      );
    });
  };

  // ── Handover Request Actions (request, cancel, accept, reject) ───────────────
  const handleHandoverAction = async (
    orderId: string,
    action: 'request_handover' | 'cancel_handover' | 'accept_handover' | 'reject_handover'
  ) => {
    if (action === 'request_handover' && activeTasks.length >= MAX_ACTIVE_ORDERS) {
      showToast(`You already have ${MAX_ACTIVE_ORDERS} active orders. Deliver one before requesting more.`, 'error');
      return;
    }

    setActionLoadingId(orderId);
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;

    const payload: Record<string, any> = { orderId, action };

    // Capture on-demand GPS coordinates for geofence verification
    if (action === 'request_handover') {
      try {
        const coords = await getDeviceLocation();
        if (coords) {
          payload.lat = coords.lat;
          payload.lng = coords.lng;
        }
      } catch {
        // Proceed without crashing if browser GPS is unready
      }
    }

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        broadcastRiderUpdate(action, orderId, data.order);
        await fetchPortalData(false);
      } else {
        showToast(data.error || 'Action could not be completed.', 'error');
        await fetchPortalData(false);
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error.', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Drop Order to Pool Action ────────────────────────────────────────────────
  const handleDropOrder = async () => {
    if (!dropModalOrder) return;
    setIsDropping(true);
    const orderId = dropModalOrder.id || dropModalOrder.orderId;
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderId, action: 'drop_order' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Order dropped back to the pool.', 'success');
        broadcastRiderUpdate('drop_order', dropModalOrder.orderId, data.order);
        setDropModalOrder(null);
        await fetchPortalData(false);
      } else {
        showToast(data.error || 'Could not drop order.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error.', 'error');
    } finally {
      setIsDropping(false);
    }
  };

  // ── Cafeteria Filtering Logic ────────────────────────────────────────────────
  const uniqueCafeterias = React.useMemo(() => {
    const map = new Map<string, number>();
    availableOrders.forEach((o) => {
      const name = (o.cafeteriaName || 'Campus Cafeteria').trim();
      map.set(name, (map.get(name) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [availableOrders]);

  const filteredAvailableOrders = React.useMemo(() => {
    let list = [...availableOrders];
    if (selectedCafeteria === 'my_stations') {
      const assigned = (rider?.assignedCafeterias || []).map((c) => c.trim().toLowerCase());
      list = list.filter(
        (o) =>
          o.isAssignedStation ||
          assigned.some((c) => (o.cafeteriaName || '').trim().toLowerCase().includes(c))
      );
    } else if (selectedCafeteria !== 'all') {
      list = list.filter(
        (o) => (o.cafeteriaName || '').trim().toLowerCase() === selectedCafeteria.toLowerCase()
      );
    }

    // Prioritize:
    // 1. Orders matching rider's assigned cafeteria (isAssignedStation)
    // 2. Peer-claimed orders awaiting pickup
    // 3. Newest orders
    return list.sort((a, b) => {
      const aAssigned = a.isAssignedStation ? 1 : 0;
      const bAssigned = b.isAssignedStation ? 1 : 0;
      if (aAssigned !== bAssigned) return bAssigned - aAssigned;

      const aIsClaimed = Boolean(a.riderId || a.rider);
      const bIsClaimed = Boolean(b.riderId || b.rider);

      if (aIsClaimed && !bIsClaimed) return -1;
      if (!aIsClaimed && bIsClaimed) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [availableOrders, selectedCafeteria, rider?.assignedCafeterias]);

  // ── Smart Batching Advice: Match active pickup cafeterias with pool orders ───
  const activeBatchAdvices = React.useMemo(() => {
    const awaitingPickupCafeterias = new Set(
      activeTasks
        .filter((t) => !['in transit', 'dispatched'].includes((t.orderStatus || '').toLowerCase()))
        .map((t) => (t.cafeteriaName || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const advices: { cafeteriaName: string; poolCount: number }[] = [];
    uniqueCafeterias.forEach((c) => {
      if (awaitingPickupCafeterias.has(c.name.trim().toLowerCase()) && c.count > 0) {
        advices.push({ cafeteriaName: c.name, poolCount: c.count });
      }
    });
    return advices;
  }, [activeTasks, uniqueCafeterias]);

  // ── Pickup code: real GoChow confirmationCode (fallback: last 4 chars of orderId) ──
  const getPickupCode = (order: RiderOrder | string | null | undefined) => {
    if (!order) return '';
    if (typeof order === 'object' && order.pickupCode) {
      return String(order.pickupCode).trim();
    }
    const orderIdStr = typeof order === 'string' ? order : order.orderId || '';
    const clean = orderIdStr.replace(/[-\s]/g, '');
    return clean.slice(-4).toUpperCase();
  };

  const atCapacity = activeTasks.length >= MAX_ACTIVE_ORDERS;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center mx-auto shadow-lg">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <p className="text-sm text-slate-500 font-medium">Loading your portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col max-w-md mx-auto">

      {/* ── Top App Bar ───────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          {/* Rider identity */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {(rider?.name || 'R').replace(/^mr\.?\s+/i, '').charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 leading-tight">
                {rider?.name || 'Dispatch Rider'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span className="text-xs text-slate-500">
                  {isOnline ? 'On duty' : 'Off duty'}
                </span>
                {isOnline && (
                  <button
                    onClick={() => setShowGpsHelpModal(true)}
                    className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${
                      gpsStatus === 'active'
                        ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        : gpsStatus === 'connecting'
                        ? 'bg-amber-100 text-amber-700 animate-pulse'
                        : gpsStatus === 'denied'
                        ? 'bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200 animate-pulse'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                    title="Tap to manage GPS permission & status"
                  >
                    {gpsStatus === 'denied' ? (
                      <MapPinOff className="w-2.5 h-2.5 text-rose-600" />
                    ) : (
                      <MapPin className="w-2.5 h-2.5" />
                    )}
                    <span>
                      {gpsStatus === 'active'
                        ? 'GPS on'
                        : gpsStatus === 'denied'
                        ? 'GPS blocked'
                        : gpsStatus === 'connecting'
                        ? 'GPS...'
                        : 'GPS off'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1.5">
            {/* Sound toggle */}
            <button
              onClick={() => {
                const next = !soundEnabled;
                setSoundEnabled(next);
                if (next) { initOrResumeAudio(); playAlertChime(); showToast('🔊 Sound enabled', 'success'); }
                else showToast('🔇 Sound muted', 'success');
              }}
              className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-all"
              title={soundEnabled ? 'Mute' : 'Enable sound'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Online toggle */}
            <button
              onClick={toggleOnlineStatus}
              disabled={isGoingOnline}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 disabled:opacity-60 ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isGoingOnline ? 'Checking…' : isOnline ? 'Online' : 'Offline'}</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-all"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className={`mx-4 mt-3 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-between border shadow-sm ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              : <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 ml-2 shrink-0 font-semibold">✕</button>
        </div>
      )}

      {/* ── Persistent GPS Denied Banner ──────────────────────────────────────── */}
      {isOnline && gpsStatus === 'denied' && (
        <div className="mx-4 mt-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex flex-col gap-2.5">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center shrink-0 shadow-sm text-white">
              <MapPinOff className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <h4 className="text-xs font-semibold text-rose-950 flex items-center gap-1.5">
                  <span>Location is blocked</span>
                </h4>
                <span className="text-xs bg-rose-200/70 text-rose-800 px-1.5 py-0.5 rounded font-semibold">
                  Required
                </span>
              </div>
              <p className="text-xs text-rose-700 mt-0.5 leading-relaxed font-medium">
                Turn on location so the team can see you on the map and handovers work.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-rose-200/60">
            <button
              onClick={() => setShowGpsHelpModal(true)}
              className="flex-1 py-2 px-3 rounded-xl bg-white border border-rose-200 text-rose-800 hover:bg-rose-50 text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>How to fix</span>
            </button>
            <button
              onClick={retryGpsPermission}
              disabled={isRetryingGps}
              className="flex-1 py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-rose-600/20 disabled:opacity-60"
            >
              {isRetryingGps ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <Compass className="w-3.5 h-3.5" />
                  <span>Try again</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Capacity Banner ───────────────────────────────────────────────────── */}
      {atCapacity && activeTab === 'available' && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-amber-800">Active Order Limit Reached (5/5)</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Complete or deliver an active order to unlock new pickups.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="sticky top-[61px] z-30 bg-white border-b border-slate-200 px-4 py-2.5">
        <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg" role="tablist">
          {([
            { key: 'available', label: 'Pool', count: `${availableOrders.length}` },
            { key: 'active', label: 'Active', count: `${activeTasks.length}/${MAX_ACTIVE_ORDERS}` },
            { key: 'completed', label: 'Done', count: `${completedToday.length}` },
          ] as const).map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => setActiveTab(t.key)}
              className={`h-9 rounded-md text-sm font-medium flex items-center justify-center gap-1.5 ${
                activeTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-xs tabular-nums ${activeTab === t.key ? 'text-orange-600' : 'text-slate-400'}`}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 space-y-3 pb-10">

        {/* Connection notice: orders below are the last good list while the server catches up */}
        {connectionIssue && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Reconnecting… showing your last updated orders.</span>
          </div>
        )}

        {/* Mobile Phone Status Bar Push Notification Activation Banner */}
        <NotificationPermissionBanner userType="rider" riderId={rider?.id} />

        {/* Offline notice */}
        {!isOnline && (
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600 text-xs">
              <WifiOff className="w-4 h-4 text-slate-400" />
              <span>You are off duty. Going online checks your location first.</span>
            </div>
            <button
              onClick={toggleOnlineStatus}
              disabled={isGoingOnline}
              className="h-10 px-4 rounded-lg bg-emerald-600 text-white font-semibold text-sm shrink-0 ml-2 hover:bg-emerald-700 disabled:opacity-60 flex items-center gap-1.5"
            >
              {isGoingOnline ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
              {isGoingOnline ? 'Checking location…' : 'Go online'}
            </button>
          </div>
        )}

        {/* ── TAB 1: AVAILABLE POOL ──────────────────────────────────────────── */}
        {activeTab === 'available' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-500">
                  {filteredAvailableOrders.length} waiting
                </p>
                {selectedCafeteria !== 'all' && (
                  <button
                    onClick={() => setSelectedCafeteria('all')}
                    className="text-xs text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"
                  >
                    Clear Filter ✕
                  </button>
                )}
              </div>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {/* ── Cafeteria Filter Pills ── */}
            {uniqueCafeterias.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCafeteria('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border ${
                    selectedCafeteria === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>All</span>
                  <span className={`text-xs px-1.5 py-0.2 rounded-full font-semibold ${
                    selectedCafeteria === 'all' ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {availableOrders.length}
                  </span>
                </button>

                {/* If rider has assigned stations, show "⭐ My Stations" button */}
                {rider?.assignedCafeterias && rider.assignedCafeterias.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCafeteria(selectedCafeteria === 'my_stations' ? 'all' : 'my_stations')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border ${
                      selectedCafeteria === 'my_stations'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm ring-2 ring-amber-300'
                        : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <span>My stations</span>
                    <span className={`text-xs px-1.5 py-0.2 rounded-full font-semibold ${
                      selectedCafeteria === 'my_stations' ? 'bg-amber-700 text-white' : 'bg-amber-200 text-amber-900'
                    }`}>
                      {availableOrders.filter((o) => o.isAssignedStation).length}
                    </span>
                  </button>
                )}

                {uniqueCafeterias.map((caf) => {
                  const isSelected = selectedCafeteria.toLowerCase() === caf.name.toLowerCase();
                  return (
                    <button
                      key={caf.name}
                      type="button"
                      onClick={() => setSelectedCafeteria(isSelected ? 'all' : caf.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Store className="w-3 h-3" />
                      <span>{caf.name}</span>
                      <span className={`text-xs px-1.5 py-0.2 rounded-full font-semibold ${
                        isSelected ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {caf.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* ── Active Pickup Batch Opportunities Banner ── */}
            {activeBatchAdvices.length > 0 && (
              <div className="space-y-2">
                {activeBatchAdvices.map((adv) => (
                  <div
                    key={adv.cafeteriaName}
                    className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex items-start justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-800">
                          Smart Batching Advice
                        </p>
                        <p className="text-xs font-semibold text-amber-900 mt-0.5">
                          You have an active pickup at <strong className="underline">{adv.cafeteriaName}</strong>, and there {adv.poolCount === 1 ? 'is' : 'are'} <strong>{adv.poolCount} more order{adv.poolCount > 1 ? 's' : ''}</strong> waiting there!
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedCafeteria(adv.cafeteriaName)}
                      className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shrink-0 shadow-sm transition-all"
                    >
                      View ({adv.poolCount})
                    </button>
                  </div>
                ))}
              </div>
            )}

            {filteredAvailableOrders.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-300 rounded-xl bg-white p-6">
                <Bike className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
                <h3 className="text-sm font-semibold text-slate-700">
                  {selectedCafeteria === 'all'
                    ? 'No Orders in the Pool'
                    : selectedCafeteria === 'my_stations'
                    ? 'No Orders at Your Assigned Stations'
                    : `No Orders at ${selectedCafeteria}`}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  {selectedCafeteria === 'all'
                    ? 'New orders will appear here with a sound alert once customers pay.'
                    : 'Try selecting "All Cafeterias" or checking other cafeteria locations.'}
                </p>
                {selectedCafeteria !== 'all' && (
                  <button
                    onClick={() => setSelectedCafeteria('all')}
                    className="mt-3 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold"
                  >
                    View All Cafeterias ({availableOrders.length})
                  </button>
                )}
              </div>
            ) : (
              filteredAvailableOrders.map((ord) => {
                const isLoadingAction = actionLoadingId === ord.id || actionLoadingId === ord.orderId;
                const isAtCap = atCapacity;
                const isPeerClaimed = Boolean(ord.riderId && ord.riderId !== rider?.id);
                const sameCafOrdersCount = availableOrders.filter(
                  (o) => (o.cafeteriaName || '').trim().toLowerCase() === (ord.cafeteriaName || '').trim().toLowerCase()
                ).length;

                return (
                  <div
                    key={ord.id || ord.orderId}
                    className={`bg-white rounded-xl border overflow-hidden ${
                      isPeerClaimed ? 'border-indigo-200' : ord.isAssignedStation ? 'border-orange-300' : 'border-slate-200'
                    }`}
                  >
                    {/* Assigned Station Priority Banner */}
                    {ord.isAssignedStation && !isPeerClaimed && (
                      <div className="bg-orange-50 text-orange-700 px-4 py-1.5 text-xs font-medium flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Your station</span>
                      </div>
                    )}

                    {/* Peer Claimed Header Tag */}
                    {isPeerClaimed && (
                      <div className="bg-indigo-50/90 border-b border-indigo-100 px-4 py-2 flex items-center justify-between text-indigo-900">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="text-xs font-semibold">
                            Accepted by <span className="underline decoration-indigo-300">{ord.rider?.name || 'Another Rider'}</span>
                          </span>
                        </div>
                        <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          Awaiting Pickup
                        </span>
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* Route: cafeteria -> hostel */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center pt-1.5 shrink-0" aria-hidden="true">
                          <span className="w-2 h-2 rounded-full bg-orange-500" />
                          <span className="w-px flex-1 bg-slate-200 my-1" />
                          <span className="w-2 h-2 rounded-full border-2 border-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div>
                            <p className="text-base font-semibold text-slate-900 truncate">{ord.cafeteriaName || 'Campus Cafeteria'}</p>
                            <p className="text-xs text-slate-500">Pick up</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800 truncate">{ord.deliveryAddress || 'Campus Hostel'}</p>
                            <p className="text-xs text-slate-500 truncate">Deliver to {ord.customerName}</p>
                          </div>
                        </div>
                      </div>

                      {/* Other orders at the same cafeteria */}
                      {sameCafOrdersCount > 1 && (
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <span className="truncate">{sameCafOrdersCount} orders waiting here</span>
                          {selectedCafeteria === 'all' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedCafeteria(ord.cafeteriaName);
                              }}
                              className="font-medium text-orange-600 shrink-0 ml-2"
                            >
                              Show all
                            </button>
                          )}
                        </div>
                      )}

                      {/* Action Button: Peer Claimed Handover Request vs Open Pool Claim */}
                      {isPeerClaimed ? (
                        ord.handoverRequestedById === rider?.id ? (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-amber-50 border border-amber-300 text-amber-900 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                                <span className="truncate">Handover Requested • Waiting...</span>
                              </div>
                            </div>
                            <button
                              onClick={() => handleHandoverAction(ord.id || ord.orderId, 'cancel_handover')}
                              disabled={isLoadingAction}
                              className="px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 shrink-0 transition-colors"
                            >
                              Cancel ✕
                            </button>
                          </div>
                        ) : ord.handoverRequestedById && ord.handoverRequestedById !== rider?.id ? (
                          <div className="w-full bg-slate-100 border border-slate-200 text-slate-500 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 mt-1">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>Requested by {ord.handoverRequestedByName || 'another rider'}</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleHandoverAction(ord.id || ord.orderId, 'request_handover')}
                            disabled={isLoadingAction || !isOnline || isAtCap}
                            title={isAtCap ? 'You have reached the 5-order limit' : undefined}
                            className={`w-full font-semibold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-1 ${
                              isAtCap || !isOnline
                                ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-indigo-600 hover:bg-indigo-700 text-white active:bg-indigo-800'
                            }`}
                          >
                            {isLoadingAction ? (
                              <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>Requesting...</span>
                              </>
                            ) : isAtCap ? (
                              <>
                                <ShieldAlert className="w-4 h-4" />
                                <span>Limit Reached (5/5)</span>
                              </>
                            ) : (
                              <>
                                <HandHelping className="w-4 h-4" />
                                <span>I'm at Cafeteria — Request Handover</span>
                              </>
                            )}
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handleOrderAction(ord.id || ord.orderId, 'claim')}
                          disabled={isLoadingAction || !isOnline || isAtCap}
                          title={isAtCap ? 'You have reached the 5-order limit' : undefined}
                          className={`w-full font-semibold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-1 ${
                            isAtCap || !isOnline
                              ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-orange-500 hover:bg-orange-600 text-white active:bg-orange-700'
                          }`}
                        >
                          {isLoadingAction ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Accepting...</span>
                            </>
                          ) : isAtCap ? (
                            <>
                              <ShieldAlert className="w-4 h-4" />
                              <span>Limit Reached (5/5)</span>
                            </>
                          ) : (
                            <>
                              <span>Accept delivery</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── TAB 2: ACTIVE TASKS ────────────────────────────────────────────── */}
        {activeTab === 'active' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {activeTasks.length} of {MAX_ACTIVE_ORDERS} slots used
              </p>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {activeTasks.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-300 rounded-xl bg-white p-6">
                <PackageCheck className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
                <h3 className="text-sm font-semibold text-slate-700">No Active Dispatches</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Head to the Pool tab to claim available orders.
                </p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-white font-semibold text-xs hover:bg-amber-600 transition-colors"
                >
                  View Pool ({availableOrders.length})
                </button>
              </div>
            ) : (
              activeTasks.map((ord) => {
                const isLoadingAction = actionLoadingId === ord.id || actionLoadingId === ord.orderId;
                const isDispatched = ['in transit', 'dispatched'].includes((ord.orderStatus || '').toLowerCase());
                const pickupCode = getPickupCode(ord);

                return (
                  <div
                    key={ord.id || ord.orderId}
                    className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                  >
                    {/* Status + pickup code */}
                    <div className="px-4 pt-4 flex items-start justify-between gap-3">
                      <div>
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          isDispatched ? 'text-blue-700' : 'text-orange-700'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isDispatched ? 'bg-blue-500' : 'bg-orange-500'}`} />
                          {isDispatched ? 'On the way' : 'Go to cafeteria'}
                        </span>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{ord.orderId}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500">Pickup code</p>
                        <p className="text-2xl font-semibold font-mono tracking-[0.15em] text-slate-900 leading-tight">{pickupCode}</p>
                      </div>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Route: cafeteria -> hostel */}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center pt-1.5 shrink-0" aria-hidden="true">
                          <span className={`w-2 h-2 rounded-full ${isDispatched ? 'bg-slate-300' : 'bg-orange-500'}`} />
                          <span className="w-px flex-1 bg-slate-200 my-1" />
                          <span className={`w-2 h-2 rounded-full ${isDispatched ? 'bg-blue-500' : 'border-2 border-slate-400'}`} />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div>
                            <p className={`text-base font-semibold truncate ${isDispatched ? 'text-slate-400' : 'text-slate-900'}`}>{ord.cafeteriaName || 'Campus Cafeteria'}</p>
                            <p className="text-xs text-slate-500">Pick up</p>
                          </div>
                          <div>
                            <p className={`text-base font-semibold truncate ${isDispatched ? 'text-slate-900' : 'text-slate-700'}`}>{ord.deliveryAddress || 'Campus Hostel'}</p>
                            <p className="text-xs text-slate-500">Deliver</p>
                          </div>
                        </div>
                      </div>

                      {/* Customer + Phone */}
                      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{ord.customerName}</p>
                          <p className="text-xs text-slate-500">Customer</p>
                        </div>
                        {ord.customerPhone ? (
                          <a
                            href={`tel:${ord.customerPhone.replace(/\D/g, '')}`}
                            className="flex items-center gap-1.5 h-10 px-4 rounded-lg border border-slate-200 text-slate-800 font-medium text-sm hover:bg-slate-50 shrink-0"
                          >
                            <Phone className="w-4 h-4 text-emerald-600" />
                            <span>Call</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">No phone</span>
                        )}
                      </div>

                      {/* Incoming Handover Request Banner */}
                      {ord.handoverRequestedById && (
                        <div className="p-3.5 rounded-xl bg-amber-500 text-white space-y-2 shadow-sm">
                          <div className="flex items-start gap-2">
                            <HandHelping className="w-4 h-4 text-amber-100 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-semibold">Handover Requested!</p>
                                {ord.handoverDistance !== undefined && ord.handoverDistance !== null ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-600/90 text-white text-xs font-semibold tracking-tight shadow-sm">
                                    <MapPin className="w-2.5 h-2.5" />
                                    📍 GPS Verified ({ord.handoverDistance}m away)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-600/90 text-white text-xs font-semibold tracking-tight shadow-sm">
                                    <MapPin className="w-2.5 h-2.5" />
                                    At Cafeteria
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-amber-100 mt-1 leading-snug">
                                <strong>{ord.handoverRequestedByName || 'Another rider'}</strong> is physically at {ord.cafeteriaName} and requested to take over this order.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleHandoverAction(ord.id || ord.orderId, 'accept_handover')}
                              disabled={isLoadingAction}
                              className="flex-1 bg-white hover:bg-emerald-50 text-emerald-800 font-semibold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Release to {ord.handoverRequestedByName?.split(' ')[0] || 'Rider'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleHandoverAction(ord.id || ord.orderId, 'reject_handover')}
                              disabled={isLoadingAction}
                              className="px-3 py-2 rounded-lg bg-amber-600/80 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
                            >
                              Keep Order
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action Buttons */}
                      {!isDispatched ? (
                        <button
                          onClick={() => handleOrderAction(ord.id || ord.orderId, 'pickup')}
                          disabled={isLoadingAction}
                          className="w-full h-12 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold px-4 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isLoadingAction
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <Store className="w-4 h-4" />}
                          <span>I have picked up the food</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOrderAction(ord.id || ord.orderId, 'deliver')}
                          disabled={isLoadingAction}
                          className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold px-4 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isLoadingAction
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />}
                          <span>Delivered to customer</span>
                        </button>
                      )}

                      {/* Secondary Actions: Drop to Pool & Transfer */}
                      <div className="grid grid-cols-2 gap-2 -mt-1">
                        {!isDispatched && (
                          <button
                            type="button"
                            onClick={() => setDropModalOrder(ord)}
                            disabled={isLoadingAction}
                            className="h-10 text-slate-600 hover:bg-slate-50 font-medium px-3 rounded-lg text-sm flex items-center justify-center gap-1.5"
                          >
                            <RotateCcw className="w-4 h-4 text-slate-400" />
                            <span>Drop to pool</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setTransferModalOrder(ord);
                            setSelectedTargetRiderId('');
                          }}
                          disabled={isLoadingAction}
                          className={`${!isDispatched ? 'col-span-1' : 'col-span-2'} h-10 text-slate-600 hover:bg-slate-50 font-medium px-3 rounded-lg text-sm flex items-center justify-center gap-1.5 truncate`}
                        >
                          <ArrowRightLeft className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate">Transfer</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── TAB 3: COMPLETED TODAY ────────────────────────────────────────── */}
        {activeTab === 'completed' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {completedToday.length} delivered today
              </p>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {completedToday.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-300 rounded-xl bg-white p-6">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
                <h3 className="text-sm font-semibold text-slate-700">No Completed Trips Yet</h3>
                <p className="text-xs text-slate-400 mt-1">Orders you complete today will appear here.</p>
              </div>
            ) : (
              completedToday.map((ord) => (
                <div
                  key={ord.id || ord.orderId}
                  className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900">{ord.orderId}</span>
                      <span className="text-xs font-semibold text-emerald-600">• Completed</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {ord.cafeteriaName} → {ord.deliveryAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                    <Clock className="w-3 h-3" />
                    <span>{ord.time || new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* ─────────────────────────────────────────────────────────────
          PEER-TO-PEER ORDER TRANSFER MODAL
      ───────────────────────────────────────────────────────────── */}
      {transferModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Transfer Order</h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{transferModalOrder.orderId}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setTransferModalOrder(null);
                  setSelectedTargetRiderId('');
                }}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order brief summary */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Cafeteria:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[240px]">{transferModalOrder.cafeteriaName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Deliver To:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[240px]">{transferModalOrder.deliveryAddress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Pickup Code:</span>
                <span className="font-semibold text-amber-700">{getPickupCode(transferModalOrder)}</span>
              </div>
            </div>

            {/* Rider selection prompt */}
            <div className="shrink-0">
              <label className="block text-xs font-semibold text-slate-700 mb-0.5">
                Select Rider to Hand Over to:
              </label>
              <p className="text-xs text-slate-400">
                The order will immediately be assigned to this rider in the system.
              </p>
            </div>

            {/* List of other active riders */}
            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {otherRiders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-xs font-medium">No other active dispatch riders currently found.</p>
                </div>
              ) : (
                otherRiders.map((targetRider) => {
                  const isFull = targetRider.activeCount >= MAX_ACTIVE_ORDERS;
                  const isSelected = selectedTargetRiderId === targetRider.id;

                  return (
                    <div
                      key={targetRider.id}
                      onClick={() => {
                        if (!isFull) setSelectedTargetRiderId(targetRider.id);
                      }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isFull
                          ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                          : isSelected
                          ? 'bg-amber-50/80 border-amber-400 ring-2 ring-amber-400/20 shadow-sm cursor-pointer'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-amber-500 text-white'
                              : isFull
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {targetRider.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{targetRider.name}</span>
                            {targetRider.isOnline && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
                            )}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">{targetRider.phone || 'No phone'}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isFull ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            5/5 Full
                          </span>
                        ) : (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            targetRider.activeCount === 0
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {targetRider.activeCount}/5 active
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => {
                  setTransferModalOrder(null);
                  setSelectedTargetRiderId('');
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTransferring || !selectedTargetRiderId}
                onClick={handleTransferOrder}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-sm shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isTransferring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Transferring...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Confirm Handover</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DROP ORDER TO POOL CONFIRMATION MODAL
      ───────────────────────────────────────────────────────────── */}
      {dropModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-700">
                  <RotateCcw className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Drop Order to Pool</h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{dropModalOrder.orderId}</p>
                </div>
              </div>
              <button
                onClick={() => setDropModalOrder(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order summary */}
            <div className="p-3.5 bg-rose-50/50 rounded-xl border border-rose-100 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Cafeteria:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[220px]">{dropModalOrder.cafeteriaName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Destination:</span>
                <span className="font-semibold text-slate-800 truncate max-w-[220px]">{dropModalOrder.deliveryAddress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-semibold text-slate-800">{dropModalOrder.customerName}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-rose-100">
                <span className="text-slate-500 font-medium">Pickup Code:</span>
                <span className="font-semibold text-rose-800 text-sm">{getPickupCode(dropModalOrder)}</span>
              </div>
            </div>

            {/* Explanatory notice */}
            <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <p>
                Dropping this order will unassign it from you and return it to the open dispatch pool so another available rider can pick it up.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isDropping}
                onClick={() => setDropModalOrder(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDropping}
                onClick={handleDropOrder}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm shadow-rose-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isDropping ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Dropping...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Confirm Drop to Pool</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GPS Permission Help & Re-test Modal ──────────────────────────────── */}
      <GpsPermissionModal
        isOpen={showGpsHelpModal}
        onClose={() => setShowGpsHelpModal(false)}
        riderId={rider?.id}
        onSuccess={(_coords) => {
          setGpsStatus('active');
          setShowGpsHelpModal(false);
          showToast('📍 GPS location verified and live!', 'success');
        }}
      />
    </div>
  );
}

