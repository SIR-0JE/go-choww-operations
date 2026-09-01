'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, ShieldCheck, Flame, Calendar, Sparkles } from 'lucide-react';

interface HeaderProps {
  onSyncComplete?: () => void;
  lastUpdated?: string;
  isDbConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSyncComplete, lastUpdated, isDbConnected = false }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

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
    <header className="border-b border-[#1b273b] bg-[#0d1522]/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-4 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Sprint Title */}
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-amber-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/25 ring-2 ring-brand-400/30">
            <Flame className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Go Choww <span className="text-brand-500 font-extrabold text-sm sm:text-base px-2 py-0.5 rounded-md bg-brand-500/15 border border-brand-500/30">OPS</span>
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Settlement Guard
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1.5">
              <span>Logistics & ₦3.5M Debt Recovery Sprint</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400/90 font-semibold">Ends Dec 10, 2026</span>
            </p>
          </div>
        </div>

        {/* Date, Database & Sync Action Controls */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Live Date Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#141f32] border border-[#213049] text-xs font-medium text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-brand-400" />
            <span>Tuesday, Sep 1, 2026</span>
          </div>

          {/* Sync / Import Button */}
          <button
            onClick={handleSyncOrders}
            disabled={isSyncing}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-xs sm:text-sm tracking-wide text-white transition-all shadow-md ${
              isSyncing
                ? 'bg-slate-700 cursor-not-allowed opacity-75'
                : 'bg-gradient-to-r from-brand-500 to-orange-600 hover:from-brand-600 hover:to-orange-700 active:scale-95 shadow-brand-500/20 hover:shadow-brand-500/40 ring-1 ring-white/10'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Import / Sync Orders'}</span>
          </button>
        </div>
      </div>

      {/* Sync Toast Feedback */}
      {syncToast && (
        <div
          className={`max-w-7xl mx-auto mt-3 p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all ${
            syncToast.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
              : 'bg-red-950/80 border-red-500/40 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{syncToast.message}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-slate-400 hover:text-white px-2 py-0.5 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </header>
  );
};
