'use client';

import React from 'react';
import { Banknote, Users, Receipt, TrendingUp, PackageCheck } from 'lucide-react';
import { MetricsSummary, formatNaira } from '@/lib/financials';

interface KpiCardsProps {
  metrics: MetricsSummary | null;
  isLoading?: boolean;
}

export const KpiCards: React.FC<KpiCardsProps> = ({ metrics, isLoading }) => {
  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-[#111c2e] border border-[#1d2b40] animate-pulse p-5"
          />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Gross Delivery Revenue',
      value: formatNaira(metrics.grossDeliveryRevenue),
      subtext: `${metrics.settledOrdersCount} settled delivery runs`,
      icon: Banknote,
      color: 'from-brand-500/20 to-amber-500/10 text-brand-400 border-brand-500/20',
      badge: 'Delivery Fees',
      badgeColor: 'bg-brand-500/10 text-brand-300 border-brand-500/30',
      tooltip: 'Sum of delivery fees across verified settled orders',
    },
    {
      title: 'Total Rider Pay',
      value: formatNaira(metrics.totalRiderPayout),
      subtext: '₦50 Same side • ₦90 Diff side',
      icon: Users,
      color: 'from-blue-500/20 to-cyan-500/10 text-cyan-400 border-cyan-500/20',
      badge: 'Payouts',
      badgeColor: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
      tooltip: 'Direct rider delivery payouts (Same side ₦50, Different side ₦90)',
    },
    {
      title: 'Total Expenses',
      value: formatNaira(metrics.totalExpenses),
      subtext: 'Fuel, Software, Salaries, Misc',
      icon: Receipt,
      color: 'from-rose-500/20 to-pink-500/10 text-rose-400 border-rose-500/20',
      badge: 'Operational Costs',
      badgeColor: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      tooltip: 'All operational and administrative expenses logged in the ledger',
    },
    {
      title: 'True Net Profit',
      value: formatNaira(metrics.netProfit),
      subtext: 'Gross Revenue - Rider Pay - Expenses',
      icon: TrendingUp,
      color: 'from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/20',
      badge: 'Net Earnings',
      badgeColor: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      tooltip: 'Retained operational earnings toward the ₦3,500,000 debt sprint',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="group relative rounded-2xl bg-[#0f1929] border border-[#1b2a3f] p-5 shadow-lg shadow-black/20 hover:border-[#2b3e5a] transition-all hover:-translate-y-0.5"
            title={card.tooltip}
          >
            {/* Top Row: Title + Icon */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {card.title}
              </span>
              <div className={`p-2 rounded-xl border bg-gradient-to-br ${card.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            {/* Middle Row: Large Value */}
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
              {card.value}
            </div>

            {/* Bottom Row: Badge & Subtext */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-[#182436]">
              <span className="text-slate-400 font-medium truncate">
                {card.subtext}
              </span>
              <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${card.badgeColor} shrink-0 ml-1`}>
                {card.badge}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
