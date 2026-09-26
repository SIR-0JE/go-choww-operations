'use client';

import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { formatNaira } from '@/lib/financials';

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
  onSelectDate?: (dateKey: string) => void;
  /** Today's order target from the sprint; drawn as a dashed line in Orders view */
  dailyTarget?: number;
}

type MetricMode = 'revenue' | 'orders';
type RangeKey = '7d' | '30d' | 'month' | 'all';

const RANGES: { key: RangeKey; label: string; phrase: string }[] = [
  { key: '7d', label: 'Last 7 days', phrase: 'in the last 7 days' },
  { key: '30d', label: 'Last 30 days', phrase: 'in the last 30 days' },
  { key: 'month', label: 'This month', phrase: 'this month' },
  { key: 'all', label: 'All time', phrase: 'all time' },
];

const BAR_COLOR = '#f97316'; // brand orange — one series, one hue
const BAR_COLOR_ACTIVE = '#c2410c';
const INK_MUTED = '#94a3b8';
const GRID = '#f1f5f9';

const shortDate = (dateKey: string) =>
  new Date(`${dateKey}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const compactNaira = (v: number) =>
  v >= 1_000_000 ? `₦${(v / 1_000_000).toFixed(1)}m` : v >= 1000 ? `₦${Math.round(v / 1000)}k` : `₦${v}`;

const DayTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d: DailyDataPoint = payload[0].payload;
  return (
    <div className="rounded-lg bg-white border border-slate-200 px-3 py-2.5 shadow-lg text-xs min-w-[170px]">
      <div className="font-semibold text-slate-900 mb-1.5">{d.displayDate}</div>
      <div className="flex justify-between gap-4 text-slate-600">
        <span>Revenue</span>
        <span className="font-medium text-slate-900 tabular-nums">{formatNaira(d.grossRevenue)}</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-600">
        <span>Delivered</span>
        <span className="font-medium text-slate-900 tabular-nums">{d.completedOrders}</span>
      </div>
      <div className="flex justify-between gap-4 text-slate-500">
        <span>Placed</span>
        <span className="tabular-nums">{d.totalOrders}</span>
      </div>
    </div>
  );
};

export const InteractiveDailyTrendChart: React.FC<InteractiveDailyTrendChartProps> = ({
  data,
  isLoading = false,
  title = 'Daily trend',
  description,
  onSelectDate,
  dailyTarget,
}) => {
  const [mode, setMode] = useState<MetricMode>('revenue');
  const [range, setRange] = useState<RangeKey>('30d');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const sorted = useMemo(() => [...data].sort((a, b) => a.date.localeCompare(b.date)), [data]);

  const visible = useMemo(() => {
    if (range === '7d') return sorted.slice(-7);
    if (range === '30d') return sorted.slice(-30);
    if (range === 'month') {
      const prefix = new Date().toISOString().slice(0, 7);
      return sorted.filter((d) => d.date.startsWith(prefix));
    }
    return sorted;
  }, [sorted, range]);

  const totals = useMemo(() => {
    const revenue = visible.reduce((a, d) => a + (d.grossRevenue || 0), 0);
    const delivered = visible.reduce((a, d) => a + (d.completedOrders || 0), 0);
    const days = visible.length || 1;
    return { revenue, delivered, avgRevenue: revenue / days, avgDelivered: delivered / days };
  }, [visible]);

  const dataKey = mode === 'revenue' ? 'grossRevenue' : 'completedOrders';
  const rangeInfo = RANGES.find((r) => r.key === range)!;

  if (isLoading || !data || data.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-slate-200 p-5">
        <div className="h-4 w-32 bg-slate-100 rounded animate-pulse" />
        <div className="mt-6 h-56 bg-slate-50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-4 sm:p-5">
      {/* Title + controls */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5 hidden sm:block">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium" role="tablist" aria-label="Measure">
            {(['revenue', 'orders'] as MetricMode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {m === 'revenue' ? 'Revenue' : 'Orders'}
              </button>
            ))}
          </div>
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as RangeKey);
              setActiveIndex(null);
            }}
            aria-label="Period"
            className="h-8 rounded-lg border border-slate-200 bg-white pl-2.5 pr-7 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Headline for the chosen period */}
      <div className="mt-4">
        <div className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {mode === 'revenue' ? formatNaira(totals.revenue) : `${totals.delivered.toLocaleString()} delivered`}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">
          {rangeInfo.phrase} ·{' '}
          {mode === 'revenue'
            ? `${formatNaira(Math.round(totals.avgRevenue))} a day on average`
            : `${totals.avgDelivered.toFixed(0)} a day on average`}
        </div>
        {mode === 'orders' && dailyTarget && (
          <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
            <svg width="18" height="2" aria-hidden="true">
              <line x1="0" y1="1" x2="18" y2="1" stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
            Today&apos;s target: {dailyTarget} orders
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="mt-4 h-56 sm:h-72 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={visible}
            margin={{ top: 8, right: 4, left: 0, bottom: 0 }}
            barCategoryGap={visible.length > 60 ? 1 : '20%'}
            onMouseLeave={() => setActiveIndex(null)}
            onClick={(state: any) => {
              const d = state?.activePayload?.[0]?.payload as DailyDataPoint | undefined;
              if (d && onSelectDate) onSelectDate(d.date);
            }}
            className={onSelectDate ? 'cursor-pointer' : ''}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fontSize: 11, fill: INK_MUTED }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              width={44}
              tick={{ fontSize: 11, fill: INK_MUTED }}
              tickLine={false}
              axisLine={false}
              tickCount={4}
              allowDecimals={false}
              tickFormatter={(v: number) => (mode === 'revenue' ? compactNaira(v) : String(v))}
            />
            <Tooltip content={<DayTooltip />} cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }} />
            {mode === 'orders' && dailyTarget && (
              <ReferenceLine
                y={dailyTarget}
                stroke="#64748b"
                strokeDasharray="4 4"
              />
            )}
            <Bar
              dataKey={dataKey}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              onMouseEnter={(_: any, i: number) => setActiveIndex(i)}
              shape={(props: any) => {
                const { x, y, width, height, index } = props;
                if (!height || height <= 0) return <g />;
                const r = Math.min(4, width / 2, height);
                const fill = index === activeIndex ? BAR_COLOR_ACTIVE : BAR_COLOR;
                return (
                  <path
                    d={`M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`}
                    fill={fill}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
