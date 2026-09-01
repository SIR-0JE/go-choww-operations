'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  Trash2,
  Calendar,
  DollarSign,
  Tag,
  Receipt,
  FileText,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  Layers,
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
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'software':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'marketing':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      case 'salaries':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      default:
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <AppLayout>
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page Title & Actions Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
              <CreditCard className="w-7 h-7 text-brand-500" />
              Expenses &amp; Cost Ledger
            </h1>
            <p className="text-xs text-slate-400 font-medium mt-1">
              Track operational costs, dispatch fuel, software, and marketing deductions from gross revenue
            </p>
          </div>

          <button
            onClick={() => {
              setFormFeedback(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-500 to-orange-600 hover:from-brand-600 hover:to-orange-700 text-white font-bold text-xs sm:text-sm shadow-lg shadow-brand-500/20 active:scale-95 transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>
        </div>

        {/* Top Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Card 1: Total Expenses */}
          <div className="p-5 rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Total Expenses to Date
              </span>
              <div className="text-2xl sm:text-3xl font-black text-white mt-1">
                {formatNaira(totalExpenses)}
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                {expenses.length} logged expense items
              </span>
            </div>
            <div className="p-3 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>

          {/* Card 2: Current Month Expenses */}
          <div className="p-5 rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Expenses (Current Month)
              </span>
              <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-1">
                {formatNaira(currentMonthExpenses)}
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Deducted from August/September Gross Margin
              </span>
            </div>
            <div className="p-3 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
              <Calendar className="w-6 h-6" />
            </div>
          </div>

          {/* Card 3: Deduction Guard */}
          <div className="p-5 rounded-2xl bg-[#0f1929] border border-[#1b2a3f] shadow-lg flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                True Net Profit Formula
              </span>
              <div className="text-sm font-extrabold text-emerald-400 mt-1.5">
                Gross Margin - Expenses
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                Directly affects ₦3.5M debt progress
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <Receipt className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-5 shadow-xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search expense description, category, or keyword..."
                className="w-full bg-[#142033] border border-[#23354e] rounded-xl pl-10 pr-4 py-2 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 transition-all"
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
          <div className="overflow-x-auto border border-[#1b2a3f] rounded-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#142033] text-slate-400 uppercase tracking-wider font-extrabold text-[10px] border-b border-[#1b2a3f]">
                <tr>
                  <th className="px-4 py-3.5">Date</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Description</th>
                  <th className="px-4 py-3.5 text-right">Amount (₦)</th>
                  <th className="px-4 py-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#18263a]">
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={5} className="px-4 py-4 bg-[#101a2b]">
                        <div className="h-4 bg-[#18263a] rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : expenses.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                      <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                      <p className="text-sm font-semibold text-slate-400">No expenses found</p>
                      <p className="text-xs text-slate-500 mt-1">Click &quot;Add Expense&quot; above to log a new entry</p>
                    </td>
                  </tr>
                ) : (
                  expenses.map((item) => (
                    <tr key={item.id} className="hover:bg-[#142236] transition-colors">
                      <td className="px-4 py-3.5 font-medium text-slate-300 whitespace-nowrap">
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

                      <td className="px-4 py-3.5 font-semibold text-white">
                        {item.description}
                      </td>

                      <td className="px-4 py-3.5 text-right font-black text-rose-400 whitespace-nowrap text-sm">
                        {formatNaira(item.amount)}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={() => handleDeleteExpense(item.id)}
                          className="p-1.5 rounded-lg bg-[#1a283e] hover:bg-red-500 hover:text-white text-slate-400 transition-colors"
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
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#101a2b] border border-[#22354e] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-[#1e2f47] pb-3">
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-brand-500" />
                  Log New Operational Expense
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1.5 rounded-lg bg-[#18263a] hover:bg-[#253957] text-slate-300 font-bold"
                >
                  ✕
                </button>
              </div>

              {formFeedback && (
                <div
                  className={`p-3 rounded-lg text-xs font-semibold ${
                    formFeedback.type === 'error'
                      ? 'bg-red-950/80 text-red-300 border border-red-500/40'
                      : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {formFeedback.message}
                </div>
              )}

              <form onSubmit={handleAddExpense} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Fuel">Fuel (Dispatch motorcycle)</option>
                    <option value="Software">Software &amp; Tools</option>
                    <option value="Marketing">Marketing &amp; Flyers</option>
                    <option value="Salaries">Salaries &amp; Stipends</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Description</label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="e.g. Motorcycle fuel allocation for Week 1"
                    required
                    className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">Amount (NGN ₦)</label>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    required
                    className="w-full bg-[#142033] border border-[#23354e] rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-slate-500"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-[#18263a] text-slate-300 font-bold hover:bg-[#20324e]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-brand-500 to-orange-600 text-white font-extrabold hover:from-brand-600 hover:to-orange-700 disabled:opacity-50 shadow-md shadow-brand-500/20"
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
