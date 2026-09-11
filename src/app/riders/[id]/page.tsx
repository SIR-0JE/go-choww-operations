'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import { RiderOrderAccordion } from '@/components/riders/RiderOrderAccordion';
import {
  Bike,
  ArrowLeft,
  Phone,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  PackageCheck,
  RefreshCw,
  X,
  Building,
  User,
  ExternalLink,
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

interface RiderDetail {
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

export default function RiderProfilePage() {
  const params = useParams();
  const router = useRouter();
  const riderId = params?.id as string;

  const [rider, setRider] = useState<RiderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchRider = useCallback(async () => {
    if (!riderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const qParams = new URLSearchParams();
      if (startDate) qParams.set('startDate', startDate);
      if (endDate) qParams.set('endDate', endDate);

      const res = await fetch(`/api/riders/${riderId}?${qParams.toString()}`);
      const data = await res.json();

      if (data.success && data.rider) {
        setRider(data.rider);
      } else {
        setError(data.error || 'Rider not found');
      }
    } catch (err: any) {
      console.error('Failed to load rider:', err);
      setError(err?.message || 'Error loading rider profile');
    } finally {
      setIsLoading(false);
    }
  }, [riderId, startDate, endDate]);

  useEffect(() => {
    fetchRider();
  }, [fetchRider]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        );
      case 'On Leave':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-500" />
            On Leave
          </span>
        );
      case 'Inactive':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-600 border border-slate-200">
            <AlertCircle className="w-3 h-3 text-slate-400" />
            Inactive
          </span>
        );
    }
  };

  return (
    <AppLayout>
      <Header />

      <main className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        {/* Navigation & Actions Top Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/riders"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition-colors"
            >
              <ArrowLeft className="w-4 h-4 text-slate-500" />
              <span>Back to Riders Roster</span>
            </Link>
          </div>

          {/* Date Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium">From:</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-slate-700 text-xs font-semibold focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium">To:</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-slate-700 text-xs font-semibold focus:outline-none"
                />
              </div>
            </div>

            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                title="Clear date filter"
              >
                Clear
              </button>
            )}

            <button
              onClick={fetchRider}
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 shadow-xs transition-colors"
              title="Refresh profile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Loading / Error States */}
        {isLoading && !rider && (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs">
            <RefreshCw className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-700">Loading rider profile & order history...</p>
            <p className="text-xs text-slate-400 mt-1">Calculating chronological order breakdown...</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 text-center shadow-xs">
            <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
            <h3 className="text-base font-bold text-rose-800">Unable to load rider</h3>
            <p className="text-xs text-rose-600 mt-1">{error}</p>
            <div className="mt-4">
              <Link
                href="/riders"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-md shadow-rose-500/20"
              >
                Return to Roster
              </Link>
            </div>
          </div>
        )}

        {rider && (
          <>
            {/* Rider Identity Banner Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="flex items-start sm:items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0 border-2 border-white">
                    {rider.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        {rider.name}
                      </h2>
                      {getStatusBadge(rider.status)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 font-medium">
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-mono font-bold text-slate-700">{rider.phone}</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Registered on {new Date(rider.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Total Payout Badge on Right */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 sm:min-w-[220px] text-right flex flex-col justify-center">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Total Payout Earned
                  </span>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 tracking-tight">
                    {formatNaira(rider.totalEarnings)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium">
                    Automated pay: ₦50 same side • ₦90 diff side
                  </p>
                </div>
              </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Assigned Orders */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Assigned Runs</span>
                  <div className="p-2 rounded-xl bg-brand-50 text-brand-600 border border-brand-100">
                    <Bike className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-slate-900">{rider.totalOrdersAssigned}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {rider.settledOrdersCount} settled delivery runs
                  </p>
                </div>
              </div>

              {/* Same Side Deliveries */}
              <div className="bg-white border border-orange-200/80 rounded-2xl p-4 shadow-xs bg-gradient-to-b from-orange-50/20 to-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-700 uppercase">Same Side (₦50)</span>
                  <div className="p-2 rounded-xl bg-orange-50 text-orange-600 border border-orange-200">
                    <PackageCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-slate-900">{rider.sameSideCount}</h3>
                  <p className="text-xs font-bold text-orange-700 mt-0.5">
                    {formatNaira(rider.sameSideEarnings)} earned
                  </p>
                </div>
              </div>

              {/* Different Side Deliveries */}
              <div className="bg-white border border-blue-200/80 rounded-2xl p-4 shadow-xs bg-gradient-to-b from-blue-50/20 to-white">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-700 uppercase">Different Side (₦90)</span>
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-slate-900">{rider.differentSideCount}</h3>
                  <p className="text-xs font-bold text-blue-700 mt-0.5">
                    {formatNaira(rider.differentSideEarnings)} earned
                  </p>
                </div>
              </div>

              {/* Pickup / Other Orders */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Pickups & Other</span>
                  <div className="p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-200">
                    <Building className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-2xl font-black text-slate-900">{rider.pickUpCount + rider.otherCount}</h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-medium">
                    {rider.pickUpCount} Pickups • {rider.otherCount} other
                  </p>
                </div>
              </div>
            </div>

            {/* Hierarchical Accordion Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Order History & Timeframe Breakdown
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Collapsible Monthly, Weekly (W1–W4), and Daily view sorted chronologically (newest first)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-extrabold text-slate-600">
                    {rider.orders.length} Total Orders Recorded
                  </span>
                </div>
              </div>

              {/* The 4-Level Accordion Component */}
              <RiderOrderAccordion orders={rider.orders} />
            </div>
          </>
        )}
      </main>
    </AppLayout>
  );
}
