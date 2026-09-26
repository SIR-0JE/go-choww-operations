'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner';
import { formatNaira, MetricsSummary, isSettledOrder, isRevenueOrder } from '@/lib/financials';
import {
  CheckCircle2,
  Bike,
  AlertOctagon,
  ChevronDown,
  ChevronRight,
  Target,
  Package,
  Truck,
} from 'lucide-react';
import { InteractiveDailyTrendChart, DailyDataPoint } from '@/components/charts/InteractiveDailyTrendChart';
import type { SprintStatus } from '@/lib/sprint';

interface MonthlyWeeklyBreakdown {
  monthKey: string;
  monthName: string;
  totalOrders: number;
  completedOrders: number;
  grossRevenue: number;
  riderPayout: number;
  expenses: number;
  netProfit: number;
  weeks: {
    weekLabel: string;
    dateRange: string;
    totalOrders: number;
    completedOrders: number;
    grossRevenue: number;
    riderPayout: number;
    expenses: number;
    netProfit: number;
  }[];
}

export default function ExecutiveDashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [sprint, setSprint] = useState<SprintStatus | null>(null);
  const [monthlyWeeklyData, setMonthlyWeeklyData] = useState<MonthlyWeeklyBreakdown[]>([]);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [activeOrdersCount, setActiveOrdersCount] = useState<number>(0);
  const [dailyData, setDailyData] = useState<DailyDataPoint[]>([]);
  const [dispatch, setDispatch] = useState<{
    waitingCount: number;
    waitingOverThreshold: number;
    oldestWaitingMinutes: number;
    oldestWaitingOrder: { orderId: string; cafeteriaName: string } | null;
    ridersOnline: number;
    thresholdMinutes: number;
    stuckOrders: { orderId: string; riderName: string; hours: number; status: string }[];
    stuckAfterHours: number;
  } | null>(null);

  // Orders waiting for a rider — refreshed every 20s
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/dispatch/status', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && data.success) setDispatch(data);
      } catch {
        // keep the last reading
      }
    };
    load();
    const interval = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Live rider activity notifications (accept / pickup / deliver)
  const [riderNotifications, setRiderNotifications] = useState<
    { id: number; riderName: string; action: string; orderId: string; timestamp: Date }[]
  >([]);
  const notifIdRef = useRef(0);

  // Operational Volume Breakdown stats
  const [volumeStats, setVolumeStats] = useState({
    completed: 0,
    refundedFailed: 0,
    canceled: 0,
    sameSide: 0,
    differentSide: 0,
    pickUp: 0,
    other: 0,
  });

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const [analyticsRes, ordersRes, expensesRes, sprintRes] = await Promise.all([
        fetch('/api/analytics'),
        fetch('/api/orders?limit=all'),
        fetch('/api/expenses'),
        fetch('/api/sprint', { cache: 'no-store' }),
      ]);

      const sprintData = await sprintRes.json().catch(() => null);
      if (sprintData?.success) setSprint(sprintData.sprint);

      const analyticsData = await analyticsRes.json();
      const ordersData = await ordersRes.json();
      const expensesData = await expensesRes.json();

      if (analyticsData.success) {
        setMetrics(analyticsData.metrics);
      }

      const allOrders: any[] = ordersData.orders || [];
      const allExpenses: any[] = expensesData.expenses || [];

      // Extract latest 10 orders for live incoming dispatches feed
      setRecentOrders(allOrders.slice(0, 10));

      // Calculate Operational Volume Counts
      let comp = 0;
      let refFail = 0;
      let canc = 0;
      let same = 0;
      let diff = 0;
      let pick = 0;
      let oth = 0;
      let inTransit = 0;

      for (const ord of allOrders) {
        const oStatus = (ord.orderStatus || '').toLowerCase();
        const pStatus = (ord.paymentStatus || '').toLowerCase();

        if (isSettledOrder(ord)) {
          comp += 1;
        } else if (pStatus === 'failed' || oStatus.includes('refund')) {
          refFail += 1;
        } else if (oStatus.includes('canc')) {
          canc += 1;
        } else {
          // Active uncompleted order (Confirmed, Preparing, Ready, Dispatched)
          inTransit += 1;
        }

        const dType = (ord.deliveryType || '').toLowerCase();
        if (dType === 'same side') same += 1;
        else if (dType === 'different side') diff += 1;
        else if (dType === 'pick up' || dType === 'pickup') pick += 1;
        else oth += 1;
      }

      setActiveOrdersCount(inTransit);

      setVolumeStats({
        completed: comp,
        refundedFailed: refFail,
        canceled: canc,
        sameSide: same,
        differentSide: diff,
        pickUp: pick,
        other: oth,
      });

      // Compute Daily Data Points for Interactive Daily Trend Chart
      const dayMap = new Map<string, DailyDataPoint>();
      for (const ord of allOrders) {
        const d = new Date(ord.createdAt);
        // Group by Lagos calendar day (WAT = UTC+1, no daylight saving)
        const dateKey = new Date(d.getTime() + 60 * 60 * 1000).toISOString().split('T')[0];
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
        if (isSettledOrder(ord)) {
          row.completedOrders += 1;
        }
        if (isRevenueOrder(ord)) {
          row.grossRevenue += Number(ord.deliveryFee) || 0;
        }
        const dType = (ord.deliveryType || '').toLowerCase();
        if (dType === 'same side') row.sameSide = (row.sameSide || 0) + 1;
        else if (dType === 'different side') row.differentSide = (row.differentSide || 0) + 1;
        else if (dType === 'pick up' || dType === 'pickup') row.pickUp = (row.pickUp || 0) + 1;
        else row.other = (row.other || 0) + 1;
      }
      setDailyData(Array.from(dayMap.values()));

      // Compute Joint Monthly and Weekly Breakdown
      computeJointMonthlyWeekly(allOrders, allExpenses);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, []);

  const getWeekInfo = (date: Date) => {
    const day = date.getDate();
    if (day <= 7) return { key: 'Week 1', range: 'Day 1 - 7' };
    if (day <= 14) return { key: 'Week 2', range: 'Day 8 - 14' };
    if (day <= 21) return { key: 'Week 3', range: 'Day 15 - 21' };
    return { key: 'Week 4+', range: 'Day 22 - 31' };
  };

  const computeJointMonthlyWeekly = (orders: any[], expenses: any[]) => {
    const monthMap = new Map<string, MonthlyWeeklyBreakdown>();

    const getOrCreateMonth = (mKey: string, mName: string) => {
      if (!monthMap.has(mKey)) {
        monthMap.set(mKey, {
          monthKey: mKey,
          monthName: mName,
          totalOrders: 0,
          completedOrders: 0,
          grossRevenue: 0,
          riderPayout: 0,
          expenses: 0,
          netProfit: 0,
          weeks: [
            { weekLabel: 'Week 1', dateRange: 'Day 1 - 7', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
            { weekLabel: 'Week 2', dateRange: 'Day 8 - 14', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
            { weekLabel: 'Week 3', dateRange: 'Day 15 - 21', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
            { weekLabel: 'Week 4+', dateRange: 'Day 22 - 31', totalOrders: 0, completedOrders: 0, grossRevenue: 0, riderPayout: 0, expenses: 0, netProfit: 0 },
          ],
        });
      }
      return monthMap.get(mKey)!;
    };

    for (const ord of orders) {
      const d = new Date(ord.createdAt);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const monthObj = getOrCreateMonth(mKey, mName);

      monthObj.totalOrders += 1;
      const isSettled = ord.isSettled || isSettledOrder(ord);
      const isRev = isRevenueOrder(ord);
      const fee = Number(ord.deliveryFee) || 0;
      const payout = Number(ord.riderPayout) || 0;

      if (isRev) {
        monthObj.grossRevenue += fee;
      }

      if (isSettled) {
        monthObj.completedOrders += 1;
        monthObj.riderPayout += payout;
      }

      const weekInfo = getWeekInfo(d);
      const weekObj = monthObj.weeks.find((w) => w.weekLabel === weekInfo.key)!;
      weekObj.totalOrders += 1;
      if (isRev) {
        weekObj.grossRevenue += fee;
      }
      if (isSettled) {
        weekObj.completedOrders += 1;
        weekObj.riderPayout += payout;
      }
    }

    for (const exp of expenses) {
      const d = new Date(exp.date);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const mName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const monthObj = getOrCreateMonth(mKey, mName);

      const amt = Number(exp.amount) || 0;
      monthObj.expenses += amt;

      const weekInfo = getWeekInfo(d);
      const weekObj = monthObj.weeks.find((w) => w.weekLabel === weekInfo.key)!;
      weekObj.expenses += amt;
    }

    // Net Profit = Gross Revenue - Total Logged Expenses
    const results = Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => {
        m.netProfit = m.grossRevenue - m.expenses;
        m.weeks = m.weeks.map((w) => {
          w.netProfit = w.grossRevenue - w.expenses;
          return w;
        });
        return m;
      });

    setMonthlyWeeklyData(results);
  };

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  // Listen for global auto-sync events so data updates live without manual page refresh
  useEffect(() => {
    const handleSync = () => {
      fetchData(false);
    };
    window.addEventListener('orders-synced', handleSync);

    return () => {
      window.removeEventListener('orders-synced', handleSync);
    };
  }, [fetchData]);

  // ── Rider Activity Notifications ────────────────────────────────────────────
  useEffect(() => {
    const handleRiderActivity = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        action: string;
        riderName: string;
        orderId: string;
      };
      if (!detail) return;

      const id = ++notifIdRef.current;
      setRiderNotifications((prev) => [
        { id, riderName: detail.riderName, action: detail.action, orderId: detail.orderId, timestamp: new Date() },
        ...prev.slice(0, 9), // keep last 10
      ]);

      // Auto-dismiss notification after 8 seconds
      setTimeout(() => {
        setRiderNotifications((prev) => prev.filter((n) => n.id !== id));
      }, 8000);

      // Refresh dashboard data immediately
      fetchData(false);
    };

    window.addEventListener('rider-activity', handleRiderActivity);
    return () => window.removeEventListener('rider-activity', handleRiderActivity);
  }, [fetchData]);

  // ── Periodic background poll every 30s so dashboard stays fresh ─────────────
  useEffect(() => {
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleMonth = (mKey: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [mKey]: !prev[mKey],
    }));
  };

  const renderStatusBadge = (status: string, _payStatus?: string) => {
    const s = (status || '').toLowerCase().trim();
    const [label, dot] =
      s === 'delivered' || s === 'completed'
        ? ['Delivered', 'bg-emerald-500']
        : s === 'in transit' || s === 'dispatched'
        ? ['In transit', 'bg-blue-500']
        : s === 'ready'
        ? ['Ready', 'bg-amber-500']
        : s === 'preparing'
        ? ['Preparing', 'bg-amber-400']
        : s.includes('canc')
        ? ['Cancelled', 'bg-slate-300']
        : s === 'confirmed' || s === 'pending'
        ? ['Confirmed', 'bg-slate-400']
        : [status, 'bg-slate-400'];
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </span>
    );
  };

  // Today's figures (Lagos calendar day, matching the daily grouping above)
  const todayKey = new Date(Date.now() + 60 * 60 * 1000).toISOString().split('T')[0];
  const today = dailyData.find((d) => d.date === todayKey);
  const todayCompleted = today?.completedOrders || 0;
  const todayRevenue = today?.grossRevenue || 0;
  // Today's target comes from the sprint: what's left to raise ÷ days left ÷ fee per order
  const targetDaily = sprint?.dailyTargetOrders || 0;
  const todayPaid = sprint?.todayOrders ?? 0;
  const sprintPct = sprint?.progressPercent ?? 0;

  const card = 'bg-white rounded-xl border border-slate-200';

  return (
    <AppLayout>
      <Header onSyncComplete={fetchData} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {/* Page title */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          {activeOrdersCount > 0 && (
            <span className="inline-flex items-center gap-2 text-sm text-slate-600 self-start sm:self-auto">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              {activeOrdersCount} active {activeOrdersCount === 1 ? 'order' : 'orders'}
            </span>
          )}
        </div>

        <NotificationPermissionBanner userType="admin" />

        {/* Key numbers */}
        <section aria-label="Key numbers" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`${card} p-5`}>
            <div className="text-sm text-slate-500">Orders today</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
              {todayPaid}
              {targetDaily > 0 && <span className="text-lg text-slate-400 font-normal"> / {targetDaily}</span>}
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full ${targetDaily > 0 && todayPaid >= targetDaily ? 'bg-emerald-500' : 'bg-brand-500'}`}
                style={{ width: `${targetDaily > 0 ? Math.min(100, (todayPaid / targetDaily) * 100) : 0}%` }}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {targetDaily > 0
                ? todayPaid >= targetDaily
                  ? `Target hit · paid, not cancelled`
                  : `${targetDaily - todayPaid} more to hit today's target`
                : `${todayCompleted} delivered`}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="text-sm text-slate-500">Delivery revenue today</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{formatNaira(todayRevenue)}</div>
            <div className="mt-3 text-xs text-slate-500">
              All time <span className="font-medium text-slate-700 tabular-nums">{formatNaira(metrics?.grossDeliveryRevenue || 0)}</span>
              {' · '}
              {metrics?.settledOrdersCount || 0} deliveries
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="text-sm text-slate-500">Net profit · this sprint</div>
            <div className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${(sprint?.earned ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {sprint ? formatNaira(sprint.earned) : '…'}
            </div>
            <div className="mt-3 text-xs text-slate-500">
              {sprint && (
                <>
                  Since {new Date(`${sprint.config.startDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                  {' · '}
                </>
              )}
              All time <span className="font-medium text-slate-700 tabular-nums">{formatNaira(metrics?.netProfit || 0)}</span>
            </div>
          </div>

          <Link href="/target" className={`${card} p-5 hover:border-slate-300 transition-colors`}>
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>Sprint</span>
              <Target className="w-4 h-4 text-brand-500" />
            </div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{sprintPct.toFixed(1)}%</div>
            <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${sprintPct}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {sprint ? `${formatNaira(sprint.remaining)} to go · ${sprint.daysLeft} days left` : '…'}
            </div>
          </Link>
        </section>

        {/* Live rider activity */}
        {riderNotifications.length > 0 && (
          <div className="space-y-2" aria-live="polite" aria-label="Rider activity">
            {riderNotifications.map((notif) => {
              const label =
                notif.action === 'claim' ? 'accepted' : notif.action === 'pickup' ? 'picked up' : 'delivered';
              const Icon = notif.action === 'claim' ? Package : notif.action === 'pickup' ? Truck : CheckCircle2;
              return (
                <div key={notif.id} className={`${card} flex items-center gap-3 px-4 py-2.5 text-sm`}>
                  <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-slate-700">
                    <span className="font-medium text-slate-900">{notif.riderName}</span> {label}{' '}
                    <span className="font-mono text-xs text-slate-500">#{notif.orderId?.slice(-8)}</span>
                  </span>
                  <span className="ml-auto text-xs text-slate-400 tabular-nums">
                    {notif.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Latest orders + dispatch */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${card} lg:col-span-2 overflow-hidden`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Latest orders</h2>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Updates automatically" />
              </div>
              <Link href="/orders" className="text-sm text-brand-600 hover:text-brand-700 inline-flex items-center gap-1">
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="text-xs text-slate-500">
                  <tr className="border-b border-slate-100">
                    <th className="px-5 py-2.5 font-medium">Order</th>
                    <th className="px-5 py-2.5 font-medium">Route</th>
                    <th className="px-5 py-2.5 font-medium">Rider</th>
                    <th className="px-5 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentOrders.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                        No orders yet. New GoChow orders appear here automatically.
                      </td>
                    </tr>
                  ) : (
                    recentOrders.slice(0, 8).map((ord: any) => (
                      <tr key={ord.id || ord.orderId} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <div className="font-medium text-slate-900">{ord.customerName}</div>
                          <div className="text-xs text-slate-500">
                            {ord.time || (ord.createdAt ? new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')}
                            <span className="font-mono ml-2 text-slate-400">{String(ord.orderId).slice(-6)}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-slate-700 max-w-[220px] truncate">{ord.cafeteriaName}</div>
                          <div className="text-xs text-slate-500 max-w-[220px] truncate">→ {ord.deliveryAddress}</div>
                        </td>
                        <td className="px-5 py-3 text-slate-700">
                          {ord.rider ? ord.rider.name : <span className="text-slate-400">In pool</span>}
                        </td>
                        <td className="px-5 py-3">{renderStatusBadge(ord.orderStatus, ord.paymentStatus)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dispatch panel */}
          <div className={`${card} p-5 flex flex-col gap-5`}>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Dispatch</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <Bike className="w-3.5 h-3.5" />
                {dispatch?.ridersOnline ?? 0} online
              </span>
            </div>

            <div>
              <div className="text-sm text-slate-500">Waiting for a rider</div>
              <div className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${dispatch && dispatch.waitingOverThreshold > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {dispatch?.waitingCount ?? 0}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {dispatch?.oldestWaitingOrder
                  ? `Oldest ${dispatch.oldestWaitingMinutes} min · ${dispatch.oldestWaitingOrder.cafeteriaName}`
                  : 'Every paid order has a rider'}
              </div>
              {dispatch && dispatch.waitingOverThreshold > 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertOctagon className="w-4 h-4 shrink-0" />
                  {dispatch.waitingOverThreshold} waiting over {dispatch.thresholdMinutes} min — consider calling in another rider.
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="text-sm text-slate-500">
                Not marked delivered <span className="text-slate-400">({dispatch?.stuckAfterHours ?? 6}h+)</span>
              </div>
              {dispatch && dispatch.stuckOrders.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {dispatch.stuckOrders.slice(0, 5).map((o) => (
                    <li key={o.orderId} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono text-slate-700 truncate">{o.orderId}</span>
                      <span className="text-slate-500 whitespace-nowrap">
                        {o.riderName} · {o.hours}h
                      </span>
                    </li>
                  ))}
                  {dispatch.stuckOrders.length > 5 && (
                    <li className="text-xs text-slate-400">+{dispatch.stuckOrders.length - 5} more</li>
                  )}
                </ul>
              ) : (
                <div className="mt-1 text-xs text-slate-500">None — all accepted orders are moving.</div>
              )}
            </div>
          </div>
        </section>

        {/* Trend */}
        <section aria-label="Daily trends">
          <InteractiveDailyTrendChart
            data={dailyData}
            dailyTarget={targetDaily || undefined}
            isLoading={isLoading}
            title="Daily trend"
            description="Revenue or orders per day — pick a range or click a day for its hourly breakdown"
          />
        </section>

        {/* Order mix */}
        <section aria-label="Order mix" className={`${card} p-5`}>
          <h2 className="text-sm font-semibold text-slate-900">Order mix (all time)</h2>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-5 divide-slate-100 lg:divide-x">
            {[
              { label: 'Delivered & paid', value: volumeStats.completed, note: 'Settled' },
              { label: 'Same side', value: volumeStats.sameSide, note: '₦50 rider pay' },
              { label: 'Different side', value: volumeStats.differentSide, note: '₦90 rider pay' },
              { label: 'Pick up', value: volumeStats.pickUp, note: 'No rider' },
              { label: 'Cancelled', value: volumeStats.canceled, note: 'No fee' },
              { label: 'Refunded / failed', value: volumeStats.refundedFailed, note: 'Excluded' },
            ].map((st) => (
              <div key={st.label} className="lg:px-5 first:lg:pl-0">
                <div className="text-xs text-slate-500">{st.label}</div>
                <div className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{st.value.toLocaleString()}</div>
                <div className="text-xs text-slate-400">{st.note}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Monthly & weekly */}
        <section aria-label="Monthly and weekly summary" className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">By month</h2>
            <span className="text-xs text-slate-400">Click a month for weekly figures</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-2.5 font-medium">Period</th>
                  <th className="px-5 py-2.5 font-medium text-right">Delivered</th>
                  <th className="px-5 py-2.5 font-medium text-right">Delivery revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={3} className="px-5 py-4">
                        <div className="h-4 bg-slate-100 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : monthlyWeeklyData.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-10 text-center text-slate-400">
                      No monthly records yet.
                    </td>
                  </tr>
                ) : (
                  monthlyWeeklyData.map((m) => {
                    const isExpanded = !!expandedMonths[m.monthKey];
                    return (
                      <React.Fragment key={m.monthKey}>
                        <tr
                          onClick={() => toggleMonth(m.monthKey)}
                          className="hover:bg-slate-50/70 cursor-pointer select-none"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2 font-medium text-slate-900">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              )}
                              {m.monthName}
                            </div>
                          </td>
                          <td className="px-5 py-3 text-right font-medium text-slate-900 tabular-nums">{m.completedOrders}</td>
                          <td className="px-5 py-3 text-right font-medium text-slate-900 tabular-nums">{formatNaira(m.grossRevenue)}</td>
                        </tr>
                        {isExpanded &&
                          m.weeks.map((week) => (
                            <tr key={`${m.monthKey}-${week.weekLabel}`} className="bg-slate-50/50 text-slate-600">
                              <td className="px-5 py-2.5 pl-11">
                                {week.weekLabel} <span className="text-xs text-slate-400 ml-1">{week.dateRange}</span>
                              </td>
                              <td className="px-5 py-2.5 text-right tabular-nums">{week.completedOrders}</td>
                              <td className="px-5 py-2.5 text-right tabular-nums">{formatNaira(week.grossRevenue)}</td>
                            </tr>
                          ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
