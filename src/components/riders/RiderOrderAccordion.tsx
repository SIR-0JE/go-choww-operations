'use client';

import React, { useState, useMemo } from 'react';
import { formatNaira } from '@/lib/financials';
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  Package,
  Bike,
  Clock,
  Building,
  MapPin,
  User,
  ArrowRightLeft,
  X,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export interface AccordionOrder {
  id: string;
  orderId: string;
  createdAt: string;
  time: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryFee: number;
  deliveryType: string;
  orderStatus: string;
  paymentStatus: string;
}

export interface RiderOption {
  id: string;
  name: string;
  phone?: string;
  status?: string;
}

interface RiderOrderAccordionProps {
  orders: AccordionOrder[];
  ridersList?: RiderOption[];
  onOrderReassigned?: () => void;
}

interface DayGroup {
  dateKey: string; // YYYY-MM-DD
  displayDate: string;
  orders: AccordionOrder[];
  totalOrders: number;
  sameSideCount: number;
  differentSideCount: number;
  pickUpCount: number;
  totalEarnings: number;
}

interface WeekGroup {
  weekKey: string;
  weekLabel: string;
  days: DayGroup[];
  totalOrders: number;
  sameSideCount: number;
  differentSideCount: number;
  totalEarnings: number;
}

interface MonthGroup {
  monthKey: string;
  monthName: string;
  weeks: WeekGroup[];
  totalOrders: number;
  sameSideCount: number;
  differentSideCount: number;
  totalEarnings: number;
}

export const RiderOrderAccordion: React.FC<RiderOrderAccordionProps> = ({
  orders,
  ridersList: propRidersList,
  onOrderReassigned,
}) => {
  const [internalRidersList, setInternalRidersList] = useState<RiderOption[]>([]);
  const [reassignOrder, setReassignOrder] = useState<AccordionOrder | null>(null);
  const [selectedNewRiderId, setSelectedNewRiderId] = useState<string>('unassigned');
  const [isReassigning, setIsReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);

  const activeRidersList = propRidersList && propRidersList.length > 0 ? propRidersList : internalRidersList;

  React.useEffect(() => {
    if (!propRidersList || propRidersList.length === 0) {
      fetch('/api/riders')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.riders) {
            setInternalRidersList(data.riders);
          }
        })
        .catch(() => {});
    }
  }, [propRidersList]);

  const handleConfirmReassign = async () => {
    if (!reassignOrder) return;
    setIsReassigning(true);
    setReassignError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: reassignOrder.orderId || reassignOrder.id,
          riderId: selectedNewRiderId === 'unassigned' ? null : selectedNewRiderId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReassignOrder(null);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('orders-synced'));
        }
        if (onOrderReassigned) {
          onOrderReassigned();
        }
      } else {
        setReassignError(data.error || 'Failed to reassign order');
      }
    } catch (err: any) {
      setReassignError(err?.message || 'Network error while reassigning');
    } finally {
      setIsReassigning(false);
    }
  };

  // Sort orders chronologically (newest first)
  const sortedOrders = useMemo(() => {
    return [...orders].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [orders]);

  // Build hierarchical breakdown: Month -> Week -> Day -> Orders
  const groupedData = useMemo(() => {
    const monthsMap = new Map<string, { monthName: string; orders: AccordionOrder[] }>();

    for (const ord of sortedOrders) {
      const d = new Date(ord.createdAt);
      if (isNaN(d.getTime())) continue;

      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, { monthName, orders: [] });
      }
      monthsMap.get(monthKey)!.orders.push(ord);
    }

    const monthGroups: MonthGroup[] = [];

    for (const [monthKey, monthData] of monthsMap.entries()) {
      // Group into weeks (Days 1-7 = Week 1, 8-14 = Week 2, 15-21 = Week 3, 22+ = Week 4)
      const weeksMap = new Map<string, { weekLabel: string; orders: AccordionOrder[] }>();

      for (const ord of monthData.orders) {
        const d = new Date(ord.createdAt);
        const dayOfMonth = d.getDate();

        let weekNum = 1;
        let weekLabel = 'Week 1 (Day 1 - 7)';
        if (dayOfMonth >= 22) {
          weekNum = 4;
          weekLabel = 'Week 4 (Day 22+)';
        } else if (dayOfMonth >= 15) {
          weekNum = 3;
          weekLabel = 'Week 3 (Day 15 - 21)';
        } else if (dayOfMonth >= 8) {
          weekNum = 2;
          weekLabel = 'Week 2 (Day 8 - 14)';
        }

        const weekKey = `${monthKey}-W${weekNum}`;
        if (!weeksMap.has(weekKey)) {
          weeksMap.set(weekKey, { weekLabel, orders: [] });
        }
        weeksMap.get(weekKey)!.orders.push(ord);
      }

      const weekGroups: WeekGroup[] = [];

      for (const [weekKey, weekData] of weeksMap.entries()) {
        // Group into days
        const daysMap = new Map<string, { displayDate: string; orders: AccordionOrder[] }>();

        for (const ord of weekData.orders) {
          const d = new Date(ord.createdAt);
          const dateKey = d.toISOString().split('T')[0];
          const displayDate = d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          if (!daysMap.has(dateKey)) {
            daysMap.set(dateKey, { displayDate, orders: [] });
          }
          daysMap.get(dateKey)!.orders.push(ord);
        }

        const dayGroups: DayGroup[] = [];

        for (const [dateKey, dayData] of daysMap.entries()) {
          let daySame = 0;
          let dayDiff = 0;
          let dayPick = 0;

          for (const ord of dayData.orders) {
            const t = (ord.deliveryType || '').toLowerCase();
            if (t.includes('same')) daySame++;
            else if (t.includes('diff')) dayDiff++;
            else if (t.includes('pick')) dayPick++;
            else daySame++;
          }

          const dayEarnings = daySame * 50 + dayDiff * 90;

          dayGroups.push({
            dateKey,
            displayDate: dayData.displayDate,
            orders: dayData.orders,
            totalOrders: dayData.orders.length,
            sameSideCount: daySame,
            differentSideCount: dayDiff,
            pickUpCount: dayPick,
            totalEarnings: dayEarnings,
          });
        }

        // Sort days descending
        dayGroups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));

        const weekSame = dayGroups.reduce((acc, d) => acc + d.sameSideCount, 0);
        const weekDiff = dayGroups.reduce((acc, d) => acc + d.differentSideCount, 0);
        const weekEarnings = dayGroups.reduce((acc, d) => acc + d.totalEarnings, 0);
        const weekTotal = dayGroups.reduce((acc, d) => acc + d.totalOrders, 0);

        weekGroups.push({
          weekKey,
          weekLabel: weekData.weekLabel,
          days: dayGroups,
          totalOrders: weekTotal,
          sameSideCount: weekSame,
          differentSideCount: weekDiff,
          totalEarnings: weekEarnings,
        });
      }

      // Sort weeks descending (W4 down to W1)
      weekGroups.sort((a, b) => b.weekKey.localeCompare(a.weekKey));

      const monthSame = weekGroups.reduce((acc, w) => acc + w.sameSideCount, 0);
      const monthDiff = weekGroups.reduce((acc, w) => acc + w.differentSideCount, 0);
      const monthEarnings = weekGroups.reduce((acc, w) => acc + w.totalEarnings, 0);
      const monthTotal = weekGroups.reduce((acc, w) => acc + w.totalOrders, 0);

      monthGroups.push({
        monthKey,
        monthName: monthData.monthName,
        weeks: weekGroups,
        totalOrders: monthTotal,
        sameSideCount: monthSame,
        differentSideCount: monthDiff,
        totalEarnings: monthEarnings,
      });
    }

    // Sort months descending (e.g. 2026-06 down to 2026-01)
    monthGroups.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    return monthGroups;
  }, [sortedOrders]);

  // Expanded states (Set of keys for months, weeks, days)
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => {
    // Expand the first (most recent) month by default
    return new Set(groupedData.length > 0 ? [groupedData[0].monthKey] : []);
  });

  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(() => {
    if (groupedData.length > 0 && groupedData[0].weeks.length > 0) {
      return new Set([groupedData[0].weeks[0].weekKey]);
    }
    return new Set();
  });

  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => {
    if (
      groupedData.length > 0 &&
      groupedData[0].weeks.length > 0 &&
      groupedData[0].weeks[0].days.length > 0
    ) {
      return new Set([groupedData[0].weeks[0].days[0].dateKey]);
    }
    return new Set();
  });

  const toggleMonth = (key: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleWeek = (key: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDay = (key: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (orders.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 text-slate-400">
        <Bike className="w-8 h-8 mx-auto mb-2 text-slate-300" />
        <p className="text-sm font-semibold text-slate-600">No delivery orders assigned yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Assign deliveries to this rider in the Raw Data table to view chronological history.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groupedData.map((month) => {
        const isMonthExpanded = expandedMonths.has(month.monthKey);

        return (
          <div
            key={month.monthKey}
            className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden shadow-sm transition-all"
          >
            {/* ─────────────────────────────────────────────────────────────
                LEVEL 1: MONTH ACCORDION HEADER
            ───────────────────────────────────────────────────────────── */}
            <button
              onClick={() => toggleMonth(month.monthKey)}
              className="w-full p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left hover:bg-slate-50/70 transition-colors cursor-pointer border-b border-slate-100"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-slate-900 text-white shadow-sm">
                  <Calendar className="w-4 h-4 text-brand-400" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>{month.monthName}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      {month.totalOrders} runs
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {month.sameSideCount} Same Side (₦50) • {month.differentSideCount} Different Side (₦90)
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-extrabold text-slate-400 block tracking-wider">
                    Monthly Payout
                  </span>
                  <span className="text-sm font-black text-emerald-700 tabular-nums">
                    {formatNaira(month.totalEarnings)}
                  </span>
                </div>
                <div className="p-1 rounded-lg bg-slate-100 text-slate-500">
                  {isMonthExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </div>
              </div>
            </button>

            {/* LEVEL 1 BODY: WEEKS LIST */}
            {isMonthExpanded && (
              <div className="p-3.5 space-y-2.5 bg-slate-50/40">
                {month.weeks.map((week) => {
                  const isWeekExpanded = expandedWeeks.has(week.weekKey);

                  return (
                    <div
                      key={week.weekKey}
                      className="rounded-xl border border-slate-200/80 bg-white overflow-hidden shadow-xs"
                    >
                      {/* ─────────────────────────────────────────────────────────────
                          LEVEL 2: WEEK ACCORDION HEADER
                      ───────────────────────────────────────────────────────────── */}
                      <button
                        onClick={() => toggleWeek(week.weekKey)}
                        className="w-full p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-brand-500" />
                          <span className="text-xs font-bold text-slate-900">
                            {week.weekLabel}
                          </span>
                          <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {week.totalOrders} runs
                          </span>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2.5">
                          <div className="text-right text-xs">
                            <span className="font-extrabold text-emerald-700 tabular-nums">
                              {formatNaira(week.totalEarnings)}
                            </span>
                          </div>
                          <div className="text-slate-400">
                            {isWeekExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                          </div>
                        </div>
                      </button>

                      {/* LEVEL 2 BODY: DAYS LIST */}
                      {isWeekExpanded && (
                        <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50/60">
                          {week.days.map((day) => {
                            const isDayExpanded = expandedDays.has(day.dateKey);

                            return (
                              <div
                                key={day.dateKey}
                                className="rounded-lg border border-slate-200 bg-white overflow-hidden"
                              >
                                {/* ─────────────────────────────────────────────────────────────
                                    LEVEL 3: DAY ACCORDION HEADER
                                ───────────────────────────────────────────────────────────── */}
                                <button
                                  onClick={() => toggleDay(day.dateKey)}
                                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50/80 transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-extrabold text-slate-800">
                                      {day.displayDate}
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                                      {day.totalOrders} orders
                                    </span>
                                    {day.sameSideCount > 0 && (
                                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
                                        {day.sameSideCount} Same (₦50)
                                      </span>
                                    )}
                                    {day.differentSideCount > 0 && (
                                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                        {day.differentSideCount} Diff (₦90)
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs font-black text-emerald-700 tabular-nums">
                                      {formatNaira(day.totalEarnings)}
                                    </span>
                                    <div className="text-slate-400">
                                      {isDayExpanded ? (
                                        <ChevronDown className="w-3.5 h-3.5" />
                                      ) : (
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      )}
                                    </div>
                                  </div>
                                </button>

                                {/* ─────────────────────────────────────────────────────────────
                                    LEVEL 4: INDIVIDUAL ORDERS TABLE
                                ───────────────────────────────────────────────────────────── */}
                                {isDayExpanded && (
                                  <div className="border-t border-slate-100 overflow-x-auto">
                                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                                        <tr>
                                          <th className="px-3 py-2">Time</th>
                                          <th className="px-3 py-2">Order ID</th>
                                          <th className="px-3 py-2">Customer</th>
                                          <th className="px-3 py-2">Cafeteria</th>
                                          <th className="px-3 py-2">Destination</th>
                                          <th className="px-3 py-2">Type</th>
                                          <th className="px-3 py-2 text-right font-bold">Rider Pay</th>
                                          <th className="px-3 py-2 text-center">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {day.orders.map((ord) => {
                                          const type = (ord.deliveryType || '').toLowerCase();
                                          const isSame = type.includes('same');
                                          const isDiff = type.includes('diff');
                                          const pay = isSame ? 50 : isDiff ? 90 : 0;

                                          return (
                                            <tr
                                              key={ord.orderId}
                                              className="hover:bg-slate-50/70 transition-colors"
                                            >
                                              <td className="px-3 py-2 text-slate-500 font-medium">
                                                <span className="flex items-center gap-1">
                                                  <Clock className="w-3 h-3 text-slate-400" />
                                                  {ord.time || '12:00 PM'}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 font-bold font-mono text-slate-900 text-[11px]">
                                                {ord.orderId}
                                              </td>
                                              <td className="px-3 py-2 font-semibold text-slate-800">
                                                <span className="flex items-center gap-1">
                                                  <User className="w-3 h-3 text-slate-400" />
                                                  {ord.customerName}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 font-medium text-amber-700">
                                                <span className="flex items-center gap-1">
                                                  <Building className="w-3 h-3 text-amber-500" />
                                                  {ord.cafeteriaName}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-slate-600 max-w-[150px] truncate">
                                                <span className="flex items-center gap-1">
                                                  <MapPin className="w-3 h-3 text-slate-400" />
                                                  {ord.deliveryAddress}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2">
                                                <span
                                                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                                    isSame
                                                      ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                                      : isDiff
                                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                  }`}
                                                >
                                                  {ord.deliveryType}
                                                </span>
                                              </td>
                                              <td className="px-3 py-2 text-right font-black text-slate-900">
                                                {formatNaira(pay)}
                                              </td>
                                              <td className="px-3 py-2 text-center">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setReassignOrder(ord);
                                                    setSelectedNewRiderId('unassigned');
                                                    setReassignError(null);
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 transition-colors"
                                                  title="Reassign to another rider"
                                                >
                                                  <ArrowRightLeft className="w-3 h-3" />
                                                  <span>Reassign</span>
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* ─────────────────────────────────────────────────────────────
          ADMIN REASSIGN ORDER MODAL
      ───────────────────────────────────────────────────────────── */}
      {reassignOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Reassign Delivery Order</h3>
                  <p className="text-xs text-slate-500 font-mono">Order #{reassignOrder.orderId}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReassignOrder(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {reassignError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{reassignError}</span>
              </div>
            )}

            {/* Order Details Brief */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-bold text-slate-800">{reassignOrder.customerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Cafeteria:</span>
                <span className="font-bold text-slate-800">{reassignOrder.cafeteriaName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Destination:</span>
                <span className="font-bold text-slate-800">{reassignOrder.deliveryAddress}</span>
              </div>
            </div>

            {/* Reassign Selector */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Assign to Rider:
              </label>
              <select
                value={selectedNewRiderId}
                onChange={(e) => setSelectedNewRiderId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="unassigned">— Unassign (Return to Available Pool) —</option>
                {activeRidersList
                  .filter((r) => !r.status || r.status === 'Active')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.phone ? `(${r.phone})` : ''}
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-400">
                Selecting &quot;Unassign&quot; will place this order back in the Available Pool for any rider to claim.
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isReassigning}
                onClick={() => setReassignOrder(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReassigning}
                onClick={handleConfirmReassign}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {isReassigning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Reassignment</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
