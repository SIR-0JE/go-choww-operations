'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  SlidersHorizontal,
  Store,
  MapPin,
} from 'lucide-react';
import { formatNaira } from '@/lib/financials';

interface OrderItem {
  id: string;
  orderId: string;
  createdAt: string;
  time: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryFee: number;
  foodTotal: number;
  totalAmountPaid: number;
  deliveryType: string;
  orderStatus: string;
  paymentStatus: string;
  riderPayout: number;
  netProfit: number;
  isSettled: boolean;
}

interface OrdersTableProps {
  refreshKey?: number;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({ refreshKey }) => {
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deliveryType, setDeliveryType] = useState('All');
  const [orderStatus, setOrderStatus] = useState('All');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);

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
      console.error('Failed to load orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, deliveryType, orderStatus, page, limit]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders, refreshKey]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleDeliveryTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDeliveryType(e.target.value);
    setPage(1);
  };

  const handleOrderStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setOrderStatus(e.target.value);
    setPage(1);
  };

  const getOrderStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Completed
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
        <XCircle className="w-3.5 h-3.5 text-rose-600" />
        Cancelled
      </span>
    );
  };

  const getPaymentStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50/80 text-emerald-700 border border-emerald-200">
          ✓ Paid
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50/80 text-amber-700 border border-amber-200">
          ⏳ Unpaid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50/80 text-rose-700 border border-rose-200">
        ✕ Failed
      </span>
    );
  };

  const getDeliveryTypeBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'same side') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-orange-50 text-orange-700 border border-orange-200">
          Same side (₦50)
        </span>
      );
    }
    if (t === 'different side') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200">
          Different side (₦90)
        </span>
      );
    }
    if (t === 'pick up' || t === 'pickup') {
      return (
        <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
          Pick up (₦0)
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-extrabold bg-purple-50 text-purple-700 border border-purple-200">
        Other (₦0)
      </span>
    );
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Table Controls Header */}
      <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-brand-600" />
              Operational Orders Ledger
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-900 font-bold">{totalCount}</strong> recorded delivery runs • Settlement filtering active
            </p>
          </div>

          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Verified Settled: Completed + Success
            </span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Box */}
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search by Order ID (e.g. ORD-), Customer, Cafeteria, or Address..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>

          {/* Delivery Type Filter */}
          <div className="sm:col-span-3">
            <select
              value={deliveryType}
              onChange={handleDeliveryTypeChange}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
            >
              <option value="All">All Delivery Types</option>
              <option value="Same side">Same side (₦50)</option>
              <option value="Different side">Different side (₦90)</option>
              <option value="Pick up">Pick up (₦0)</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Order Status Filter */}
          <div className="sm:col-span-3">
            <select
              value={orderStatus}
              onChange={handleOrderStatusChange}
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

      {/* Table Container */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
            <tr>
              <th className="px-4 py-3.5">Order ID &amp; Date</th>
              <th className="px-4 py-3.5">Customer &amp; Destination</th>
              <th className="px-4 py-3.5">Cafeteria</th>
              <th className="px-4 py-3.5">Delivery Type</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Delivery Fee</th>
              <th className="px-4 py-3.5 text-right">Rider Pay</th>
              <th className="px-4 py-3.5 text-right">Net Profit</th>
              <th className="px-4 py-3.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={9} className="px-4 py-4 bg-slate-50/50">
                    <div className="h-4 bg-slate-200 rounded w-full" />
                  </td>
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">No matching orders found</p>
                  <p className="text-xs text-slate-400 mt-1">Try clearing your search query or filters</p>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.orderId}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    !order.isSettled ? 'opacity-65 bg-slate-50/30' : ''
                  }`}
                >
                  {/* Order ID & Time */}
                  <td className="px-4 py-3.5">
                    <div className="font-extrabold text-slate-900 font-mono tracking-tight text-xs">
                      {order.orderId}
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium">
                      {new Date(order.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      • {order.time}
                    </div>
                  </td>

                  {/* Customer & Address */}
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-900">{order.customerName}</div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[220px] flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{order.deliveryAddress}</span>
                    </div>
                  </td>

                  {/* Cafeteria */}
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-700 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span>{order.cafeteriaName}</span>
                    </div>
                  </td>

                  {/* Delivery Type */}
                  <td className="px-4 py-3.5">
                    {getDeliveryTypeBadge(order.deliveryType)}
                  </td>

                  {/* Status Badges */}
                  <td className="px-4 py-3.5">
                    <div className="space-y-1">
                      <div>{getOrderStatusBadge(order.orderStatus)}</div>
                      <div>{getPaymentStatusBadge(order.paymentStatus)}</div>
                    </div>
                  </td>

                  {/* Delivery Fee */}
                  <td className="px-4 py-3.5 text-right font-extrabold text-slate-900">
                    {formatNaira(order.deliveryFee)}
                  </td>

                  {/* Rider Pay */}
                  <td className="px-4 py-3.5 text-right font-bold text-blue-700">
                    {order.isSettled ? formatNaira(order.riderPayout) : '—'}
                  </td>

                  {/* Net Profit */}
                  <td className="px-4 py-3.5 text-right">
                    {order.isSettled ? (
                      <span className="font-black text-emerald-700">
                        {formatNaira(order.netProfit)}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[11px] italic font-semibold">
                        Ignored (Unsettled)
                      </span>
                    )}
                  </td>

                  {/* View Modal Trigger */}
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-600 transition-colors"
                      title="Inspect Order Details"
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
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
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

      {/* Order Details Modal Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="text-xs font-bold text-brand-600 uppercase tracking-wider">Order Details</div>
                <div className="text-base font-black text-slate-900 font-mono">{selectedOrder.orderId}</div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Content Grid */}
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

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 font-medium">Delivery Type:</span>
                <div className="mt-1">{getDeliveryTypeBadge(selectedOrder.deliveryType)}</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <span className="text-slate-400 font-medium">Order Status:</span>
                <div className="mt-1">{getOrderStatusBadge(selectedOrder.orderStatus)}</div>
              </div>
            </div>

            {/* Financial Ledger Breakdown */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider border-b border-slate-200 pb-1.5">
                Financial Breakdown
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Food Total:</span>
                <span className="text-slate-900 font-medium">{formatNaira(selectedOrder.foodTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee (Gross):</span>
                <span className="text-brand-600 font-bold">{formatNaira(selectedOrder.deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Rider Payout Obligation:</span>
                <span className="text-blue-700 font-bold">{formatNaira(selectedOrder.riderPayout)}</span>
              </div>
              <div className="flex justify-between text-slate-900 pt-2 border-t border-slate-200 font-bold text-sm">
                <span className="text-emerald-700">Net Retained Profit:</span>
                <span className="text-emerald-700 font-black">{formatNaira(selectedOrder.netProfit)}</span>
              </div>
            </div>

            {/* Settlement Status Note */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="text-slate-500 font-medium">Settlement Audit: </span>
              {selectedOrder.isSettled ? (
                <span className="text-emerald-700 font-bold">
                  ✓ Verified Settled Order (Included in KPI &amp; Sprint calculations)
                </span>
              ) : (
                <span className="text-amber-700 font-bold">
                  ⚠ Unsettled / Cancelled (Excluded from KPI calculations)
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
