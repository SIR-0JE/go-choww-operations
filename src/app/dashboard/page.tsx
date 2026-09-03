'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira, MetricsSummary } from '@/lib/financials';
import {
  Banknote,
  Receipt,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Bike,
  PackageCheck,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  Target,
  Layers,
} from 'lucide-react';

interface MonthlyWeeklyBreakdown {
  monthKey: string;
  monthName: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  riderPayout: number;
  expenses: number;
  netProfit: number;
  weeks: {
    weekLabel: string;
    dateRange: string;
    totalOrders: number;
    completedOrders: number;
    grossRevenue: number;
    riderPayout: number;
    expenses: number;
    netProfit: number;
  }[];
}

export default function ExecutiveDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [monthlyWeeklyData, setMonthlyWeeklyData] = useState<MonthlyWeeklyBreakdown[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Operational Volume Breakdown stats
  const [volumeStats, setVolumeStats] = useState({
    completed: 0,
    refundedFailed: 0,
    canceled: 0,
    sameSide: 0,
    differentSide: 0,
    pickUp: 0,
    other: 0,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [analyticsRes, ordersRes, expensesRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/orders?limit=all'),
        fetch('/api/expenses'),
      ]);

      const analyticsData = await analyticsRes.json();
      const ordersData = await ordersRes.json();
      const expensesData = await expensesRes.json();

      if (analyticsData.success) {
        setMetrics(analyticsData.metrics);
      }

      const allOrders: any[] = ordersData.orders || [];
      const allExpenses: any[] = expensesData.expenses || [];

      // Calculate Operational Volume Counts
      let comp = 0;
      let refFail = 0;
      let canc = 0;
      let same = 0;
      let diff = 0;
      let pick = 0;
      let oth = 0;

      for (const ord of allOrders) {
        const oStatus = (ord.orderStatus || '').toLowerCase();
        const pStatus = (ord.paymentStatus || '').toLowerCase();

        if (oStatus === 'completed' && pStatus === 'success') {
          comp += 1;
        } else if (pStatus === 'failed' || oStatus.includes('refund')) {
          refFail += 1;
        } else if (oStatus.includes('canc')) {
          canc += 1;
        }

        const dType = (ord.deliveryType || '').toLowerCase();
        if (dType === 'same side') same += 1;
        else if (dType === 'different side') diff += 1;
        else if (dType === 'pick up' || dType === 'pickup') pick += 1;
        else oth += 1;
      }

      setVolumeStats({
        completed: comp,
        refundedFailed: refFail,
        canceled: canc,
        sameSide: same,
        differentSide: diff,
        pickUp: pick,
        other: oth,
      });

      // Compute Joint Monthly and Weekly Breakdown
      computeJointMonthlyWeekly(allOrders, allExpenses);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getWeekInfo = (date: Date) => {
    const day = date.getDate();
    if (day <= 7) return { key: 'Week 1', range: 'Day 1 - 7' };
    if (day <= 14) return { key: 'Week 2', range: 'Day 8 - 14' };
    if (day <= 21) return { key: 'Week 3', range: 'Day 15 - 21' };
    return { key: 'Week 4+', range: 'Day 22 - 31' };
  };

  const computeJointMonthlyWeekly = (orders: any[], expenses: any[]) => {
    const monthMap = new Map<string, MonthlyWeeklyBreakdown>();

    const getOrCreateMonth = (mKey: string, mName: string) => {
      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, {
          monthKey: mKey,
          monthName: mName,
          totalOrders: 0,
          completedOrders: 0,
          grossRevenue: 0,
          riderPayout: 0,
          expenses: 0,
          netProfit: 0,
          weeks: [
            { weekLabel: 'Week 1', dateRange: 'Day 1 - 7', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
            { weekLabel: 'Week 2', dateRange: 'Day 8 - 14', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
            { weekLabel: 'Week 3', dateRange: 'Day 15 - 21', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
            { weekLabel: 'Week 4+', dateRange: 'Day 22 - 31', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
          ],
        });
      }
      return monthMap.get(mKey)!;
    };

    for (const ord of orders) {
      const d = new Date(ord.createdAt);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const monthObj = getOrCreateMonth(mKey, mName);

      monthObj.totalOrders += 1;
      const isSettled = ord.isSettled || (ord.orderStatus?.toLowerCase() === 'completed' && ord.paymentStatus?.toLowerCase() === 'success');
      const fee = Number(ord.deliveryFee) || 0;
      const payout = Number(ord.riderPayout) || 0;

      if (isSettled) {
        monthObj.completedOrders += 1;
        monthObj.grossRevenue += fee;
        monthObj.riderPayout += payout;
      }

      const weekInfo = getWeekInfo(d);
      const weekObj = monthObj.weeks.find((w) => w.weekLabel === weekInfo.key)!;
      weekObj.totalOrders += 1;
      if (isSettled) {
        weekObj.completedOrders += 1;
        weekObj.grossRevenue += fee;
        weekObj.riderPayout += payout;
      }
    }

    for (const exp of expenses) {
      const d = new Date(exp.date);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const monthObj = getOrCreateMonth(mKey, mName);

      const amt = Number(exp.amount) || 0;
      monthObj.expenses += amt;

      const weekInfo = getWeekInfo(d);
      const weekObj = monthObj.weeks.find((w) => w.weekLabel === weekInfo.key)!;
      weekObj.expenses += amt;
    }

    // Net Profit = Gross Revenue - Total Logged Expenses
    const results = Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => {
        m.netProfit = m.grossRevenue - m.expenses;
        m.weeks = m.weeks.map((w) => {
          w.netProfit = w.grossRevenue - w.expenses;
          return w;
        });
        return m;
      });

    setMonthlyWeeklyData(results);
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleMonth = (mKey: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [mKey]: !prev[mKey],
    }));
  };

  return (
    <AppLayout>
      <Header onSyncComplete={fetchData} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Executive Overview
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              High-level operational metrics, financial margin analysis, and weekly delivery trajectory.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white text-slate-700 border border-slate-200/80 shadow-sm flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-brand-600" />
              <span>Sprint Target: <strong className="text-slate-900 font-bold tabular-nums">₦3,500,000</strong></span>
            </span>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 1: FINANCIAL OVERVIEW (3 MINIMALIST FINTECH CARDS)
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="Financial Overview" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Financial Overview
            </div>
            <span className="text-[11px] text-slate-400 font-medium">All figures verified</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {/* Card 1: Gross Delivery Revenue */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Gross Delivery Revenue
                </span>
                <div className="p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200/70">
                  <Banknote className="w-4 h-4 text-brand-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
                {formatNaira(metrics?.grossDeliveryRevenue || 0)}
              </div>
              <div className="flex items-center justify-between text-xs pt-4 mt-4 border-t border-slate-100">
                <span className="text-slate-500 font-normal">
                  <strong className="font-semibold text-slate-800 tabular-nums">{metrics?.settledOrdersCount || 0}</strong> Settled Runs
                </span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                  Delivery Fees
                </span>
              </div>
            </div>

            {/* Card 2: Total Expenses (Logged Only) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Expenses (Logged)
                </span>
                <div className="p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200/70">
                  <Receipt className="w-4 h-4 text-rose-600" />
                </div>
              </div>
              <div className="text-3xl font-bold text-slate-900 tracking-tight tabular-nums">
                {formatNaira(metrics?.totalExpenses || 0)}
              </div>
              <div className="flex items-center justify-between text-xs pt-4 mt-4 border-t border-slate-100">
                <span className="text-slate-500 font-normal">
                  Fuel, software, salaries, misc
                </span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-rose-50 text-rose-700 border border-rose-200/70">
                  Operational Costs
                </span>
              </div>
            </div>

            {/* Card 3: Net Profit (Logged) */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm hover:shadow-md hover:border-slate-300/80 transition-all duration-200">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Net Profit (Logged)
                </span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="text-3xl font-bold text-emerald-700 tracking-tight tabular-nums">
                {formatNaira(metrics?.netProfit || 0)}
              </div>
              <div className="flex items-center justify-between text-xs pt-4 mt-4 border-t border-slate-100">
                <span className="text-slate-500 font-normal">
                  Gross Revenue - Logged Expenses
                </span>
                <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                  Retained Margin
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 2: OPERATIONAL VOLUME (7 CLEAN MINIMALIST CARDS)
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="Operational Volume" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Operational Volume &amp; Status Breakdown
            </div>
            <span className="text-[11px] text-slate-400 font-medium">1:1 Excel Mapped</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* Stat 1: Completed Orders */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Completed</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{volumeStats.completed}</span>
              </div>
              <div className="text-[11px] text-emerald-700 font-medium mt-1.5">Settled &amp; Paid</div>
            </div>

            {/* Stat 2: Refunded Orders */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Refunded</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{volumeStats.refundedFailed}</span>
              </div>
              <div className="text-[11px] text-amber-700 font-medium mt-1.5">Excluded from Net</div>
            </div>

            {/* Stat 3: Canceled Orders */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Canceled</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{volumeStats.canceled}</span>
              </div>
              <div className="text-[11px] text-rose-700 font-medium mt-1.5">Zero Fee</div>
            </div>

            {/* Stat 4: Same Side */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Same Side</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <Bike className="w-4 h-4 text-brand-600 shrink-0" />
                <span>{volumeStats.sameSide}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1.5">₦50 Rider Ref</div>
            </div>

            {/* Stat 5: Different Side */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Different Side</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <Bike className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{volumeStats.differentSide}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1.5">₦90 Rider Ref</div>
            </div>

            {/* Stat 6: Pick Up */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Pick Up</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{volumeStats.pickUp}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1.5">₦0 Rider Ref</div>
            </div>

            {/* Stat 7: Other */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex flex-col justify-between hover:border-slate-300 transition-colors">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Other</div>
              <div className="text-2xl font-bold text-slate-900 mt-2.5 flex items-center gap-2 tabular-nums">
                <AlertOctagon className="w-4 h-4 text-purple-600 shrink-0" />
                <span>{volumeStats.other}</span>
              </div>
              <div className="text-[11px] text-slate-500 font-medium mt-1.5">Custom Order</div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 3: JOINT MONTHLY & WEEKLY SUMMARY (CLEAN FINTECH TABLE)
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="Joint Monthly and Weekly Summary" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span>Joint Monthly &amp; Weekly Summary</span>
            </div>
            <span className="text-xs text-slate-400 font-normal">
              Click month row to toggle weekly breakdown
            </span>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200/80">
                  <tr>
                    <th className="px-6 py-4">Period</th>
                    <th className="px-6 py-4 text-center">Completed Orders</th>
                    <th className="px-6 py-4 text-right">Delivery Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {isLoading ? (
                    [...Array(3)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={3} className="px-6 py-4 bg-slate-50/40">
                          <div className="h-4 bg-slate-200 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : monthlyWeeklyData.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400">
                        No monthly records found. Click &quot;Sync Orders&quot; in the header to ingest batch data.
                      </td>
                    </tr>
                  ) : (
                    monthlyWeeklyData.map((m) => {
                      const isExpanded = !!expandedMonths[m.monthKey];
                      return (
                        <React.Fragment key={m.monthKey}>
                          {/* Month Header Row (Clickable Accordion) */}
                          <tr
                            onClick={() => toggleMonth(m.monthKey)}
                            className="bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer font-semibold text-slate-900 transition-colors select-none border-b border-slate-200/60"
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2.5">
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-brand-600 shrink-0 transition-transform" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 transition-transform" />
                                )}
                                <span className="text-sm font-semibold">{m.monthName}</span>
                                <span className="text-[10px] font-medium text-slate-400 ml-1">
                                  (Monthly Total)
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center font-bold text-slate-900 tabular-nums">
                              {m.completedOrders}
                            </td>
                            <td className="px-6 py-4 text-right font-bold text-slate-900 text-sm tabular-nums">
                              {formatNaira(m.grossRevenue)}
                            </td>
                          </tr>

                          {/* Nested Week 1–4 Rows */}
                          {isExpanded &&
                            m.weeks.map((week) => (
                              <tr
                                key={`${m.monthKey}-${week.weekLabel}`}
                                className="bg-white hover:bg-slate-50/60 transition-colors text-slate-600 text-xs"
                              >
                                <td className="px-6 py-3.5 pl-14">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                    <span className="font-medium text-slate-700">{week.weekLabel}</span>
                                    <span className="text-[11px] text-slate-400 font-normal">
                                      ({week.dateRange})
                                    </span>
                                  </div>
                                </td>
                                <td className="px-6 py-3.5 text-center font-medium text-slate-600 tabular-nums">
                                  {week.completedOrders}
                                </td>
                                <td className="px-6 py-3.5 text-right font-medium text-slate-700 tabular-nums">
                                  {formatNaira(week.grossRevenue)}
                                </td>
                              </tr>
                            ))}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
