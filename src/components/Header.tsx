'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, Calendar, Menu } from 'lucide-react';
import { useSidebar } from './AppLayout';

interface HeaderProps {
  onSyncComplete?: () => void;
  lastUpdated?: string;
  isDbConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSyncComplete }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { openSidebar } = useSidebar();

  const handleSyncOrders = async () => {
    setIsSyncing(true);
    setSyncToast(null);

    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setSyncToast({
          message: data.message || `Imported ${data.syncedCount} new operational orders!`,
          type: 'success',
        });
        if (onSyncComplete) onSyncComplete();
      } else {
        setSyncToast({
          message: data.error || 'Failed to sync orders',
          type: 'error',
        });
      }
    } catch (err: any) {
      setSyncToast({
        message: err?.message || 'Network error while syncing orders',
        type: 'error',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  return (
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-sm sticky top-0 z-30">
      {/* Top Header Bar */}
      <div className="px-4 sm:px-8 py-3.5 max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Left: Hamburger (on mobile) + Greeting & Live System Status */}
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
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Systems
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
            <span>Tuesday, Sep 1, 2026</span>
          </div>

          {/* Sync Orders Button */}
          <button
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

      {/* Toast alert if triggered */}
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
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
