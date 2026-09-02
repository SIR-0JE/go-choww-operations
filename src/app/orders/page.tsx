'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
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
  SlidersHorizontal,
  Store,
  MapPin,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

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
}

export default function RawDataOrdersPage() {
  const [orders, setOrders] = useState<RawOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deliveryType, setDeliveryType] = useState('All');
  const [orderStatus, setOrderStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<RawOrder | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        deliveryType,
        orderStatus,
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
  }, [search, deliveryType, orderStatus, page, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
              <Database className="w-7 h-7 text-brand-600" />
              Raw Data Ledger
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Complete transactional audit log mapping all individual delivery orders, timestamps, cafeteria partners, and payouts
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 self-start sm:self-auto">
            Total Records: <strong className="text-slate-900">{totalCount}</strong>
          </span>
        </div>

        {/* Table Container with Search & Filters */}
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
          {/* Controls Bar */}
          <div className="p-5 border-b border-slate-100 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Search Bar */}
              <div className="sm:col-span-6 relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search order number, customer, address, or cafeteria..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                />
              </div>

              {/* Delivery Type Dropdown */}
              <div className="sm:col-span-3">
                <select
                  value={deliveryType}
                  onChange={(e) => {
                    setDeliveryType(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Delivery Types</option>
                  <option value="Same side">Same side (₦50)</option>
                  <option value="Different side">Different side (₦90)</option>
                  <option value="Pick up">Pick up (₦0)</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Status Dropdown */}
              <div className="sm:col-span-3">
                <select
                  value={orderStatus}
                  onChange={(e) => {
                    setOrderStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                >
                  <option value="All">All Order Statuses</option>
                  <option value="Completed">Completed Only</option>
                  <option value="Pending">Pending Only</option>
                  <option value="Cancelled">Cancelled Only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Full-Width Table matching exact column spec:
              Date | Order Number | Customer Name | Cafeteria | Delivery Address | Food Total | Delivery Fee | Total Amount Paid | Delivery Type | Order Status */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Order Number</th>
                  <th className="px-4 py-3.5">Customer Name</th>
                  <th className="px-4 py-3.5">Cafeteria</th>
                  <th className="px-4 py-3.5">Delivery Address</th>
                  <th className="px-4 py-3.5 text-right">Food Total</th>
                  <th className="px-4 py-3.5 text-right">Delivery Fee</th>
                  <th className="px-4 py-3.5 text-right font-bold">Total Paid</th>
                  <th className="px-4 py-3.5">Delivery Type</th>
                  <th className="px-4 py-3.5">Order Status</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={11} className="px-4 py-4 bg-slate-50/50">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No orders found in raw dataset</p>
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
                          year: 'numeric',
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
                      <td className="px-4 py-3.5 max-w-[200px] truncate text-slate-600 font-medium">
                        {ord.deliveryAddress}
                      </td>

                      {/* Food Total */}
                      <td className="px-4 py-3.5 text-right font-medium text-slate-800">
                        {formatNaira(ord.foodTotal)}
                      </td>

                      {/* Delivery Fee */}
                      <td className="px-4 py-3.5 text-right font-bold text-brand-600">
                        {formatNaira(ord.deliveryFee)}
                      </td>

                      {/* Total Amount Paid */}
                      <td className="px-4 py-3.5 text-right font-black text-slate-900">
                        {formatNaira(ord.totalAmountPaid)}
                      </td>

                      {/* Delivery Type */}
                      <td className="px-4 py-3.5">
                        {getDeliveryTypeBadge(ord.deliveryType)}
                      </td>

                      {/* Order Status */}
                      <td className="px-4 py-3.5">
                        {getOrderStatusBadge(ord.orderStatus, ord.paymentStatus)}
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
