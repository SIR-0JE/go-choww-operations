'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Flame,
  Moon,
  Zap,
  Store,
  Clock,
  ChevronDown,
  ChevronUp,
  Package,
  TrendingUp,
  Bike,
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
} from 'recharts';
import { formatNaira, isSettledOrder, isRevenueOrder } from '@/lib/financials';

export interface OrderItem {
  id?: string;
  orderId: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryFee: number;
  foodTotal?: number;
  totalAmountPaid?: number;
  deliveryType: string;
  orderStatus: string;
  paymentStatus?: string;
  riderId?: string | null;
  rider?: {
    id: string;
    name: string;
    phone?: string;
    status?: string;
  } | null;
  time?: string;
  createdAt: string;
  isSettled?: boolean;
}

interface IntradayVelocityDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  dateStr: string; // "YYYY-MM-DD"
  displayDate: string;
  orders: OrderItem[];
}

type Granularity = '1hour' | '30min';

interface TimeBucket {
  key: string;
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  orders: OrderItem[];
  orderCount: number;
  grossDeliveryRev: number;
  grossFoodTotal: number;
  cafeteriaCounts: Record<string, number>;
  rushLevel: 'peak' | 'high' | 'moderate' | 'quiet' | 'dormant';
}

// Format 24hr hour and min into 12-hour AM/PM string
function formatTime12(hour: number, min: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mStr = min < 10 ? `0${min}` : `${min}`;
  return `${h12}:${mStr} ${period}`;
}

export const IntradayVelocityDrawer: React.FC<IntradayVelocityDrawerProps> = ({
  isOpen,
  onClose,
  dateStr,
  displayDate,
  orders,
}) => {
  const [granularity, setGranularity] = useState<Granularity>('1hour');
  const [expandedBucketKey, setExpandedBucketKey] = useState<string | null>(null);
  const [hideZeroBuckets, setHideZeroBuckets] = useState<boolean>(true);

  // Overall day metrics
  const dayStats = useMemo(() => {
    const totalOrders = orders.length;
    const completedOrders = orders.filter((o) => o.isSettled || isSettledOrder(o)).length;
    const deliveryRev = orders.reduce(
      (sum, o) => (isRevenueOrder(o) ? sum + (Number(o.deliveryFee) || 0) : sum),
      0
    );
    const foodRev = orders.reduce((sum, o) => sum + (Number(o.foodTotal) || 0), 0);

    // Vendor volume ranking
    const vendorMap: Record<string, number> = {};
    for (const o of orders) {
      const v = (o.cafeteriaName || 'Unknown').trim();
      vendorMap[v] = (vendorMap[v] || 0) + 1;
    }
    const topVendors = Object.entries(vendorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return { totalOrders, completedOrders, deliveryRev, foodRev, topVendors };
  }, [orders]);

  // Compute time buckets based on granularity
  const { buckets, peakBucket, quietBucket, avgOrdersPerHour } = useMemo(() => {
    if (orders.length === 0) {
      return { buckets: [], peakBucket: null, quietBucket: null, avgOrdersPerHour: '0' };
    }

    const intervalMinutes = granularity === '1hour' ? 60 : 30;
    const totalBuckets = (24 * 60) / intervalMinutes;

    const bucketList: TimeBucket[] = [];

    for (let i = 0; i < totalBuckets; i++) {
      const totalStartMin = i * intervalMinutes;
      const startHour = Math.floor(totalStartMin / 60);
      const startMin = totalStartMin % 60;

      const totalEndMin = totalStartMin + intervalMinutes;
      const endHour = Math.floor(totalEndMin / 60) % 24;
      const endMin = totalEndMin % 60;

      const startLabel = formatTime12(startHour, startMin);
      const endLabel = formatTime12(endHour, endMin);
      const label = `${startLabel} – ${endLabel}`;
      const key = `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`;

      bucketList.push({
        key,
        label,
        startHour,
        startMin,
        endHour,
        endMin,
        orders: [],
        orderCount: 0,
        grossDeliveryRev: 0,
        grossFoodTotal: 0,
        cafeteriaCounts: {},
        rushLevel: 'dormant',
      });
    }

    // Place each order into its bucket
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const h = d.getHours();
      const m = d.getMinutes();

      let bucketIndex = 0;
      if (granularity === '1hour') {
        bucketIndex = h;
      } else {
        bucketIndex = h * 2 + (m >= 30 ? 1 : 0);
      }

      if (bucketIndex >= 0 && bucketIndex < bucketList.length) {
        const b = bucketList[bucketIndex];
        b.orders.push(o);
        b.orderCount += 1;
        if (isRevenueOrder(o)) {
          b.grossDeliveryRev += Number(o.deliveryFee) || 0;
        }
        b.grossFoodTotal += Number(o.foodTotal) || 0;

        const vendor = (o.cafeteriaName || 'Unknown').trim();
        b.cafeteriaCounts[vendor] = (b.cafeteriaCounts[vendor] || 0) + 1;
      }
    }

    // Determine Peak & Dull Windows
    const maxCount = Math.max(...bucketList.map((b) => b.orderCount), 0);

    // Business hours window (08:00 to 21:00) for realistic quiet detection
    const businessBuckets = bucketList.filter((b) => b.startHour >= 8 && b.startHour < 21);

    let peak: TimeBucket | null = null;
    let quiet: TimeBucket | null = null;

    if (maxCount > 0) {
      peak = bucketList.find((b) => b.orderCount === maxCount) || null;
    }

    if (businessBuckets.length > 0) {
      const sortedByLowest = [...businessBuckets].sort((a, b) => a.orderCount - b.orderCount);
      // Pick the quietest slot during operational business hours
      quiet = sortedByLowest[0] || null;
    }

    // Classify Rush Levels
    bucketList.forEach((b) => {
      if (b.orderCount === 0) {
        b.rushLevel = 'dormant';
      } else if (b.orderCount === maxCount && maxCount > 0) {
        b.rushLevel = 'peak';
      } else if (b.orderCount >= maxCount * 0.65) {
        b.rushLevel = 'high';
      } else if (b.orderCount >= maxCount * 0.25) {
        b.rushLevel = 'moderate';
      } else {
        b.rushLevel = 'quiet';
      }
    });

    // Compute active velocity (orders per active hour)
    const activeBuckets = bucketList.filter((b) => b.orderCount > 0);
    const activeHours = (activeBuckets.length * intervalMinutes) / 60;
    const avgVelocity = activeHours > 0 ? (orders.length / activeHours).toFixed(1) : '0';

    return {
      buckets: bucketList,
      peakBucket: peak,
      quietBucket: quiet,
      avgOrdersPerHour: avgVelocity,
    };
  }, [orders, granularity]);

  // Filter buckets for display if hideZeroBuckets is on
  const displayBuckets = useMemo(() => {
    if (!hideZeroBuckets) return buckets;
    const activeIndices = buckets
      .map((b, idx) => (b.orderCount > 0 ? idx : -1))
      .filter((idx) => idx !== -1);

    if (activeIndices.length === 0) return buckets;

    const minIdx = Math.max(0, Math.min(...activeIndices) - 1);
    const maxIdx = Math.min(buckets.length - 1, Math.max(...activeIndices) + 1);

    return buckets.slice(minIdx, maxIdx + 1);
  }, [buckets, hideZeroBuckets]);

  // Toggle accordion for order inspection
  const toggleAccordion = (key: string) => {
    setExpandedBucketKey((prev) => (prev === key ? null : key));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Background dismissal */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="relative z-10 w-full max-w-4xl h-full bg-slate-50 border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
        {/* ── Drawer Header ────────────────────────────────────────────── */}
        <div className="bg-white px-6 py-5 border-b border-slate-200/90 flex items-center justify-between shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-brand-50 text-brand-600 border border-brand-200">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-slate-900">
                    Intraday Order Velocity &amp; Rush Breakdown
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                    {displayDate}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  Hourly order intake velocity, peak rush detection, quiet periods, and cafeteria surge analysis
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Close Drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable Body Content ──────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Key Metrics & Rush Insights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Peak Rush Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-600" />
                  Peak Rush Hour
                </span>
                {peakBucket && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-200/80 text-amber-900">
                    {((peakBucket.orderCount / (dayStats.totalOrders || 1)) * 100).toFixed(0)}% Day Vol
                  </span>
                )}
              </div>
              <div className="mt-2">
                <p className="text-sm font-extrabold text-amber-950">
                  {peakBucket && peakBucket.orderCount > 0 ? peakBucket.label : 'No Peak Detected'}
                </p>
                <p className="text-xs font-semibold text-amber-700 mt-0.5">
                  {peakBucket && peakBucket.orderCount > 0
                    ? `${peakBucket.orderCount} Orders received`
                    : '0 orders'}
                </p>
              </div>
            </div>

            {/* Quiet / Dull Period Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200/60 border border-slate-300/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-slate-500" />
                  Slowest Window
                </span>
                <span className="text-[10px] font-semibold text-slate-500">8am - 9pm</span>
              </div>
              <div className="mt-2">
                <p className="text-sm font-extrabold text-slate-800">
                  {quietBucket ? quietBucket.label : 'N/A'}
                </p>
                <p className="text-xs font-semibold text-slate-600 mt-0.5">
                  {quietBucket ? `${quietBucket.orderCount} Orders received` : '0 orders'}
                </p>
              </div>
            </div>

            {/* Intake Velocity */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-blue-600" />
                  Average Velocity
                </span>
              </div>
              <div className="mt-2">
                <p className="text-xl font-black text-blue-950">
                  {avgOrdersPerHour}{' '}
                  <span className="text-xs font-semibold text-blue-600">orders / hr</span>
                </p>
                <p className="text-xs font-medium text-blue-700 mt-0.5">
                  Across active operating hours
                </p>
              </div>
            </div>

            {/* Total Day Logistics Revenue */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200/80 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-emerald-600" />
                  Daily Gross Total
                </span>
              </div>
              <div className="mt-2">
                <p className="text-xl font-black text-emerald-950">
                  {formatNaira(dayStats.deliveryRev)}
                </p>
                <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                  {dayStats.totalOrders} total runs ({dayStats.completedOrders} settled)
                </p>
              </div>
            </div>
          </div>

          {/* 2. Top Cafeteria Surge Leaderboard for this Day */}
          {dayStats.topVendors.length > 0 && (
            <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-brand-600" />
                  Cafeteria Surge Leaderboard (Full Day)
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  Highest volume order origins
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {dayStats.topVendors.map(([vendor, count], idx) => (
                  <div
                    key={vendor}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-extrabold text-[10px] flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="font-bold text-slate-800">{vendor}</span>
                    <span className="font-extrabold text-brand-600 px-1.5 py-0.5 rounded bg-brand-50 border border-brand-200/60 text-[11px]">
                      {count} orders
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Intraday Velocity Bar Chart & Granularity Switcher */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-600" />
                  Order Velocity Intake Curve
                </h4>
                <p className="text-xs text-slate-500 font-normal">
                  Visual distribution of incoming orders throughout the day
                </p>
              </div>

              {/* Granularity & View Controls */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {/* Granularity Switcher */}
                <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-bold shadow-inner">
                  <button
                    onClick={() => setGranularity('1hour')}
                    className={`px-3 py-1 rounded-xl transition-all ${
                      granularity === '1hour'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    1-Hour Blocks
                  </button>
                  <button
                    onClick={() => setGranularity('30min')}
                    className={`px-3 py-1 rounded-xl transition-all ${
                      granularity === '30min'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    30-Min Rush Buckets
                  </button>
                </div>

                {/* Hide zero toggle */}
                <button
                  onClick={() => setHideZeroBuckets(!hideZeroBuckets)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    hideZeroBuckets
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Toggle displaying inactive empty hours"
                >
                  {hideZeroBuckets ? 'Active Hours Only' : 'All 24 Hours'}
                </button>
              </div>
            </div>

            {/* Chart Area */}
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={displayBuckets}
                  margin={{ top: 10, right: 10, left: -20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="key"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    interval={granularity === '30min' ? 1 : 0}
                    angle={-35}
                    textAnchor="end"
                    tickFormatter={(val) => {
                      const [h, m] = val.split(':').map(Number);
                      return formatTime12(h, m);
                    }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc', opacity: 0.8 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const b: TimeBucket = payload[0]?.payload;
                        if (!b) return null;
                        const topVendorsSlot = Object.entries(b.cafeteriaCounts)
                          .sort((a, b) => b[1] - a[1])
                          .slice(0, 2);

                        return (
                          <div className="rounded-xl bg-white border border-slate-200 p-3 shadow-xl text-xs space-y-1.5 z-50 min-w-[200px]">
                            <div className="font-extrabold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                              <span>{b.label}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                  b.rushLevel === 'peak'
                                    ? 'bg-amber-100 text-amber-800'
                                    : b.rushLevel === 'high'
                                    ? 'bg-orange-100 text-orange-800'
                                    : b.rushLevel === 'moderate'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {b.rushLevel.toUpperCase()}
                              </span>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Orders Placed:</span>
                              <strong className="text-slate-900 font-bold">{b.orderCount}</strong>
                            </div>
                            <div className="flex justify-between text-slate-600">
                              <span>Delivery Fees:</span>
                              <strong className="text-brand-600 font-bold">
                                {formatNaira(b.grossDeliveryRev)}
                              </strong>
                            </div>
                            {topVendorsSlot.length > 0 && (
                              <div className="pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                                <span>Top Vendors: </span>
                                {topVendorsSlot.map(([v, c]) => `${v} (${c})`).join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="orderCount"
                    radius={[6, 6, 0, 0]}
                    onClick={(data) => {
                      if (data?.key) toggleAccordion(data.key);
                    }}
                    className="cursor-pointer"
                  >
                    {displayBuckets.map((b) => {
                      let color = '#94a3b8'; // quiet
                      if (b.rushLevel === 'peak') color = '#f59e0b'; // amber/orange
                      else if (b.rushLevel === 'high') color = '#fb923c';
                      else if (b.rushLevel === 'moderate') color = '#3b82f6'; // blue
                      else if (b.rushLevel === 'dormant') color = '#e2e8f0';

                      return <Cell key={b.key} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Time Window Breakdown Table & Order Inspector */}
          <div className="rounded-3xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  Time Slot Velocity Ledger
                </h4>
                <p className="text-xs text-slate-500 font-normal">
                  Click on any time block to expand and inspect the individual orders received
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                {displayBuckets.filter((b) => b.orderCount > 0).length} Active Intervals
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {displayBuckets.map((bucket) => {
                const isExpanded = expandedBucketKey === bucket.key;
                const topVendorsSlot = Object.entries(bucket.cafeteriaCounts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3);

                const percentOfDay =
                  dayStats.totalOrders > 0
                    ? ((bucket.orderCount / dayStats.totalOrders) * 100).toFixed(1)
                    : '0';

                return (
                  <div key={bucket.key} className="transition-colors">
                    {/* Time Slot Row */}
                    <div
                      onClick={() => bucket.orderCount > 0 && toggleAccordion(bucket.key)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        bucket.orderCount > 0
                          ? 'hover:bg-slate-50/90 cursor-pointer'
                          : 'opacity-50'
                      } ${isExpanded ? 'bg-slate-50' : ''}`}
                    >
                      {/* Left: Window & Intensity Badge */}
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            bucket.rushLevel === 'peak'
                              ? 'bg-amber-500 animate-pulse'
                              : bucket.rushLevel === 'high'
                              ? 'bg-orange-400'
                              : bucket.rushLevel === 'moderate'
                              ? 'bg-blue-500'
                              : bucket.orderCount > 0
                              ? 'bg-slate-400'
                              : 'bg-slate-200'
                          }`}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-slate-900 text-xs">
                              {bucket.label}
                            </span>
                            {bucket.rushLevel === 'peak' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                <Flame className="w-3 h-3 text-amber-600" />
                                PEAK RUSH
                              </span>
                            )}
                            {bucket.rushLevel === 'high' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-orange-100 text-orange-800 border border-orange-200">
                                HIGH RUSH
                              </span>
                            )}
                          </div>
                          {topVendorsSlot.length > 0 ? (
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                              Surge:{' '}
                              {topVendorsSlot.map(([v, c]) => `${v} (${c})`).join(', ')}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                              No orders in this slot
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Metrics & Accordion Trigger */}
                      <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-auto text-xs">
                        {/* Order Count & Progress */}
                        <div className="text-right">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {bucket.orderCount}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {percentOfDay}% of day
                          </span>
                        </div>

                        {/* Revenue */}
                        <div className="text-right min-w-[70px]">
                          <span className="font-extrabold text-brand-600">
                            {formatNaira(bucket.grossDeliveryRev)}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            logistics fee
                          </span>
                        </div>

                        {/* Expand Button */}
                        {bucket.orderCount > 0 && (
                          <button
                            type="button"
                            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1"
                          >
                            <span>Inspect</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded Order Inspector Accordion */}
                    {isExpanded && bucket.orders.length > 0 && (
                      <div className="bg-white px-4 py-3 border-t border-slate-200/70 space-y-2 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                          <span className="flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5 text-brand-600" />
                            {bucket.orders.length} Orders Placed during {bucket.label}
                          </span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                          <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                            <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2">Order ID</th>
                                <th className="px-3 py-2">Time</th>
                                <th className="px-3 py-2">Customer</th>
                                <th className="px-3 py-2">Cafeteria / Vendor</th>
                                <th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2 text-right">Fee</th>
                                <th className="px-3 py-2">Rider</th>
                                <th className="px-3 py-2 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-[11px]">
                              {bucket.orders.map((ord) => {
                                const ordTime = ord.createdAt
                                  ? new Date(ord.createdAt).toLocaleTimeString('en-US', {
                                      hour: 'numeric',
                                      minute: '2-digit',
                                      hour12: true,
                                    })
                                  : ord.time || 'N/A';

                                return (
                                  <tr key={ord.orderId} className="hover:bg-slate-50/60">
                                    <td className="px-3 py-2 font-bold text-slate-900">
                                      #{ord.orderId}
                                    </td>
                                    <td className="px-3 py-2 text-slate-500">{ordTime}</td>
                                    <td className="px-3 py-2 text-slate-800 font-semibold">
                                      {ord.customerName}
                                    </td>
                                    <td className="px-3 py-2 text-slate-700">
                                      {ord.cafeteriaName}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          (ord.deliveryType || '')
                                            .toLowerCase()
                                            .includes('same')
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : (ord.deliveryType || '')
                                                .toLowerCase()
                                                .includes('diff')
                                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        }`}
                                      >
                                        {ord.deliveryType}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right font-bold text-slate-900">
                                      {formatNaira(Number(ord.deliveryFee) || 0)}
                                    </td>
                                    <td className="px-3 py-2">
                                      {ord.rider?.name ? (
                                        <span className="flex items-center gap-1 text-slate-800 font-semibold">
                                          <Bike className="w-3 h-3 text-brand-600" />
                                          {ord.rider.name}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">Unassigned</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          (ord.orderStatus || '')
                                            .toLowerCase()
                                            .includes('deliv') ||
                                          (ord.orderStatus || '')
                                            .toLowerCase()
                                            .includes('comp')
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : (ord.orderStatus || '')
                                                .toLowerCase()
                                                .includes('canc')
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'bg-amber-50 text-amber-700'
                                        }`}
                                      >
                                        {ord.orderStatus || 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Drawer Footer ────────────────────────────────────────────── */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-500 font-medium">
            Viewing intraday telemetry for <strong className="text-slate-800">{displayDate}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-sm"
          >
            Close Breakdown
          </button>
        </div>
      </div>
    </div>
  );
};
