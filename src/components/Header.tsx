'use client';

import React, { useState } from 'react';
import { RefreshCw, CheckCircle2, Flame, Calendar, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  onSyncComplete?: () => void;
  lastUpdated?: string;
  isDbConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSyncComplete }) => {
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
    <header className="border-b border-slate-200/90 bg-white sticky top-0 z-40 shadow-sm">
      {/* Top Bar: Brand, Date & Primary Sync Action */}
      <div className="px-4 sm:px-8 py-3 max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Brand Title */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-orange-600 flex items-center justify-center text-white shadow-sm ring-2 ring-brand-100">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-slate-900">
                Go Choww <span className="text-brand-600 text-xs px-2 py-0.5 rounded bg-brand-50 border border-brand-200 font-extrabold">OPERATIONS</span>
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                Settlement Guard
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Excel-Synced Logistics Ledger &amp; Financial Analytics
            </p>
          </div>
        </div>

        {/* Live Date Badge & Sync Button */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600">
            <Calendar className="w-3.5 h-3.5 text-brand-600" />
            <span>Tuesday, Sep 1, 2026</span>
          </div>

          <button
            onClick={handleSyncOrders}
            disabled={isSyncing}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl font-bold text-xs tracking-wide text-white transition-all shadow-sm ${
              isSyncing
                ? 'bg-slate-300 cursor-not-allowed text-slate-500'
                : 'bg-gradient-to-r from-brand-500 to-orange-600 hover:from-brand-600 hover:to-orange-700 active:scale-95'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Orders'}</span>
          </button>
        </div>
      </div>

      {/* Toast alert if triggered */}
      {syncToast && (
        <div
          className={`px-4 sm:px-8 py-2 text-xs font-semibold flex items-center justify-between border-t ${
            syncToast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{syncToast.message}</span>
            </div>
            <button
              onClick={() => setSyncToast(null)}
              className="text-slate-400 hover:text-slate-700 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
