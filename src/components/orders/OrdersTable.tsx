'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  SlidersHorizontal,
  Store,
  MapPin,
  Bike,
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

  // Handle filter changes (reset page to 1)
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
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          Completed
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-300 border border-red-500/30">
        <XCircle className="w-3.5 h-3.5 text-red-400" />
        Cancelled
      </span>
    );
  };

  const getPaymentStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'success') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-500/20">
          ✓ Paid
        </span>
      );
    }
    if (s === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950/60 text-amber-400 border border-amber-500/20">
          ⏳ Unpaid
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-red-950/60 text-red-400 border border-red-500/20">
        ✕ Failed
      </span>
    );
  };

  const getDeliveryTypeBadge = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'same side') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-orange-500/15 text-orange-300 border border-orange-500/30">
          Same side (₦50)
        </span>
      );
    }
    if (t === 'different side') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-blue-500/15 text-blue-300 border border-blue-500/30">
          Different side (₦90)
        </span>
      );
    }
    if (t === 'pick up' || t === 'pickup') {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          Pick up (₦0)
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-purple-500/15 text-purple-300 border border-purple-500/30">
        Other (₦0)
      </span>
    );
  };

  return (
    <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-xl shadow-black/20 overflow-hidden">
      {/* Table Controls Header */}
      <div className="p-5 sm:p-6 border-b border-[#1a293d] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5 text-brand-400" />
              Operational Orders Ledger
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Showing <strong className="text-white">{totalCount}</strong> recorded delivery runs • Settlement filtering active
            </p>
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
              <ShieldCheck className="w-4 h-4" />
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
              className="w-full bg-[#142033] border border-[#23354e] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white"
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
              className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
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
              className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
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
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-[#142033] text-slate-400 uppercase tracking-wider font-extrabold text-[10px] border-b border-[#1b2a3f]">
            <tr>
              <th className="px-4 py-3.5">Order ID & Date</th>
              <th className="px-4 py-3.5">Customer & Destination</th>
              <th className="px-4 py-3.5">Cafeteria</th>
              <th className="px-4 py-3.5">Delivery Type</th>
              <th className="px-4 py-3.5">Status</th>
              <th className="px-4 py-3.5 text-right">Delivery Fee</th>
              <th className="px-4 py-3.5 text-right">Rider Pay</th>
              <th className="px-4 py-3.5 text-right">Net Profit</th>
              <th className="px-4 py-3.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#18263a]">
            {isLoading ? (
              [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={9} className="px-4 py-4 bg-[#101a2b]">
                    <div className="h-4 bg-[#18263a] rounded w-full" />
                  </td>
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-semibold text-slate-400">No matching orders found</p>
                  <p className="text-xs text-slate-500 mt-1">Try clearing your search query or filters</p>
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.orderId}
                  className={`hover:bg-[#142236] transition-colors ${
                    !order.isSettled ? 'opacity-65 bg-[#0d1522]/50' : ''
                  }`}
                >
                  {/* Order ID & Time */}
                  <td className="px-4 py-3.5">
                    <div className="font-extrabold text-white font-mono tracking-tight text-xs">
                      {order.orderId}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium">
                      {new Date(order.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      • {order.time}
                    </div>
                  </td>

                  {/* Customer & Address */}
                  <td className="px-4 py-3.5">
                    <div className="font-bold text-slate-200">{order.customerName}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[220px] flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span>{order.deliveryAddress}</span>
                    </div>
                  </td>

                  {/* Cafeteria */}
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-slate-300 flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-amber-400 shrink-0" />
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
                  <td className="px-4 py-3.5 text-right font-extrabold text-white">
                    {formatNaira(order.deliveryFee)}
                  </td>

                  {/* Rider Pay */}
                  <td className="px-4 py-3.5 text-right font-bold text-indigo-300">
                    {order.isSettled ? formatNaira(order.riderPayout) : '—'}
                  </td>

                  {/* Net Profit */}
                  <td className="px-4 py-3.5 text-right">
                    {order.isSettled ? (
                      <span className="font-black text-emerald-300">
                        {formatNaira(order.netProfit)}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px] italic font-semibold">
                        Ignored (Unsettled)
                      </span>
                    )}
                  </td>

                  {/* View Modal Trigger */}
                  <td className="px-4 py-3.5 text-center">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="p-1.5 rounded-lg bg-[#1a283e] hover:bg-brand-500 hover:text-white text-slate-400 transition-colors"
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
      <div className="p-4 border-t border-[#1a293d] bg-[#111c2e] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={limit}
            onChange={(e) => {
              setLimit(parseInt(e.target.value, 10));
              setPage(1);
            }}
            className="bg-[#17253a] border border-[#23354e] rounded px-2 py-1 text-white text-xs focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span>
            Page <strong className="text-white">{page}</strong> of <strong className="text-white">{totalPages}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="px-3 py-1.5 rounded-lg bg-[#18253a] border border-[#24374f] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#20324e] transition-colors flex items-center gap-1 font-semibold"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="px-3 py-1.5 rounded-lg bg-[#18253a] border border-[#24374f] text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#20324e] transition-colors flex items-center gap-1 font-semibold"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Order Details Modal Drawer */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#101a2b] border border-[#22354e] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#1e2f47] pb-3">
              <div>
                <div className="text-xs font-bold text-brand-400 uppercase tracking-wider">Order Details</div>
                <div className="text-base font-black text-white font-mono">{selectedOrder.orderId}</div>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-lg bg-[#18263a] hover:bg-[#253957] text-slate-300 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Modal Content Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-[#142033] border border-[#1f3049]">
                <span className="text-slate-400 font-medium">Customer:</span>
                <p className="font-bold text-white text-sm mt-0.5">{selectedOrder.customerName}</p>
              </div>

              <div className="p-3 rounded-xl bg-[#142033] border border-[#1f3049]">
                <span className="text-slate-400 font-medium">Cafeteria:</span>
                <p className="font-bold text-amber-300 text-sm mt-0.5">{selectedOrder.cafeteriaName}</p>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-[#142033] border border-[#1f3049]">
                <span className="text-slate-400 font-medium">Delivery Address:</span>
                <p className="font-semibold text-slate-200 mt-0.5">{selectedOrder.deliveryAddress}</p>
              </div>

              <div className="p-3 rounded-xl bg-[#142033] border border-[#1f3049]">
                <span className="text-slate-400 font-medium">Delivery Type:</span>
                <div className="mt-1">{getDeliveryTypeBadge(selectedOrder.deliveryType)}</div>
              </div>

              <div className="p-3 rounded-xl bg-[#142033] border border-[#1f3049]">
                <span className="text-slate-400 font-medium">Order Status:</span>
                <div className="mt-1">{getOrderStatusBadge(selectedOrder.orderStatus)}</div>
              </div>
            </div>

            {/* Financial Ledger Breakdown */}
            <div className="p-4 rounded-xl bg-[#0b121e] border border-[#1e2f47] space-y-2 text-xs">
              <div className="font-bold text-slate-300 text-[11px] uppercase tracking-wider border-b border-[#18263a] pb-1.5">
                Financial Breakdown
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Food Total:</span>
                <span className="text-slate-200 font-medium">{formatNaira(selectedOrder.foodTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Delivery Fee (Gross):</span>
                <span className="text-brand-400 font-bold">{formatNaira(selectedOrder.deliveryFee)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Rider Payout Obligation:</span>
                <span className="text-indigo-400 font-bold">{formatNaira(selectedOrder.riderPayout)}</span>
              </div>
              <div className="flex justify-between text-slate-200 pt-2 border-t border-[#18263a] font-bold text-sm">
                <span className="text-emerald-400">Net Retained Profit:</span>
                <span className="text-emerald-300 font-black">{formatNaira(selectedOrder.netProfit)}</span>
              </div>
            </div>

            {/* Settlement Status Note */}
            <div className="p-3 rounded-xl bg-[#142033] border border-[#1f3049] text-xs">
              <span className="text-slate-400 font-medium">Settlement Audit: </span>
              {selectedOrder.isSettled ? (
                <span className="text-emerald-400 font-bold">
                  ✓ Verified Settled Order (Included in KPI & Sprint calculations)
                </span>
              ) : (
                <span className="text-amber-400 font-bold">
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
