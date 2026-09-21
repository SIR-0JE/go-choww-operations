'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import { RiderOrderAccordion } from '@/components/riders/RiderOrderAccordion';
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
  Trash2,
  ExternalLink,
  Store,
  Edit3,
  Plus,
  Sparkles,
  MapPin,
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
  isOnline?: boolean;
  pin?: string;
  assignedCafeterias?: string[];
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

  // Cafeteria Management States
  const [availableCafeterias, setAvailableCafeterias] = useState<string[]>([]);
  const [isAddCafModalOpen, setIsAddCafModalOpen] = useState(false);
  const [newCafName, setNewCafName] = useState('');
  const [newCafCampus, setNewCafCampus] = useState('Campus Main');
  const [isAddingCaf, setIsAddingCaf] = useState(false);

  // Edit / Assign Cafeterias Modal State
  const [editingRider, setEditingRider] = useState<RiderItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPin, setEditPin] = useState('1234');
  const [editStatus, setEditStatus] = useState<'Active' | 'Inactive' | 'On Leave'>('Active');
  const [editCafeterias, setEditCafeterias] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Modal States
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderItem | null>(null);
  const [riderToDelete, setRiderToDelete] = useState<RiderItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Register Form State
  const [newRiderName, setNewRiderName] = useState('');
  const [newRiderPhone, setNewRiderPhone] = useState('');
  const [newRiderPin, setNewRiderPin] = useState('1234');
  const [newRiderStatus, setNewRiderStatus] = useState<'Active' | 'Inactive' | 'On Leave'>('Active');
  const [newRiderCafeterias, setNewRiderCafeterias] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchCafeterias = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/geofence');
      const data = await res.json();
      if (data.success) {
        const names: string[] = (data.allCafeterias || data.settings?.cafeterias || []).map(
          (c: any) => (c.name || '').trim()
        ).filter(Boolean);
        setAvailableCafeterias(Array.from(new Set(names)));
      }
    } catch (err) {
      console.warn('Failed to fetch cafeterias:', err);
    }
  }, []);

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
    fetchCafeterias();
  }, [fetchRiders, fetchCafeterias]);

  const handleQuickAddCafeteria = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCafName.trim()) return;
    setIsAddingCaf(true);
    try {
      const res = await fetch('/api/settings/geofence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_cafeteria',
          cafeteria: {
            name: newCafName.trim(),
            campus: newCafCampus,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchCafeterias();
        // If register modal is open, auto-select it
        if (isRegisterModalOpen) {
          setNewRiderCafeterias((prev) => Array.from(new Set([...prev, newCafName.trim()])));
        }
        // If edit modal is open, auto-select it
        if (editingRider) {
          setEditCafeterias((prev) => Array.from(new Set([...prev, newCafName.trim()])));
        }
        setNewCafName('');
        setIsAddCafModalOpen(false);
      }
    } catch (err) {
      console.error('Quick add cafeteria error:', err);
    } finally {
      setIsAddingCaf(false);
    }
  };

  const handleOpenEdit = (rider: RiderItem) => {
    setEditingRider(rider);
    setEditName(rider.name);
    setEditPhone(rider.phone === 'N/A' ? '' : rider.phone);
    setEditPin(rider.pin || '1234');
    setEditStatus(rider.status);
    setEditCafeterias(rider.assignedCafeterias || []);
  };

  const handleSaveEditRider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRider) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch('/api/riders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRider.id,
          name: editName.trim(),
          phone: editPhone.trim() || null,
          pin: editPin.trim() || '1234',
          status: editStatus,
          assignedCafeterias: editCafeterias,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingRider(null);
        fetchRiders();
      } else {
        alert(data.error || 'Failed to update rider');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error');
    } finally {
      setIsSavingEdit(false);
    }
  };

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
          pin: newRiderPin.trim() || '1234',
          status: newRiderStatus,
          assignedCafeterias: newRiderCafeterias,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setIsRegisterModalOpen(false);
        setNewRiderName('');
        setNewRiderPhone('');
        setNewRiderPin('1234');
        setNewRiderStatus('Active');
        setNewRiderCafeterias([]);
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

  const handleDeleteRider = async (id: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/riders?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        setRiderToDelete(null);
        if (selectedRider?.id === id) {
          setSelectedRider(null);
        }
        fetchRiders();
      } else {
        alert(data.error || 'Failed to delete rider');
      }
    } catch (err: any) {
      alert(err?.message || 'Network error deleting rider');
    } finally {
      setIsDeleting(false);
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

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsAddCafModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs sm:text-sm font-bold shadow-xs transition-all"
            >
              <Store className="w-4 h-4 text-amber-600" />
              <span>+ Add Cafeteria</span>
            </button>

            <Link
              href="/rider/login"
              target="_blank"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-all"
            >
              <ExternalLink className="w-4 h-4 text-amber-400" />
              <span>Rider Mobile Portal</span>
            </Link>

            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-brand-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Register New Rider</span>
            </button>
          </div>
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
                  <th className="px-5 py-3.5">Assigned Stations</th>
                  <th className="px-5 py-3.5 text-center">Total Orders</th>
                  <th className="px-5 py-3.5 text-center">Same-Side (₦50)</th>
                  <th className="px-5 py-3.5 text-center">Different-Side (₦90)</th>
                  <th className="px-5 py-3.5 text-right font-bold">Total Earnings</th>
                  <th className="px-5 py-3.5 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={9} className="px-5 py-4 bg-slate-50/50">
                        <div className="h-4 bg-slate-200 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : riders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-5 py-12 text-center text-slate-400">
                      <Bike className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No riders registered yet</p>
                      <p className="text-xs text-slate-400 mt-1">Click &quot;Register New Rider&quot; above to add your delivery fleet</p>
                    </td>
                  </tr>
                ) : (
                  riders.map((rider) => {
                    const assigned = rider.assignedCafeterias || [];
                    return (
                      <tr key={rider.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Name */}
                        <td className="px-5 py-4 font-bold text-slate-900 text-sm flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-600 font-black flex items-center justify-center text-xs border border-brand-200">
                            {rider.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span>{rider.name}</span>
                            <span className="block text-[10px] font-mono text-slate-400 font-normal">PIN: {rider.pin || '1234'}</span>
                          </div>
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
                          <div className="flex flex-col gap-1 items-start">
                            {getStatusBadge(rider.status)}
                            {rider.isOnline ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Online
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                Offline
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Assigned Cafeteria Stations */}
                        <td className="px-5 py-4">
                          {assigned.length > 0 ? (
                            <div className="flex flex-wrap items-center gap-1 max-w-xs">
                              {assigned.map((caf) => (
                                <span
                                  key={caf}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs"
                                >
                                  <Store className="w-2.5 h-2.5 text-amber-600" />
                                  <span>{caf}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">
                              All Campus Spots (Open)
                            </span>
                          )}
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

                        {/* Actions */}
                        <td className="px-5 py-4 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenEdit(rider)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-500 hover:text-white text-amber-800 border border-amber-200/80 text-xs font-bold transition-colors"
                              title="Assign Cafeterias & Edit Details"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Assign / Edit</span>
                            </button>

                            <button
                              onClick={() => setSelectedRider(rider)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-brand-500 hover:text-white text-slate-700 text-xs font-bold transition-colors"
                              title="Quick View Breakdown"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Runs</span>
                            </button>

                            <Link
                              href={`/riders/${rider.id}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 hover:bg-brand-600 hover:text-white text-brand-700 border border-brand-200/60 text-xs font-bold transition-colors"
                              title="View Full Chronological Profile"
                            >
                              <span>Profile</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>

                            <button
                              onClick={() => setRiderToDelete(rider)}
                              className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-600 transition-colors border border-rose-200/60"
                              title="Delete Rider"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            EDIT RIDER & ASSIGN CAFETERIAS MODAL
        ───────────────────────────────────────────────────────────── */}
        {editingRider && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Assign Cafeterias & Edit Rider</h3>
                    <p className="text-xs text-slate-500">Configure priority dispatch stations for {editingRider.name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingRider(null)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditRider} className="space-y-4 overflow-y-auto flex-1 pr-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Rider Name *</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="080..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Portal PIN (4 Digits)</label>
                    <input
                      type="text"
                      maxLength={4}
                      value={editPin}
                      onChange={(e) => setEditPin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium font-mono tracking-widest"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                    >
                      <option value="Active">Active</option>
                      <option value="On Leave">On Leave</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {/* Assigned Cafeteria Multi-Select Station Picker */}
                <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-black text-amber-900">
                        Priority Assigned Cafeterias ({editCafeterias.length})
                      </label>
                      <p className="text-[11px] text-amber-700">
                        Orders from these cafeterias will trigger urgent alerts and appear at the top of their pool.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editCafeterias.length === availableCafeterias.length) {
                            setEditCafeterias([]);
                          } else {
                            setEditCafeterias([...availableCafeterias]);
                          }
                        }}
                        className="text-[10px] font-bold text-amber-800 bg-white px-2 py-0.5 rounded border border-amber-300"
                      >
                        {editCafeterias.length === availableCafeterias.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto p-1 bg-white rounded-xl border border-amber-200">
                    {availableCafeterias.length === 0 ? (
                      <p className="text-xs text-slate-400 p-2 italic">No cafeterias registered. Add one below!</p>
                    ) : (
                      availableCafeterias.map((caf) => {
                        const isSelected = editCafeterias.some(
                          (c) => c.trim().toLowerCase() === caf.trim().toLowerCase()
                        );
                        return (
                          <button
                            key={caf}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setEditCafeterias((prev) =>
                                  prev.filter((c) => c.trim().toLowerCase() !== caf.trim().toLowerCase())
                                );
                              } else {
                                setEditCafeterias((prev) => [...prev, caf]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                              isSelected
                                ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-amber-300'
                            }`}
                          >
                            <Store className="w-3 h-3" />
                            <span>{caf}</span>
                            {isSelected && <span className="text-[10px]">✓</span>}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-slate-500">
                      Need a cafeteria not listed here?
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddCafModalOpen(true)}
                      className="text-xs font-bold text-brand-600 hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Create New Cafeteria</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRider(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-500/20 transition-all flex items-center gap-2"
                  >
                    {isSavingEdit ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            QUICK ADD CAFETERIA MODAL
        ───────────────────────────────────────────────────────────── */}
        {isAddCafModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Add Campus Cafeteria</h3>
                    <p className="text-xs text-slate-500">Register a new food vendor spot</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsAddCafModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleQuickAddCafeteria} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cafeteria Name *</label>
                  <input
                    type="text"
                    required
                    value={newCafName}
                    onChange={(e) => setNewCafName(e.target.value)}
                    placeholder="e.g. Divine Cafeteria"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Campus Zone</label>
                  <select
                    value={newCafCampus}
                    onChange={(e) => setNewCafCampus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  >
                    <option value="Temporary Site">Temporary Site (Oungbona)</option>
                    <option value="Permanent Site">Permanent Site</option>
                    <option value="Campus Main">Campus Main</option>
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddCafModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingCaf}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-md shadow-amber-500/20 flex items-center gap-2"
                  >
                    {isAddingCaf ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <span>Save Cafeteria</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            REGISTER NEW RIDER MODAL
        ───────────────────────────────────────────────────────────── */}
        {isRegisterModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
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

              <form onSubmit={handleRegisterRider} className="space-y-3.5 overflow-y-auto flex-1 pr-1">
                <div className="grid grid-cols-2 gap-3">
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
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-bold text-slate-700">Portal PIN (4 Digits)</label>
                      <span className="text-[10px] text-slate-400">Default: 1234</span>
                    </div>
                    <input
                      type="text"
                      maxLength={4}
                      value={newRiderPin}
                      onChange={(e) => setNewRiderPin(e.target.value)}
                      placeholder="1234"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium font-mono tracking-widest"
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
                </div>

                {/* Assigned Cafeteria Multi-Select in Register Modal */}
                <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-black text-amber-900">
                        Assign Cafeteria Stations ({newRiderCafeterias.length})
                      </label>
                      <p className="text-[11px] text-amber-700">Optional: Choose which cafeterias prioritize this rider.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-white rounded-xl border border-amber-200">
                    {availableCafeterias.map((caf) => {
                      const isSelected = newRiderCafeterias.includes(caf);
                      return (
                        <button
                          key={caf}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setNewRiderCafeterias((prev) => prev.filter((c) => c !== caf));
                            } else {
                              setNewRiderCafeterias((prev) => [...prev, caf]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 border ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-600'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          <span>{caf}</span>
                          {isSelected && <span>✓</span>}
                        </button>
                      );
                    })}
                  </div>
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
            DELETE RIDER CONFIRMATION MODAL
        ───────────────────────────────────────────────────────────── */}
        {riderToDelete && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Delete Rider</h3>
                  <p className="text-xs text-slate-500">Remove rider from dispatch roster</p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                <p>
                  Are you sure you want to delete <strong className="text-slate-900 font-bold">{riderToDelete.name}</strong>?
                </p>
                <p className="text-slate-500 text-[11px]">
                  All {riderToDelete.totalOrdersAssigned} delivery orders assigned to this rider will remain safe and be marked as <strong className="text-slate-700">Unassigned</strong>.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setRiderToDelete(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleDeleteRider(riderToDelete.id)}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-500/20 transition-all flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Confirm Delete</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            RIDER ORDERS BREAKDOWN MODAL (WITH ACCORDION)
        ───────────────────────────────────────────────────────────── */}
        {selectedRider && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-brand-50 text-brand-600 font-black flex items-center justify-center text-base border border-brand-200">
                    {selectedRider.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <span>{selectedRider.name}</span>
                      {getStatusBadge(selectedRider.status)}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Phone: <span className="font-mono text-slate-700 font-bold">{selectedRider.phone}</span> • Total Payout: <strong className="text-emerald-700">{formatNaira(selectedRider.totalEarnings)}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/riders/${selectedRider.id}`}
                    className="px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-600 hover:text-white text-brand-700 border border-brand-200 transition-colors text-xs font-bold flex items-center gap-1.5"
                    title="Open Full Profile Page"
                  >
                    <span>Full Profile</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    onClick={() => {
                      setRiderToDelete(selectedRider);
                    }}
                    className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-500 hover:text-white text-rose-600 border border-rose-200 transition-colors text-xs font-bold flex items-center gap-1"
                    title="Delete Rider"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => setSelectedRider(null)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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

              {/* Hierarchical Accordion Container */}
              <div className="overflow-y-auto flex-1 pr-1">
                <RiderOrderAccordion
                  orders={selectedRider.orders}
                  ridersList={riders}
                  onOrderReassigned={() => {
                    fetchRiders();
                    setSelectedRider(null);
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </main>
    </AppLayout>
  );
}
