'use client';

import React from 'react';
import { Banknote, Users, Receipt, TrendingUp } from 'lucide-react';
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
            className="h-36 rounded-2xl bg-white border border-slate-200 animate-pulse p-5 shadow-sm"
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
      iconColor: 'bg-brand-50 text-brand-600 border-brand-200/60',
      badge: 'Delivery Fees',
      badgeColor: 'bg-brand-50 text-brand-700 border-brand-200/80',
      tooltip: 'Sum of delivery fees across verified completed orders',
    },
    {
      title: 'Total Rider Pay',
      value: formatNaira(metrics.totalRiderPayout),
      subtext: '₦50 Same side • ₦90 Diff side',
      icon: Users,
      iconColor: 'bg-blue-50 text-blue-600 border-blue-200/60',
      badge: 'Payouts',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200/80',
      tooltip: 'Direct rider delivery payouts (Same side ₦50, Different side ₦90)',
    },
    {
      title: 'Total Expenses',
      value: formatNaira(metrics.totalExpenses),
      subtext: 'Fuel, Software, Salaries, Misc',
      icon: Receipt,
      iconColor: 'bg-rose-50 text-rose-600 border-rose-200/60',
      badge: 'Operational Costs',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200/80',
      tooltip: 'All operational and administrative expenses logged in the ledger',
    },
    {
      title: 'True Net Profit',
      value: formatNaira(metrics.netProfit),
      subtext: 'Gross Revenue - Rider Pay - Expenses',
      icon: TrendingUp,
      iconColor: 'bg-emerald-50 text-emerald-600 border-emerald-200/60',
      badge: 'Net Earnings',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
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
            className="group relative rounded-2xl bg-white border border-slate-200/90 p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition-all hover:-translate-y-0.5"
            title={card.tooltip}
          >
            {/* Top Row: Title + Icon */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {card.title}
              </span>
              <div className={`p-2.5 rounded-xl border ${card.iconColor}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>

            {/* Middle Row: Large Value */}
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 mb-2">
              {card.value}
            </div>

            {/* Bottom Row: Badge & Subtext */}
            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
              <span className="text-slate-500 font-medium truncate">
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
