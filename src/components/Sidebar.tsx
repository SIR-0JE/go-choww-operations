'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Database,
  Receipt,
  CalendarDays,
  CalendarRange,
  Flame,
  X,
  ChevronRight,
  TrendingUp,
  Target,
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const pathname = usePathname();

  // Exactly mapped to the legacy Excel model tabs
  const navItems = [
    {
      label: 'Executive Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard' || pathname === '/',
      badge: 'Main',
    },
    {
      label: 'Raw Data',
      href: '/orders',
      icon: Database,
      active: pathname === '/orders',
    },
    {
      label: 'Expenses',
      href: '/expenses',
      icon: Receipt,
      active: pathname === '/expenses',
    },
    {
      label: 'Daily Summary',
      href: '/daily-summary',
      icon: CalendarDays,
      active: pathname === '/daily-summary',
    },
    {
      label: 'Monthly Summary',
      href: '/monthly-summary',
      icon: CalendarRange,
      active: pathname === '/monthly-summary',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              onClick={onCloseMobile}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-black text-lg text-slate-900 tracking-tight">
                  <span>Go Choww</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 border border-brand-200">
                    SaaS
                  </span>
                </div>
                <div className="text-[11px] font-semibold text-slate-400">
                  Operations &amp; Debt Recovery
                </div>
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Items (Excel Tab Structure) */}
        <div className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
            Excel-Mapped Modules
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${
                  item.active
                    ? 'bg-brand-50 text-brand-700 border border-brand-200/80 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      item.active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-700'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                        item.active
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      item.active
                        ? 'text-brand-600 translate-x-0.5'
                        : 'text-transparent group-hover:text-slate-400'
                    }`}
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Sprint Summary Footer Widget */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/70">
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <span className="flex items-center gap-1.5 text-brand-600">
                <Target className="w-3.5 h-3.5" />
                ₦3,500,000 Sprint
              </span>
              <span className="text-[10px] font-semibold text-slate-500">Dec 10, 2026</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Daily Target: <strong className="text-slate-900 font-extrabold">126 orders/day</strong>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
