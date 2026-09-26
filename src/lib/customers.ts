import { prisma } from '@/lib/prisma';

/**
 * Customers are recognised by name. When the same name comes with different
 * phone numbers, each number is a different person. Older orders (CSV imports)
 * have no phone, so for a shared name those orders cannot be tied to one person
 * and are kept together as "<name> · older orders, no number".
 */

export const REGULAR_MIN_ORDERS = 5;
export const LOSING_AFTER_DAYS = 10;
export const LOSING_LOOKBACK_DAYS = 60;

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // WAT = UTC+1

export interface CustomerSummary {
  key: string;
  name: string;
  phone: string | null;
  noNumber: boolean; // the "older orders, no number" bucket of a shared name
  orders: number;
  spent: number;
  firstOrderAt: string;
  lastOrderAt: string;
  ordersToday: number;
  favouriteCafeteria: string | null;
  favouriteAddress: string | null;
}

export interface CustomerOrder {
  id: string;
  orderId: string;
  createdAt: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryType: string;
  orderStatus: string;
  totalAmountPaid: number;
}

type Row = {
  id: string;
  orderId: string;
  customerName: string;
  customerPhone: string | null;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryType: string;
  orderStatus: string;
  totalAmountPaid: unknown;
  createdAt: Date;
};

export const normaliseName = (name: string) => (name || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function normalisePhone(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('234') && digits.length === 13) return '0' + digits.slice(3);
  return digits;
}

const isCancelled = (status: string) => (status || '').toLowerCase().startsWith('canc');

export const lagosDayKey = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

function keyFor(nameKey: string, phone: string | null, nameHasSeveralPhones: boolean) {
  if (!nameHasSeveralPhones) return `n:${nameKey}`;
  return phone ? `n:${nameKey}|p:${phone}` : `n:${nameKey}|none`;
}

async function loadOrders(): Promise<Row[]> {
  const rows = await prisma.deliveryOrder.findMany({
    select: {
      id: true,
      orderId: true,
      customerName: true,
      customerPhone: true,
      cafeteriaName: true,
      deliveryAddress: true,
      deliveryType: true,
      orderStatus: true,
      totalAmountPaid: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.filter((r) => !isCancelled(r.orderStatus) && normaliseName(r.customerName));
}

// Which names are shared by more than one phone number
function sharedNames(rows: Row[]) {
  const phonesByName = new Map<string, Set<string>>();
  for (const r of rows) {
    const phone = normalisePhone(r.customerPhone);
    if (!phone) continue;
    const n = normaliseName(r.customerName);
    if (!phonesByName.has(n)) phonesByName.set(n, new Set());
    phonesByName.get(n)!.add(phone);
  }
  const shared = new Set<string>();
  phonesByName.forEach((phones, n) => {
    if (phones.size > 1) shared.add(n);
  });
  return shared;
}

const mostCommon = (counts: Map<string, number>) => {
  let best: string | null = null;
  let bestN = 0;
  counts.forEach((n, v) => {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  });
  return best;
};

const bump = (m: Map<string, number>, v: string) => {
  if (v) m.set(v, (m.get(v) || 0) + 1);
};

export async function getCustomers(now = new Date()) {
  const rows = await loadOrders();
  const shared = sharedNames(rows);
  const today = lagosDayKey(now);

  type Acc = {
    key: string;
    names: Map<string, number>;
    phone: string | null;
    noNumber: boolean;
    orders: number;
    spent: number;
    first: Date;
    last: Date;
    ordersToday: number;
    cafeterias: Map<string, number>;
    addresses: Map<string, number>;
  };
  const byKey = new Map<string, Acc>();

  for (const r of rows) {
    const nameKey = normaliseName(r.customerName);
    const phone = normalisePhone(r.customerPhone);
    const isShared = shared.has(nameKey);
    const key = keyFor(nameKey, phone, isShared);
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        key,
        names: new Map(),
        phone: null,
        noNumber: isShared && !phone,
        orders: 0,
        spent: 0,
        first: r.createdAt,
        last: r.createdAt,
        ordersToday: 0,
        cafeterias: new Map(),
        addresses: new Map(),
      };
      byKey.set(key, acc);
    }
    bump(acc.names, (r.customerName || '').trim().replace(/\s+/g, ' '));
    if (phone) acc.phone = phone; // rows are oldest first, so this keeps the latest number
    acc.orders += 1;
    acc.spent += Number(r.totalAmountPaid) || 0;
    if (r.createdAt < acc.first) acc.first = r.createdAt;
    if (r.createdAt > acc.last) acc.last = r.createdAt;
    if (lagosDayKey(r.createdAt) === today) acc.ordersToday += 1;
    bump(acc.cafeterias, r.cafeteriaName);
    bump(acc.addresses, r.deliveryAddress);
  }

  const customers: CustomerSummary[] = Array.from(byKey.values()).map((a) => ({
    key: a.key,
    name: mostCommon(a.names) || 'Customer',
    phone: a.phone,
    noNumber: a.noNumber,
    orders: a.orders,
    spent: Math.round(a.spent),
    firstOrderAt: a.first.toISOString(),
    lastOrderAt: a.last.toISOString(),
    ordersToday: a.ordersToday,
    favouriteCafeteria: mostCommon(a.cafeterias),
    favouriteAddress: mostCommon(a.addresses),
  }));

  const dayMs = 24 * 60 * 60 * 1000;
  const daysSince = (iso: string) => (now.getTime() - new Date(iso).getTime()) / dayMs;

  const orderedToday = customers
    .filter((c) => c.ordersToday > 0)
    .sort((a, b) => b.lastOrderAt.localeCompare(a.lastOrderAt));
  const top = [...customers].sort((a, b) => b.orders - a.orders || b.spent - a.spent);
  const losing = customers
    .filter((c) => {
      const d = daysSince(c.lastOrderAt);
      return c.orders >= REGULAR_MIN_ORDERS && d >= LOSING_AFTER_DAYS && d <= LOSING_LOOKBACK_DAYS;
    })
    .sort((a, b) => b.orders - a.orders);

  return {
    customers: top,
    orderedTodayKeys: orderedToday.map((c) => c.key),
    losingKeys: losing.map((c) => c.key),
    summary: {
      totalCustomers: customers.length,
      orderedToday: orderedToday.length,
      newToday: orderedToday.filter((c) => lagosDayKey(new Date(c.firstOrderAt)) === today).length,
      regulars: customers.filter((c) => c.orders >= REGULAR_MIN_ORDERS).length,
      losing: losing.length,
    },
  };
}

export async function getCustomerOrders(key: string): Promise<CustomerOrder[]> {
  const m = /^n:(.*?)(?:\|p:(\d+)|\|none)?$/.exec(key);
  if (!m) return [];
  const nameKey = m[1];
  const phone = m[2] || null;
  const wantsNoNumber = key.endsWith('|none');

  const rows = (await loadOrders()).filter((r) => normaliseName(r.customerName) === nameKey);
  const matches = rows.filter((r) => {
    const p = normalisePhone(r.customerPhone);
    if (phone) return p === phone;
    if (wantsNoNumber) return !p;
    return true;
  });

  return matches
    .reverse()
    .slice(0, 100)
    .map((r) => ({
      id: r.id,
      orderId: r.orderId,
      createdAt: r.createdAt.toISOString(),
      cafeteriaName: r.cafeteriaName,
      deliveryAddress: r.deliveryAddress,
      deliveryType: r.deliveryType,
      orderStatus: r.orderStatus,
      totalAmountPaid: Number(r.totalAmountPaid) || 0,
    }));
}
