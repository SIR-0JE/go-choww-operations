'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle2, AlertCircle, Calendar, Menu } from 'lucide-react';
import { useSidebar } from './AppLayout';

const POLL_INTERVAL_MS = 15_000; // 15 seconds

interface HeaderProps {
  onSyncComplete?: () => void;
  lastUpdated?: string;
  isDbConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSyncComplete }) => {
  // Manual sync state
  const [isSyncing, setIsSyncing] = useState(false);
  // Auto-poll state
  const [isPolling, setIsPolling] = useState(false);
  // Toast
  const [syncToast, setSyncToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const { openSidebar } = useSidebar();
  const router = useRouter();
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSyncToast({ message, type });
    toastTimerRef.current = setTimeout(() => setSyncToast(null), 5000);
  }, []);

  // ── Core sync function (shared by auto-poll and manual button) ─────────────
  const runSync = useCallback(
    async (options: { silent: boolean }) => {
      try {
        const res = await fetch('/api/sync-orders', { method: 'POST' });
        const data = await res.json();

        if (res.ok && data.success) {
          const hasChanges = data.hasChanges ?? (data.newlySyncedCount > 0 || data.statusUpdatedCount > 0);

          if (!options.silent || hasChanges) {
            // Auto-poll: only toast if something actually changed
            // Manual: always toast so user gets confirmation
            showToast(
              data.message || `Sync complete — ${data.newlySyncedCount ?? 0} new order(s).`,
              'success'
            );
          }

          if (hasChanges) {
            if (onSyncComplete) onSyncComplete();
            router.refresh();
          }
        } else if (!options.silent) {
          showToast(data.error || 'Failed to sync orders', 'error');
        }
      } catch (err: any) {
        if (!options.silent) {
          showToast(err?.message || 'Network error while syncing', 'error');
        }
      }
    },
    [onSyncComplete, router, showToast]
  );

  // ── Auto-poll: runs every 10 seconds on every page ─────────────────────────
  useEffect(() => {
    const poll = async () => {
      setIsPolling(true);
      await runSync({ silent: true });
      setIsPolling(false);
    };

    // Run immediately on mount to fix any stale statuses right away
    poll();

    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [runSync]);

  // ── Manual sync button handler ──────────────────────────────────────────────
  const handleSyncOrders = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    await runSync({ silent: false });
    setIsSyncing(false);
  };

  // ── Live badge state ────────────────────────────────────────────────────────
  const badgeText = isPolling ? 'Syncing…' : 'Live';
  const badgeDotClass = isPolling
    ? 'bg-blue-500 animate-pulse'
    : 'bg-emerald-500 animate-pulse';
  const badgeClass = isPolling
    ? 'bg-blue-50 text-blue-700 border-blue-200/80'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200/80';

  return (
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-sm sticky top-0 z-30">
      {/* Top Header Bar */}
      <div className="px-4 sm:px-8 py-3.5 max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Hamburger (mobile) + Greeting & Live System Status */}
        <div className="flex items-center gap-3">
          <button
            onClick={openSidebar}
            className="lg:hidden p-2 rounded-xl border border-slate-200/80 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shrink-0"
            aria-label="Open mobile navigation menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
                Welcome back, Admin
              </h2>
              {/* Live / Syncing badge */}
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors duration-300 ${badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${badgeDotClass}`} />
                {badgeText}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
              Centralized Logistics &amp; Operational Settlement Platform
            </p>
          </div>
        </div>

        {/* Right: Date Badge, Sync Button & User Avatar */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Live Date Badge */}
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-medium text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>

          {/* Manual Sync Button */}
          <button
            id="sync-orders-btn"
            onClick={handleSyncOrders}
            disabled={isSyncing}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-semibold text-xs tracking-tight text-white transition-all shadow-sm ${
              isSyncing
                ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                : 'bg-slate-900 hover:bg-slate-800 active:scale-[0.98]'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Orders'}</span>
          </button>

          {/* User Profile Badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200/80">
            <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-xs font-bold text-brand-700 select-none shadow-sm">
              AD
            </div>
            <div className="hidden xl:block text-left text-xs">
              <div className="font-semibold text-slate-800 leading-none">Niyi</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5">Admin Ops</div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast notification */}
      {syncToast && (
        <div
          className={`px-4 sm:px-8 py-2.5 text-xs font-medium flex items-center justify-between border-t transition-all ${
            syncToast.type === 'success'
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : 'bg-rose-50/80 border-rose-200 text-rose-900'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              {syncToast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{syncToast.message}</span>
            </div>
            <button
              onClick={() => setSyncToast(null)}
              className="text-slate-400 hover:text-slate-700 font-bold ml-4"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
