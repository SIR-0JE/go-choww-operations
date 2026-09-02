'use client';

import React from 'react';
import { Target, Zap, ShieldAlert, Compass } from 'lucide-react';
import { MetricsSummary, formatNaira } from '@/lib/financials';

interface DebtRecoveryCardProps {
  metrics: MetricsSummary | null;
  isLoading?: boolean;
}

export const DebtRecoveryCard: React.FC<DebtRecoveryCardProps> = ({ metrics, isLoading }) => {
  if (isLoading || !metrics) {
    return (
      <div className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse p-6 shadow-sm" />
    );
  }

  const progress = Math.min(100, Math.max(0, metrics.debtProgressPercent));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm">
      {/* Subtle Background Accent */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-brand-50 to-orange-50/30 rounded-full blur-2xl pointer-events-none -mr-16 -mt-16" />

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600 border border-brand-200/80 shadow-sm">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                ₦3,500,000 Debt Recovery Sprint
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                ACTIVE SPRINT
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Target Deadline: <strong className="text-slate-700 font-semibold">December 10, 2026</strong> ({metrics.daysRemainingInSprint} days remaining)
            </p>
          </div>
        </div>

        {/* Progress Percentage Badge */}
        <div className="flex items-baseline gap-2 bg-slate-50 px-4 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto shadow-inner">
          <span className="text-xs text-slate-500 font-semibold">Recovered:</span>
          <span className="text-xl font-black text-brand-600">
            {progress.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2 mb-6 relative z-10">
        <div className="flex justify-between text-xs font-bold text-slate-700">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-500 animate-ping" />
            True Net Recovered: <span className="text-brand-600 font-black">{formatNaira(metrics.netProfit)}</span>
          </span>
          <span className="text-slate-500 font-medium">
            Goal: <strong className="text-slate-900">₦3,500,000.00</strong>
          </span>
        </div>

        {/* Outer Bar */}
        <div className="w-full h-3.5 rounded-full bg-slate-100 border border-slate-200 overflow-hidden p-0.5 relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 via-amber-500 to-emerald-500 transition-all duration-1000 ease-out shadow-sm"
            style={{ width: `${Math.max(1.5, progress)}%` }}
          />
        </div>
      </div>

      {/* Metric Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 relative z-10 pt-4 border-t border-slate-100">
        {/* Metric 1: Remaining Debt */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-rose-50 text-rose-600 border border-rose-200/60">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Remaining Debt
            </div>
            <div className="text-base font-black text-slate-900">
              {formatNaira(metrics.remainingDebt)}
            </div>
          </div>
        </div>

        {/* Metric 2: Run Rate vs Target Velocity */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200/60">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Run Rate / Velocity
            </div>
            <div className="text-sm font-black text-slate-900 flex items-center gap-1">
              <span>{metrics.dailyAverageSettledOrders} / {metrics.targetDailyOrders}</span>
              <span className="text-xs font-medium text-slate-500">orders/day</span>
              <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800">
                {metrics.velocityPercent}% Pace
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Target Daily Net Velocity */}
        <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200/60">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Target Daily Profit
            </div>
            <div className="text-sm font-black text-slate-900 flex items-center gap-1">
              <span>{formatNaira(metrics.targetDailyNetProfit)}</span>
              <span className="text-xs font-medium text-slate-500">/ day</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
