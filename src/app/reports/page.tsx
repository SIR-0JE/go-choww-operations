'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  BarChart3,
  Calendar,
  Layers,
  Store,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';

interface DailySummaryRow {
  date: string;
  displayDate: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  riderFees: number;
  expenses: number;
  netProfit: number;
}

interface MonthlySummaryRow {
  monthKey: string;
  monthName: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  riderPayout: number;
  totalExpenses: number;
  netProfit: number;
}

interface TopCafeteriaRow {
  cafeteriaName: string;
  orderCount: number;
  totalFoodValue: number;
  totalDeliveryFees: number;
}

const CustomDailyNetTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    const isProfit = d.netProfit >= 0;
    return (
      <div className="rounded-xl bg-[#0e1726] border border-[#22354e] p-3.5 shadow-2xl text-xs space-y-1.5 z-50">
        <div className="font-extrabold text-white text-sm border-b border-[#22354e] pb-1 flex items-center justify-between gap-3">
          <span>{d.displayDate || label}</span>
          <span className="text-slate-400 font-medium">{d.totalOrders} total orders</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-300">
          <span>Gross Delivery Revenue:</span>
          <span className="font-bold text-white">{formatNaira(d.grossRevenue)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-300">
          <span>Rider Payout:</span>
          <span className="font-bold text-indigo-300">{formatNaira(d.riderFees)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-300">
          <span>Daily Expenses:</span>
          <span className="font-bold text-rose-400">{formatNaira(d.expenses)}</span>
        </div>
        <div className="flex justify-between gap-4 pt-1 border-t border-[#1e2f47] font-bold">
          <span className={isProfit ? 'text-emerald-400' : 'text-red-400'}>Daily Net Profit:</span>
          <span className={`font-black ${isProfit ? 'text-emerald-300' : 'text-red-300'}`}>
            {formatNaira(d.netProfit)}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const [dailySummary, setDailySummary] = useState<DailySummaryRow[]>([]);
  const [dailyChartData, setDailyChartData] = useState<DailySummaryRow[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryRow[]>([]);
  const [topCafeterias, setTopCafeterias] = useState<TopCafeteriaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.success) {
        setDailySummary(data.dailySummary || []);
        setDailyChartData(data.dailyChartData || []);
        setMonthlySummary(data.monthlySummary || []);
        setTopCafeterias(data.topCafeterias || []);
      }
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <AppLayout>
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
              <FileSpreadsheet className="w-7 h-7 text-brand-500" />
              Summaries &amp; Financial Reports
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Excel-equivalent Daily Summary and Monthly Ledger analytics with cafeteria breakdowns
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="inline-flex rounded-xl bg-[#142033] border border-[#213049] p-1 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('daily')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'daily'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Daily Summary Tab
            </button>
            <button
              onClick={() => setActiveTab('monthly')}
              className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all ${
                activeTab === 'monthly'
                  ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Monthly Summary Tab
            </button>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TAB 1: DAILY SUMMARY
        ───────────────────────────────────────────────────────────── */}
        {activeTab === 'daily' && (
          <div className="space-y-6">
            {/* Daily Net Profit Bar Chart */}
            <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Daily Net Profit Trajectory
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Gross Delivery Revenue minus Rider Pay and Daily Expenses
                  </p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#162235] text-slate-300 border border-[#23354e]">
                  Active Days Tracked: {dailyChartData.length}
                </span>
              </div>

              <div className="w-full h-64 sm:h-72">
                {isLoading ? (
                  <div className="h-full flex items-center justify-center text-slate-500">
                    <Activity className="w-8 h-8 animate-spin text-brand-500" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyChartData} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c2c42" vertical={false} />
                      <XAxis
                        dataKey="displayDate"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#203046' }}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        axisLine={{ stroke: '#203046' }}
                        tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip content={<CustomDailyNetTooltip />} />
                      <ReferenceLine y={0} stroke="#475569" />
                      <Bar dataKey="netProfit" name="Daily Net Profit" radius={[6, 6, 0, 0]}>
                        {dailyChartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.netProfit >= 0 ? '#10b981' : '#f43f5e'}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Daily Aggregation Table */}
            <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-xl overflow-hidden">
              <div className="p-5 border-b border-[#1a293d]">
                <h3 className="text-base font-extrabold text-white">Daily Operational Ledger</h3>
                <p className="text-xs text-slate-400 font-medium">
                  Aggregated financial figures per operational calendar date
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#142033] text-slate-400 uppercase tracking-wider font-extrabold text-[10px] border-b border-[#1b2a3f]">
                    <tr>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5 text-center">Total Orders</th>
                      <th className="px-4 py-3.5 text-center">Settled Orders</th>
                      <th className="px-4 py-3.5 text-right">Delivery Revenue</th>
                      <th className="px-4 py-3.5 text-right">Rider Fees</th>
                      <th className="px-4 py-3.5 text-right">Daily Expenses</th>
                      <th className="px-4 py-3.5 text-right font-black">Daily Net Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#18263a]">
                    {isLoading ? (
                      [...Array(6)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={7} className="px-4 py-4 bg-[#101a2b]">
                            <div className="h-4 bg-[#18263a] rounded w-full" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      dailySummary.map((row) => {
                        const isProfit = row.netProfit >= 0;
                        return (
                          <tr key={row.date} className="hover:bg-[#142236] transition-colors">
                            <td className="px-4 py-3.5 font-bold text-white whitespace-nowrap">
                              {row.displayDate}
                            </td>
                            <td className="px-4 py-3.5 text-center font-medium text-slate-300">
                              {row.totalOrders}
                            </td>
                            <td className="px-4 py-3.5 text-center font-extrabold text-cyan-400">
                              {row.completedOrders}
                            </td>
                            <td className="px-4 py-3.5 text-right font-bold text-brand-400">
                              {formatNaira(row.grossRevenue)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-medium text-indigo-300">
                              {formatNaira(row.riderFees)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-medium text-rose-400">
                              {formatNaira(row.expenses)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-black">
                              <span
                                className={`px-2 py-0.5 rounded ${
                                  isProfit
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                    : 'bg-red-500/15 text-red-300 border border-red-500/30'
                                }`}
                              >
                                {formatNaira(row.netProfit)}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            TAB 2: MONTHLY SUMMARY & TOP CAFETERIAS
        ───────────────────────────────────────────────────────────── */}
        {activeTab === 'monthly' && (
          <div className="space-y-6">
            {/* Monthly Aggregation Table */}
            <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-xl overflow-hidden">
              <div className="p-5 border-b border-[#1a293d]">
                <h3 className="text-base font-extrabold text-white">Monthly Summary Ledger</h3>
                <p className="text-xs text-slate-400 font-medium">
                  Month-by-month financial statement showing revenues, rider costs, expenses, and retained net profit
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#142033] text-slate-400 uppercase tracking-wider font-extrabold text-[10px] border-b border-[#1b2a3f]">
                    <tr>
                      <th className="px-4 py-3.5">Month</th>
                      <th className="px-4 py-3.5 text-center">Total Orders</th>
                      <th className="px-4 py-3.5 text-center">Settled Orders</th>
                      <th className="px-4 py-3.5 text-right">Gross Revenue</th>
                      <th className="px-4 py-3.5 text-right">Rider Payout</th>
                      <th className="px-4 py-3.5 text-right">Total Expenses</th>
                      <th className="px-4 py-3.5 text-right font-black">Net Profit (₦)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#18263a]">
                    {isLoading ? (
                      [...Array(2)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={7} className="px-4 py-4 bg-[#101a2b]">
                            <div className="h-4 bg-[#18263a] rounded w-full" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      monthlySummary.map((m) => (
                        <tr key={m.monthKey} className="hover:bg-[#142236] transition-colors">
                          <td className="px-4 py-3.5 font-extrabold text-white text-sm whitespace-nowrap">
                            {m.monthName}
                          </td>
                          <td className="px-4 py-3.5 text-center font-bold text-slate-300">
                            {m.totalOrders}
                          </td>
                          <td className="px-4 py-3.5 text-center font-extrabold text-cyan-400">
                            {m.completedOrders}
                          </td>
                          <td className="px-4 py-3.5 text-right font-black text-brand-400 text-sm">
                            {formatNaira(m.grossRevenue)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-indigo-300">
                            {formatNaira(m.riderPayout)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-rose-400">
                            {formatNaira(m.totalExpenses)}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="px-2.5 py-1 rounded-md text-sm font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              {formatNaira(m.netProfit)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Cafeterias Breakdown */}
            <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-xl overflow-hidden">
              <div className="p-5 border-b border-[#1a293d]">
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-amber-400" />
                  Top Cafeterias &amp; Food Vendors Breakdown
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  Aggregated food order volumes and generated delivery fees per cafeteria partner
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-[#142033] text-slate-400 uppercase tracking-wider font-extrabold text-[10px] border-b border-[#1b2a3f]">
                    <tr>
                      <th className="px-4 py-3.5">Rank &amp; Cafeteria</th>
                      <th className="px-4 py-3.5 text-center">Total Orders</th>
                      <th className="px-4 py-3.5 text-right">Total Food Gross Value</th>
                      <th className="px-4 py-3.5 text-right">Delivery Fees Generated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#18263a]">
                    {isLoading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={4} className="px-4 py-4 bg-[#101a2b]">
                            <div className="h-4 bg-[#18263a] rounded w-full" />
                          </td>
                        </tr>
                      ))
                    ) : (
                      topCafeterias.map((cat, idx) => (
                        <tr key={cat.cafeteriaName} className="hover:bg-[#142236] transition-colors">
                          <td className="px-4 py-3.5 font-bold text-white flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-[#18263a] text-slate-300 flex items-center justify-center text-[11px] font-extrabold">
                              #{idx + 1}
                            </span>
                            <span>{cat.cafeteriaName}</span>
                          </td>
                          <td className="px-4 py-3.5 text-center font-extrabold text-cyan-400">
                            {cat.orderCount} orders
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-slate-200">
                            {formatNaira(cat.totalFoodValue)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-black text-brand-400">
                            {formatNaira(cat.totalDeliveryFees)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
