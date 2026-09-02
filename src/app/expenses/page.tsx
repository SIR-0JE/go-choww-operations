'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  Receipt,
  Plus,
  Search,
  Trash2,
  Calendar,
  Calculator,
  Bike,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  Layers,
  Sparkles,
} from 'lucide-react';

interface ExpenseItem {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export default function ExpensesManagerPage() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [totalExpenses, setTotalExpenses] = useState(0);

  // Form State for Adding Expense
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formDate, setFormDate] = useState('2026-09-01');
  const [formCategory, setFormCategory] = useState('Fuel');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formFeedback, setFormFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Dynamic Rider Pay Calculator State
  const [calcStartDate, setCalcStartDate] = useState('2026-08-01');
  const [calcEndDate, setCalcEndDate] = useState('2026-09-01');
  const [paymentModel, setPaymentModel] = useState<'standard' | 'flat' | 'custom'>('standard');
  const [customSameRate, setCustomSameRate] = useState(50);
  const [customDiffRate, setCustomDiffRate] = useState(90);

  const fetchExpensesAndOrders = useCallback(async () => {
    setIsLoading(true);
    try {
      const [expRes, ordRes] = await Promise.all([
        fetch(`/api/expenses?search=${encodeURIComponent(search)}&category=${encodeURIComponent(categoryFilter)}`),
        fetch('/api/orders?limit=500'),
      ]);

      const expData = await expRes.json();
      const ordData = await ordRes.json();

      if (expData.success) {
        setExpenses(expData.expenses || []);
        setTotalExpenses(expData.totalExpenses || 0);
      }

      if (ordData.success) {
        setOrders(ordData.orders || []);
      }
    } catch (err) {
      console.error('Failed to load expenses & orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    fetchExpensesAndOrders();
  }, [fetchExpensesAndOrders]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription || !formAmount || isNaN(Number(formAmount))) {
      setFormFeedback({ message: 'Please provide a valid description and amount', type: 'error' });
      return;
    }

    setIsSubmitting(true);
    setFormFeedback(null);

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formDate,
          category: formCategory,
          description: formDescription,
          amount: Number(formAmount),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFormDescription('');
        setFormAmount('');
        setIsAddModalOpen(false);
        fetchExpensesAndOrders();
      } else {
        setFormFeedback({ message: data.error || 'Failed to add expense', type: 'error' });
      }
    } catch (err: any) {
      setFormFeedback({ message: err?.message || 'Network error', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense record?')) return;

    try {
      const res = await fetch(`/api/expenses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        fetchExpensesAndOrders();
      }
    } catch (err) {
      console.error('Failed to delete expense:', err);
    }
  };

  // Dynamic Rider Pay Computation
  const calculateDynamicRiderPay = () => {
    const start = new Date(calcStartDate).getTime();
    const end = new Date(calcEndDate).getTime() + 86400000; // inclusive of end day

    let sameSideCount = 0;
    let diffSideCount = 0;
    let otherCount = 0;
    let totalSettled = 0;

    for (const ord of orders) {
      const ordTime = new Date(ord.createdAt).getTime();
      const isSettled = ord.isSettled || (ord.orderStatus?.toLowerCase() === 'completed' && ord.paymentStatus?.toLowerCase() === 'success');

      if (isSettled && ordTime >= start && ordTime <= end) {
        totalSettled++;
        const type = (ord.deliveryType || '').toLowerCase();
        if (type === 'same side') sameSideCount++;
        else if (type === 'different side') diffSideCount++;
        else otherCount++;
      }
    }

    let totalRiderPay = 0;
    if (paymentModel === 'standard') {
      totalRiderPay = sameSideCount * 50 + diffSideCount * 90;
    } else if (paymentModel === 'flat') {
      totalRiderPay = totalSettled * 70;
    } else {
      totalRiderPay = sameSideCount * customSameRate + diffSideCount * customDiffRate;
    }

    return {
      totalSettled,
      sameSideCount,
      diffSideCount,
      otherCount,
      totalRiderPay,
    };
  };

  const dynamicRiderStats = calculateDynamicRiderPay();

  const getCategoryColor = (cat: string) => {
    switch (cat.toLowerCase()) {
      case 'fuel':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'software':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200';
      case 'marketing':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'salaries':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <AppLayout>
      <Header onSyncComplete={fetchExpensesAndOrders} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Title & Add Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
              <Receipt className="w-7 h-7 text-brand-600" />
              Expenses &amp; Rider Pay Hub
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Operational expense ledger paired with the Excel Dynamic Rider Payout calculator
            </p>
          </div>

          <button
            onClick={() => {
              setFormFeedback(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-orange-600 hover:from-brand-600 hover:to-orange-700 text-white font-bold text-xs sm:text-sm shadow-sm hover:shadow active:scale-95 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>

        {/* 2-Column Grid: Left Side (Expense Logs Table) | Right Side (Dynamic Rider Pay Calculator) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ─────────────────────────────────────────────────────────────
              LEFT SIDE (8 COLUMNS): EXPENSES LOG TABLE
          ───────────────────────────────────────────────────────────── */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Expense Logs
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                Total Logged: <strong className="text-rose-600 font-black">{formatNaira(totalExpenses)}</strong>
              </span>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm space-y-4">
              {/* Search & Category Filter */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-8 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search expenses by keyword, category, or note..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                  />
                </div>

                <div className="sm:col-span-4">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
                  >
                    <option value="All">All Categories</option>
                    <option value="Fuel">Fuel</option>
                    <option value="Software">Software</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Salaries">Salaries</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>
              </div>

              {/* Table (Date | Category | Description | Amount) */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3.5">Date</th>
                      <th className="px-4 py-3.5">Category</th>
                      <th className="px-4 py-3.5">Description</th>
                      <th className="px-4 py-3.5 text-right">Amount</th>
                      <th className="px-4 py-3.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoading ? (
                      [...Array(5)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={5} className="px-4 py-4 bg-slate-50/50">
                            <div className="h-4 bg-slate-200 rounded w-full" />
                          </td>
                        </tr>
                      ))
                    ) : expenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                          <AlertCircle className="w-7 h-7 mx-auto mb-2 text-slate-300" />
                          <p className="text-xs font-semibold text-slate-600">No expense logs match your filter</p>
                        </td>
                      </tr>
                    ) : (
                      expenses.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                            {new Date(item.date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[10px] border ${getCategoryColor(
                                item.category
                              )}`}
                            >
                              {item.category}
                            </span>
                          </td>

                          <td className="px-4 py-3 font-semibold text-slate-900 max-w-[180px] truncate">
                            {item.description}
                          </td>

                          <td className="px-4 py-3 text-right font-black text-rose-600 whitespace-nowrap text-xs">
                            {formatNaira(item.amount)}
                          </td>

                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleDeleteExpense(item.id)}
                              className="p-1 rounded-lg bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-500 transition-colors"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              RIGHT SIDE (5 COLUMNS): DYNAMIC RIDER PAY CALCULATOR
          ───────────────────────────────────────────────────────────── */}
          <div className="lg:col-span-5 space-y-4">
            <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
              Excel Dynamic Rider Pay Calculator
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-5">
              {/* Widget Header */}
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/60 shadow-sm">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Dynamic Rider Pay Calculator
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Adjust date range and payout rates for automatic settlement
                  </p>
                </div>
              </div>

              {/* Date Filter Range */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Start Date</label>
                  <input
                    type="date"
                    value={calcStartDate}
                    onChange={(e) => setCalcStartDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">End Date</label>
                  <input
                    type="date"
                    value={calcEndDate}
                    onChange={(e) => setCalcEndDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Payment Model Selector */}
              <div className="space-y-1.5 text-xs">
                <label className="block text-slate-700 font-bold">Payment Model</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentModel('standard')}
                    className={`py-2 px-2 text-center rounded-xl font-extrabold transition-all border ${
                      paymentModel === 'standard'
                        ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentModel('flat')}
                    className={`py-2 px-2 text-center rounded-xl font-extrabold transition-all border ${
                      paymentModel === 'flat'
                        ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Flat Rate
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentModel('custom')}
                    className={`py-2 px-2 text-center rounded-xl font-extrabold transition-all border ${
                      paymentModel === 'custom'
                        ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {/* Rate / Amount Breakdown */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Active Rate / Amount Matrix
                </div>
                {paymentModel === 'standard' && (
                  <div className="space-y-1 text-slate-700">
                    <div className="flex justify-between">
                      <span>Same side Rate:</span>
                      <strong className="text-slate-900">₦50 / order</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Different side Rate:</span>
                      <strong className="text-slate-900">₦90 / order</strong>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Pick up / Other:</span>
                      <span>₦0 / order</span>
                    </div>
                  </div>
                )}
                {paymentModel === 'flat' && (
                  <div className="flex justify-between text-slate-700">
                    <span>Uniform Flat Rate:</span>
                    <strong className="text-slate-900">₦70 / completed order</strong>
                  </div>
                )}
                {paymentModel === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500">Same side (₦)</span>
                      <input
                        type="number"
                        value={customSameRate}
                        onChange={(e) => setCustomSameRate(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Diff side (₦)</span>
                      <input
                        type="number"
                        value={customDiffRate}
                        onChange={(e) => setCustomDiffRate(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Calculated Output Callout Card */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50/70 to-indigo-50/50 border border-blue-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-blue-900 font-bold">
                  <span>Filtered Settled Orders:</span>
                  <span className="font-extrabold text-blue-700">{dynamicRiderStats.totalSettled} runs</span>
                </div>
                <div className="text-[11px] text-slate-600 flex justify-between">
                  <span>Same: {dynamicRiderStats.sameSideCount} • Diff: {dynamicRiderStats.diffSideCount} • Other: {dynamicRiderStats.otherCount}</span>
                </div>
                <div className="pt-2 border-t border-blue-200/80 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">TOTAL RIDER PAY:</span>
                  <span className="text-2xl font-black text-blue-700">
                    {formatNaira(dynamicRiderStats.totalRiderPay)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Expense Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-brand-600" />
                  Log New Operational Expense
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              {formFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold ${
                    formFeedback.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  }`}
                >
                  {formFeedback.message}
                </div>
              )}

              <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white"
                  >
                    <option value="Fuel">Fuel (Dispatch motorcycle)</option>
                    <option value="Software">Software &amp; Tools</option>
                    <option value="Marketing">Marketing &amp; Flyers</option>
                    <option value="Salaries">Salaries &amp; Stipends</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g. Motorcycle fleet weekly fuel refill"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Amount (NGN ₦)</label>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white placeholder-slate-400"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-orange-600 text-white font-extrabold hover:from-brand-600 hover:to-orange-700 disabled:opacity-50 shadow-sm"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Expense'}
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
