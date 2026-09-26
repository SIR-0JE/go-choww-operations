'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import {
  Bell,
  Package,
  Truck,
  CheckCircle2,
  ArrowRightLeft,
  Trash2,
  CheckCheck,
  Info,
  Clock,
  ChevronRight,
} from 'lucide-react';
import {
  loadNotifications,
  markAllRead,
  clearAllNotifications,
  AppNotification,
} from '@/lib/notifications';

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(isoString).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function NotificationIcon({ type }: { type: AppNotification['type'] }) {
  switch (type) {
    case 'claim':
      return (
        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
          <Package className="w-5 h-5 text-amber-600" />
        </div>
      );
    case 'pickup':
      return (
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-blue-600" />
        </div>
      );
    case 'deliver':
      return (
        <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        </div>
      );
    case 'transfer':
      return (
        <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
          <ArrowRightLeft className="w-5 h-5 text-violet-600" />
        </div>
      );
    case 'new_order':
      return (
        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-slate-600" />
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
          <Info className="w-5 h-5 text-slate-500" />
        </div>
      );
  }
}

type FilterType = 'all' | 'unread' | 'claim' | 'pickup' | 'deliver' | 'new_order';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');

  const reload = useCallback(() => {
    setNotifications(loadNotifications());
  }, []);

  useEffect(() => {
    reload();
    // Listen for updates from other tabs or rider activity events
    window.addEventListener('notifications-updated', reload);
    window.addEventListener('rider-activity', reload);
    // Also mark all as read when the page is opened
    markAllRead();
    return () => {
      window.removeEventListener('notifications-updated', reload);
      window.removeEventListener('rider-activity', reload);
    };
  }, [reload]);

  const handleMarkAllRead = () => {
    markAllRead();
    reload();
  };

  const handleClearAll = () => {
    clearAllNotifications();
    reload();
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: `Unread${unreadCount > 0 ? ` (${unreadCount})` : ''}` },
    { key: 'claim', label: 'Accepted' },
    { key: 'pickup', label: 'Picked Up' },
    { key: 'deliver', label: 'Delivered' },
    { key: 'new_order', label: 'New Orders' },
  ];

  return (
    <AppLayout>
      <Header />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Notifications</h1>
              {unreadCount > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-500 text-white">
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">Rider activity from the last 24 hours.</p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
            <button
              onClick={handleClearAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear all
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                filter === f.key
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-4">
                <Bell className="w-7 h-7 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No notifications</p>
              <p className="text-xs text-slate-400 font-medium mt-1 max-w-xs">
                Rider actions (accept, pickup, deliver) will appear here in real time.
                Notifications clear automatically after 24 hours.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((notif) => (
                <li
                  key={notif.id}
                  className={`flex items-start gap-4 px-5 py-4 transition-colors hover:bg-slate-50/60 ${
                    !notif.read ? 'bg-slate-50/40' : ''
                  }`}
                >
                  <NotificationIcon type={notif.type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className={`text-sm font-semibold text-slate-900 ${!notif.read ? '' : 'font-semibold'}`}>
                        {notif.title}
                      </p>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 font-medium leading-snug">{notif.body}</p>
                    {notif.orderId && (
                      <Link
                        href={`/orders`}
                        className="inline-flex items-center gap-1 text-xs font-mono text-brand-600 hover:text-brand-700 mt-1.5 transition-colors"
                      >
                        View in orders
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5 text-xs text-slate-400 font-medium">
                    <Clock className="w-3 h-3" />
                    <span>{timeAgo(notif.timestamp)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-center text-xs text-slate-400 font-medium">
            Showing {filtered.length} notification{filtered.length !== 1 ? 's' : ''} •
            All entries auto-clear 24 hours after creation
          </p>
        )}
      </main>
    </AppLayout>
  );
}
