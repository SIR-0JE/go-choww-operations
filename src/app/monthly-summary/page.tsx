'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  CalendarRange,
  TrendingUp,
  Activity,
  Store,
  BarChart3,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface MonthlySummaryRow {
  monthKey: string;
  monthName: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  foodValueHandled: number;
  sameSide: number;
  differentSide: number;
  pickUp: number;
  other: number;
}

interface TopCafeteriaRow {
  cafeteriaName: string;
  orderCount: number;
  totalFoodValue: number;
  totalDeliveryFees: number;
}

const CustomMonthlyTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-3.5 shadow-xl shadow-slate-200/50 text-xs space-y-1.5 z-50">
        <div className="font-extrabold text-slate-900 text-sm border-b border-slate-100 pb-1 flex items-center justify-between gap-4">
          <span>{d.monthName || label}</span>
          <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-bold border border-brand-200">
            {d.totalOrders} orders
          </span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Delivery Revenue:</span>
          <span className="font-bold text-brand-600">{formatNaira(d.grossRevenue)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Food Value Handled:</span>
          <span className="font-bold text-slate-900">{formatNaira(d.foodValueHandled)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600 pt-1 border-t border-slate-100">
          <span>Same Side / Diff Side:</span>
          <span className="font-bold text-slate-700">{d.sameSide} / {d.differentSide}</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function MonthlySummaryPage() {
  const [monthlyData, setMonthlyData] = useState<MonthlySummaryRow[]>([]);
  const [topCafeterias, setTopCafeterias] = useState<TopCafeteriaRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMonthlySummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ordRes, repRes] = await Promise.all([
        fetch('/api/orders?limit=all'),
        fetch('/api/reports'),
      ]);

      const ordData = await ordRes.json();
      const repData = await repRes.json();
      const orders = ordData.orders || [];

      // Group by Month
      const monthMap = new Map<string, MonthlySummaryRow>();

      for (const ord of orders) {
        const d = new Date(ord.createdAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, {
            monthKey,
            monthName,
            totalOrders: 0,
            completedOrders: 0,
            grossRevenue: 0,
            foodValueHandled: 0,
            sameSide: 0,
            differentSide: 0,
            pickUp: 0,
            other: 0,
          });
        }

        const m = monthMap.get(monthKey)!;
        m.totalOrders += 1;
        m.foodValueHandled += Number(ord.foodTotal) || 0;

        const isSettled = ord.isSettled || (ord.orderStatus?.toLowerCase() === 'completed' && ord.paymentStatus?.toLowerCase() === 'success');
        if (isSettled) {
          m.completedOrders += 1;
          m.grossRevenue += Number(ord.deliveryFee) || 0;
        }

        const dType = (ord.deliveryType || '').toLowerCase();
        if (dType === 'same side') m.sameSide += 1;
        else if (dType === 'different side') m.differentSide += 1;
        else if (dType === 'pick up' || dType === 'pickup') m.pickUp += 1;
        else m.other += 1;
      }

      const sortedMonths = Array.from(monthMap.values()).sort((a, b) =>
        b.monthKey.localeCompare(a.monthKey)
      );

      setMonthlyData(sortedMonths);
      setTopCafeterias(repData.topCafeterias || []);
    } catch (err) {
      console.error('Failed to load monthly summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonthlySummary();
  }, [fetchMonthlySummary]);

  return (
    <AppLayout>
      <Header onSyncComplete={fetchMonthlySummary} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
              <CalendarRange className="w-7 h-7 text-brand-600" />
              Monthly Summary Ledger
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Excel-equivalent month-by-month financial performance, gross food value handled, and cafeteria partner breakdowns
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
            {monthlyData.length} Calendar Months
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TOP: RECHARTS MONTHLY PERFORMANCE GRAPH
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-brand-600" />
                Monthly Delivery Revenue &amp; Food Value Handled
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Comparing gross food merchandise value and retained delivery fees
              </p>
            </div>
          </div>

          <div className="w-full h-64 sm:h-72">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <Activity className="w-8 h-8 animate-spin text-brand-500" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...monthlyData].reverse()} margin={{ top: 15, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="monthName"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomMonthlyTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', color: '#64748b' }}
                  />
                  <Bar
                    dataKey="foodValueHandled"
                    name="Food Value Handled (₦)"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    dataKey="grossRevenue"
                    name="Delivery Revenue (₦)"
                    fill="#f97316"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            BODY: MONTHLY BREAKDOWN TABLE
            Exact Columns: Month | Total Orders | Delivery Revenue | Food Value Handled | Same Side | Different Side | Pick Up | Other
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Monthly Ledger Table</h3>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Exact mapped columns from the Excel Monthly Summary worksheet
              </p>
            </div>
            <span className="text-xs font-medium text-slate-400">
              {monthlyData.length} Calendar Months
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-6 py-4">Month</th>
                  <th className="px-6 py-4 text-center">Total Orders</th>
                  <th className="px-6 py-4 text-right">Delivery Revenue</th>
                  <th className="px-6 py-4 text-right">Food Value Handled</th>
                  <th className="px-6 py-4 text-center">Same Side (₦50)</th>
                  <th className="px-6 py-4 text-center">Different Side (₦90)</th>
                  <th className="px-6 py-4 text-center">Pick Up (₦0)</th>
                  <th className="px-6 py-4 text-center">Other</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {isLoading ? (
                  [...Array(2)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8} className="px-6 py-4 bg-slate-50/40">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : monthlyData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      No monthly records found.
                    </td>
                  </tr>
                ) : (
                  monthlyData.map((m) => (
                    <tr key={m.monthKey} className="hover:bg-slate-50/70 transition-colors">
                      {/* Month */}
                      <td className="px-6 py-4 font-semibold text-slate-900 text-sm">
                        {m.monthName}
                      </td>

                      {/* Total Orders */}
                      <td className="px-6 py-4 text-center font-bold text-slate-900 tabular-nums">
                        {m.totalOrders}
                      </td>

                      {/* Delivery Revenue */}
                      <td className="px-6 py-4 text-right font-bold text-slate-900 text-sm tabular-nums">
                        {formatNaira(m.grossRevenue)}
                      </td>

                      {/* Food Value Handled */}
                      <td className="px-6 py-4 text-right font-semibold text-slate-700 tabular-nums">
                        {formatNaira(m.foodValueHandled)}
                      </td>

                      {/* Same Side */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {m.sameSide}
                      </td>

                      {/* Different Side */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {m.differentSide}
                      </td>

                      {/* Pick Up */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {m.pickUp}
                      </td>

                      {/* Other */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {m.other}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TOP CAFETERIAS BREAKDOWN
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Store className="w-5 h-5 text-amber-600" />
              Top Cafeteria Partners Performance
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Ranked food cafeteria vendors by order volume and generated delivery revenues
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Rank &amp; Cafeteria</th>
                  <th className="px-4 py-3.5 text-center">Total Orders</th>
                  <th className="px-4 py-3.5 text-right">Total Food Gross Value</th>
                  <th className="px-4 py-3.5 text-right font-black text-brand-700">Delivery Fees Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={4} className="px-5 py-4 bg-slate-50/50">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : (
                  topCafeterias.map((cat, idx) => (
                    <tr key={cat.cafeteriaName} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-slate-900 flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[11px] font-black">
                          #{idx + 1}
                        </span>
                        <span>{cat.cafeteriaName}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-extrabold text-blue-600">
                        {cat.orderCount} orders
                      </td>
                      <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                        {formatNaira(cat.totalFoodValue)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-black text-brand-600">
                        {formatNaira(cat.totalDeliveryFees)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}
