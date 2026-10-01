'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, CheckCircle2, AlertCircle, Menu } from 'lucide-react';
import { useSidebar } from './AppLayout';
import { pushNotification } from '@/lib/notifications';

const DEFAULT_POLL_INTERVAL_MS = 15_000; // 15 seconds

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

  // Live schedule status
  const [syncScheduleStatus, setSyncScheduleStatus] = useState<{
    isOperating: boolean;
    badgeText: string;
    statusText: string;
    mode: string;
    intervalSeconds?: number;
  } | null>(null);

  const { openSidebar } = useSidebar();
  const router = useRouter();
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isSyncRunningRef = useRef(false);
  const onSyncCompleteRef = useRef(onSyncComplete);

  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  // ── Fetch current sync schedule status & listen for updates ─────────────────
  useEffect(() => {
    const fetchScheduleStatus = async () => {
      try {
        const res = await fetch('/api/settings/sync');
        const data = await res.json();
        if (data.success && data.status) {
          setSyncScheduleStatus({
            ...data.status,
            intervalSeconds: data.settings?.intervalSeconds || 15,
          });
        }
      } catch {
        // ignore
      }
    };

    fetchScheduleStatus();

    const handleSettingsUpdated = (e: any) => {
      if (e?.detail?.status) {
        setSyncScheduleStatus({
          ...e.detail.status,
          intervalSeconds: e.detail.settings?.intervalSeconds || 15,
        });
      } else {
        fetchScheduleStatus();
      }
    };

    window.addEventListener('sync-settings-updated', handleSettingsUpdated);
    return () => window.removeEventListener('sync-settings-updated', handleSettingsUpdated);
  }, []);

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setSyncToast({ message, type });
    toastTimerRef.current = setTimeout(() => setSyncToast(null), 5000);
  }, []);

  // ── Core sync function (shared by auto-poll and manual button) ─────────────
  const runSync = useCallback(
    async (options: { silent: boolean; force?: boolean }) => {
      if (isSyncRunningRef.current) return;
      isSyncRunningRef.current = true;

      // Watchdog: force unlock after 10s if network ever hangs
      const watchdog = setTimeout(() => {
        isSyncRunningRef.current = false;
      }, 10000);

      const controller = new AbortController();
      const abortTimeout = setTimeout(() => controller.abort(), 9000);

      try {
        const res = await fetch('/api/sync-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: Boolean(options.force) }),
          signal: controller.signal,
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (data.operatingStatus) {
            setSyncScheduleStatus((prev) => ({
              ...prev,
              ...data.operatingStatus,
            }));
          }

          const hasChanges = Boolean(data.hasChanges ?? (data.newlySyncedCount > 0 || data.statusUpdatedCount > 0));

          if (!options.silent || hasChanges) {
            showToast(
              data.message || `Sync complete — ${data.newlySyncedCount ?? 0} new order(s).`,
              'success'
            );
          }

          // Persist new order arrival to notification store
          if (data.newlySyncedCount && data.newlySyncedCount > 0) {
            pushNotification({
              type: 'new_order',
              title: 'New Orders Synced',
              body: `${data.newlySyncedCount} new order${data.newlySyncedCount > 1 ? 's' : ''} arrived from GoChoww`,
            });
          }

          // Only notify listening components if there were genuine new orders or status updates
          if (hasChanges && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('orders-synced', { detail: data }));
          }

          if (hasChanges && onSyncCompleteRef.current) {
            onSyncCompleteRef.current();
          }
          // Note: router.refresh() is intentionally removed to avoid disruptive DOM re-renders and input focus loss
        } else if (!options.silent) {
          showToast(data.error || 'Failed to sync orders', 'error');
        }
      } catch (err: any) {
        if (!options.silent && err?.name !== 'AbortError') {
          showToast(err?.message || 'Network error while syncing', 'error');
        }
      } finally {
        clearTimeout(abortTimeout);
        clearTimeout(watchdog);
        isSyncRunningRef.current = false;
      }
    },
    [showToast]
  );

  // ── Auto-poll: runs periodically during operating hours; sleeps off-hours ────
  useEffect(() => {
    // If auto-sync is sleeping off-hours or paused, DO NOT poll /api/sync-orders!
    const isSleepingOrPaused =
      syncScheduleStatus && (!syncScheduleStatus.isOperating || syncScheduleStatus.mode === 'paused');

    if (isSleepingOrPaused) {
      // Quiet schedule check every 60s to detect when morning operating hours resume
      const checkSchedule = async () => {
        try {
          const res = await fetch('/api/settings/sync');
          const data = await res.json();
          if (data.success && data.status) {
            setSyncScheduleStatus({
              ...data.status,
              intervalSeconds: data.settings?.intervalSeconds || 15,
            });
          }
        } catch {
          // ignore
        }
      };

      const scheduleInterval = setInterval(checkSchedule, 60000);

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          checkSchedule();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleVisibilityChange);

      return () => {
        clearInterval(scheduleInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleVisibilityChange);
      };
    }

    const poll = async () => {
      setIsPolling(true);
      await runSync({ silent: true, force: false });
      setIsPolling(false);
    };

    // Run immediately when operating window is active
    poll();

    const intervalMs = (syncScheduleStatus?.intervalSeconds || 15) * 1000;
    pollIntervalRef.current = setInterval(poll, intervalMs);

    // Instant sync on tab focus or phone screen unlock
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        poll();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [runSync, syncScheduleStatus?.intervalSeconds, syncScheduleStatus?.isOperating, syncScheduleStatus?.mode]);

  // ── Manual sync button handler (Always bypasses schedule with force: true) ─
  const handleSyncOrders = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    await runSync({ silent: false, force: true });
    setIsSyncing(false);
  };

  // ── Live badge state ────────────────────────────────────────────────────────
  let badgeText = 'Live';
  let badgeDotClass = 'bg-emerald-500 animate-pulse';
  let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
  let badgeTitle = 'Auto-Sync is active within operating hours';

  if (isPolling) {
    badgeText = 'Syncing…';
    badgeDotClass = 'bg-blue-500 animate-pulse';
    badgeClass = 'bg-blue-50 text-blue-700 border-blue-200/80';
  } else if (syncScheduleStatus?.mode === 'paused') {
    badgeText = 'Paused';
    badgeDotClass = 'bg-rose-500';
    badgeClass = 'bg-rose-50 text-rose-700 border-rose-200/80';
    badgeTitle = 'Auto-sync is manually paused. Click to configure in Settings.';
  } else if (syncScheduleStatus && !syncScheduleStatus.isOperating) {
    badgeText = 'Sleeping';
    badgeDotClass = 'bg-amber-500';
    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200/80';
    badgeTitle = syncScheduleStatus.statusText || 'Outside operating hours (Resumes at start time)';
  }

  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="h-16 px-4 sm:px-8 max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: menu (mobile) + sync status */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={openSidebar}
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link
            href="/settings"
            title={badgeTitle}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity hover:opacity-80 ${badgeClass}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badgeDotClass}`} />
            <span>Auto-sync {badgeText.toLowerCase()}</span>
          </Link>
        </div>

        {/* Right: date, sync, profile */}
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="hidden md:inline text-sm text-slate-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button
            id="sync-orders-btn"
            onClick={handleSyncOrders}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing…' : 'Sync orders'}</span>
          </button>
          <div
            className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center text-xs font-semibold text-white select-none"
            title="Niyi · Admin"
          >
            N
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
