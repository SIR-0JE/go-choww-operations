'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  CalendarDays,
  TrendingUp,
  Activity,
  Bike,
  PackageCheck,
  AlertOctagon,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DailySummaryRow {
  date: string;
  displayDate: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  sameSide: number;
  differentSide: number;
  pickUp: number;
  other: number;
}

const CustomDailyTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-3.5 shadow-xl shadow-slate-200/50 text-xs space-y-1.5 z-50">
        <div className="font-extrabold text-slate-900 text-sm border-b border-slate-100 pb-1 flex items-center justify-between gap-4">
          <span>{d.displayDate || label}</span>
          <span className="px-2 py-0.5 rounded bg-brand-50 text-brand-700 font-bold border border-brand-200">
            {d.totalOrders} total runs
          </span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Delivery Revenue:</span>
          <span className="font-bold text-brand-600">{formatNaira(d.grossRevenue)}</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Same Side (₦50):</span>
          <span className="font-bold text-slate-900">{d.sameSide} orders</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Different Side (₦90):</span>
          <span className="font-bold text-blue-700">{d.differentSide} orders</span>
        </div>
        <div className="flex justify-between gap-4 text-slate-600">
          <span>Pick Up (₦0):</span>
          <span className="font-bold text-emerald-700">{d.pickUp} orders</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function DailySummaryPage() {
  const [dailyData, setDailyData] = useState<DailySummaryRow[]>([]);
  const [chartData, setChartData] = useState<DailySummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDailySummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/orders?limit=all');
      const data = await res.json();
      const orders = data.orders || [];

      // Group orders by day
      const dayMap = new Map<string, DailySummaryRow>();

      for (const ord of orders) {
        const d = new Date(ord.createdAt);
        const dateKey = d.toISOString().split('T')[0];
        const displayDate = d.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });

        if (!dayMap.has(dateKey)) {
          dayMap.set(dateKey, {
            date: dateKey,
            displayDate,
            totalOrders: 0,
            completedOrders: 0,
            grossRevenue: 0,
            sameSide: 0,
            differentSide: 0,
            pickUp: 0,
            other: 0,
          });
        }

        const row = dayMap.get(dateKey)!;
        row.totalOrders += 1;

        const isSettled = ord.isSettled || (ord.orderStatus?.toLowerCase() === 'completed' && ord.paymentStatus?.toLowerCase() === 'success');
        if (isSettled) {
          row.completedOrders += 1;
          row.grossRevenue += Number(ord.deliveryFee) || 0;
        }

        const dType = (ord.deliveryType || '').toLowerCase();
        if (dType === 'same side') row.sameSide += 1;
        else if (dType === 'different side') row.differentSide += 1;
        else if (dType === 'pick up' || dType === 'pickup') row.pickUp += 1;
        else row.other += 1;
      }

      const sortedList = Array.from(dayMap.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // No slice — show all days from Jan to Aug
      const chartList = [...sortedList]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setDailyData(sortedList);
      setChartData(chartList);
    } catch (err) {
      console.error('Failed to load daily summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDailySummary();
  }, [fetchDailySummary]);

  return (
    <AppLayout>
      <Header onSyncComplete={fetchDailySummary} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
              <CalendarDays className="w-7 h-7 text-brand-600" />
              Daily Summary Ledger
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Excel-equivalent day-by-day operational trajectory, order counts, and delivery type breakdowns
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
            {dailyData.length} Days Tracked
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TOP: RECHARTS DAILY TREND GRAPH
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-600" />
                Daily Delivery Revenue &amp; Order Trajectory
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Visualizing daily gross delivery revenues collected and order volume trends
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
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dailyRevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickFormatter={(str) => str.split(',')[0]}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip content={<CustomDailyTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '10px', fontSize: '11px', color: '#64748b' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="grossRevenue"
                    name="Delivery Revenue (₦)"
                    stroke="#f97316"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#dailyRevGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM: MODERN DATA GRID
            Exact Columns: Date | Total Orders | Delivery Revenue | Same Side | Different Side | Pick Up | Other
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Daily Breakdown Ledger</h3>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Detailed day-by-day settled volume and gross logistics revenues
              </p>
            </div>
            <span className="text-xs font-medium text-slate-400">
              {dailyData.length} Recorded Days
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] font-semibold border-b border-slate-200/80">
                <tr>
                  <th className="px-6 py-4">Date</th>
                  <th className="px-6 py-4 text-center">Total Orders</th>
                  <th className="px-6 py-4 text-right">Delivery Revenue</th>
                  <th className="px-6 py-4 text-center">Same Side (₦50)</th>
                  <th className="px-6 py-4 text-center">Different Side (₦90)</th>
                  <th className="px-6 py-4 text-center">Pick Up (₦0)</th>
                  <th className="px-6 py-4 text-center">Other</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="px-6 py-4 bg-slate-50/40">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : dailyData.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      No daily records found.
                    </td>
                  </tr>
                ) : (
                  dailyData.map((row) => (
                    <tr key={row.date} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date */}
                      <td className="px-6 py-4 font-semibold text-slate-900">
                        {row.displayDate}
                      </td>

                      {/* Total Orders */}
                      <td className="px-6 py-4 text-center font-bold text-slate-900 tabular-nums">
                        {row.totalOrders}
                      </td>

                      {/* Delivery Revenue */}
                      <td className="px-6 py-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatNaira(row.grossRevenue)}
                      </td>

                      {/* Same Side */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {row.sameSide}
                      </td>

                      {/* Different Side */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {row.differentSide}
                      </td>

                      {/* Pick Up */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {row.pickUp}
                      </td>

                      {/* Other */}
                      <td className="px-6 py-4 text-center text-slate-600 tabular-nums font-medium">
                        {row.other}
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
