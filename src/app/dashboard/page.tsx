'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { KpiCards } from '@/components/KpiCards';
import { DebtRecoveryCard } from '@/components/DebtRecoveryCard';
import { DailyRevenueChart } from '@/components/charts/DailyRevenueChart';
import { DeliveryTypeBreakdownChart } from '@/components/charts/DeliveryTypeBreakdownChart';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { MetricsSummary } from '@/lib/financials';
import { ShieldCheck } from 'lucide-react';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [dailyChartData, setDailyChartData] = useState<any[]>([]);
  const [breakdownChartData, setBreakdownChartData] = useState<any[]>([]);
  const [isDbConnected, setIsDbConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();

      if (data.success) {
        setMetrics(data.metrics);
        setDailyChartData(data.dailyChartData || []);
        setBreakdownChartData(data.breakdownChartData || []);
        setIsDbConnected(data.isDbConnected || false);
        setLastUpdated(data.lastUpdated || new Date().toISOString());
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleSyncComplete = () => {
    fetchAnalytics();
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <AppLayout>
      {/* Top Header */}
      <Header
        onSyncComplete={handleSyncComplete}
        lastUpdated={lastUpdated}
        isDbConnected={isDbConnected}
      />

      {/* Main Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Settlement Rule Banner */}
        <div className="rounded-xl bg-gradient-to-r from-brand-950/70 via-[#101b2c] to-[#101b2c] border border-brand-500/25 px-4 py-3 text-xs flex items-center justify-between gap-3 text-slate-300 shadow-md">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0" />
            <span>
              <strong className="text-white">Strict Financial Settlement Rule:</strong> KPIs and revenue graphs strictly compute verified settled orders (<code className="text-brand-300 bg-brand-500/15 px-1 py-0.5 rounded font-bold">orderStatus === &quot;Completed&quot;</code> &amp; <code className="text-emerald-300 bg-emerald-500/15 px-1 py-0.5 rounded font-bold">paymentStatus === &quot;success&quot;</code>) with full expense deductions.
            </span>
          </div>
          <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-500/15 text-brand-300 border border-brand-500/30">
            Sprint Ending Dec 10, 2026
          </span>
        </div>

        {/* 1. 4-Grid KPI Cards */}
        <section aria-label="Key Performance Indicators">
          <KpiCards metrics={metrics} isLoading={isLoading} />
        </section>

        {/* 2. Debt Recovery Sprint Card */}
        <section aria-label="Debt Recovery Progress">
          <DebtRecoveryCard metrics={metrics} isLoading={isLoading} />
        </section>

        {/* 3. Analytics Charts Grid (2 Columns) */}
        <section aria-label="Financial and Volume Visualizations" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <DailyRevenueChart data={dailyChartData} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-5">
            <DeliveryTypeBreakdownChart data={breakdownChartData} isLoading={isLoading} />
          </div>
        </section>

        {/* 4. Orders Data Table with Search, Filter & Pagination */}
        <section aria-label="Operations Ledger">
          <OrdersTable refreshKey={refreshKey} />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#162235] bg-[#0b121e] py-6 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 Go Choww Logistics &amp; Operations SaaS. All rights reserved.</span>
          <span className="text-slate-400 font-medium">Sprint Goal: ₦3,500,000 Debt Liquidation by Dec 10, 2026</span>
        </div>
      </footer>
    </AppLayout>
  );
}
