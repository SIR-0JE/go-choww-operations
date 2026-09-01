'use client';

import React from 'react';
import { Target, Zap, Clock, ShieldAlert, Award, Compass, ArrowUpRight } from 'lucide-react';
import { MetricsSummary, formatNaira } from '@/lib/financials';

interface DebtRecoveryCardProps {
  metrics: MetricsSummary | null;
  isLoading?: boolean;
}

export const DebtRecoveryCard: React.FC<DebtRecoveryCardProps> = ({ metrics, isLoading }) => {
  if (isLoading || !metrics) {
    return (
      <div className="h-44 rounded-2xl bg-[#111c2e] border border-[#1d2b40] animate-pulse p-6" />
    );
  }

  const progress = Math.min(100, Math.max(0, metrics.debtProgressPercent));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#111c2e] via-[#0f1929] to-[#0c1422] border border-[#22354e] p-6 shadow-xl shadow-black/30">
      {/* Subtle Background Glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-brand-500 to-amber-600 text-white shadow-md shadow-brand-500/20">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-tight">
                ₦3,500,000 Debt Recovery Sprint
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                ACTIVE SPRINT
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Target Deadline: <strong className="text-slate-200">December 10, 2026</strong> ({metrics.daysRemainingInSprint} days remaining)
            </p>
          </div>
        </div>

        {/* Progress Percentage Badge */}
        <div className="flex items-baseline gap-2 bg-[#17253a] px-3.5 py-1.5 rounded-xl border border-[#263b57] self-start sm:self-auto">
          <span className="text-xs text-slate-400 font-semibold">Recovered:</span>
          <span className="text-xl font-black text-brand-400">
            {progress.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2 mb-6 relative z-10">
        <div className="flex justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-brand-400 animate-ping" />
            Net Recovered: <span className="text-brand-400 font-extrabold">{formatNaira(metrics.netProfit)}</span>
          </span>
          <span className="text-slate-400 font-medium">
            Goal: <strong className="text-white">₦3,500,000.00</strong>
          </span>
        </div>

        {/* Outer Bar */}
        <div className="w-full h-4 rounded-full bg-[#162235] border border-[#253750] overflow-hidden p-0.5 relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-600 via-amber-500 to-emerald-400 transition-all duration-1000 ease-out shadow-sm shadow-brand-500/50"
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>
      </div>

      {/* Metric Highlights Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 relative z-10 pt-4 border-t border-[#1a293d]">
        {/* Metric 1: Remaining Debt */}
        <div className="p-3.5 rounded-xl bg-[#142033]/80 border border-[#21324a] flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/15 text-red-400 border border-red-500/20">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Remaining Debt
            </div>
            <div className="text-base font-black text-white">
              {formatNaira(metrics.remainingDebt)}
            </div>
          </div>
        </div>

        {/* Metric 2: Run Rate vs Target Velocity */}
        <div className="p-3.5 rounded-xl bg-[#142033]/80 border border-[#21324a] flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/20">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Run Rate / Target Velocity
            </div>
            <div className="text-sm font-black text-white flex items-center gap-1">
              <span>{metrics.dailyAverageSettledOrders} / {metrics.targetDailyOrders}</span>
              <span className="text-xs font-semibold text-slate-400">orders/day</span>
              <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300">
                {metrics.velocityPercent}% Pace
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Target Daily Net Velocity */}
        <div className="p-3.5 rounded-xl bg-[#142033]/80 border border-[#21324a] flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <Compass className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Target Net Profit
            </div>
            <div className="text-sm font-black text-white flex items-center gap-1">
              <span>{formatNaira(metrics.targetDailyNetProfit)}</span>
              <span className="text-xs font-semibold text-slate-400">/ day</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
