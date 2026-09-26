'use client';

import React, { useState, useEffect } from 'react';
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
  Bike,
  Radio,
  Settings,
  Bell,
  ClipboardCheck,
  Users,
} from 'lucide-react';
import { countUnread } from '@/lib/notifications';

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);
  const [sprintLine, setSprintLine] = useState<{ today: number; target: number; pct: number } | null>(null);

  // Today's orders against the sprint's daily target; refreshed every 2 minutes
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/sprint', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (alive && d.success) {
            setSprintLine({ today: d.sprint.todayOrders, target: d.sprint.dailyTargetOrders, pct: d.sprint.progressPercent });
          }
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setUnreadCount(countUnread());
    refresh();
    window.addEventListener('notifications-updated', refresh);
    window.addEventListener('rider-activity', refresh);
    return () => {
      window.removeEventListener('notifications-updated', refresh);
      window.removeEventListener('rider-activity', refresh);
    };
  }, []);

  const is = (...paths: string[]) => paths.includes(pathname);

  const navGroups: { title: string; items: { label: string; href: string; icon: any; active: boolean; unreadCount?: number }[] }[] = [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, active: is('/dashboard', '/') },
        { label: 'Sprint Target', href: '/target', icon: Target, active: is('/target') },
      ],
    },
    {
      title: 'Operations',
      items: [
        { label: 'Orders', href: '/orders', icon: Database, active: is('/orders', '/raw-data') },
        { label: 'Riders', href: '/riders', icon: Bike, active: is('/riders') },
        { label: 'Live Fleet', href: '/dashboard/fleet', icon: Radio, active: is('/dashboard/fleet') },
        { label: 'Reconciliation', href: '/dashboard/reconciliation', icon: ClipboardCheck, active: is('/dashboard/reconciliation') },
      ],
    },
    {
      title: 'Finance',
      items: [
        { label: 'Daily Summary', href: '/daily-summary', icon: CalendarDays, active: is('/daily-summary') },
        { label: 'Monthly Summary', href: '/monthly-summary', icon: CalendarRange, active: is('/monthly-summary') },
        { label: 'Expenses', href: '/expenses', icon: Receipt, active: is('/expenses') },
      ],
    },
    {
      title: 'Growth',
      items: [{ label: 'Customers', href: '/customers', icon: Users, active: is('/customers') }],
    },
    {
      title: 'System',
      items: [
        { label: 'Notifications', href: '/notifications', icon: Bell, active: is('/notifications'), unreadCount },
        { label: 'Settings', href: '/settings', icon: Settings, active: is('/settings') },
      ],
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

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-100">
          <Link href="/dashboard" onClick={onCloseMobile} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white">
              <Flame className="w-4 h-4" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-slate-900 tracking-tight">Go Choww</div>
              <div className="text-[11px] text-slate-500">Operations</div>
            </div>
          </Link>
          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="px-3 pb-1.5 text-[11px] font-medium text-slate-400">{group.title}</div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const unread = item.unreadCount || 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        item.active
                          ? 'bg-brand-50 text-brand-700 font-medium'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${item.active ? 'text-brand-600' : 'text-slate-400'}`} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {unread > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-rose-500 text-white min-w-[18px] text-center">
                          {unread}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Sprint shortcut */}
        <div className="p-3 border-t border-slate-100">
          <Link
            href="/target"
            onClick={onCloseMobile}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Target className="w-4 h-4 text-brand-600 shrink-0" />
            <div className="flex-1 min-w-0 leading-tight">
              <div className="text-xs font-medium text-slate-900">
                {sprintLine && sprintLine.target > 0 ? `Today ${sprintLine.today} / ${sprintLine.target} orders` : 'Sprint target'}
              </div>
              <div className="text-xs text-slate-500">
                {sprintLine ? `Sprint ${sprintLine.pct.toFixed(1)}% done` : 'Loading…'}
              </div>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        </div>
      </aside>
    </>
  );
};
