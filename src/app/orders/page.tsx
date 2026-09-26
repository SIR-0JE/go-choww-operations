'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { CsvUploadDropzone } from '@/components/orders/CsvUploadDropzone';
import { formatNaira } from '@/lib/financials';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  AlertCircle,
  Bike,
  Pencil,
  Save,
  RefreshCw,
  X,
  Upload,
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
  pickupCode?: string | null;
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
  const [showImport, setShowImport] = useState(false);

  // Edit Order Override Modal State
  const [editingOrder, setEditingOrder] = useState<RawOrder | null>(null);
  const [editDeliveryType, setEditDeliveryType] = useState<string>('Same side');
  const [editDeliveryFee, setEditDeliveryFee] = useState<number | string>(100);
  const [editRiderId, setEditRiderId] = useState<string>('unassigned');
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [editSaveError, setEditSaveError] = useState<string | null>(null);

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
        setTotalCount(data.pagination?.activeTotalCount ?? data.pagination?.totalCount ?? 0);
        setTotalPages(data.pagination?.totalPages || 1);
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

  // Listen for global auto-sync events so data updates live without manual page refresh
  useEffect(() => {
    const handleSync = () => {
      fetchOrders();
    };
    window.addEventListener('orders-synced', handleSync);
    return () => window.removeEventListener('orders-synced', handleSync);
  }, [fetchOrders]);

  // Open Edit Modal
  const openEditModal = (ord: RawOrder) => {
    setEditingOrder(ord);
    setEditDeliveryType(ord.deliveryType || 'Same side');
    setEditDeliveryFee(ord.deliveryFee);
    setEditRiderId(ord.riderId || 'unassigned');
    setEditSaveError(null);
  };

  // Save Order Override Handler
  const handleSaveOrderOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setIsSavingOrder(true);
    setEditSaveError(null);

    try {
      const res = await fetch(`/api/orders/${editingOrder.id || editingOrder.orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryType: editDeliveryType,
          deliveryFee: Number(editDeliveryFee),
          riderId: editRiderId === 'unassigned' ? null : editRiderId,
        }),
      });
      const data = await res.json();

      if (data.success && data.order) {
        // Optimistically update orders list with new values
        setOrders((prev) =>
          prev.map((ord) => (ord.orderId === editingOrder.orderId ? { ...ord, ...data.order } : ord))
        );
        // If the inspect modal is viewing this order, update that too
        if (selectedOrder && selectedOrder.orderId === editingOrder.orderId) {
          setSelectedOrder((prev) => (prev ? { ...prev, ...data.order } : null));
        }
        setEditingOrder(null);
      } else {
        setEditSaveError(data.error || 'Failed to update order');
      }
    } catch (err: any) {
      console.error('Failed to save order override:', err);
      setEditSaveError(err?.message || 'Network error updating order');
    } finally {
      setIsSavingOrder(false);
    }
  };

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

  const getOrderStatusBadge = (status: string, _payStatus?: string) => {
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
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {label}
      </span>
    );
  };

  const getDeliveryTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    const label = t === 'same side' ? 'Same side' : t === 'different side' ? 'Different side' : t.includes('pick') ? 'Pick up' : 'Other';
    const tone =
      t === 'different side' ? 'bg-blue-50 text-blue-700' : t.includes('pick') ? 'bg-slate-100 text-slate-600' : t === 'same side' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500';
    return <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${tone}`}>{label}</span>;
  };

  // Cafeteria pickup code (GoChow confirmationCode) — shown so admins can help riders at the counter
  const pickupCodeChip = (code?: string | null) =>
    code ? (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-900 text-white text-xs font-mono font-medium tracking-wider" title="Cafeteria pickup code">
        {code}
      </span>
    ) : (
      <span className="text-xs text-slate-300">—</span>
    );

  const selectCls =
    'h-9 bg-white border border-slate-200 rounded-lg px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/10 min-w-0';

  return (
    <AppLayout>
      <Header onSyncComplete={fetchOrders} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-medium text-slate-700 tabular-nums">{totalCount.toLocaleString()}</span> orders · every GoChow order with its rider, route and status
            </p>
          </div>
          <button
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
          >
            <Upload className="w-4 h-4" />
            {showImport ? 'Close import' : 'Import CSV'}
          </button>
        </div>

        {showImport && (
          <section aria-label="Import orders">
            <CsvUploadDropzone onUploadSuccess={fetchOrders} />
          </section>
        )}

        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          {/* Filters */}
          <div className="p-3 sm:p-4 border-b border-slate-100 flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search order, customer, cafeteria, hostel or pickup code"
                className="w-full h-9 bg-white border border-slate-200 rounded-lg pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 lg:flex">
              <select
                value={deliveryType}
                onChange={(e) => {
                  setDeliveryType(e.target.value);
                  setPage(1);
                }}
                className={selectCls}
                aria-label="Delivery type"
              >
                <option value="All">All types</option>
                <option value="Same side">Same side</option>
                <option value="Different side">Different side</option>
                <option value="Pick up">Pick up</option>
              </select>
              <select
                value={orderStatus}
                onChange={(e) => {
                  setOrderStatus(e.target.value);
                  setPage(1);
                }}
                className={selectCls}
                aria-label="Status"
              >
                <option value="All">All statuses</option>
                <option value="Completed">Delivered</option>
                <option value="Dispatched">In transit</option>
                <option value="Ready">Ready</option>
                <option value="Preparing">Preparing</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <select
                value={riderFilter}
                onChange={(e) => {
                  setRiderFilter(e.target.value);
                  setPage(1);
                }}
                className={selectCls}
                aria-label="Rider"
              >
                <option value="All">All riders</option>
                <option value="unassigned">Unassigned</option>
                {ridersList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-slate-100">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="px-4 py-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-full" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">No matching orders</p>
              <p className="text-xs text-slate-500 mt-1">Try a different search or filter.</p>
            </div>
          ) : (
            <>
              {/* Phone: one card per order */}
              <ul className="md:hidden divide-y divide-slate-100">
                {orders.map((ord) => {
                  const isCancelled = (ord.orderStatus || '').toLowerCase().includes('canc');
                  return (
                    <li key={ord.orderId} className={`p-4 space-y-2.5 ${isCancelled ? 'opacity-60' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{ord.customerName}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(ord.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {ord.time}
                            <span className="font-mono ml-1.5 text-slate-400">{ord.orderId.slice(-6)}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <div className="text-sm font-medium text-slate-900 tabular-nums">{formatNaira(ord.deliveryFee)}</div>
                          {getOrderStatusBadge(ord.orderStatus, ord.paymentStatus)}
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">
                        {ord.cafeteriaName} <span className="text-slate-400">→</span> {ord.deliveryAddress}
                      </div>
                      <div className="flex items-center gap-2">
                        {pickupCodeChip(ord.pickupCode)}
                        {getDeliveryTypeBadge(ord.deliveryType)}
                        <select
                          value={ord.riderId || 'unassigned'}
                          disabled={updatingOrderId === ord.orderId}
                          onChange={(e) => handleAssignRider(ord.orderId, e.target.value)}
                          className={`${selectCls} flex-1 h-8 text-xs`}
                          aria-label="Assign rider"
                        >
                          <option value="unassigned">No rider</option>
                          {ridersList.map((rider) => (
                            <option key={rider.id} value={rider.id}>
                              {rider.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setSelectedOrder(ord)}
                          className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500"
                          aria-label="View order"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-4 py-2.5 font-medium">Order</th>
                      <th className="px-4 py-2.5 font-medium">Route</th>
                      <th className="px-4 py-2.5 font-medium">Code</th>
                      <th className="px-4 py-2.5 font-medium">Type</th>
                      <th className="px-4 py-2.5 font-medium text-right">Fee</th>
                      <th className="px-4 py-2.5 font-medium">Status</th>
                      <th className="px-4 py-2.5 font-medium">Rider</th>
                      <th className="px-4 py-2.5 font-medium sr-only">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders.map((ord) => {
                      const isCancelled = (ord.orderStatus || '').toLowerCase().includes('canc');
                      return (
                        <tr key={ord.orderId} className={`hover:bg-slate-50/70 ${isCancelled ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{ord.customerName}</div>
                            <div className="text-xs text-slate-500 whitespace-nowrap">
                              {new Date(ord.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {ord.time}
                              <span className="font-mono ml-1.5 text-slate-400">{ord.orderId}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-slate-700 max-w-[220px] truncate">{ord.cafeteriaName}</div>
                            <div className="text-xs text-slate-500 max-w-[220px] truncate">→ {ord.deliveryAddress}</div>
                          </td>
                          <td className="px-4 py-3">{pickupCodeChip(ord.pickupCode)}</td>
                          <td className="px-4 py-3">{getDeliveryTypeBadge(ord.deliveryType)}</td>
                          <td className="px-4 py-3 text-right text-slate-900 tabular-nums">{formatNaira(ord.deliveryFee)}</td>
                          <td className="px-4 py-3">{getOrderStatusBadge(ord.orderStatus, ord.paymentStatus)}</td>
                          <td className="px-4 py-3 min-w-[150px]">
                            <select
                              value={ord.riderId || 'unassigned'}
                              disabled={updatingOrderId === ord.orderId}
                              onChange={(e) => handleAssignRider(ord.orderId, e.target.value)}
                              className={`${selectCls} w-full h-8 text-xs ${ord.riderId ? 'text-slate-900' : 'text-slate-400'}`}
                              aria-label="Assign rider"
                            >
                              <option value="unassigned">No rider</option>
                              {ridersList.map((rider) => (
                                <option key={rider.id} value={rider.id}>
                                  {rider.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEditModal(ord)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                                title="Edit order"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSelectedOrder(ord)}
                                className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100"
                                title="View order"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(parseInt(e.target.value, 10));
                  setPage(1);
                }}
                className="h-8 bg-white border border-slate-200 rounded-lg px-2 text-sm text-slate-700 focus:outline-none"
                aria-label="Rows per page"
              >
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
              <span className="hidden sm:inline">
                Page {page} of {totalPages}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="sm:hidden text-xs">
                {page}/{totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
                className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-40 hover:bg-slate-50"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Inspector */}
        {selectedOrder && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="text-xs font-semibold text-brand-600">Raw Order Record</div>
                  <div className="text-base font-semibold text-slate-900 font-mono">{selectedOrder.orderId}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const o = selectedOrder;
                      setSelectedOrder(null);
                      openEditModal(o);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-brand-50 hover:bg-brand-600 hover:text-white text-brand-700 border border-brand-200 transition-colors text-xs font-semibold flex items-center gap-1"
                    title="Edit this order"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => setSelectedOrder(null)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Customer:</span>
                  <p className="font-semibold text-slate-900 text-sm mt-0.5">{selectedOrder.customerName}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Cafeteria:</span>
                  <p className="font-semibold text-amber-700 text-sm mt-0.5">{selectedOrder.cafeteriaName}</p>
                </div>
                <div className="col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-slate-400 font-medium">Delivery Address:</span>
                  <p className="font-semibold text-slate-800 mt-0.5">{selectedOrder.deliveryAddress}</p>
                </div>
                <div className="col-span-2 p-3 rounded-xl bg-blue-50/60 border border-blue-100 flex items-center justify-between">
                  <div>
                    <span className="text-blue-500 font-medium">Assigned Dispatch Rider:</span>
                    <p className="font-semibold text-blue-950 text-sm mt-0.5">
                      {selectedOrder.rider?.name || 'Unassigned'}
                    </p>
                  </div>
                  <Bike className="w-5 h-5 text-blue-600" />
                </div>
                <div className="col-span-2 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Cafeteria pickup code</span>
                  {pickupCodeChip(selectedOrder.pickupCode)}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="font-semibold text-slate-700 text-xs border-b border-slate-200 pb-1.5">
                  Financial Settlement Breakdown
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Food Total:</span>
                  <span className="text-slate-900 font-medium">{formatNaira(selectedOrder.foodTotal)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Fee:</span>
                  <span className="text-brand-600 font-semibold">{formatNaira(selectedOrder.deliveryFee)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Rider Payout:</span>
                  <span className="text-blue-700 font-semibold">{formatNaira(selectedOrder.riderPayout)}</span>
                </div>
                <div className="flex justify-between text-slate-900 pt-2 border-t border-slate-200 font-semibold text-sm">
                  <span className="text-emerald-700">Net Retained Profit:</span>
                  <span className="text-emerald-700 font-semibold">{formatNaira(selectedOrder.netProfit)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            EDIT ORDER OVERRIDE MODAL
        ───────────────────────────────────────────────────────────── */}
        {editingOrder && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Manual Order Override</h3>
                    <p className="text-xs text-slate-500 font-mono font-semibold">{editingOrder.orderId}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingOrder(null)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {editSaveError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{editSaveError}</span>
                </div>
              )}

              {/* Order Context Info */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400 font-medium">Customer:</span>
                  <p className="font-semibold text-slate-900 truncate">{editingOrder.customerName}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Cafeteria (Origin):</span>
                  <p className="font-semibold text-amber-700 truncate">{editingOrder.cafeteriaName}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 font-medium">Delivery Address (Destination):</span>
                  <p className="font-semibold text-slate-800 truncate">{editingOrder.deliveryAddress}</p>
                </div>
              </div>

              {/* Form Controls */}
              <form onSubmit={handleSaveOrderOverride} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Delivery Type / Fulfillment Zone *
                  </label>
                  <select
                    value={editDeliveryType}
                    onChange={(e) => setEditDeliveryType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="Same side">Same side (₦50 Rider Pay)</option>
                    <option value="Different side">Different side (₦90 Rider Pay)</option>
                    <option value="Pick up">Pick up (₦0 Rider Pay)</option>
                    <option value="Other">Other (₦0 Rider Pay)</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    Override to Same side or Different side if an order marked as Pickup was fulfilled by a rider.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Delivery Fee (NGN ₦) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                      ₦
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={editDeliveryFee}
                      onChange={(e) => setEditDeliveryFee(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Dispatch Rider
                  </label>
                  <select
                    value={editRiderId}
                    onChange={(e) => setEditRiderId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                  >
                    <option value="unassigned">— Unassigned —</option>
                    {ridersList.map((rider) => (
                      <option key={rider.id} value={rider.id}>
                        {rider.name} ({rider.status || 'Active'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dynamic Financial Impact Preview */}
                {(() => {
                  const typeLower = editDeliveryType.toLowerCase();
                  const isSame = typeLower.includes('same');
                  const isDiff = typeLower.includes('diff');
                  const riderPay = isSame ? 50 : isDiff ? 90 : 0;
                  const fee = Number(editDeliveryFee) || 0;
                  const net = fee - riderPay;

                  return (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                      <span className="font-semibold text-slate-500 text-xs block">
                        Live Calculation Preview
                      </span>
                      <div className="flex justify-between text-slate-600">
                        <span>Rider Pay:</span>
                        <span className="font-semibold text-blue-700">{formatNaira(riderPay)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Updated Delivery Fee:</span>
                        <span className="font-semibold text-brand-600">{formatNaira(fee)}</span>
                      </div>
                      <div className="flex justify-between text-slate-900 pt-1.5 border-t border-slate-200 font-semibold">
                        <span className="text-emerald-700">Estimated Net Profit:</span>
                        <span className="text-emerald-700 font-semibold">{formatNaira(net)}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Form Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isSavingOrder}
                    onClick={() => setEditingOrder(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingOrder}
                    className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-sm shadow-brand-500/20 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSavingOrder ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving Changes...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Override</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
