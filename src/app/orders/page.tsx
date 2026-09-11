'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { CsvUploadDropzone } from '@/components/orders/CsvUploadDropzone';
import { formatNaira } from '@/lib/financials';
import {
  Database,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  Eye,
  AlertCircle,
  Bike,
  UserCheck,
} from 'lucide-react';

interface RiderOption {
  id: string;
  name: string;
  phone?: string;
  status?: string;
}

interface RawOrder {
  id: string;
  orderId: string;
  createdAt: string;
  time: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  foodTotal: number;
  deliveryFee: number;
  totalAmountPaid: number;
  deliveryType: string;
  orderStatus: string;
  paymentStatus: string;
  riderPayout: number;
  netProfit: number;
  isSettled: boolean;
  riderId?: string | null;
  rider?: {
    id: string;
    name: string;
    phone?: string | null;
  } | null;
}

export default function RawDataOrdersPage() {
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [ridersList, setRidersList] = useState<RiderOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deliveryType, setDeliveryType] = useState('All');
  const [orderStatus, setOrderStatus] = useState('All');
  const [riderFilter, setRiderFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<RawOrder | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Fetch Riders for Dropdown
  const fetchRiders = async () => {
    try {
      const res = await fetch('/api/riders');
      const data = await res.json();
      if (data.success && data.riders) {
        setRidersList(data.riders);
      }
    } catch (err) {
      console.error('Failed to load riders list:', err);
    }
  };

  useEffect(() => {
    fetchRiders();
  }, []);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        deliveryType,
        orderStatus,
        riderId: riderFilter,
        page: page.toString(),
        limit: limit.toString(),
      });

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setOrders(data.orders || []);
        setTotalCount(data.pagination.totalCount || 0);
        setTotalPages(data.pagination.totalPages || 1);
      }
    } catch (err) {
      console.error('Failed to load raw orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, deliveryType, orderStatus, riderFilter, page, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Inline Rider Assignment Handler
  const handleAssignRider = async (orderId: string, newRiderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          riderId: newRiderId === 'unassigned' ? null : newRiderId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        // Optimistically update orders list
        setOrders((prev) =>
          prev.map((ord) => {
            if (ord.orderId === orderId) {
              const matchedRider = ridersList.find((r) => r.id === newRiderId) || null;
              return {
                ...ord,
                riderId: newRiderId === 'unassigned' ? null : newRiderId,
                rider: matchedRider ? { id: matchedRider.id, name: matchedRider.name, phone: matchedRider.phone } : null,
              };
            }
            return ord;
          })
        );
      }
    } catch (err) {
      console.error('Failed to assign rider:', err);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const getOrderStatusBadge = (status: string, payStatus: string) => {
    const s = (status || '').toLowerCase();
    const p = (payStatus || '').toLowerCase();

    if (s === 'completed' && p === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Completed
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <XCircle className="w-3 h-3 text-rose-600" />
        {status}
      </span>
    );
  };

  const getDeliveryTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    if (t === 'same side') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200">
          Same side
        </span>
      );
    }
    if (t === 'different side') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
          Different side
        </span>
      );
    }
    if (t === 'pick up' || t === 'pickup') {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Pick up
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
        Other
      </span>
    );
  };

  return (
    <AppLayout>
      <Header onSyncComplete={fetchOrders} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Database className="w-6 h-6 text-brand-600" />
              <span>Raw Data Ledger</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-normal mt-1">
              Customer deliveries, cafeteria partners, rider assignments, and payouts
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white text-slate-700 border border-slate-200/80 shadow-sm self-start sm:self-auto">
            Total Orders: <strong className="text-slate-900 font-bold tabular-nums">{totalCount}</strong>
          </span>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            TOP: THE CSV / EXCEL DATA PIPELINE UPLOAD DROPZONE
        ───────────────────────────────────────────────────────────── */}
        <section aria-label="CSV Data Pipeline Dropzone">
          <CsvUploadDropzone onUploadSuccess={fetchOrders} />
        </section>

        {/* ─────────────────────────────────────────────────────────────
            BODY: FULL-WIDTH RAW DATA TABLE WITH INLINE RIDER ASSIGNMENT
        ───────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden space-y-0">
          {/* Filter Bar */}
          <div className="p-5 border-b border-slate-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Search Box */}
              <div className="sm:col-span-5 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search order number, customer, cafeteria, address, or rider..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                />
              </div>

              {/* Delivery Type Filter */}
              <div className="sm:col-span-2">
                <select
                  value={deliveryType}
                  onChange={(e) => {
                    setDeliveryType(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Types</option>
                  <option value="Same side">Same side (₦50)</option>
                  <option value="Different side">Different side (₦90)</option>
                  <option value="Pick up">Pick up (₦0)</option>
                </select>
              </div>

              {/* Order Status Filter */}
              <div className="sm:col-span-2">
                <select
                  value={orderStatus}
                  onChange={(e) => {
                    setOrderStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Statuses</option>
                  <option value="Completed">Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              {/* Rider Filter */}
              <div className="sm:col-span-3">
                <select
                  value={riderFilter}
                  onChange={(e) => {
                    setRiderFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Dispatch Riders</option>
                  <option value="unassigned">Unassigned Orders</option>
                  {ridersList.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.phone ? `(${r.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Order ID</th>
                  <th className="px-4 py-3.5">Customer</th>
                  <th className="px-4 py-3.5">Cafeteria</th>
                  <th className="px-4 py-3.5">Destination</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5 text-right font-bold">Delivery Fee</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 min-w-[160px]">Assigned Rider</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={10} className="px-4 py-4 bg-slate-50/50">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No matching orders found</p>
                      <p className="text-xs text-slate-400 mt-1">Upload a CSV or Excel export above to populate records</p>
                    </td>
                  </tr>
                ) : (
                  orders.map((ord) => (
                    <tr key={ord.orderId} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date */}
                      <td className="px-4 py-3.5 font-medium text-slate-700">
                        {new Date(ord.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                        <span className="text-[10px] text-slate-400 ml-1">({ord.time})</span>
                      </td>

                      {/* Order Number */}
                      <td className="px-4 py-3.5 font-bold font-mono text-slate-900">
                        {ord.orderId}
                      </td>

                      {/* Customer Name */}
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        {ord.customerName}
                      </td>

                      {/* Cafeteria */}
                      <td className="px-4 py-3.5 font-medium text-amber-700">
                        {ord.cafeteriaName}
                      </td>

                      {/* Delivery Address */}
                      <td className="px-4 py-3.5 max-w-[170px] truncate text-slate-600 font-medium">
                        {ord.deliveryAddress}
                      </td>

                      {/* Delivery Type */}
                      <td className="px-4 py-3.5">
                        {getDeliveryTypeBadge(ord.deliveryType)}
                      </td>

                      {/* Delivery Fee */}
                      <td className="px-4 py-3.5 text-right font-bold text-brand-600">
                        {formatNaira(ord.deliveryFee)}
                      </td>

                      {/* Order Status */}
                      <td className="px-4 py-3.5">
                        {getOrderStatusBadge(ord.orderStatus, ord.paymentStatus)}
                      </td>

                      {/* Assigned Rider Dropdown */}
                      <td className="px-4 py-3.5">
                        <div className="relative flex items-center gap-1.5">
                          <select
                            value={ord.riderId || 'unassigned'}
                            disabled={updatingOrderId === ord.orderId}
                            onChange={(e) => handleAssignRider(ord.orderId, e.target.value)}
                            className={`w-full text-xs font-semibold rounded-lg px-2.5 py-1.5 border transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 ${
                              ord.riderId
                                ? 'bg-blue-50/80 text-blue-900 border-blue-200 font-bold'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <option value="unassigned">— Unassigned —</option>
                            {ridersList.map((rider) => (
                              <option key={rider.id} value={rider.id}>
                                {rider.name}
                              </option>
                            ))}
                          </select>
                          {ord.riderId && (
                            <span title="Assigned">
                              <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => setSelectedOrder(ord)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-600 transition-colors"
                          title="Inspect Record"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 text-xs focus:outline-none font-medium shadow-sm"
              >
                <option value={15}>15</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>
                Page <strong className="text-slate-900 font-bold">{page}</strong> of <strong className="text-slate-900 font-bold">{totalPages}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center gap-1 font-semibold shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center gap-1 font-semibold shadow-sm"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Inspector */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="text-xs font-bold text-brand-600 uppercase tracking-wider">Raw Order Record</div>
                  <div className="text-base font-black text-slate-900 font-mono">{selectedOrder.orderId}</div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Customer:</span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedOrder.customerName}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Cafeteria:</span>
                  <p className="font-bold text-amber-700 text-sm mt-0.5">{selectedOrder.cafeteriaName}</p>
                </div>
                <div className="col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Delivery Address:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedOrder.deliveryAddress}</p>
                </div>
                <div className="col-span-2 p-3 rounded-xl bg-blue-50/60 border border-blue-100 flex items-center justify-between">
                  <div>
                    <span className="text-blue-500 font-medium">Assigned Dispatch Rider:</span>
                    <p className="font-bold text-blue-950 text-sm mt-0.5">
                      {selectedOrder.rider?.name || 'Unassigned'}
                    </p>
                  </div>
                  <Bike className="w-5 h-5 text-blue-600" />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider border-b border-slate-200 pb-1.5">
                  Financial Settlement Breakdown
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Food Total:</span>
                  <span className="text-slate-900 font-medium">{formatNaira(selectedOrder.foodTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee:</span>
                  <span className="text-brand-600 font-bold">{formatNaira(selectedOrder.deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Rider Payout:</span>
                  <span className="text-blue-700 font-bold">{formatNaira(selectedOrder.riderPayout)}</span>
                </div>
                <div className="flex justify-between text-slate-900 pt-2 border-t border-slate-200 font-bold text-sm">
                  <span className="text-emerald-700">Net Retained Profit:</span>
                  <span className="text-emerald-700 font-black">{formatNaira(selectedOrder.netProfit)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
