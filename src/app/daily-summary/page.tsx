'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira, isSettledOrder, isRevenueOrder } from '@/lib/financials';
import {
  CalendarDays,
  TrendingUp,
  Activity,
  Bike,
  PackageCheck,
  AlertOctagon,
  Calendar,
  Clock,
  ChevronRight,
  Flame,
} from 'lucide-react';
import { InteractiveDailyTrendChart } from '@/components/charts/InteractiveDailyTrendChart';
import { IntradayVelocityDrawer, OrderItem } from '@/components/analytics/IntradayVelocityDrawer';

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
  orders: OrderItem[];
}

export default function DailySummaryPage() {
  const [dailyData, setDailyData] = useState<DailySummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDayRow, setSelectedDayRow] = useState<DailySummaryRow | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchDailySummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/orders?limit=all');
      const data = await res.json();
      const orders: OrderItem[] = data.orders || [];

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
            orders: [],
          });
        }

        const row = dayMap.get(dateKey)!;
        row.totalOrders += 1;
        row.orders.push(ord);

        const isSettled = ord.isSettled || isSettledOrder(ord);
        if (isSettled) {
          row.completedOrders += 1;
        }

        const isRev = isRevenueOrder(ord);
        if (isRev) {
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

      setDailyData(sortedList);
    } catch (err) {
      console.error('Failed to load daily summary:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDailySummary();
  }, [fetchDailySummary]);

  const handleOpenDrawer = (row: DailySummaryRow) => {
    setSelectedDayRow(row);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
  };

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
              Excel-equivalent day-by-day operational trajectory, order counts, delivery fees, and clickable intraday rush analytics
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
            {dailyData.length} Days Tracked
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TOP: INTERACTIVE DAILY TREND GRAPH (DUAL-MODE & DATE FILTER)
        ───────────────────────────────────────────────────────────── */}
        <InteractiveDailyTrendChart
          data={dailyData}
          isLoading={isLoading}
          title="Daily Delivery Revenue &amp; Order Trajectory"
          description="Click any day node or pick date presets to inspect daily volume and hourly rush velocity"
          onSelectDate={(dateKey) => {
            const found = dailyData.find((d) => d.date === dateKey);
            if (found) {
              handleOpenDrawer(found);
            }
          }}
        />

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM: MODERN DATA GRID WITH CLICK-TO-INSPECT HOURLY BREAKDOWN
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Daily Breakdown Ledger</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                  Click any row for hourly rush breakdown
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-normal mt-0.5">
                Detailed day-by-day settled volume, gross logistics revenues, and intraday velocity
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
                  <th className="px-6 py-4 text-center">Intraday Analysis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {isLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8} className="px-6 py-4 bg-slate-50/40">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : dailyData.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                      No daily records found.
                    </td>
                  </tr>
                ) : (
                  dailyData.map((row) => (
                    <tr
                      key={row.date}
                      onClick={() => handleOpenDrawer(row)}
                      className="hover:bg-brand-50/40 cursor-pointer transition-colors group"
                    >
                      {/* Date */}
                      <td className="px-6 py-4 font-semibold text-slate-900 group-hover:text-brand-700 flex items-center gap-2">
                        <span>{row.displayDate}</span>
                      </td>

                      {/* Total Orders */}
                      <td className="px-6 py-4 text-center font-bold text-slate-900 tabular-nums">
                        {row.totalOrders}
                      </td>

                      {/* Delivery Revenue */}
                      <td className="px-6 py-4 text-right font-bold text-brand-600 tabular-nums">
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

                      {/* Action Button */}
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDrawer(row);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-brand-600 hover:text-white text-slate-700 font-bold text-xs transition-all shadow-sm border border-slate-200 hover:border-brand-600"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Hourly Rate</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── INTRADAY VELOCITY & RUSH DRAWER ──────────────────────────────── */}
      {selectedDayRow && (
        <IntradayVelocityDrawer
          isOpen={isDrawerOpen}
          onClose={handleCloseDrawer}
          dateStr={selectedDayRow.date}
          displayDate={selectedDayRow.displayDate}
          orders={selectedDayRow.orders}
        />
      )}
    </AppLayout>
  );
}
