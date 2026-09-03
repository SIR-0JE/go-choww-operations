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
  Target,
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const pathname = usePathname();

  // Exactly mapped to the operational Excel model tabs
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
    {
      label: 'Sprint Target',
      href: '/target',
      icon: Target,
      active: pathname === '/target',
      badge: 'Sprint',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
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
              <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-sm ring-1 ring-slate-800 transition-transform group-hover:scale-105">
                <Flame className="w-5 h-5 text-brand-500" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-bold text-base text-slate-900 tracking-tight">
                  <span>Go Choww</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200/80">
                    OPS
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-500">
                  Operations &amp; Debt Recovery
                </div>
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 py-5 px-3 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Operations Modules
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onCloseMobile}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-xs sm:text-sm transition-all duration-150 ${
                  item.active
                    ? 'bg-slate-900 text-white shadow-sm shadow-slate-950/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      item.active ? 'text-brand-400' : 'text-slate-400 group-hover:text-slate-600'
                    }`}
                  />
                  <span className={item.active ? 'font-semibold' : ''}>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        item.active
                          ? 'bg-slate-800 text-slate-200 border border-slate-700'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      item.active
                        ? 'text-slate-400 translate-x-0.5'
                        : 'text-transparent group-hover:text-slate-400'
                    }`}
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Sprint Summary Footer Card */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <Link
            href="/target"
            onClick={onCloseMobile}
            className="block p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-sm space-y-2 hover:border-slate-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
              <span className="flex items-center gap-1.5 text-slate-900">
                <Target className="w-3.5 h-3.5 text-brand-600" />
                Sprint Recovery
              </span>
              <span className="text-[10px] font-medium text-slate-500">Dec 10, 2026</span>
            </div>
            <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between">
              <span>Goal: <strong className="text-slate-900 font-semibold tabular-nums">₦3.5M</strong></span>
              <span className="text-[10px] font-semibold text-brand-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                Manage &rarr;
              </span>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
};
