'use client';

import React from 'react';
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
import { TrendingUp, Activity } from 'lucide-react';

interface DailyRevenueChartProps {
  data: Array<{
    date: string;
    displayDate: string;
    settledOrders: number;
    grossRevenue: number;
    riderPayout: number;
    expenses?: number;
    netProfit: number;
    cumulativeNetProfit: number;
  }>;
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-3.5 shadow-xl shadow-slate-200/50 text-xs space-y-1.5 z-50">
        <div className="font-extrabold text-slate-900 text-sm border-b border-slate-100 pb-1 flex items-center justify-between gap-4">
          <span>{d.displayDate || label}</span>
          <span className="px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 font-bold text-[11px] border border-brand-200">
            {d.settledOrders} orders
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
            Gross Revenue:
          </span>
          <span className="font-bold text-slate-900">{formatNaira(d.grossRevenue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            Rider Payout:
          </span>
          <span className="font-bold text-blue-700">{formatNaira(d.riderPayout)}</span>
        </div>
        {d.expenses !== undefined && d.expenses > 0 && (
          <div className="flex items-center justify-between gap-4 text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              Daily Expenses:
            </span>
            <span className="font-bold text-rose-600">{formatNaira(d.expenses)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-4 text-slate-600 pt-1 border-t border-slate-100">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-700">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            Net Profit:
          </span>
          <span className="font-black text-emerald-700">{formatNaira(d.netProfit)}</span>
        </div>
        <div className="text-[10px] text-slate-400 font-medium italic pt-0.5">
          Cumulative Net: <span className="font-bold text-slate-700">{formatNaira(d.cumulativeNetProfit)}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const DailyRevenueChart: React.FC<DailyRevenueChartProps> = ({ data, isLoading }) => {
  if (isLoading || !data || data.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-6 h-80 flex flex-col items-center justify-center text-slate-400 shadow-sm">
        <Activity className="w-8 h-8 animate-spin text-brand-500 mb-2" />
        <p className="text-xs font-medium">Loading daily financial trends...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            Daily Financial Velocity &amp; Volume
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Daily delivery revenues collected versus retained net earnings
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
            Last {data.length} Active Days
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="lightGrossGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="lightNetGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="displayDate"
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
            <Tooltip content={<CustomTooltip />} />
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
              name="Gross Revenue"
              stroke="#f97316"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#lightGrossGradient)"
            />
            <Area
              type="monotone"
              dataKey="netProfit"
              name="Net Profit"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#lightNetGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
