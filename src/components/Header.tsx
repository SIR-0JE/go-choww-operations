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
    <header className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Sprint Title */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-brand-500/15 ring-2 ring-brand-100">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2">
                Go Choww <span className="text-brand-600 font-extrabold text-sm sm:text-base px-2 py-0.5 rounded-md bg-brand-50 border border-brand-200">OPS</span>
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Settlement Guard
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
              <span>Logistics &amp; ₦3.5M Debt Recovery Sprint</span>
              <span className="text-slate-300">•</span>
              <span className="text-amber-700 font-semibold">Ends Dec 10, 2026</span>
            </p>
          </div>
        </div>

        {/* Date, Database & Sync Action Controls */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Live Date Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 border border-slate-200 text-xs font-semibold text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-brand-600" />
            <span>Tuesday, Sep 1, 2026</span>
          </div>

          {/* Sync / Import Button */}
          <button
            onClick={handleSyncOrders}
            disabled={isSyncing}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs sm:text-sm tracking-wide text-white transition-all shadow-sm ${
              isSyncing
                ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                : 'bg-gradient-to-r from-brand-500 to-orange-600 hover:from-brand-600 hover:to-orange-700 active:scale-95 shadow-brand-500/15 hover:shadow-brand-500/30'
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
          className={`max-w-7xl mx-auto mt-3 p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{syncToast.message}</span>
          </div>
          <button
            onClick={() => setSyncToast(null)}
            className="text-slate-400 hover:text-slate-700 px-2 py-0.5 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </header>
  );
};
