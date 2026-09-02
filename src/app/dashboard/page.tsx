'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira, MetricsSummary } from '@/lib/financials';
import {
  Banknote,
  Receipt,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  Calendar,
  Layers,
  Sparkles,
  ShieldCheck,
  Bike,
  PackageCheck,
  RotateCcw,
} from 'lucide-react';

interface WeeklyBreakdown {
  weekLabel: string;
  dateRange: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  riderPayout: number;
  expenses: number;
  netProfit: number;
}

interface MonthlySummaryItem {
  monthKey: string;
  monthName: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  riderPayout: number;
  expenses: number;
  netProfit: number;
  weeks: WeeklyBreakdown[];
}

export default function ExecutiveDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [ordersRaw, setOrdersRaw] = useState<any[]>([]);
  const [expensesRaw, setExpensesRaw] = useState<any[]>([]);
  const [monthlyWeeklyData, setMonthlyWeeklyData] = useState<MonthlySummaryItem[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({
    '2026-08': true,
    '2026-09': true,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Operational volume counts
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
        fetch('/api/orders?limit=500'),
        fetch('/api/expenses'),
      ]);

      const analyticsData = await analyticsRes.json();
      const ordersData = await ordersRes.json();
      const expensesData = await expensesRes.json();

      if (analyticsData.success) {
        setMetrics(analyticsData.metrics);
      }

      const ordersList = ordersData.orders || [];
      const expensesList = expensesData.expenses || [];
      setOrdersRaw(ordersList);
      setExpensesRaw(expensesList);

      // 1. Calculate Operational Volume Stats
      let completed = 0;
      let refundedFailed = 0;
      let canceled = 0;
      let sameSide = 0;
      let differentSide = 0;
      let pickUp = 0;
      let other = 0;

      for (const ord of ordersList) {
        const oStatus = (ord.orderStatus || '').toLowerCase();
        const pStatus = (ord.paymentStatus || '').toLowerCase();
        const dType = (ord.deliveryType || '').toLowerCase();

        if (oStatus === 'completed' && pStatus === 'success') {
          completed++;
        } else if (pStatus === 'failed' || pStatus === 'refunded') {
          refundedFailed++;
        }

        if (oStatus === 'cancelled' || oStatus === 'canceled') {
          canceled++;
        }

        if (dType === 'same side') sameSide++;
        else if (dType === 'different side') differentSide++;
        else if (dType === 'pick up' || dType === 'pickup') pickUp++;
        else other++;
      }

      setVolumeStats({
        completed,
        refundedFailed,
        canceled,
        sameSide,
        differentSide,
        pickUp,
        other,
      });

      // 2. Compute Joint Monthly & Weekly Summary
      computeJointMonthlyWeekly(ordersList, expensesList);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const computeJointMonthlyWeekly = (orders: any[], expenses: any[]) => {
    const monthMap = new Map<string, MonthlySummaryItem>();

    // Helper to get week number (1-4+)
    const getWeekInfo = (d: Date) => {
      const day = d.getDate();
      if (day <= 7) return { key: 'Week 1', range: 'Day 1 - 7' };
      if (day <= 14) return { key: 'Week 2', range: 'Day 8 - 14' };
      if (day <= 21) return { key: 'Week 3', range: 'Day 15 - 21' };
      return { key: 'Week 4+', range: 'Day 22 - 31' };
    };

    // Helper to init a month item
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

    // Process Orders
    for (const ord of orders) {
      const d = new Date(ord.createdAt);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const monthObj = getOrCreateMonth(mKey, mName);

      monthObj.totalOrders += 1;
      const weekInfo = getWeekInfo(d);
      const weekObj = monthObj.weeks.find((w) => w.weekLabel === weekInfo.key)!;
      weekObj.totalOrders += 1;

      if (ord.isSettled || (ord.orderStatus?.toLowerCase() === 'completed' && ord.paymentStatus?.toLowerCase() === 'success')) {
        const fee = Number(ord.deliveryFee) || 0;
        const payout = Number(ord.riderPayout) || 0;
        monthObj.completedOrders += 1;
        monthObj.grossRevenue += fee;
        monthObj.riderPayout += payout;

        weekObj.completedOrders += 1;
        weekObj.grossRevenue += fee;
        weekObj.riderPayout += payout;
      }
    }

    // Process Expenses
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

    // Calculate Net Profits
    const results = Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => {
        m.netProfit = m.grossRevenue - m.riderPayout - m.expenses;
        m.weeks = m.weeks.map((w) => {
          w.netProfit = w.grossRevenue - w.riderPayout - w.expenses;
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
    setExpandedMonths((prev) => ({ ...prev, [mKey]: !prev[mKey] }));
  };

  return (
    <AppLayout>
      <Header onSyncComplete={fetchData} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
              <Layers className="w-7 h-7 text-brand-600" />
              Executive Dashboard
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              High-level financial summaries, operational order velocity, and joint monthly/weekly performance
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
            Sprint Target: ₦3,500,000
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 1: TOP ROW (FINANCIAL OVERVIEW - 3 PREMIUM KPI CARDS)
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="Financial Overview" className="space-y-3">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            Financial Overview
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Gross Delivery Revenue */}
            <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Gross Delivery Revenue
                </span>
                <div className="p-2.5 rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60">
                  <Banknote className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {formatNaira(metrics?.grossDeliveryRevenue || 0)}
              </div>
              <div className="flex items-center justify-between text-xs pt-3 mt-3 border-t border-slate-100">
                <span className="text-slate-500 font-medium">
                  {metrics?.settledOrdersCount || 0} Settled Delivery Runs
                </span>
                <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-brand-50 text-brand-700 border border-brand-200">
                  Delivery Fees
                </span>
              </div>
            </div>

            {/* Card 2: Total Expenses (Logged Only) */}
            <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/90 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Total Expenses (Logged)
                </span>
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200/60">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                {formatNaira(metrics?.totalExpenses || 0)}
              </div>
              <div className="flex items-center justify-between text-xs pt-3 mt-3 border-t border-slate-100">
                <span className="text-slate-500 font-medium">
                  Fuel, Software, Salaries, Misc
                </span>
                <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200">
                  Operational Costs
                </span>
              </div>
            </div>

            {/* Card 3: NET PROFIT */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-white via-white to-emerald-50/40 border border-emerald-200 p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                  TRUE NET PROFIT
                </span>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight">
                {formatNaira(metrics?.netProfit || 0)}
              </div>
              <div className="flex items-center justify-between text-xs pt-3 mt-3 border-t border-emerald-100">
                <span className="text-slate-600 font-medium">
                  Gross Revenue - Rider Pay - Expenses
                </span>
                <span className="px-2.5 py-0.5 rounded-md font-bold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                  Retained Margin
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 2: OPERATIONAL VOLUME (7 CLEAN STAT CARDS)
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="Operational Volume" className="space-y-3">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            Operational Volume &amp; Status Breakdown
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {/* Stat 1: Total Completed Orders */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Completed</div>
              <div className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>{volumeStats.completed}</span>
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-1">Settled &amp; Paid</div>
            </div>

            {/* Stat 2: Refunded / Failed */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Refunded / Failed</div>
              <div className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4 text-amber-600" />
                <span>{volumeStats.refundedFailed}</span>
              </div>
              <div className="text-[10px] text-amber-700 font-semibold mt-1">Excluded from Net</div>
            </div>

            {/* Stat 3: Canceled Orders */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Canceled</div>
              <div className="text-2xl font-black text-slate-900 mt-2 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>{volumeStats.canceled}</span>
              </div>
              <div className="text-[10px] text-rose-700 font-semibold mt-1">Zero Fee Charged</div>
            </div>

            {/* Stat 4: Same Side */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Same Side</div>
              <div className="text-2xl font-black text-brand-600 mt-2 flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-brand-600" />
                <span>{volumeStats.sameSide}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">₦50 Rider Pay</div>
            </div>

            {/* Stat 5: Different Side */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Different Side</div>
              <div className="text-2xl font-black text-blue-600 mt-2 flex items-center gap-1.5">
                <Bike className="w-4 h-4 text-blue-600" />
                <span>{volumeStats.differentSide}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">₦90 Rider Pay</div>
            </div>

            {/* Stat 6: Pick Up */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Pick Up</div>
              <div className="text-2xl font-black text-emerald-600 mt-2 flex items-center gap-1.5">
                <PackageCheck className="w-4 h-4 text-emerald-600" />
                <span>{volumeStats.pickUp}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">₦0 Rider Pay</div>
            </div>

            {/* Stat 7: Other */}
            <div className="p-4 rounded-xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Other</div>
              <div className="text-2xl font-black text-purple-600 mt-2 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-purple-600" />
                <span>{volumeStats.other}</span>
              </div>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">Custom / Manual</div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            SECTION 3: JOINT MONTHLY & WEEKLY SUMMARY (EXPANDABLE ACCORDION TABLE)
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="Joint Monthly and Weekly Summary" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Joint Monthly &amp; Weekly Summary
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Click any month row to expand / collapse Week 1–4 breakdown
            </span>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5">Period / Month</th>
                    <th className="px-4 py-3.5 text-center">Total Orders</th>
                    <th className="px-4 py-3.5 text-center">Completed Orders</th>
                    <th className="px-4 py-3.5 text-right">Gross Delivery Revenue</th>
                    <th className="px-4 py-3.5 text-right">Rider Payout</th>
                    <th className="px-4 py-3.5 text-right">Logged Expenses</th>
                    <th className="px-5 py-3.5 text-right font-black">Net Profit (₦)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    [...Array(3)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={7} className="px-5 py-4 bg-slate-50/50">
                          <div className="h-4 bg-slate-200 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : monthlyWeeklyData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
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
                            className="bg-slate-50/90 hover:bg-slate-100/80 cursor-pointer font-bold text-slate-900 transition-colors select-none border-b border-slate-200"
                          >
                            <td className="px-5 py-4 flex items-center gap-2.5">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-brand-600 shrink-0" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                              )}
                              <span className="font-extrabold text-sm">{m.monthName}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-bold">
                                Monthly Total
                              </span>
                            </td>
                            <td className="px-4 py-4 text-center font-bold">{m.totalOrders}</td>
                            <td className="px-4 py-4 text-center font-extrabold text-blue-600">
                              {m.completedOrders}
                            </td>
                            <td className="px-4 py-4 text-right font-extrabold text-brand-600 text-sm">
                              {formatNaira(m.grossRevenue)}
                            </td>
                            <td className="px-4 py-4 text-right font-bold text-blue-700">
                              {formatNaira(m.riderPayout)}
                            </td>
                            <td className="px-4 py-4 text-right font-bold text-rose-600">
                              {formatNaira(m.expenses)}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span className="px-2.5 py-1 rounded-md text-sm font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {formatNaira(m.netProfit)}
                              </span>
                            </td>
                          </tr>

                          {/* Nested Week 1 - 4+ Rows */}
                          {isExpanded &&
                            m.weeks.map((week) => (
                              <tr
                                key={`${m.monthKey}-${week.weekLabel}`}
                                className="bg-white hover:bg-slate-50/60 transition-colors text-slate-600"
                              >
                                <td className="px-5 py-3 pl-12">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                    <span className="font-semibold text-slate-800">{week.weekLabel}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">
                                      ({week.dateRange})
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center">{week.totalOrders}</td>
                                <td className="px-4 py-3 text-center font-medium text-slate-700">
                                  {week.completedOrders}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-slate-900">
                                  {formatNaira(week.grossRevenue)}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-blue-700">
                                  {formatNaira(week.riderPayout)}
                                </td>
                                <td className="px-4 py-3 text-right font-medium text-rose-600">
                                  {formatNaira(week.expenses)}
                                </td>
                                <td className="px-5 py-3 text-right font-bold text-emerald-700">
                                  {formatNaira(week.netProfit)}
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
