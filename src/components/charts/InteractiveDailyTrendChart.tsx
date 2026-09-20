'use client';

import React, { useState, useMemo } from 'react';
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
import { formatNaira } from '@/lib/financials';
import {
  TrendingUp,
  Activity,
  Calendar,
  Layers,
  Banknote,
  Package,
  ArrowRight,
  ChevronDown,
} from 'lucide-react';

export interface DailyDataPoint {
  date: string; // YYYY-MM-DD
  displayDate: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  sameSide?: number;
  differentSide?: number;
  pickUp?: number;
  other?: number;
  riderPayout?: number;
  netProfit?: number;
}

interface InteractiveDailyTrendChartProps {
  data: DailyDataPoint[];
  isLoading?: boolean;
  title?: string;
  description?: string;
}

type MetricMode = 'revenue' | 'orders';
type DatePreset = '7d' | '14d' | '30d' | 'this_month' | 'all' | 'custom';

// Custom Tooltip for Revenue & Orders
const CustomTrendTooltip = ({ active, payload, label, mode }: any) => {
  if (active && payload && payload.length) {
    const d: DailyDataPoint = payload[0]?.payload;
    if (!d) return null;

    const isRev = mode === 'revenue';

    return (
      <div className="rounded-xl bg-white border border-slate-200 p-3.5 shadow-xl shadow-slate-200/50 text-xs space-y-1.5 z-50 min-w-[210px]">
        <div className="font-extrabold text-slate-900 text-sm border-b border-slate-100 pb-1 flex items-center justify-between gap-4">
          <span>{d.displayDate || label}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
            isRev ? 'bg-orange-50 text-orange-700 border border-orange-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {isRev ? formatNaira(d.grossRevenue) : `${d.totalOrders} runs`}
          </span>
        </div>

        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              Delivery Revenue:
            </span>
            <strong className="text-slate-900 font-bold">{formatNaira(d.grossRevenue)}</strong>
          </div>

          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Total Orders:
            </span>
            <strong className="text-slate-900 font-bold">{d.totalOrders}</strong>
          </div>

          {d.completedOrders !== undefined && (
            <div className="flex items-center justify-between gap-3 text-slate-500 text-[11px]">
              <span>Settled Completed:</span>
              <span className="font-semibold text-emerald-700">{d.completedOrders}</span>
            </div>
          )}

          {(d.sameSide !== undefined || d.differentSide !== undefined) && (
            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
              <span>Same: <strong className="text-slate-700">{d.sameSide || 0}</strong></span>
              <span>Diff: <strong className="text-slate-700">{d.differentSide || 0}</strong></span>
              <span>Pickup: <strong className="text-slate-700">{d.pickUp || 0}</strong></span>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};

export const InteractiveDailyTrendChart: React.FC<InteractiveDailyTrendChartProps> = ({
  data,
  isLoading = false,
  title = 'Daily Operational Trajectory',
  description = 'Interactive visual trends for gross logistics revenue and order delivery volumes',
}) => {
  const [metricMode, setMetricMode] = useState<MetricMode>('revenue');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [isCustomExpanded, setIsCustomExpanded] = useState<boolean>(false);

  // Chronological sorted master data
  const chronologicalData = useMemo(() => {
    return [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [data]);

  // Apply Date Filtering
  const filteredData = useMemo(() => {
    if (chronologicalData.length === 0) return [];

    if (datePreset === 'all') {
      return chronologicalData;
    }

    if (datePreset === '7d') {
      return chronologicalData.slice(-7);
    }

    if (datePreset === '14d') {
      return chronologicalData.slice(-14);
    }

    if (datePreset === '30d') {
      return chronologicalData.slice(-30);
    }

    if (datePreset === 'this_month') {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();

      return chronologicalData.filter((item) => {
        const itemDate = new Date(item.date);
        return (
          itemDate.getFullYear() === currentYear && itemDate.getMonth() === currentMonth
        );
      });
    }

    if (datePreset === 'custom') {
      return chronologicalData.filter((item) => {
        if (customStart && item.date < customStart) return false;
        if (customEnd && item.date > customEnd) return false;
        return true;
      });
    }

    return chronologicalData;
  }, [chronologicalData, datePreset, customStart, customEnd]);

  // Filtered Summary Aggregates
  const stats = useMemo(() => {
    const totalRev = filteredData.reduce((acc, d) => acc + (d.grossRevenue || 0), 0);
    const totalRuns = filteredData.reduce((acc, d) => acc + (d.totalOrders || 0), 0);
    const avgDailyRuns = filteredData.length > 0 ? (totalRuns / filteredData.length).toFixed(1) : '0';
    const avgDailyRev = filteredData.length > 0 ? totalRev / filteredData.length : 0;

    return { totalRev, totalRuns, avgDailyRuns, avgDailyRev, count: filteredData.length };
  }, [filteredData]);

  if (isLoading || !data || data.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-8 h-80 flex flex-col items-center justify-center text-slate-400 shadow-sm">
        <Activity className="w-8 h-8 animate-spin text-brand-500 mb-2" />
        <p className="text-xs font-semibold">Loading daily operational trends...</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5">
      {/* ── Top Header & Controls ────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        {/* Title & Subtitle */}
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            <span>{title}</span>
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">{description}</p>
        </div>

        {/* Controls Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 1. Metric Mode Segment Switch (Revenue vs. Orders) */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold shadow-inner">
            <button
              onClick={() => setMetricMode('revenue')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                metricMode === 'revenue'
                  ? 'bg-white text-orange-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Revenue (₦)</span>
            </button>
            <button
              onClick={() => setMetricMode('orders')}
              className={`px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${
                metricMode === 'orders'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Orders Volume</span>
            </button>
          </div>

          {/* 2. Date Range Presets */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => { setDatePreset('7d'); setIsCustomExpanded(false); }}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${
                datePreset === '7d' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7D
            </button>
            <button
              onClick={() => { setDatePreset('14d'); setIsCustomExpanded(false); }}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${
                datePreset === '14d' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              14D
            </button>
            <button
              onClick={() => { setDatePreset('30d'); setIsCustomExpanded(false); }}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${
                datePreset === '30d' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              30D
            </button>
            <button
              onClick={() => { setDatePreset('this_month'); setIsCustomExpanded(false); }}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${
                datePreset === 'this_month' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month
            </button>
            <button
              onClick={() => { setDatePreset('all'); setIsCustomExpanded(false); }}
              className={`px-2.5 py-1.5 rounded-xl transition-all ${
                datePreset === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => {
                setDatePreset('custom');
                setIsCustomExpanded(!isCustomExpanded || datePreset !== 'custom');
              }}
              className={`px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 ${
                datePreset === 'custom' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Custom Date Range"
            >
              <Calendar className="w-3 h-3" />
              <span>Custom</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Expandable Custom Date Range Picker ───────────────────────────────── */}
      {datePreset === 'custom' && isCustomExpanded && (
        <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <Calendar className="w-4 h-4 text-brand-600" />
            <span>Select Custom Range:</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
              placeholder="Start Date"
            />
            <span className="text-slate-400 font-bold">➔</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 shadow-sm"
              placeholder="End Date"
            />
            {(customStart || customEnd) && (
              <button
                onClick={() => { setCustomStart(''); setCustomEnd(''); }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[11px]"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Summary Stats Pills for Filtered Range ───────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtered Window</span>
          <span className="font-extrabold text-slate-900 mt-0.5">{stats.count} Days</span>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Delivery Fees</span>
          <span className="font-extrabold text-orange-600 mt-0.5">{formatNaira(stats.totalRev)}</span>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Deliveries</span>
          <span className="font-extrabold text-blue-600 mt-0.5">{stats.totalRuns.toLocaleString()} orders</span>
        </div>
        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Daily Volume</span>
          <span className="font-extrabold text-slate-800 mt-0.5">{stats.avgDailyRuns} orders/day</span>
        </div>
      </div>

      {/* ── Recharts Canvas ─────────────────────────────────────────────────── */}
      <div className="w-full h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={filteredData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <defs>
              {/* Revenue Gradient */}
              <linearGradient id="trendRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
              </linearGradient>

              {/* Orders Volume Gradient */}
              <linearGradient id="trendOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />

            <XAxis
              dataKey="displayDate"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              tickFormatter={(str) => {
                if (!str) return '';
                // e.g. "Fri, Aug 14" -> "Aug 14"
                const parts = str.split(',');
                return parts.length > 1 ? parts[1].trim() : str;
              }}
            />

            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              tickFormatter={(val) => {
                if (metricMode === 'revenue') {
                  return val >= 1000 ? `₦${(val / 1000).toFixed(0)}k` : `₦${val}`;
                }
                return val.toString();
              }}
            />

            <Tooltip content={<CustomTrendTooltip mode={metricMode} />} />

            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingBottom: '12px', fontSize: '11px', color: '#64748b' }}
            />

            {metricMode === 'revenue' ? (
              <Area
                type="monotone"
                dataKey="grossRevenue"
                name="Delivery Revenue (₦)"
                stroke="#f97316"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#trendRevenueGrad)"
              />
            ) : (
              <Area
                type="monotone"
                dataKey="totalOrders"
                name="Completed Orders Count"
                stroke="#3b82f6"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#trendOrdersGrad)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
