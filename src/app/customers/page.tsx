'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Phone, MessageSquare, X, Users } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { formatNaira } from '@/lib/financials';
import type { CustomerSummary, CustomerOrder } from '@/lib/customers';

type Tab = 'today' | 'top' | 'losing' | 'all';

type Summary = {
  totalCustomers: number;
  orderedToday: number;
  newToday: number;
  regulars: number;
  losing: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const agoLabel = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });

const timeOfDay = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });

const whatsappNumber = (phone: string) => (phone.startsWith('0') ? '234' + phone.slice(1) : phone);

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'top', label: 'Top' },
  { key: 'losing', label: 'Quiet' },
  { key: 'all', label: 'All' },
];

function CustomerDetail({ customer, onClose }: { customer: CustomerSummary; onClose: () => void }) {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);

  useEffect(() => {
    let alive = true;
    setOrders(null);
    fetch(`/api/customers?key=${encodeURIComponent(customer.key)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => alive && setOrders(d.success ? d.orders : []))
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
  }, [customer.key]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 pb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 truncate">{customer.name}</h2>
            <p className="text-sm text-slate-500">
              {customer.noNumber ? 'Older orders under this name, no number' : customer.phone || 'No phone number'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {customer.phone && (
          <div className="px-5 pb-4 grid grid-cols-2 gap-2">
            <a
              href={`tel:${customer.phone}`}
              className="h-11 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center justify-center gap-2"
            >
              <Phone className="w-4 h-4" />
              Call
            </a>
            <a
              href={`https://wa.me/${whatsappNumber(customer.phone)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 rounded-lg border border-slate-200 text-slate-800 text-sm font-medium flex items-center justify-center gap-2"
            >
              <MessageSquare className="w-4 h-4 text-emerald-600" />
              WhatsApp
            </a>
          </div>
        )}

        <dl className="px-5 pb-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Orders</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">{customer.orders}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Total spent</dt>
            <dd className="font-semibold text-slate-900 tabular-nums">{formatNaira(customer.spent)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">First order</dt>
            <dd className="text-slate-900">{shortDate(customer.firstOrderAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Last order</dt>
            <dd className="text-slate-900">
              {shortDate(customer.lastOrderAt)} <span className="text-slate-400">· {agoLabel(customer.lastOrderAt)}</span>
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Favourite cafeteria</dt>
            <dd className="text-slate-900 truncate">{customer.favouriteCafeteria || '—'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Usually delivers to</dt>
            <dd className="text-slate-900 truncate">{customer.favouriteAddress || '—'}</dd>
          </div>
        </dl>

        <div className="border-t border-slate-100 flex-1 overflow-y-auto">
          <div className="px-5 pt-3 pb-1 text-sm font-medium text-slate-900">Orders</div>
          {orders === null ? (
            <div className="px-5 py-6 text-sm text-slate-400">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-400">No orders found.</div>
          ) : (
            <ul className="divide-y divide-slate-100 pb-4">
              {orders.map((o) => (
                <li key={o.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-900 truncate">
                      {o.cafeteriaName} <span className="text-slate-400">→</span> {o.deliveryAddress}
                    </div>
                    <div className="text-xs text-slate-500">
                      {shortDate(o.createdAt)}, {timeOfDay(o.createdAt)} · {o.deliveryType}
                    </div>
                  </div>
                  <div className="text-sm text-slate-900 tabular-nums shrink-0">{formatNaira(o.totalAmountPaid)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [todayKeys, setTodayKeys] = useState<string[]>([]);
  const [losingKeys, setLosingKeys] = useState<string[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState<Tab>('today');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/customers', { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setCustomers(data.customers);
      setTodayKeys(data.orderedTodayKeys);
      setLosingKeys(data.losingKeys);
      setSummary(data.summary);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byKey = useMemo(() => new Map(customers.map((c) => [c.key, c])), [customers]);
  // Top 50 by orders; "All" is ordered the same way (most orders first)
  const rank = useMemo(() => new Map(customers.map((c, i) => [c.key, i + 1])), [customers]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      const digits = q.replace(/\D/g, '');
      return customers.filter(
        (c) => c.name.toLowerCase().includes(q) || (digits.length >= 3 && (c.phone || '').includes(digits))
      );
    }
    if (tab === 'today') return todayKeys.map((k) => byKey.get(k)!).filter(Boolean);
    if (tab === 'losing') return losingKeys.map((k) => byKey.get(k)!).filter(Boolean);
    if (tab === 'top') return customers.slice(0, 50);
    return customers;
  }, [tab, search, customers, todayKeys, losingKeys, byKey]);

  const emptyText =
    tab === 'today'
      ? 'No orders yet today.'
      : tab === 'losing'
      ? 'No regulars have gone quiet.'
      : 'No customers found.';

  const tabHint =
    tab === 'today'
      ? 'Everyone who ordered today, latest first.'
      : tab === 'top'
      ? 'Your 50 customers with the most orders.'
      : tab === 'losing'
      ? 'Ordered 5+ times, but not in the last 10 days.'
      : 'Everyone, most orders first.';

  return (
    <AppLayout>
      <Header onSyncComplete={load} />
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customers</h1>
          <p className="text-sm text-slate-500 mt-1">
            {summary ? (
              <>
                <span className="font-medium text-slate-900 tabular-nums">{summary.orderedToday}</span> ordered today
                {summary.newToday > 0 && (
                  <>
                    {' '}
                    (<span className="tabular-nums">{summary.newToday}</span> new)
                  </>
                )}{' '}
                · <span className="font-medium text-slate-900 tabular-nums">{summary.regulars}</span> regulars ·{' '}
                <span className="font-medium text-slate-900 tabular-nums">{summary.totalCustomers.toLocaleString()}</span> in total
              </>
            ) : (
              'Who orders, how often, and who has gone quiet.'
            )}
          </p>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="w-full h-11 bg-white border border-slate-200 rounded-lg pl-9 pr-3 text-base sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>

        {!search && (
          <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg" role="tablist">
            {TABS.map((t) => {
              const count =
                t.key === 'today' ? summary?.orderedToday : t.key === 'losing' ? summary?.losing : undefined;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`h-9 rounded-md text-sm font-medium flex items-center justify-center gap-1 px-1 ${
                    tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  <span className="truncate">{t.label}</span>
                  {count !== undefined && count > 0 && (
                    <span className={`text-xs tabular-nums ${t.key === 'losing' ? 'text-rose-600' : 'text-orange-600'}`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 text-xs text-slate-500">
            {search ? `${list.length} match${list.length === 1 ? '' : 'es'}` : tabHint}
          </div>

          {isLoading ? (
            <div className="divide-y divide-slate-100">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="px-4 py-4 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">
              Couldn&apos;t load customers.{' '}
              <button onClick={load} className="text-slate-900 underline">
                Try again
              </button>
            </div>
          ) : list.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Users className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-500">{emptyText}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {list.map((c) => {
                const showRank = !search && tab === 'top';
                const sub =
                  tab === 'today' && !search
                    ? `${c.ordersToday > 1 ? `${c.ordersToday} orders today · ` : ''}${
                        c.orders === c.ordersToday ? 'first time' : `${c.orders} orders in total`
                      }`
                    : `${c.orders} order${c.orders === 1 ? '' : 's'} · last ${agoLabel(c.lastOrderAt)}`;
                return (
                  <li key={c.key}>
                    <button
                      onClick={() => setSelected(c)}
                      className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50"
                    >
                      {showRank && (
                        <span className="w-6 text-sm text-slate-400 tabular-nums text-right shrink-0">{rank.get(c.key)}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 truncate">{c.name}</span>
                          {c.noNumber && <span className="text-xs text-slate-400 shrink-0">no number</span>}
                          {tab === 'today' && !search && c.orders === c.ordersToday && (
                            <span className="text-xs text-emerald-700 bg-emerald-50 px-1.5 rounded shrink-0">new</span>
                          )}
                        </span>
                        <span className="block text-xs text-slate-500 truncate">
                          {sub}
                          {c.favouriteCafeteria ? ` · ${c.favouriteCafeteria}` : ''}
                        </span>
                      </span>
                      <span className="text-sm text-slate-900 tabular-nums shrink-0">{formatNaira(c.spent)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </AppLayout>
  );
}
