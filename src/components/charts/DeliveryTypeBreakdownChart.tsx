'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { formatNaira } from '@/lib/financials';
import { PieChart, Bike } from 'lucide-react';

interface DeliveryTypeBreakdownChartProps {
  data: Array<{
    type: string;
    count: number;
    rate: string;
    totalPayout: number;
    fill: string;
  }>;
  isLoading?: boolean;
}

const CustomBarTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload;
    return (
      <div className="rounded-xl bg-[#0e1726] border border-[#22354e] p-3 shadow-2xl text-xs space-y-1.5 z-50">
        <div className="font-extrabold text-white text-sm border-b border-[#22354e] pb-1 flex items-center justify-between gap-3">
          <span>{d.type}</span>
          <span className="text-brand-400 font-bold">{d.rate}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span>Settled Volume:</span>
          <span className="font-bold text-white">{d.count} orders</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-300">
          <span>Total Rider Payout:</span>
          <span className="font-black text-indigo-300">{formatNaira(d.totalPayout)}</span>
        </div>
      </div>
    );
  }
  return null;
};

export const DeliveryTypeBreakdownChart: React.FC<DeliveryTypeBreakdownChartProps> = ({
  data,
  isLoading,
}) => {
  if (isLoading || !data || data.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-6 h-80 flex flex-col items-center justify-center text-slate-500">
        <Bike className="w-8 h-8 animate-bounce text-brand-500 mb-2" />
        <p className="text-xs font-medium">Loading delivery breakdown...</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-5 sm:p-6 shadow-xl shadow-black/20 flex flex-col justify-between">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-indigo-400" />
            Delivery Type & Payout Breakdown
          </h3>
          <p className="text-xs text-slate-400 font-medium">
            Same side (₦50) vs Different side (₦90) vs Pick up (₦0)
          </p>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full h-64 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1c2c42" vertical={false} />
            <XAxis
              dataKey="type"
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
            />
            <Tooltip content={<CustomBarTooltip />} />
            <Bar dataKey="count" name="Settled Orders" radius={[8, 8, 0, 0]} maxBarSize={48}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Legend Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-[#1a293d] text-center text-xs">
        {data.map((item, idx) => (
          <div key={idx} className="p-2 rounded-lg bg-[#141f32] border border-[#203047]">
            <div className="text-[10px] text-slate-400 font-bold truncate">{item.type}</div>
            <div className="font-extrabold text-white text-sm">{item.count}</div>
            <div className="text-[10px] text-slate-400 font-medium">{item.rate}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
