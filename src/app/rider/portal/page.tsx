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
} from 'lucide-react';
import { pushNotification, buildRiderNotification } from '@/lib/notifications';
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner';

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
  riderId?: string | null;
  rider?: {
    id: string;
    name: string;
    phone?: string;
  } | null;
}

interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Peer-to-Peer Transfer States
  const [otherRiders, setOtherRiders] = useState<OtherRider[]>([]);
  const [transferModalOrder, setTransferModalOrder] = useState<RiderOrder | null>(null);
  const [selectedTargetRiderId, setSelectedTargetRiderId] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);

  // Cafeteria Filter & Takeover States
  const [selectedCafeteria, setSelectedCafeteria] = useState<string>('all');
  const [takeoverModalOrder, setTakeoverModalOrder] = useState<RiderOrder | null>(null);
  const [isTakingOver, setIsTakingOver] = useState(false);

  const prevAvailableIdsRef = useRef<Set<string>>(new Set());
  const prevActiveIdsRef = useRef<Set<string>>(new Set());
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 4000);
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

  // ── Fetch Rider Profile & Orders ─────────────────────────────────────────────
  const fetchPortalData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setIsRefreshing(true);
      const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
      try {
        const headers: Record<string, string> = {};
        if (localRiderId) headers['x-rider-id'] = localRiderId;
        const res = await fetch('/api/rider/orders', { headers });
        if (res.status === 401) {
          if (!isBackground && !localRiderId) router.push('/rider/login');
          return;
        }
        const data = await res.json();
        if (data.success) {
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
            const hasNewOrder = newAvailable.some((ord) => !prevAvailableIdsRef.current.has(ord.orderId));
            if (hasNewOrder) {
              playAlertChime();
              showToast('🔔 New order available in the dispatch pool!', 'success');
            }
          }
          prevAvailableIdsRef.current = new Set(newAvailable.map((o) => o.orderId));

          // Real-time eviction detection: if an order was taken over from this rider by another rider at the cafeteria
          if (isBackground && prevActiveIdsRef.current.size > 0) {
            const currentActiveIds = new Set(newActive.map((o) => o.orderId || o.id));
            for (const prevId of prevActiveIdsRef.current) {
              if (!currentActiveIds.has(prevId)) {
                const wasDelivered = newCompleted.some((c) => (c.orderId || c.id) === prevId);
                if (!wasDelivered) {
                  playAlertChime();
                  showToast('🔔 An active delivery was picked up at the cafeteria by another rider.', 'success');
                }
              }
            }
          }
          prevActiveIdsRef.current = new Set(newActive.map((o) => o.orderId || o.id));

          setAvailableOrders(newAvailable);
          setActiveTasks(newActive);
          setCompletedToday(newCompleted);
          if (data.otherRiders) {
            setOtherRiders(data.otherRiders);
          }
          if (newActive.length > 0 && activeTasks.length === 0 && !isBackground) {
            setActiveTab('active');
          }
        }
      } catch (err: any) {
        console.error('Failed to load rider orders:', err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [router, playAlertChime, activeTasks.length]
  );

  // ── High-Speed Real-Time Synchronization (3.5s cycle + BroadcastChannel) ────
  useEffect(() => {
    let isOffHours = false;
    let inFlightFetch = false;

    // 1. Fast local portal data fetch (Direct database, sub-30ms)
    const fetchFast = async () => {
      if (inFlightFetch) return;
      inFlightFetch = true;
      try {
        await fetchPortalData(true);
      } finally {
        inFlightFetch = false;
      }
    };

    // 2. Periodic external GoChow order sync (every 10s during operating hours)
    const triggerExternalSync = async () => {
      try {
        if (!isOffHours) {
          const syncRes = await fetch('/api/sync-orders', { method: 'POST' });
          const syncData = await syncRes.json();
          if (syncData && syncData.inOperatingWindow === false) {
            isOffHours = true;
          } else {
            isOffHours = false;
          }
          if (syncData?.hasChanges) {
            await fetchPortalData(true);
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('orders-synced', { detail: syncData }));
            }
          }
        }
      } catch {
        // ignore
      }
    };

    // Initial load
    fetchPortalData(false);
    triggerExternalSync();

    // Fast 3.5s poll for instant state transitions across riders
    const fastInterval = setInterval(fetchFast, 3500);

    // 10s background sync from external GoChow platform
    const syncInterval = setInterval(triggerExternalSync, 10000);

    // Instant sync on screen unlock / tab focus
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchFast();
        triggerExternalSync();
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

    const handleCustomRiderActivity = () => {
      fetchFast();
    };
    window.addEventListener('rider-activity', handleCustomRiderActivity);
    window.addEventListener('orders-synced', handleCustomRiderActivity);

    return () => {
      clearInterval(fastInterval);
      clearInterval(syncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('rider-activity', handleCustomRiderActivity);
      window.removeEventListener('orders-synced', handleCustomRiderActivity);
      if (channel) channel.close();
    };
  }, [fetchPortalData]);

  // ── Toggle Online Status ────────────────────────────────────────────────────
  const toggleOnlineStatus = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isOnline: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        if (typeof window !== 'undefined' && rider) {
          localStorage.setItem('rider_session', JSON.stringify({ ...rider, isOnline: newStatus }));
        }
      }
    } catch {
      setIsOnline(!newStatus);
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
        showToast(data.message, 'success');
        await fetchPortalData(false);
        if (action === 'claim') setActiveTab('active');
        else if (action === 'deliver') setActiveTab('completed');
        
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

  // ── Cafeteria Order Takeover Action ──────────────────────────────────────────
  const handleTakeoverOrder = async () => {
    if (!takeoverModalOrder) return;
    if (activeTasks.length >= MAX_ACTIVE_ORDERS) {
      showToast(`You already have ${MAX_ACTIVE_ORDERS} active orders. Deliver one before picking up more.`, 'error');
      setTakeoverModalOrder(null);
      return;
    }

    setIsTakingOver(true);
    const localRiderId = typeof window !== 'undefined' ? localStorage.getItem('rider_id') : null;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (localRiderId) headers['x-rider-id'] = localRiderId;
      const res = await fetch('/api/rider/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          orderId: takeoverModalOrder.id || takeoverModalOrder.orderId,
          action: 'takeover',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'Order picked up at cafeteria & assigned to you!', 'success');
        broadcastRiderUpdate('takeover', takeoverModalOrder.orderId, data.order);
        setTakeoverModalOrder(null);
        await fetchPortalData(false);
        setActiveTab('active');
      } else {
        showToast(data.error || 'Could not pick up order.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error.', 'error');
    } finally {
      setIsTakingOver(false);
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
    const list =
      selectedCafeteria === 'all'
        ? [...availableOrders]
        : availableOrders.filter(
            (o) => (o.cafeteriaName || '').trim().toLowerCase() === selectedCafeteria.toLowerCase()
          );

    // Prioritize accepted/claimed orders awaiting pickup to the very top of the list
    return list.sort((a, b) => {
      const aIsClaimed = Boolean(a.riderId || a.rider);
      const bIsClaimed = Boolean(b.riderId || b.rider);

      if (aIsClaimed && !bIsClaimed) return -1;
      if (!aIsClaimed && bIsClaimed) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [availableOrders, selectedCafeteria]);

  // ── Pickup code: last 4 chars of orderId ─────────────────────────────────────
  const getPickupCode = (orderId: string) => {
    const clean = orderId.replace(/[-\s]/g, '');
    return clean.slice(-4).toUpperCase();
  };

  const atCapacity = activeTasks.length >= MAX_ACTIVE_ORDERS;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto shadow-lg">
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
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm shrink-0">
              <Bike className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">
                {rider?.name || 'Dispatch Rider'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                  }`}
                />
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  {isOnline ? 'On Duty' : 'Off Duty'}
                </span>
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
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
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
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 ml-2 shrink-0 font-bold">✕</button>
        </div>
      )}

      {/* ── Capacity Banner ───────────────────────────────────────────────────── */}
      {atCapacity && activeTab === 'available' && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-800">Active Order Limit Reached (5/5)</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Complete or deliver an active order to unlock new pickups.
            </p>
          </div>
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────────────── */}
      <div className="sticky top-[61px] z-30 bg-white border-b border-slate-200 px-4 py-3">
        <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
          {/* Pool tab */}
          <button
            onClick={() => setActiveTab('available')}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
              activeTab === 'available'
                ? 'bg-white text-amber-700 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>Pool</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeTab === 'available' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {availableOrders.length}
              </span>
            </div>
            <span className="text-[9px] font-normal opacity-70">Available</span>
          </button>

          {/* Active tab */}
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
              activeTab === 'active'
                ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>Active</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeTab === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {activeTasks.length}/{MAX_ACTIVE_ORDERS}
              </span>
            </div>
            <span className="text-[9px] font-normal opacity-70">In Transit</span>
          </button>

          {/* Done tab */}
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-2 px-1 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
              activeTab === 'completed'
                ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>Done</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-black ${
                activeTab === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
              }`}>
                {completedToday.length}
              </span>
            </div>
            <span className="text-[9px] font-normal opacity-70">Today</span>
          </button>
        </div>
      </div>

      {/* ── Main Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 p-4 space-y-3 pb-10">

        {/* Mobile Phone Status Bar Push Notification Activation Banner */}
        <NotificationPermissionBanner userType="rider" riderId={rider?.id} />

        {/* Offline notice */}
        {!isOnline && (
          <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-600 text-xs">
              <WifiOff className="w-4 h-4 text-slate-400" />
              <span>You are <strong>Off Duty</strong>. Go online to claim orders.</span>
            </div>
            <button
              onClick={toggleOnlineStatus}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs shrink-0 ml-2 hover:bg-emerald-700 transition-colors"
            >
              Go Online
            </button>
          </div>
        )}

        {/* ── TAB 1: AVAILABLE POOL ──────────────────────────────────────────── */}
        {activeTab === 'available' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Dispatch Pool ({filteredAvailableOrders.length})
                </p>
                {selectedCafeteria !== 'all' && (
                  <button
                    onClick={() => setSelectedCafeteria('all')}
                    className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200"
                  >
                    Clear Filter ✕
                  </button>
                )}
              </div>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium"
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border ${
                    selectedCafeteria === 'all'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-3 h-3" />
                  <span>All Cafeterias</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    selectedCafeteria === 'all' ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {availableOrders.length}
                  </span>
                </button>

                {uniqueCafeterias.map((caf) => {
                  const isSelected = selectedCafeteria.toLowerCase() === caf.name.toLowerCase();
                  return (
                    <button
                      key={caf.name}
                      type="button"
                      onClick={() => setSelectedCafeteria(isSelected ? 'all' : caf.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 border ${
                        isSelected
                          ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'
                      }`}
                    >
                      <Store className="w-3 h-3" />
                      <span>{caf.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                        isSelected ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {caf.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {filteredAvailableOrders.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl bg-white p-6">
                <Bike className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
                <h3 className="text-sm font-semibold text-slate-700">
                  {selectedCafeteria === 'all' ? 'No Orders in the Pool' : `No Orders at ${selectedCafeteria}`}
                </h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  {selectedCafeteria === 'all'
                    ? 'New orders will appear here with a sound alert once customers pay.'
                    : 'Try selecting "All Cafeterias" or checking other cafeteria locations.'}
                </p>
                {selectedCafeteria !== 'all' && (
                  <button
                    onClick={() => setSelectedCafeteria('all')}
                    className="mt-3 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold"
                  >
                    View All Cafeterias ({availableOrders.length})
                  </button>
                )}
              </div>
            ) : (
              filteredAvailableOrders.map((ord) => {
                const isLoadingAction = actionLoadingId === ord.id || actionLoadingId === ord.orderId;
                const isAtCap = atCapacity;
                const isPeerClaimed = Boolean(ord.rider && ord.rider.id !== rider?.id);

                return (
                  <div
                    key={ord.id || ord.orderId}
                    className={`bg-white rounded-2xl border shadow-sm overflow-hidden space-y-0 transition-all ${
                      isPeerClaimed
                        ? 'border-indigo-200 ring-1 ring-indigo-100'
                        : 'border-slate-200'
                    }`}
                  >
                    {/* Peer Claimed Header Tag */}
                    {isPeerClaimed && (
                      <div className="bg-indigo-50/90 border-b border-indigo-100 px-4 py-2 flex items-center justify-between text-indigo-900">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-indigo-600" />
                          <span className="text-xs font-bold">
                            Accepted by <span className="underline decoration-indigo-300">{ord.rider?.name}</span>
                          </span>
                        </div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          Awaiting Pickup
                        </span>
                      </div>
                    )}

                    <div className="p-4 space-y-3">
                      {/* Cafeteria */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Cafeteria</p>
                          <p className="text-sm font-bold text-slate-900 truncate">{ord.cafeteriaName || 'Campus Cafeteria'}</p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* Location */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Location</p>
                          <p className="text-sm font-semibold text-slate-800 truncate">{ord.deliveryAddress || 'Campus Hostel'}</p>
                        </div>
                      </div>

                      <div className="border-t border-slate-100" />

                      {/* Customer Name */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                          <User className="w-4 h-4 text-slate-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Customer</p>
                          <p className="text-sm font-medium text-slate-700 truncate">{ord.customerName}</p>
                        </div>
                      </div>

                      {/* Action Button: Peer Takeover vs Normal Claim */}
                      {isPeerClaimed ? (
                        <button
                          onClick={() => setTakeoverModalOrder(ord)}
                          disabled={!isOnline || isAtCap}
                          title={isAtCap ? 'You have reached the 5-order limit' : undefined}
                          className={`w-full font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-1 ${
                            isAtCap || !isOnline
                              ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 active:scale-[0.98]'
                          }`}
                        >
                          {isAtCap ? (
                            <>
                              <ShieldAlert className="w-4 h-4" />
                              <span>Limit Reached (5/5)</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4 fill-current" />
                              <span>I'm at Cafeteria — Pick Up Now</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOrderAction(ord.id || ord.orderId, 'claim')}
                          disabled={isLoadingAction || !isOnline || isAtCap}
                          title={isAtCap ? 'You have reached the 5-order limit' : undefined}
                          className={`w-full font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 mt-1 ${
                            isAtCap || !isOnline
                              ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                              : 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm active:scale-[0.98]'
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
                              <Sparkles className="w-4 h-4" />
                              <span>Accept Delivery</span>
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
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                My Active Deliveries ({activeTasks.length}/{MAX_ACTIVE_ORDERS})
              </p>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {activeTasks.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl bg-white p-6">
                <PackageCheck className="w-10 h-10 mx-auto mb-3 text-slate-300 stroke-[1.5]" />
                <h3 className="text-sm font-semibold text-slate-700">No Active Dispatches</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Head to the Pool tab to claim available orders.
                </p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-white font-bold text-xs hover:bg-amber-600 transition-colors"
                >
                  View Pool ({availableOrders.length})
                </button>
              </div>
            ) : (
              activeTasks.map((ord) => {
                const isLoadingAction = actionLoadingId === ord.id || actionLoadingId === ord.orderId;
                const isDispatched = (ord.orderStatus || '').toLowerCase().includes('disp');
                const pickupCode = getPickupCode(ord.orderId);

                return (
                  <div
                    key={ord.id || ord.orderId}
                    className="bg-white rounded-2xl border-2 border-amber-300 shadow-md overflow-hidden"
                  >
                    {/* Status header strip */}
                    <div className={`px-4 py-2.5 flex items-center justify-between ${
                      isDispatched ? 'bg-blue-50 border-b border-blue-100' : 'bg-amber-50 border-b border-amber-100'
                    }`}>
                      <span className="text-[10px] font-mono font-bold text-slate-500">{ord.orderId}</span>
                      <span className={`text-[11px] font-black uppercase tracking-wide ${
                        isDispatched ? 'text-blue-700' : 'text-amber-700'
                      }`}>
                        {isDispatched ? '🚴 In Transit' : '⏳ Awaiting Pickup'}
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                      {/* Step 1: Cafeteria */}
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-50 border border-orange-100">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4 text-orange-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">Step 1 · Pick Up Here</p>
                          <p className="text-sm font-bold text-slate-900 truncate">{ord.cafeteriaName || 'Campus Cafeteria'}</p>
                        </div>
                      </div>

                      {/* Step 2: Location */}
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Step 2 · Deliver Here</p>
                          <p className="text-sm font-bold text-slate-900 truncate">{ord.deliveryAddress || 'Campus Hostel'}</p>
                        </div>
                      </div>

                      {/* Pickup Code */}
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center shrink-0">
                          <Hash className="w-4 h-4 text-amber-800" />
                        </div>
                        <div>
                          <p className="text-[10px] text-amber-700 font-bold uppercase tracking-wider">Pickup Code</p>
                          <p className="text-xl font-black text-amber-900 tracking-[0.2em]">{pickupCode}</p>
                        </div>
                      </div>

                      {/* Customer + Phone */}
                      <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{ord.customerName}</p>
                            <p className="text-[10px] text-slate-500">Recipient</p>
                          </div>
                        </div>

                        {ord.customerPhone ? (
                          <a
                            href={`tel:${ord.customerPhone.replace(/\D/g, '')}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 transition-colors shadow-sm"
                          >
                            <Phone className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Call</span>
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No phone on file</span>
                        )}
                      </div>

                      {/* Action Buttons */}
                      {!isDispatched ? (
                        <button
                          onClick={() => handleOrderAction(ord.id || ord.orderId, 'pickup')}
                          disabled={isLoadingAction}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                        >
                          {isLoadingAction
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <Store className="w-4 h-4" />}
                          <span>1. Confirm Food Picked Up</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOrderAction(ord.id || ord.orderId, 'deliver')}
                          disabled={isLoadingAction}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                        >
                          {isLoadingAction
                            ? <RefreshCw className="w-4 h-4 animate-spin" />
                            : <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />}
                          <span>2. Confirm Completed</span>
                        </button>
                      )}

                      {/* Secondary Action: Hand Over / Transfer to Another Rider */}
                      <button
                        type="button"
                        onClick={() => {
                          setTransferModalOrder(ord);
                          setSelectedTargetRiderId('');
                        }}
                        disabled={isLoadingAction}
                        className="w-full bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] border border-slate-200"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" />
                        <span>Hand Over / Transfer to Another Rider</span>
                      </button>
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
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Completed Today ({completedToday.length} runs)
              </p>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-amber-600 hover:text-amber-700 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {completedToday.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-slate-300 rounded-2xl bg-white p-6">
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
                      <span className="text-xs font-bold text-slate-900">{ord.orderId}</span>
                      <span className="text-[10px] font-semibold text-emerald-600">• Completed</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {ord.cafeteriaName} → {ord.deliveryAddress}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-slate-400 shrink-0">
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
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Transfer Order</h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{transferModalOrder.orderId}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setTransferModalOrder(null);
                  setSelectedTargetRiderId('');
                }}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order brief summary */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Cafeteria:</span>
                <span className="font-bold text-slate-800 truncate max-w-[240px]">{transferModalOrder.cafeteriaName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Deliver To:</span>
                <span className="font-bold text-slate-800 truncate max-w-[240px]">{transferModalOrder.deliveryAddress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Pickup Code:</span>
                <span className="font-black text-amber-700 tracking-widest">{getPickupCode(transferModalOrder.orderId)}</span>
              </div>
            </div>

            {/* Rider selection prompt */}
            <div className="shrink-0">
              <label className="block text-xs font-bold text-slate-700 mb-0.5">
                Select Rider to Hand Over to:
              </label>
              <p className="text-[11px] text-slate-400">
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
                          className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
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
                          <p className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{targetRider.name}</span>
                            {targetRider.isOnline && (
                              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono">{targetRider.phone || 'No phone'}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {isFull ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            5/5 Full
                          </span>
                        ) : (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
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
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTransferring || !selectedTargetRiderId}
                onClick={handleTransferOrder}
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
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
          CAFETERIA ORDER TAKEOVER CONFIRMATION MODAL
      ───────────────────────────────────────────────────────────── */}
      {takeoverModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 w-full max-w-lg overflow-hidden shadow-2xl p-5 space-y-4 animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-150 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Pick Up from Cafeteria</h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{takeoverModalOrder.orderId}</p>
                </div>
              </div>
              <button
                onClick={() => setTakeoverModalOrder(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order summary */}
            <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Currently Claimed By:</span>
                <span className="font-extrabold text-indigo-900">{takeoverModalOrder.rider?.name || 'Another Rider'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Cafeteria:</span>
                <span className="font-bold text-slate-800 truncate max-w-[220px]">{takeoverModalOrder.cafeteriaName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Delivery Destination:</span>
                <span className="font-bold text-slate-800 truncate max-w-[220px]">{takeoverModalOrder.deliveryAddress}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-800">{takeoverModalOrder.customerName}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-indigo-100">
                <span className="text-slate-500 font-medium">Pickup Code:</span>
                <span className="font-black text-indigo-800 tracking-widest text-sm">{getPickupCode(takeoverModalOrder.orderId)}</span>
              </div>
            </div>

            {/* Explanatory notice */}
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                Are you physically present at <strong>{takeoverModalOrder.cafeteriaName}</strong>? Confirming will mark this order as <strong>In Transit</strong> and reassign the delivery &amp; payout to you.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                disabled={isTakingOver}
                onClick={() => setTakeoverModalOrder(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isTakingOver}
                onClick={handleTakeoverOrder}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isTakingOver ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Picking up...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Confirm Cafeteria Pickup</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
