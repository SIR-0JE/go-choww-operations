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
    netProfit: number;
    cumulativeNetProfit: number;
  }>;
  isLoading?: boolean;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    return (
      <div className="rounded-xl bg-[#0e1726] border border-[#22354e] p-3.5 shadow-2xl text-xs space-y-1.5 z-50">
        <div className="font-extrabold text-white text-sm border-b border-[#22354e] pb-1 flex items-center justify-between gap-4">
          <span>{d.displayDate || label}</span>
          <span className="px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 font-bold text-[11px]">
            {d.settledOrders} orders
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-brand-500" />
            Gross Revenue:
          </span>
          <span className="font-bold text-white">{formatNaira(d.grossRevenue)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />
            Rider Payout:
          </span>
          <span className="font-bold text-indigo-300">{formatNaira(d.riderPayout)}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-300 pt-1 border-t border-[#1b2b3f]">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
            Net Profit:
          </span>
          <span className="font-black text-emerald-300">{formatNaira(d.netProfit)}</span>
        </div>
        <div className="text-[10px] text-slate-400 italic pt-0.5">
          Cumulative Net: <span className="font-bold text-amber-300">{formatNaira(d.cumulativeNetProfit)}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const DailyRevenueChart: React.FC<DailyRevenueChartProps> = ({ data, isLoading }) => {
  if (isLoading || !data || data.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-6 h-80 flex flex-col items-center justify-center text-slate-500">
        <Activity className="w-8 h-8 animate-spin text-brand-500 mb-2" />
        <p className="text-xs font-medium">Loading daily financial trends...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-5 sm:p-6 shadow-xl shadow-black/20 flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-400" />
            Daily Financial Velocity & Volume
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            Daily gross delivery fees, rider payout obligations, and retained net profit
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="px-2 py-1 rounded-md bg-[#162235] text-slate-300 border border-[#22334b]">
            Last {data.length} Active Days
          </span>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="grossGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
            </defs>

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
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
            />

            <Area
              type="monotone"
              dataKey="grossRevenue"
              name="Gross Revenue"
              stroke="#f97316"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#grossGradient)"
            />
            <Area
              type="monotone"
              dataKey="netProfit"
              name="Net Profit"
              stroke="#10b981"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#netGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
