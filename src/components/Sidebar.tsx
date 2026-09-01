'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  CreditCard,
  BarChart3,
  Flame,
  Menu,
  X,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
} from 'lucide-react';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const pathname = usePathname();

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      active: pathname === '/dashboard' || pathname === '/',
      badge: 'Live',
    },
    {
      label: 'All Orders',
      href: '/orders',
      icon: Package,
      active: pathname === '/orders',
    },
    {
      label: 'Expenses',
      href: '/expenses',
      icon: CreditCard,
      active: pathname === '/expenses',
    },
    {
      label: 'Summaries & Reports',
      href: '/reports',
      icon: BarChart3,
      active: pathname === '/reports',
      badge: 'Excel',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-[#0a101d] border-r border-[#19263b] flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#162235]">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              onClick={onCloseMobile}
              className="flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-brand-500/25 ring-2 ring-brand-400/20 group-hover:scale-105 transition-transform">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-black text-lg text-white tracking-tight">
                  <span>Go Choww</span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
                    OPS
                  </span>
                </div>
                <div className="text-[11px] font-medium text-slate-400">
                  Logistics &amp; Debt Sprint
                </div>
              </div>
            </Link>

            {/* Mobile close button */}
            <button
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#152236]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto">
          <div className="px-3 pb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
            Modules
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
                    ? 'bg-gradient-to-r from-brand-500/20 via-brand-500/10 to-transparent text-white border border-brand-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#121c2e]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      item.active ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span
                      className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded ${
                        item.active
                          ? 'bg-brand-500 text-white'
                          : 'bg-[#18263a] text-slate-400 group-hover:text-slate-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-transform ${
                      item.active
                        ? 'text-brand-400 translate-x-0.5'
                        : 'text-transparent group-hover:text-slate-600'
                    }`}
                  />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Sprint Summary Footer Widget */}
        <div className="p-4 border-t border-[#162235] bg-[#0c1422]">
          <div className="p-3 rounded-xl bg-[#111a2a] border border-[#1e2f47] space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5 text-brand-400">
                <TrendingUp className="w-3.5 h-3.5" />
                ₦3.5M Sprint
              </span>
              <span className="text-[10px] font-semibold text-slate-400">Dec 10, 2026</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Target: <strong className="text-white">126 orders/day</strong>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
