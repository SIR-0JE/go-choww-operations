'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  CreditCard,
  Plus,
  Search,
  Trash2,
  Calendar,
  Receipt,
  AlertCircle,
  TrendingDown,
} from 'lucide-react';

interface ExpenseItem {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [currentMonthExpenses, setCurrentMonthExpenses] = useState(0);

  // Form State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formDate, setFormDate] = useState('2026-09-01');
  const [formCategory, setFormCategory] = useState('Fuel');
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formFeedback, setFormFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        category: categoryFilter,
      });
      const res = await fetch(`/api/expenses?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setExpenses(data.expenses || []);
        setTotalExpenses(data.totalExpenses || 0);
        setCurrentMonthExpenses(data.currentMonthExpenses || 0);
      }
    } catch (err) {
      console.error('Failed to load expenses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [search, categoryFilter]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

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
        fetchExpenses();
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
        fetchExpenses();
      }
    } catch (err) {
      console.error('Failed to delete expense:', err);
    }
  };

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
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Title & Actions Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 flex items-center gap-2.5">
              <CreditCard className="w-7 h-7 text-brand-600" />
              Expenses &amp; Cost Ledger
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1">
              Track operational costs, dispatch fuel, software, and marketing deductions from gross revenue
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

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Expenses */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Expenses to Date
              </span>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
                {formatNaira(totalExpenses)}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {expenses.length} logged expense items
              </span>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Current Month Expenses */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Expenses (Current Month)
              </span>
              <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-1">
                {formatNaira(currentMonthExpenses)}
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Deducted from August/September Margin
              </span>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <Calendar className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Deduction Guard */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                True Net Profit Formula
              </span>
              <div className="text-sm font-extrabold text-emerald-700 mt-1.5">
                Gross Margin - Expenses
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                Directly affects ₦3.5M debt sprint progress
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <Receipt className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expense description, category, or keyword..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all font-medium"
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

          {/* Expenses Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider font-extrabold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Description</th>
                  <th className="px-4 py-3.5 text-right">Amount (₦)</th>
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
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm font-semibold text-slate-600">No expenses found</p>
                      <p className="text-xs text-slate-400 mt-1">Click &quot;Add Expense&quot; above to log a new entry</p>
                    </td>
                  </tr>
                ) : (
                  expenses.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 font-medium text-slate-600 whitespace-nowrap">
                        {new Date(item.date).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border ${getCategoryColor(
                            item.category
                          )}`}
                        >
                          {item.category}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {item.description}
                      </td>

                      <td className="px-4 py-3.5 text-right font-black text-rose-600 whitespace-nowrap text-sm">
                        {formatNaira(item.amount)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => handleDeleteExpense(item.id)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-500 hover:text-white text-slate-500 transition-colors"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
                    placeholder="e.g. Motorcycle fuel allocation for Week 1"
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
