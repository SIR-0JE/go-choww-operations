'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Square,
  Search,
  RefreshCw,
  Bike,
  Store,
  User,
  MapPin,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Filter,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
  Sparkles,
  Zap,
  Clock,
  X,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

interface UnassignedOrder {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryType: string;
  deliveryFee: number;
  foodTotal: number;
  totalAmountPaid: number;
  orderStatus: string;
  paymentStatus: string;
  time: string;
  createdAt: string;
}

interface RiderOption {
  id: string;
  name: string;
  phone?: string | null;
  isOnline?: boolean;
}

type DatePreset = 'ALL' | 'TODAY' | 'YESTERDAY' | 'LAST7' | 'THIS_MONTH' | 'CUSTOM';

export default function BacklogReconciliationPage() {
  const [orders, setOrders] = useState<UnassignedOrder[]>([]);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCafeteria, setSelectedCafeteria] = useState('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('ALL');
  const [customDate, setCustomDate] = useState('');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Bulk & Action States
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkRiderId, setBulkRiderId] = useState('');
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const [assigningRowId, setAssigningRowId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Show Toast Helper ────────────────────────────────────────────────────────
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Compute Date Range Parameters based on Presets ──────────────────────────
  const getDateQueryParams = useCallback((): { date?: string; startDate?: string; endDate?: string } => {
    const today = new Date();
    const toYMD = (d: Date) => d.toISOString().split('T')[0];

    if (datePreset === 'TODAY') {
      return { date: toYMD(today) };
    }
    if (datePreset === 'YESTERDAY') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { date: toYMD(yesterday) };
    }
    if (datePreset === 'LAST7') {
      const past = new Date(today);
      past.setDate(past.getDate() - 7);
      return { startDate: toYMD(past), endDate: toYMD(today) };
    }
    if (datePreset === 'THIS_MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      return { startDate: toYMD(firstDay), endDate: toYMD(today) };
    }
    if (datePreset === 'CUSTOM') {
      if (customDate) return { date: customDate };
      if (customStartDate || customEndDate) {
        return {
          ...(customStartDate && { startDate: customStartDate }),
          ...(customEndDate && { endDate: customEndDate }),
        };
      }
    }
    return {};
  }, [datePreset, customDate, customStartDate, customEndDate]);

  // ── Fetch Backlog Orders and Active Riders ──────────────────────────────────
  const fetchBacklog = useCallback(async (showSpin = true) => {
    if (showSpin) setIsRefreshing(true);
    try {
      const params = new URLSearchParams();
      const dateParams = getDateQueryParams();
      if (dateParams.date) params.set('date', dateParams.date);
      if (dateParams.startDate) params.set('startDate', dateParams.startDate);
      if (dateParams.endDate) params.set('endDate', dateParams.endDate);
      if (selectedCafeteria !== 'ALL') params.set('cafeteria', selectedCafeteria);

      const url = `/api/reconciliation?${params.toString()}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders || []);
        setRiders(data.riders || []);
      } else {
        showToast(data.error || 'Failed to load backlog', 'error');
      }
    } catch (err: any) {
      console.error('Failed to fetch backlog:', err);
      showToast('Error connecting to reconciliation API', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getDateQueryParams, selectedCafeteria, showToast]);

  useEffect(() => {
    fetchBacklog(true);
  }, [fetchBacklog]);

  // ── Unique Cafeterias for Filter Tabs ───────────────────────────────────────
  const cafeterias = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.cafeteriaName) set.add(o.cafeteriaName);
    });
    return Array.from(set).sort();
  }, [orders]);

  // ── Unique Dates in Backlog for Quick Chips ────────────────────────────────
  const uniqueDatesInOrders = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      const dStr = new Date(o.createdAt).toISOString().split('T')[0];
      map.set(dStr, (map.get(dStr) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [orders]);

  // ── Client Filtered Orders (Search Query) ──────────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter((o) => {
      return (
        o.orderId.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerPhone && o.customerPhone.toLowerCase().includes(q)) ||
        o.cafeteriaName.toLowerCase().includes(q) ||
        o.deliveryAddress.toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery]);

  // ── Backlog Summary Stats ──────────────────────────────────────────────────
  const totalValue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + Number(o.totalAmountPaid || 0), 0);
  }, [filteredOrders]);

  const totalDeliveryFees = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0);
  }, [filteredOrders]);

  // ── Single Row Rider Assignment ────────────────────────────────────────────
  const handleAssignSingle = async (orderId: string, riderId: string) => {
    if (!riderId) return;
    setAssigningRowId(orderId);
    try {
      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, riderId }),
      });
      const data = await res.json();
      if (data.success) {
        const assignedRider = riders.find((r) => r.id === riderId);
        showToast(
          `Assigned order #${orderId.slice(-6)} to ${assignedRider?.name || 'Rider'}`,
          'success'
        );
        // Optimistically remove from backlog
        setOrders((prev) => prev.filter((o) => o.orderId !== orderId));
        setSelectedOrderIds((prev) => {
          const next = new Set(prev);
          next.delete(orderId);
          return next;
        });
      } else {
        showToast(data.error || 'Failed to assign order', 'error');
      }
    } catch (err: any) {
      console.error('Assign error:', err);
      showToast('Network error while assigning order', 'error');
    } finally {
      setAssigningRowId(null);
    }
  };

  // ── Bulk Rider Assignment ──────────────────────────────────────────────────
  const handleBulkAssign = async () => {
    if (!bulkRiderId) {
      showToast('Please select a rider from the dropdown for bulk assignment', 'error');
      return;
    }
    if (selectedOrderIds.size === 0) {
      showToast('Please select at least one order to assign', 'error');
      return;
    }

    setIsBulkAssigning(true);
    const updates = Array.from(selectedOrderIds).map((orderId) => ({
      orderId,
      riderId: bulkRiderId,
    }));

    try {
      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (data.success) {
        const assignedRider = riders.find((r) => r.id === bulkRiderId);
        showToast(
          `Successfully assigned ${data.updatedCount} orders to ${assignedRider?.name || 'Rider'}!`,
          'success'
        );
        // Optimistically remove updated orders from backlog view
        const updatedSet = new Set(selectedOrderIds);
        setOrders((prev) => prev.filter((o) => !updatedSet.has(o.orderId)));
        setSelectedOrderIds(new Set());
        setBulkRiderId('');
      } else {
        showToast(data.error || 'Bulk assignment failed', 'error');
      }
    } catch (err: any) {
      console.error('Bulk assign error:', err);
      showToast('Network error during bulk assignment', 'error');
    } finally {
      setIsBulkAssigning(false);
    }
  };

  // ── Select All / Deselect All ──────────────────────────────────────────────
  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o) => o.orderId)));
    }
  };

  const toggleSelectRow = (orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6 pb-12">
        {/* Top Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
                  <Bike className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2 flex-wrap">
                    Backlog Reconciliation Ledger
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {filteredOrders.length} Unassigned
                    </span>
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Filter by date, cafeteria, or search keywords to allocate historical deliveries to riders.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={() => fetchBacklog(true)}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-brand-600' : ''}`} />
                <span>Refresh</span>
              </button>
              <Link
                href="/riders"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
              >
                <span>Manage Fleet</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-100">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtered Backlog</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">{filteredOrders.length}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Filtered Gross Value</p>
              <p className="text-lg font-black text-slate-900 mt-0.5">₦{totalValue.toLocaleString()}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delivery Fees</p>
              <p className="text-lg font-black text-emerald-600 mt-0.5">₦{totalDeliveryFees.toLocaleString()}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/60">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Riders Available</p>
              <p className="text-lg font-black text-blue-600 mt-0.5">{riders.length} Riders</p>
            </div>
          </div>
        </div>

        {/* Date Filter & Preset Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Date Preset Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-500 mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Date Range:</span>
              </span>

              {(
                [
                  { id: 'ALL', label: 'All Time' },
                  { id: 'TODAY', label: 'Today' },
                  { id: 'YESTERDAY', label: 'Yesterday' },
                  { id: 'LAST7', label: 'Last 7 Days' },
                  { id: 'THIS_MONTH', label: 'This Month' },
                  { id: 'CUSTOM', label: 'Custom Date' },
                ] as const
              ).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setDatePreset(preset.id);
                    if (preset.id !== 'CUSTOM') {
                      setCustomDate('');
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    datePreset === preset.id
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Date Pickers */}
            {datePreset === 'CUSTOM' && (
              <div className="flex items-center gap-2 flex-wrap animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Specific Date:</span>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                <span className="text-xs text-slate-400 font-medium">or</span>

                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => {
                      setCustomStartDate(e.target.value);
                      setCustomDate('');
                    }}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                  <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => {
                      setCustomEndDate(e.target.value);
                      setCustomDate('');
                    }}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none"
                  />
                </div>

                {(customDate || customStartDate || customEndDate) && (
                  <button
                    onClick={() => {
                      setCustomDate('');
                      setCustomStartDate('');
                      setCustomEndDate('');
                    }}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500"
                    title="Clear custom date"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick Date Chips from Loaded Backlog */}
          {datePreset === 'ALL' && uniqueDatesInOrders.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 pb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">
                Jump to Day:
              </span>
              {uniqueDatesInOrders.slice(0, 8).map(([dStr, count]) => {
                const dateObj = new Date(dStr);
                const label = dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                return (
                  <button
                    key={dStr}
                    onClick={() => {
                      setDatePreset('CUSTOM');
                      setCustomDate(dStr);
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-brand-50 hover:text-brand-700 border border-slate-200/80 text-[11px] font-semibold text-slate-700 transition-colors"
                  >
                    {label} <span className="text-slate-400 font-normal">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Bulk Action Sticky Bar (Appears when rows are selected) */}
        {selectedOrderIds.size > 0 && (
          <div className="bg-slate-900 text-white rounded-2xl p-4 shadow-lg border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200 sticky top-16 z-20">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-brand-500 text-slate-900 font-black text-xs flex items-center justify-center">
                {selectedOrderIds.size}
              </span>
              <span className="text-xs font-medium">orders selected for bulk assignment</span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={bulkRiderId}
                onChange={(e) => setBulkRiderId(e.target.value)}
                className="bg-slate-800 text-white border border-slate-700 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 max-w-[200px]"
              >
                <option value="">Select Target Rider...</option>
                {riders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.phone || 'No phone'})
                  </option>
                ))}
              </select>

              <button
                onClick={handleBulkAssign}
                disabled={isBulkAssigning || !bulkRiderId}
                className="bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isBulkAssigning ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 fill-current" />
                )}
                <span>Assign {selectedOrderIds.size} Orders</span>
              </button>

              <button
                onClick={() => setSelectedOrderIds(new Set())}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Search & Cafeteria Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Order ID, Customer, Phone, Cafeteria, or Address..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              <select
                value={selectedCafeteria}
                onChange={(e) => setSelectedCafeteria(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              >
                <option value="ALL">All Cafeterias ({orders.length})</option>
                {cafeterias.map((cafe) => (
                  <option key={cafe} value={cafe}>
                    {cafe} ({orders.filter((o) => o.cafeteriaName === cafe).length})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-6 h-6 text-brand-600 animate-spin" />
              <p className="text-xs font-semibold text-slate-500">Loading unassigned backlog orders...</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                {orders.length === 0 ? '🎉 No Unassigned Orders for this Date!' : 'No matching unassigned orders'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {orders.length === 0
                  ? 'All historical orders for the selected date range have been assigned. Adjust the date filter to inspect other periods.'
                  : 'Try clearing your search query or adjusting your filters to view other unassigned orders.'}
              </p>
              {(searchQuery || selectedCafeteria !== 'ALL' || datePreset !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCafeteria('ALL');
                    setDatePreset('ALL');
                    setCustomDate('');
                    setCustomStartDate('');
                    setCustomEndDate('');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  Reset All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-slate-400 hover:text-slate-700"
                        title="Select all on this page"
                      >
                        {selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-brand-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-4">Order ID &amp; Time</th>
                    <th className="py-3 px-4">Cafeteria</th>
                    <th className="py-3 px-4">Customer &amp; Phone</th>
                    <th className="py-3 px-4">Delivery Address</th>
                    <th className="py-3 px-4 text-right">Fee / Total</th>
                    <th className="py-3 px-4 text-center min-w-[220px]">Assign to Rider</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((ord) => {
                    const isSelected = selectedOrderIds.has(ord.orderId);
                    const isRowBusy = assigningRowId === ord.orderId;

                    return (
                      <tr
                        key={ord.orderId}
                        className={`transition-colors hover:bg-slate-50/70 ${
                          isSelected ? 'bg-brand-50/40' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3.5 px-4">
                          <button
                            type="button"
                            onClick={() => toggleSelectRow(ord.orderId)}
                            className="text-slate-400 hover:text-slate-700"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-brand-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>

                        {/* Order ID & Time */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 font-mono">
                            #{ord.orderId.replace(/^ORD-/, '')}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(ord.createdAt).toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                              })}{' '}
                              • {ord.time}
                            </span>
                          </div>
                        </td>

                        {/* Cafeteria */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-semibold text-slate-800">{ord.cafeteriaName}</span>
                          </div>
                          <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-100 text-slate-600">
                            {ord.deliveryType || 'Standard'}
                          </span>
                        </td>

                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{ord.customerName}</div>
                          {ord.customerPhone ? (
                            <a
                              href={`tel:${ord.customerPhone.replace(/\D/g, '')}`}
                              className="text-[10px] text-brand-600 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <span>{ord.customerPhone}</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No phone</span>
                          )}
                        </td>

                        {/* Delivery Address */}
                        <td className="py-3.5 px-4 max-w-[200px]">
                          <div className="flex items-start gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                            <span className="text-slate-700 truncate font-medium">{ord.deliveryAddress}</span>
                          </div>
                        </td>

                        {/* Fee / Total */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="font-bold text-emerald-600">₦{Number(ord.deliveryFee).toLocaleString()}</div>
                          <div className="text-[10px] text-slate-400">Total: ₦{Number(ord.totalAmountPaid).toLocaleString()}</div>
                        </td>

                        {/* Inline Rider Selector */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center gap-1.5 justify-center">
                            <select
                              disabled={isRowBusy}
                              onChange={(e) => handleAssignSingle(ord.orderId, e.target.value)}
                              defaultValue=""
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 max-w-[180px]"
                            >
                              <option value="" disabled>
                                Select Rider...
                              </option>
                              {riders.map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name}
                                </option>
                              ))}
                            </select>

                            {isRowBusy && <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600 shrink-0" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Floating Toast */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5">
            <div
              className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-semibold border ${
                toast.type === 'success'
                  ? 'bg-emerald-900 text-white border-emerald-700'
                  : 'bg-rose-900 text-white border-rose-700'
              }`}
            >
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{toast.message}</span>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
