'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira, MetricsSummary } from '@/lib/financials';
import {
  Target,
  Calendar,
  Zap,
  ShieldAlert,
  Compass,
  TrendingUp,
  Save,
  RotateCcw,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Flame,
  Award,
  BarChart3,
  CalendarDays,
  Sparkles,
} from 'lucide-react';

interface SprintConfig {
  targetAmount: number;
  startDate: string;
  endDate: string;
}

const DEFAULT_CONFIG: SprintConfig = {
  targetAmount: 3500000,
  startDate: '2026-01-01',
  endDate: '2026-12-10',
};

const STORAGE_KEY = 'go_choww_sprint_target_config';

export default function TargetPage() {
  const [config, setConfig] = useState<SprintConfig>(DEFAULT_CONFIG);
  const [tempConfig, setTempConfig] = useState<SprintConfig>(DEFAULT_CONFIG);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavedToast, setIsSavedToast] = useState(false);

  // Load saved config from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.targetAmount && parsed.endDate) {
          setConfig(parsed);
          setTempConfig(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      if (data.success && data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Failed to load target analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfig(tempConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tempConfig));
    } catch {
      // ignore
    }
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3500);
  };

  const handleResetDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    setTempConfig(DEFAULT_CONFIG);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setIsSavedToast(true);
    setTimeout(() => setIsSavedToast(false), 3500);
  };

  // Dynamic calculations based on target configuration and actual platform metrics
  const calculations = useMemo(() => {
    const target = Number(config.targetAmount) || DEFAULT_CONFIG.targetAmount;
    const netProfit = metrics?.netProfit ?? 0;
    const settledOrders = metrics?.settledOrdersCount ?? 0;
    const grossMargin = metrics?.grossMargin ?? netProfit;

    // Use current date or reference operational date (Sep 1, 2026)
    const now = new Date();
    // If running in development or testing in 2026
    const refDate = now.getFullYear() >= 2026 ? now : new Date('2026-09-01T00:00:00Z');
    const end = new Date(`${config.endDate}T23:59:59Z`);
    const start = new Date(`${config.startDate}T00:00:00Z`);

    const msPerDay = 1000 * 60 * 60 * 24;
    const diffToDeadline = end.getTime() - refDate.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffToDeadline / msPerDay));

    const totalSprintDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / msPerDay));
    const elapsedDays = Math.max(1, totalSprintDays - daysRemaining);

    const progressPercent = Math.min(100, Math.max(0, (netProfit / target) * 100));
    const remainingDebt = Math.max(0, target - netProfit);

    // Run-rate needed to clear remaining debt in remaining days
    const requiredDailyRunRate = daysRemaining > 0 ? Math.round(remainingDebt / daysRemaining) : 0;

    // Estimate net profit per settled order (~₦100 - ₦150)
    const avgProfitPerOrder = settledOrders > 0 ? Math.max(50, Math.round(grossMargin / settledOrders)) : 100;
    const requiredDailyOrders = requiredDailyRunRate > 0 ? Math.ceil(requiredDailyRunRate / avgProfitPerOrder) : 0;

    // Actual pace
    const actualDailyNetAverage = Math.round(netProfit / elapsedDays);
    const velocityPercent = requiredDailyRunRate > 0 ? Math.round((actualDailyNetAverage / requiredDailyRunRate) * 100) : 100;

    // Projected completion date at current pace
    let projectedCompletionDate: string = 'N/A';
    if (actualDailyNetAverage > 0 && remainingDebt > 0) {
      const daysToComplete = Math.ceil(remainingDebt / actualDailyNetAverage);
      const projDate = new Date(refDate.getTime() + daysToComplete * msPerDay);
      projectedCompletionDate = projDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } else if (remainingDebt === 0) {
      projectedCompletionDate = 'Target Achieved!';
    }

    return {
      target,
      netProfit,
      settledOrders,
      daysRemaining,
      totalSprintDays,
      elapsedDays,
      progressPercent,
      remainingDebt,
      requiredDailyRunRate,
      requiredDailyOrders,
      actualDailyNetAverage,
      velocityPercent,
      projectedCompletionDate,
      avgProfitPerOrder,
    };
  }, [config, metrics]);

  return (
    <AppLayout>
      <Header onSyncComplete={fetchAnalytics} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <Target className="w-6 h-6 text-brand-600" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Sprint Target &amp; Debt Recovery
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Configure debt settlement milestones, sprint deadlines, and monitor payoff velocity.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-white text-slate-700 border border-slate-200/80 shadow-sm flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span><strong className="text-slate-900 font-bold tabular-nums">{calculations.daysRemaining}</strong> Days to Deadline</span>
            </span>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 1: THE RE-INTEGRATED GORGEOUS DEBT RECOVERY CARD
        ───────────────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-sm">
          {/* Subtle Background Accent */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-orange-50/40 via-amber-50/20 to-transparent rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          {/* Top Row: Title + Progress Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 uppercase tracking-wide">
                  Active Recovery Sprint
                </span>
                <span className="text-xs text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Ends {new Date(config.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
                {formatNaira(calculations.target)} Target Velocity
              </h2>
            </div>

            {/* Large Progress Percentage Pill */}
            <div className="flex items-baseline gap-2.5 bg-slate-50 px-5 py-2.5 rounded-2xl border border-slate-200/80 self-start sm:self-auto">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Settled</span>
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">
                {calculations.progressPercent.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Master Progress Bar */}
          <div className="space-y-2 mb-8 relative z-10">
            <div className="flex justify-between text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                True Net Profit Recovered:{' '}
                <span className="text-slate-900 font-bold tabular-nums">
                  {formatNaira(calculations.netProfit)}
                </span>
              </span>
              <span className="text-slate-500 font-normal">
                Goal: <strong className="text-slate-900 font-semibold tabular-nums">{formatNaira(calculations.target)}</strong>
              </span>
            </div>

            <div className="w-full h-3.5 rounded-full bg-slate-100 border border-slate-200/80 overflow-hidden p-0.5 relative">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 via-amber-500 to-emerald-500 transition-all duration-1000 ease-out"
                style={{ width: `${Math.max(1.5, calculations.progressPercent)}%` }}
              />
            </div>

            <div className="flex justify-between text-[11px] text-slate-400 font-medium pt-0.5">
              <span>Sprint Started: {new Date(config.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <span>Remaining to Clear: <strong className="text-slate-700 tabular-nums">{formatNaira(calculations.remainingDebt)}</strong></span>
            </div>
          </div>

          {/* Quick Metrics 4-Col Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10 pt-6 border-t border-slate-100">
            {/* 1. Remaining Debt */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-white text-rose-600 border border-slate-200/80 shrink-0 shadow-sm">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Remaining Debt
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                  {formatNaira(calculations.remainingDebt)}
                </div>
              </div>
            </div>

            {/* 2. Required Daily Run Rate */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-white text-amber-600 border border-slate-200/80 shrink-0 shadow-sm">
                <Zap className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Required Daily Run-Rate
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                  {formatNaira(calculations.requiredDailyRunRate)}
                  <span className="text-xs font-normal text-slate-400 ml-1">/ day</span>
                </div>
              </div>
            </div>

            {/* 3. Required Daily Orders */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-white text-blue-600 border border-slate-200/80 shrink-0 shadow-sm">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Target Daily Volume
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                  {calculations.requiredDailyOrders}
                  <span className="text-xs font-normal text-slate-400 ml-1">orders/day</span>
                </div>
              </div>
            </div>

            {/* 4. Days Remaining */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 flex items-center gap-3.5">
              <div className="p-2.5 rounded-lg bg-white text-emerald-600 border border-slate-200/80 shrink-0 shadow-sm">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Sprint Runway
                </div>
                <div className="text-base sm:text-lg font-bold text-slate-900 mt-0.5 tabular-nums">
                  {calculations.daysRemaining}
                  <span className="text-xs font-normal text-slate-400 ml-1">days left</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 2: INTERACTIVE SPRINT CONFIGURATION & MILESTONE PANEL
        ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Sprint Parameters Editor Form (7 cols) */}
          <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-slate-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Sprint Parameters &amp; Target Controls
                  </h3>
                  <p className="text-xs text-slate-500 font-normal">
                    Adjust target values; days remaining and required run-rate will update instantly.
                  </p>
                </div>
              </div>

              {isSavedToast && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-in fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Configuration Saved!
                </span>
              )}
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-5">
              {/* Field 1: Target Amount */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span>Sprint Target Amount (₦)</span>
                  <span className="text-slate-900 font-bold tabular-nums">{formatNaira(tempConfig.targetAmount)}</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm">₦</span>
                  <input
                    type="number"
                    min={100000}
                    step={50000}
                    value={tempConfig.targetAmount}
                    onChange={(e) =>
                      setTempConfig({ ...tempConfig, targetAmount: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full pl-8 pr-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all tabular-nums"
                  />
                </div>
                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Presets:</span>
                  <button
                    type="button"
                    onClick={() => setTempConfig({ ...tempConfig, targetAmount: 3500000 })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      tempConfig.targetAmount === 3500000
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ₦3.5M (Original Excel)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempConfig({ ...tempConfig, targetAmount: 5000000 })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      tempConfig.targetAmount === 5000000
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ₦5.0M (Stretch)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempConfig({ ...tempConfig, targetAmount: 2000000 })}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                      tempConfig.targetAmount === 2000000
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    ₦2.0M (Phase 1)
                  </button>
                </div>
              </div>

              {/* Date Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Field 2: Start Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                    <span>Sprint Start Date</span>
                  </label>
                  <input
                    type="date"
                    value={tempConfig.startDate}
                    onChange={(e) => setTempConfig({ ...tempConfig, startDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all"
                  />
                </div>

                {/* Field 3: End Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-brand-600" />
                    <span>Sprint Deadline (End Date)</span>
                  </label>
                  <input
                    type="date"
                    value={tempConfig.endDate}
                    onChange={(e) => setTempConfig({ ...tempConfig, endDate: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  Reset to Defaults
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs tracking-wide shadow-sm flex items-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Save className="w-4 h-4" />
                  Save Sprint Parameters
                </button>
              </div>
            </form>
          </div>

          {/* Right: Milestone Trajectory & Forecast (5 cols) */}
          <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/80 p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <Sparkles className="w-5 h-5 text-slate-500" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Milestone Forecast
                </h3>
                <p className="text-xs text-slate-500 font-normal">
                  Dynamic pacing trajectory towards 100% recovery
                </p>
              </div>
            </div>

            {/* Projection Summary Box */}
            <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500">Projected Completion:</span>
                <span className="font-semibold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200/80 shadow-sm">
                  {calculations.projectedCompletionDate}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500">Pacing Health:</span>
                <span
                  className={`font-semibold px-2.5 py-1 rounded-lg text-xs tabular-nums ${
                    calculations.velocityPercent >= 100
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : calculations.velocityPercent >= 70
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {calculations.velocityPercent}% of required speed
                </span>
              </div>
            </div>

            {/* Milestone Steps */}
            <div className="space-y-2 text-xs">
              {[
                { pct: 25, label: 'Initial Traction (25%)' },
                { pct: 50, label: 'Halfway Mark (50%)' },
                { pct: 75, label: 'Final Stretch (75%)' },
                { pct: 100, label: 'Full Debt Clearance (100%)' },
              ].map((m) => {
                const milestoneAmount = (calculations.target * m.pct) / 100;
                const isPassed = calculations.netProfit >= milestoneAmount;
                const isCurrent =
                  !isPassed &&
                  calculations.netProfit >= (calculations.target * (m.pct - 25)) / 100;

                return (
                  <div
                    key={m.pct}
                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-colors ${
                      isPassed
                        ? 'bg-emerald-50/40 border-emerald-200/60 text-slate-800'
                        : isCurrent
                        ? 'bg-amber-50/40 border-amber-200 text-slate-900 ring-1 ring-amber-200/60'
                        : 'bg-white border-slate-200/80 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isPassed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : isCurrent ? (
                        <Flame className="w-4 h-4 text-amber-600 shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-xs text-slate-900">{m.label}</div>
                        <div className="text-[11px] text-slate-500 font-normal tabular-nums mt-0.5">
                          {formatNaira(milestoneAmount)}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                        isPassed
                          ? 'bg-emerald-100/80 text-emerald-800'
                          : isCurrent
                          ? 'bg-amber-100/80 text-amber-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {isPassed ? 'ACHIEVED' : isCurrent ? 'IN PROGRESS' : 'UPCOMING'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
