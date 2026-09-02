'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, Flame, Calendar, Target, ShieldCheck } from 'lucide-react';
import { formatNaira, MetricsSummary } from '@/lib/financials';

interface HeaderProps {
  onSyncComplete?: () => void;
  lastUpdated?: string;
  isDbConnected?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onSyncComplete }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);

  const fetchSprintMetrics = async () => {
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchSprintMetrics();
  }, []);

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
        fetchSprintMetrics();
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

  const progress = metrics ? Math.min(100, Math.max(0, metrics.debtProgressPercent)) : 0;
  const netProfit = metrics ? metrics.netProfit : 0;
  const daysRemaining = metrics ? metrics.daysRemainingInSprint : 99;

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

      {/* Global ₦3,500,000 Debt Recovery Sprint Banner (Visible at Top of Application) */}
      <div className="bg-gradient-to-r from-orange-50/60 via-amber-50/40 to-slate-50 border-t border-slate-100 px-4 sm:px-8 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2.5">
          {/* Label + Progress Numbers */}
          <div className="flex items-center gap-2 text-xs">
            <div className="p-1.5 rounded-lg bg-brand-500 text-white shadow-sm">
              <Target className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-extrabold text-slate-900 mr-2">₦3,500,000 Debt Recovery Sprint:</span>
              <span className="font-black text-brand-600">{formatNaira(netProfit)}</span>
              <span className="text-slate-400 font-medium"> / ₦3,500,000.00</span>
              <span className="ml-2 font-bold text-[11px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
                {daysRemaining} days left (Ends Dec 10, 2026)
              </span>
            </div>
          </div>

          {/* Mini Progress Bar */}
          <div className="flex items-center gap-3 min-w-[200px] sm:min-w-[280px]">
            <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 via-amber-500 to-emerald-500 transition-all duration-700 rounded-full"
                style={{ width: `${Math.max(1, progress)}%` }}
              />
            </div>
            <span className="text-xs font-black text-slate-800 whitespace-nowrap">
              {progress.toFixed(1)}%
            </span>
          </div>
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
