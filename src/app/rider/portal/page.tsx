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
  Clock,
  CheckCircle2,
  PackageCheck,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

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
}

interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  isOnline: boolean;
}

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

  const prevAvailableIdsRef = useRef<Set<string>>(new Set());
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage({ text, type });
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 3500);
  };

  // ── Web Audio Chime Synthesizer ─────────────────────────────────────────────
  const playAlertChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // First note
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.35);

      // Second note (higher pitch)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.55);

      // Mobile vibration
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
      }
    } catch {
      // AudioContext might be restricted until first user interaction
    }
  }, [soundEnabled]);

  // ── Fetch Rider Profile & Orders ────────────────────────────────────────────
  const fetchPortalData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setIsRefreshing(true);

      try {
        const res = await fetch('/api/rider/orders');
        if (res.status === 401) {
          router.push('/rider/login');
          return;
        }

        const data = await res.json();

        if (data.success) {
          if (data.rider) {
            setRider(data.rider);
            setIsOnline(Boolean(data.rider.isOnline));
          }

          const newAvailable: RiderOrder[] = data.available || [];
          const newActive: RiderOrder[] = data.active || [];
          const newCompleted: RiderOrder[] = data.completedToday || [];

          // Detect newly added orders to trigger audio chime
          if (isBackground && prevAvailableIdsRef.current.size > 0) {
            const hasNewOrder = newAvailable.some((ord) => !prevAvailableIdsRef.current.has(ord.orderId));
            if (hasNewOrder) {
              playAlertChime();
              showToast('🔔 New order available in the dispatch pool!', 'success');
            }
          }

          // Update cache of seen available IDs
          prevAvailableIdsRef.current = new Set(newAvailable.map((o) => o.orderId));

          setAvailableOrders(newAvailable);
          setActiveTasks(newActive);
          setCompletedToday(newCompleted);

          // If rider has an active task and currently on available tab, prompt or switch
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

  // Initial Load
  useEffect(() => {
    fetchPortalData(false);
  }, [fetchPortalData]);

  // Live Auto-Poll every 6 seconds for instantaneous order claiming
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPortalData(true);
    }, 6000);

    return () => clearInterval(interval);
  }, [fetchPortalData]);

  // ── Toggle Online / On-Duty Status ──────────────────────────────────────────
  const toggleOnlineStatus = async () => {
    const newStatus = !isOnline;
    setIsOnline(newStatus);

    try {
      const res = await fetch('/api/rider/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOnline: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
      }
    } catch {
      setIsOnline(!newStatus); // revert on error
      showToast('Could not update status. Check your connection.', 'error');
    }
  };

  // ── Logout ──────────────────────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await fetch('/api/rider/auth', { method: 'DELETE' });
    } catch {
      // ignore
    }
    router.push('/rider/login');
  };

  // ── Order Actions: Claim, Pick Up, Deliver ───────────────────────────────────
  const handleOrderAction = async (orderId: string, action: 'claim' | 'pickup' | 'deliver') => {
    setActionLoadingId(orderId);

    try {
      const res = await fetch('/api/rider/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, action }),
      });

      const data = await res.json();

      if (data.success) {
        showToast(data.message, 'success');
        await fetchPortalData(false);
        if (action === 'claim') {
          setActiveTab('active');
        }
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

  // ── Render Helpers ──────────────────────────────────────────────────────────
  const renderBadge = (type: string) => {
    const isSameSide = type?.toLowerCase().includes('same');
    return (
      <span
        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
          isSameSide
            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
        }`}
      >
        {type || 'Standard Delivery'}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto relative shadow-2xl border-x border-slate-900">
      {/* ── Top App Bar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800/80 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Rider identity */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-600 flex items-center justify-center font-bold text-slate-950 text-sm shadow-md shadow-amber-500/20">
              <Bike className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
                {rider?.name || 'Dispatch Rider'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase">
                  {isOnline ? 'On Duty' : 'Off Duty'}
                </span>
              </div>
            </div>
          </div>

          {/* Quick controls: Sound, Online toggle, Logout */}
          <div className="flex items-center gap-2">
            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-xl border transition-all ${
                soundEnabled
                  ? 'bg-slate-800/80 border-slate-700 text-amber-400'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
              title={soundEnabled ? 'Mute Alert Sound' : 'Enable Alert Sound'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Online / Offline switch */}
            <button
              onClick={toggleOnlineStatus}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                isOnline
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <span>{isOnline ? 'Go Offline' : 'Go Online'}</span>
            </button>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 transition-all"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast Banner ─────────────────────────────────────────────────────── */}
      {toastMessage && (
        <div
          className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between border-b transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* ── Tabs Navigation ──────────────────────────────────────────────────── */}
      <div className="bg-slate-900/60 p-2 border-b border-slate-800/80 sticky top-[61px] z-30 backdrop-blur-md">
        <div className="grid grid-cols-3 gap-1.5 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
          {/* Available Tab */}
          <button
            onClick={() => setActiveTab('available')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'available'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>Pool</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'available'
                    ? 'bg-slate-950 text-amber-400'
                    : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                }`}
              >
                {availableOrders.length}
              </span>
            </div>
            <span className="text-[9px] opacity-80 font-normal">Available</span>
          </button>

          {/* Active Tasks Tab */}
          <button
            onClick={() => setActiveTab('active')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'active'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>Active</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'active'
                    ? 'bg-slate-950 text-amber-400'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                }`}
              >
                {activeTasks.length}
              </span>
            </div>
            <span className="text-[9px] opacity-80 font-normal">In Transit</span>
          </button>

          {/* Completed Today Tab */}
          <button
            onClick={() => setActiveTab('completed')}
            className={`py-2 px-1 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 ${
              activeTab === 'completed'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span>Done</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                  activeTab === 'completed'
                    ? 'bg-slate-950 text-amber-400'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {completedToday.length}
              </span>
            </div>
            <span className="text-[9px] opacity-80 font-normal">Today</span>
          </button>
        </div>
      </div>

      {/* ── Main Orders Container ────────────────────────────────────────────── */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 pb-20">
        {/* Offline notice */}
        {!isOnline && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>You are currently <strong>Off Duty</strong>. Tap Online to claim orders.</span>
            </div>
            <button
              onClick={toggleOnlineStatus}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] shrink-0 ml-2"
            >
              Go Online
            </button>
          </div>
        )}

        {/* ── TAB 1: AVAILABLE POOL ─────────────────────────────────────────── */}
        {activeTab === 'available' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-semibold text-slate-300">
                Unassigned Orders ({availableOrders.length})
              </span>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {availableOrders.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-3xl bg-slate-900/30 p-6">
                <Bike className="w-12 h-12 mx-auto mb-3 text-slate-600 stroke-[1.5]" />
                <h3 className="text-sm font-bold text-slate-300">No Orders in the Pool</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  New campus orders will pop up here live with a sound alert as soon as customers pay.
                </p>
              </div>
            ) : (
              availableOrders.map((ord) => {
                const isLoadingAction = actionLoadingId === ord.id || actionLoadingId === ord.orderId;

                return (
                  <div
                    key={ord.id || ord.orderId}
                    className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-lg relative overflow-hidden transition-all hover:border-slate-700"
                  >
                    {/* Top status & ID */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        {ord.orderId}
                      </span>
                      {renderBadge(ord.deliveryType)}
                    </div>

                    {/* Cafeteria Pickup */}
                    <div className="flex items-start gap-2.5 mb-2.5">
                      <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400 mt-0.5 shrink-0">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                          Pickup Location
                        </div>
                        <div className="text-sm font-bold text-white leading-snug">
                          {ord.cafeteriaName || 'Campus Cafeteria'}
                        </div>
                      </div>
                    </div>

                    {/* Destination Delivery */}
                    <div className="flex items-start gap-2.5 mb-4">
                      <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-400 mt-0.5 shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                          Drop-Off Hostel
                        </div>
                        <div className="text-xs font-semibold text-slate-200 leading-snug">
                          {ord.deliveryAddress || 'Campus Hostel'}
                        </div>
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 mb-4 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium text-slate-300">{ord.customerName}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>{ord.time || new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Claim Button */}
                    <button
                      onClick={() => handleOrderAction(ord.id || ord.orderId, 'claim')}
                      disabled={isLoadingAction || !isOnline}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black py-3 px-4 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-amber-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isLoadingAction ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                          <span>Accepting Delivery...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 stroke-[2.5]" />
                          <span>Accept Delivery Run</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── TAB 2: ACTIVE TASKS ───────────────────────────────────────────── */}
        {activeTab === 'active' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-semibold text-slate-300">
                My Active Deliveries ({activeTasks.length})
              </span>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {activeTasks.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-3xl bg-slate-900/30 p-6">
                <PackageCheck className="w-12 h-12 mx-auto mb-3 text-slate-600 stroke-[1.5]" />
                <h3 className="text-sm font-bold text-slate-300">No Active Dispatches</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  You have not accepted any deliveries yet. Head to the <strong>Pool</strong> tab to claim available orders.
                </p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="mt-4 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                >
                  View Available Orders ({availableOrders.length})
                </button>
              </div>
            ) : (
              activeTasks.map((ord) => {
                const isLoadingAction = actionLoadingId === ord.id || actionLoadingId === ord.orderId;
                const isDispatched = (ord.orderStatus || '').toLowerCase().includes('disp');

                return (
                  <div
                    key={ord.id || ord.orderId}
                    className="p-5 rounded-3xl bg-slate-900 border-2 border-amber-500/40 shadow-xl relative overflow-hidden"
                  >
                    {/* Status Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        {ord.orderId}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-black border uppercase tracking-wider ${
                          isDispatched
                            ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}
                      >
                        {isDispatched ? '🚴 In Transit' : '⏳ Go to Cafeteria'}
                      </span>
                    </div>

                    {/* Step 1: Pickup info */}
                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 mb-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-xl bg-orange-500/10 text-orange-400 mt-0.5 shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            Step 1: Pick Up Food Here
                          </div>
                          <div className="text-sm font-bold text-white">
                            {ord.cafeteriaName || 'Campus Cafeteria'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Step 2: Destination info */}
                    <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 mb-3">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-xl bg-blue-500/10 text-blue-400 mt-0.5 shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            Step 2: Deliver to Hostel
                          </div>
                          <div className="text-sm font-bold text-slate-100">
                            {ord.deliveryAddress || 'Campus Hostel'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Customer contact row with one-tap call */}
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 mb-4">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="text-xs font-bold text-white">{ord.customerName}</div>
                          <div className="text-[10px] text-slate-400">Recipient</div>
                        </div>
                      </div>

                      {/* One-Tap Call Customer Button */}
                      <a
                        href="tel:08000000000"
                        onClick={(e) => {
                          // Prompt or trigger native phone dialer
                          const customerPhone = prompt(
                            `Call recipient "${ord.customerName}". Enter or confirm phone:`,
                            '080'
                          );
                          if (customerPhone) {
                            window.location.href = `tel:${customerPhone.replace(/\D/g, '')}`;
                          }
                          e.preventDefault();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                      >
                        <Phone className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Call Recipient</span>
                      </a>
                    </div>

                    {/* 3-Step Lifecycle Action Buttons */}
                    {!isDispatched ? (
                      <button
                        onClick={() => handleOrderAction(ord.id || ord.orderId, 'pickup')}
                        disabled={isLoadingAction}
                        className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black py-3.5 px-4 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoadingAction ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <Store className="w-4 h-4" />
                        )}
                        <span>1. Confirm Food Picked Up from Cafeteria</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleOrderAction(ord.id || ord.orderId, 'deliver')}
                        disabled={isLoadingAction}
                        className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black py-3.5 px-4 rounded-2xl text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isLoadingAction ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                        )}
                        <span>2. Confirm Delivered to Customer</span>
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ── TAB 3: COMPLETED TODAY ────────────────────────────────────────── */}
        {activeTab === 'completed' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="font-semibold text-slate-300">
                Delivered Today ({completedToday.length} runs)
              </span>
              <button
                onClick={() => fetchPortalData(false)}
                disabled={isRefreshing}
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:underline"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {completedToday.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-3xl bg-slate-900/30 p-6">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-slate-600 stroke-[1.5]" />
                <h3 className="text-sm font-bold text-slate-300">No Completed Trips Today</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                  Orders you deliver today will show up here as your proof of completed runs.
                </p>
              </div>
            ) : (
              completedToday.map((ord) => (
                <div
                  key={ord.id || ord.orderId}
                  className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>{ord.orderId}</span>
                        <span className="text-[10px] text-emerald-400 font-semibold">• Delivered</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {ord.cafeteriaName} → {ord.deliveryAddress}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-mono text-slate-400">
                      {ord.time || new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}
