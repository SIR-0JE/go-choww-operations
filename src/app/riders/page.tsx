'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  Bike,
  UserPlus,
  Search,
  Phone,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronRight,
  TrendingUp,
  DollarSign,
  PackageCheck,
  Users,
  Eye,
  Calendar,
  X,
  RefreshCw,
} from 'lucide-react';

interface RiderOrder {
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

interface RiderItem {
  id: string;
  name: string;
  phone: string;
  status: 'Active' | 'Inactive' | 'On Leave';
  createdAt: string;
  totalOrdersAssigned: number;
  settledOrdersCount: number;
  sameSideCount: number;
  differentSideCount: number;
  pickUpCount: number;
  otherCount: number;
  sameSideEarnings: number;
  differentSideEarnings: number;
  totalEarnings: number;
  orders: RiderOrder[];
}

interface RiderSummary {
  totalRiders: number;
  activeRiders: number;
  totalAssignedOrders: number;
  totalRiderPayouts: number;
}

export default function RidersPage() {
  const [riders, setRiders] = useState<RiderItem[]>([]);
  const [summary, setSummary] = useState<RiderSummary>({
    totalRiders: 0,
    activeRiders: 0,
    totalAssignedOrders: 0,
    totalRiderPayouts: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modal States
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderItem | null>(null);

  // Register Form State
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderStatus, setNewRiderStatus] = useState<'Active' | 'Inactive' | 'On Leave'>('Active');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchRiders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/riders?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setRiders(data.riders || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      }
    } catch (err) {
      console.error('Failed to fetch riders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, startDate, endDate]);

  useEffect(() => {
    fetchRiders();
  }, [fetchRiders]);

  const handleRegisterRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRiderName.trim()) {
      setFormError('Rider name is required.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/riders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRiderName.trim(),
          phone: newRiderPhone.trim() || null,
          status: newRiderStatus,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setIsRegisterModalOpen(false);
        setNewRiderName('');
        setNewRiderPhone('');
        setNewRiderStatus('Active');
        fetchRiders();
      } else {
        setFormError(data.error || 'Failed to register rider.');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Network error.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'Active') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      );
    }
    if (status === 'On Leave') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          On Leave
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
        Inactive
      </span>
    );
  };

  return (
    <AppLayout>
      <Header onSyncComplete={fetchRiders} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 shadow-sm">
                <Bike className="w-6 h-6" />
              </div>
              <span>Riders Management</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Register delivery riders, link order assignments, and track automated earnings and run volumes.
            </p>
          </div>

          <button
            onClick={() => setIsRegisterModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-brand-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Rider</span>
          </button>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TOP METRICS ROW
        ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Active Riders */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Fleet</span>
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">
              {summary.activeRiders} <span className="text-xs font-semibold text-slate-400">/ {summary.totalRiders} total</span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Registered dispatch riders</p>
          </div>

          {/* Card 2: Total Assigned Orders */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Deliveries</span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                <PackageCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">
              {summary.totalAssignedOrders}
            </div>
            <p className="text-[11px] text-emerald-700 font-medium">Orders assigned to riders</p>
          </div>

          {/* Card 3: Total Rider Payouts Earned */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Payouts</span>
              <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-brand-600 tabular-nums">
              {formatNaira(summary.totalRiderPayouts)}
            </div>
            <p className="text-[11px] text-slate-400 font-medium">₦50 Same side + ₦90 Different side</p>
          </div>

          {/* Card 4: Avg Orders per Rider */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Fleet Volume</span>
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">
              {summary.activeRiders > 0
                ? Math.round(summary.totalAssignedOrders / summary.activeRiders)
                : 0}
            </div>
            <p className="text-[11px] text-purple-700 font-medium">Orders per active rider</p>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            MAIN SUMMARY TABLE & CONTROLS
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden space-y-0">
          {/* Filter Bar */}
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rider by name or phone..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
              />
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent focus:outline-none text-xs text-slate-800 font-medium"
                  placeholder="Start date"
                />
                <span className="text-slate-300">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent focus:outline-none text-xs text-slate-800 font-medium"
                  placeholder="End date"
                />
              </div>

              {(startDate || endDate) && (
                <button
                  onClick={() => {
                    setStartDate('');
                    setEndDate('');
                  }}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold"
                  title="Clear dates"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Rider Name</th>
                  <th className="px-5 py-3.5">Contact Phone</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-center">Total Orders</th>
                  <th className="px-5 py-3.5 text-center">Same-Side (₦50)</th>
                  <th className="px-5 py-3.5 text-center">Different-Side (₦90)</th>
                  <th className="px-5 py-3.5 text-right font-bold">Total Earnings</th>
                  <th className="px-5 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8} className="px-5 py-4 bg-slate-50/50">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : riders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                      <Bike className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No riders registered yet</p>
                      <p className="text-xs text-slate-400 mt-1">Click &quot;Register New Rider&quot; above to add your delivery fleet</p>
                    </td>
                  </tr>
                ) : (
                  riders.map((rider) => (
                    <tr key={rider.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name */}
                      <td className="px-5 py-4 font-bold text-slate-900 text-sm flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 font-black flex items-center justify-center text-xs border border-brand-200">
                          {rider.name.charAt(0).toUpperCase()}
                        </div>
                        <span>{rider.name}</span>
                      </td>

                      {/* Phone */}
                      <td className="px-5 py-4 font-medium text-slate-600">
                        <span className="flex items-center gap-1.5 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {rider.phone || '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        {getStatusBadge(rider.status)}
                      </td>

                      {/* Total Orders */}
                      <td className="px-5 py-4 text-center font-bold text-slate-900 tabular-nums">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-extrabold text-xs">
                          {rider.totalOrdersAssigned}
                        </span>
                      </td>

                      {/* Same Side Deliveries */}
                      <td className="px-5 py-4 text-center font-semibold text-orange-700 tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-orange-50 border border-orange-200 font-extrabold text-xs">
                          {rider.sameSideCount}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                          ({formatNaira(rider.sameSideEarnings)})
                        </span>
                      </td>

                      {/* Different Side Deliveries */}
                      <td className="px-5 py-4 text-center font-semibold text-blue-700 tabular-nums">
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 font-extrabold text-xs">
                          {rider.differentSideCount}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                          ({formatNaira(rider.differentSideEarnings)})
                        </span>
                      </td>

                      {/* Total Earnings */}
                      <td className="px-5 py-4 text-right font-black text-slate-900 text-sm tabular-nums">
                        <span className="text-emerald-700 font-extrabold">
                          {formatNaira(rider.totalEarnings)}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-4 text-center">
                        <button
                          onClick={() => setSelectedRider(rider)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-700 text-xs font-bold transition-colors"
                          title="View Assigned Orders"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Orders ({rider.totalOrdersAssigned})</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            REGISTER NEW RIDER MODAL
        ───────────────────────────────────────────────────────────── */}
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-brand-50 text-brand-600">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Register New Rider</h3>
                    <p className="text-xs text-slate-500">Add a new delivery partner to the dispatch roster</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsRegisterModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterRider} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rider Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newRiderName}
                    onChange={(e) => setNewRiderName(e.target.value)}
                    placeholder="e.g. Tunde Adeyemi"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={newRiderPhone}
                    onChange={(e) => setNewRiderPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Initial Status</label>
                  <select
                    value={newRiderStatus}
                    onChange={(e) => setNewRiderStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium"
                  >
                    <option value="Active">Active (Ready for Orders)</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md shadow-brand-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Rider</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            RIDER ORDERS BREAKDOWN MODAL
        ───────────────────────────────────────────────────────────── */}
        {selectedRider && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-600 font-black flex items-center justify-center text-sm border border-brand-200">
                    {selectedRider.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>{selectedRider.name}</span>
                      {getStatusBadge(selectedRider.status)}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Phone: <span className="font-mono text-slate-700 font-bold">{selectedRider.phone}</span> • Total Payout Earned: <strong className="text-emerald-700">{formatNaira(selectedRider.totalEarnings)}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRider(null)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Order Stats Pill */}
              <div className="grid grid-cols-3 gap-3 shrink-0 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium text-[11px]">Total Runs</span>
                  <p className="font-black text-slate-900 text-sm mt-0.5">{selectedRider.totalOrdersAssigned}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-orange-50/60 border border-orange-100">
                  <span className="text-orange-600 font-medium text-[11px]">Same Side (₦50)</span>
                  <p className="font-black text-orange-700 text-sm mt-0.5">{selectedRider.sameSideCount} <span className="text-xs font-normal">({formatNaira(selectedRider.sameSideEarnings)})</span></p>
                </div>
                <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
                  <span className="text-blue-600 font-medium text-[11px]">Different Side (₦90)</span>
                  <p className="font-black text-blue-700 text-sm mt-0.5">{selectedRider.differentSideCount} <span className="text-xs font-normal">({formatNaira(selectedRider.differentSideEarnings)})</span></p>
                </div>
              </div>

              {/* Orders Table Container */}
              <div className="overflow-y-auto flex-1 border border-slate-100 rounded-xl">
                <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-extrabold text-[10px] sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Order ID</th>
                      <th className="px-4 py-2.5">Cafeteria</th>
                      <th className="px-4 py-2.5">Destination</th>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5 text-right font-bold">Rider Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedRider.orders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          No deliveries assigned to this rider yet.
                        </td>
                      </tr>
                    ) : (
                      selectedRider.orders.map((ord) => {
                        const type = (ord.deliveryType || '').toLowerCase();
                        const isSame = type.includes('same');
                        const isDiff = type.includes('diff');
                        const pay = isSame ? 50 : isDiff ? 90 : 0;

                        return (
                          <tr key={ord.orderId} className="hover:bg-slate-50/80">
                            <td className="px-4 py-2.5 font-medium text-slate-700">
                              {new Date(ord.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-2.5 font-bold font-mono text-slate-900 text-[11px]">
                              {ord.orderId}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-amber-700">
                              {ord.cafeteriaName}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600 max-w-[150px] truncate">
                              {ord.deliveryAddress}
                            </td>
                            <td className="px-4 py-2.5">
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
                            <td className="px-4 py-2.5 text-right font-black text-slate-900">
                              {formatNaira(pay)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
