import { prisma } from '@/lib/prisma';
import { isRevenueOrder } from '@/lib/financials';

/**
 * The sprint: raise `targetAmount` between `startDate` and `endDate` (inclusive, Lagos days).
 *
 * Earned = delivery fees on paid, non-cancelled orders since the start
 *        − expenses logged since the start (counted the moment they are logged).
 *
 * Daily order target = what is still to raise ÷ days left (today included)
 *                      ÷ what one order brings in (average delivery fee, last 14 days).
 * It is worked out from everything before today, so it stays fixed through the day
 * and moves overnight: a strong day lowers tomorrow's target, a slow one raises it.
 * Expenses logged today raise it straight away.
 */

export interface SprintConfig {
  targetAmount: number;
  startDate: string; // YYYY-MM-DD, Lagos
  endDate: string; // YYYY-MM-DD, Lagos, inclusive
}

export const DEFAULT_SPRINT: SprintConfig = {
  targetAmount: 3500000,
  startDate: '2026-09-07',
  endDate: '2026-12-10',
};

const SPRINT_KEY = 'sprint_target';
const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // WAT = UTC+1, no daylight saving
const FEE_LOOKBACK_DAYS = 14;
const PACE_LOOKBACK_DAYS = 7;

const isDateKey = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Midnight at the start of a Lagos calendar day, as a real instant
const lagosDayStart = (dateKey: string) => new Date(Date.parse(`${dateKey}T00:00:00Z`) - LAGOS_OFFSET_MS);
const lagosDateKey = (d: Date) => new Date(d.getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);
const daysBetween = (fromKey: string, toKey: string) => Math.round((Date.parse(toKey) - Date.parse(fromKey)) / DAY_MS);

export async function getSprintConfig(): Promise<SprintConfig> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: SPRINT_KEY } });
    if (row?.value) {
      const saved = JSON.parse(row.value);
      return {
        targetAmount: Number(saved.targetAmount) > 0 ? Number(saved.targetAmount) : DEFAULT_SPRINT.targetAmount,
        startDate: isDateKey(saved.startDate) ? saved.startDate : DEFAULT_SPRINT.startDate,
        endDate: isDateKey(saved.endDate) ? saved.endDate : DEFAULT_SPRINT.endDate,
      };
    }
  } catch (err) {
    console.warn('[sprint] could not read config, using defaults:', err);
  }
  return { ...DEFAULT_SPRINT };
}

export async function saveSprintConfig(input: Partial<SprintConfig>): Promise<SprintConfig> {
  const current = await getSprintConfig();
  const next: SprintConfig = {
    targetAmount: Number(input.targetAmount) > 0 ? Math.round(Number(input.targetAmount)) : current.targetAmount,
    startDate: isDateKey(input.startDate) ? input.startDate : current.startDate,
    endDate: isDateKey(input.endDate) ? input.endDate : current.endDate,
  };
  if (next.endDate < next.startDate) throw new Error('The deadline must be after the start date.');
  await prisma.systemSetting.upsert({
    where: { key: SPRINT_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SPRINT_KEY, value: JSON.stringify(next) },
  });
  return next;
}

export interface SprintStatus {
  config: SprintConfig;
  today: string;
  earned: number; // fees since start (including today) − expenses since start
  feesSinceStart: number;
  expensesSinceStart: number;
  remaining: number;
  remainingAtStartOfToday: number; // what today's target is based on
  progressPercent: number;
  daysLeft: number; // including today
  daysElapsed: number; // complete days since start, before today
  neededPerDay: number;
  feePerOrder: number;
  dailyTargetOrders: number;
  todayOrders: number;
  todayFees: number;
  paceOrdersPerDay: number; // average paid orders a day over the last 7 full days
  averageEarnedPerDay: number; // since the start, before today
  projectedFinishDate: string | null; // if the last 7 days' pace continues
  status: 'not_started' | 'running' | 'reached' | 'ended';
}

export async function getSprintStatus(now = new Date()): Promise<SprintStatus> {
  const config = await getSprintConfig();
  const today = lagosDateKey(now);
  const todayStart = lagosDayStart(today);
  const sprintStart = lagosDayStart(config.startDate);
  const feeWindowStart = new Date(todayStart.getTime() - FEE_LOOKBACK_DAYS * DAY_MS);
  const earliest = new Date(Math.min(sprintStart.getTime(), feeWindowStart.getTime()));

  const [orders, expenseSum] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: { createdAt: { gte: earliest } },
      select: { deliveryFee: true, orderStatus: true, paymentStatus: true, createdAt: true },
    }),
    prisma.expense.aggregate({ where: { date: { gte: sprintStart } }, _sum: { amount: true } }),
  ]);

  const paceStart = new Date(todayStart.getTime() - PACE_LOOKBACK_DAYS * DAY_MS);
  let feesBeforeToday = 0;
  let todayFees = 0;
  let todayOrders = 0;
  let recentFees = 0;
  let recentOrders = 0;
  let paceOrders = 0;
  let sprintFeesTotal = 0;
  let sprintOrdersTotal = 0;

  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    const fee = Number(o.deliveryFee) || 0;
    const t = o.createdAt;
    if (t >= sprintStart) {
      sprintFeesTotal += fee;
      sprintOrdersTotal += 1;
      if (t < todayStart) feesBeforeToday += fee;
    }
    if (t >= todayStart) {
      todayFees += fee;
      todayOrders += 1;
    } else {
      if (t >= feeWindowStart) {
        recentFees += fee;
        recentOrders += 1;
      }
      if (t >= paceStart) paceOrders += 1;
    }
  }

  const expensesSinceStart = Number(expenseSum._sum.amount) || 0;
  const earnedBeforeToday = feesBeforeToday - expensesSinceStart;
  const earned = sprintFeesTotal - expensesSinceStart;
  const remaining = Math.max(0, config.targetAmount - earned);

  const daysLeft = Math.max(0, daysBetween(today, config.endDate) + 1);
  const daysElapsed = Math.max(0, daysBetween(config.startDate, today));

  // What one order brings in: recent average, falling back to the sprint average
  const feePerOrder =
    recentOrders > 0
      ? recentFees / recentOrders
      : sprintOrdersTotal > 0
      ? sprintFeesTotal / sprintOrdersTotal
      : 0;

  // Fixed for the whole day: based on what was still owed at the start of today
  const remainingAtStartOfToday = Math.max(0, config.targetAmount - earnedBeforeToday);
  const neededPerDay = daysLeft > 0 ? remainingAtStartOfToday / daysLeft : 0;
  const dailyTargetOrders = feePerOrder > 0 ? Math.ceil(neededPerDay / feePerOrder) : 0;

  const averageEarnedPerDay = daysElapsed > 0 ? earnedBeforeToday / daysElapsed : 0;
  // Finish date if the last 7 days' order pace continues (same basis as "your pace")
  const recentFeesPerDay = (paceOrders / PACE_LOOKBACK_DAYS) * feePerOrder;
  let projectedFinishDate: string | null = null;
  if (remaining > 0 && recentFeesPerDay > 0) {
    projectedFinishDate = lagosDateKey(new Date(todayStart.getTime() + Math.ceil(remaining / recentFeesPerDay) * DAY_MS));
  }

  const status: SprintStatus['status'] =
    remaining <= 0 ? 'reached' : today < config.startDate ? 'not_started' : today > config.endDate ? 'ended' : 'running';

  return {
    config,
    today,
    earned: Math.round(earned),
    feesSinceStart: Math.round(sprintFeesTotal),
    expensesSinceStart: Math.round(expensesSinceStart),
    remaining: Math.round(remaining),
    remainingAtStartOfToday: Math.round(remainingAtStartOfToday),
    progressPercent: config.targetAmount > 0 ? Math.max(0, Math.min(100, (earned / config.targetAmount) * 100)) : 0,
    daysLeft,
    daysElapsed,
    neededPerDay: Math.round(neededPerDay),
    feePerOrder: Math.round(feePerOrder),
    dailyTargetOrders,
    todayOrders,
    todayFees: Math.round(todayFees),
    paceOrdersPerDay: Math.round((paceOrders / PACE_LOOKBACK_DAYS) * 10) / 10,
    averageEarnedPerDay: Math.round(averageEarnedPerDay),
    projectedFinishDate,
    status,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendar: every day of the sprint against the target it had that morning
// ─────────────────────────────────────────────────────────────────────────────

export interface CalendarDay {
  date: string; // YYYY-MM-DD, Lagos
  orders: number; // paid, non-cancelled orders that day
  fees: number; // delivery fees that day
  target: number | null; // that day's order target; null for days still to come
  needed: number | null; // the money that day had to bring in (the target in naira); null for days still to come
  // A day is hit by reaching its order target or the money needed, whichever comes first
  hitBy: 'orders' | 'money' | 'both' | null;
  status: 'hit' | 'near' | 'missed' | 'today' | 'future';
}

export interface SprintCalendar {
  config: SprintConfig;
  today: string;
  days: CalendarDay[]; // startDate .. endDate
}

const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/**
 * For each day up to today, the target it would have had on the morning of that day,
 * worked out with the same rule as getSprintStatus: what was still owed (fees before
 * that day − expenses before it) ÷ days left ÷ average fee over the 14 days before.
 * Today's figures come out identical to the target page's.
 */
export async function getSprintCalendar(now = new Date()): Promise<SprintCalendar> {
  const config = await getSprintConfig();
  const today = lagosDateKey(now);
  const sprintStart = lagosDayStart(config.startDate);
  const from = new Date(sprintStart.getTime() - FEE_LOOKBACK_DAYS * DAY_MS);

  const [orders, expenses] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: { createdAt: { gte: from } },
      select: { deliveryFee: true, orderStatus: true, paymentStatus: true, createdAt: true },
    }),
    prisma.expense.findMany({ where: { date: { gte: sprintStart } }, select: { date: true, amount: true } }),
  ]);

  // Orders and fees per Lagos day
  const perDay = new Map<string, { orders: number; fees: number }>();
  for (const o of orders) {
    if (!isRevenueOrder(o)) continue;
    const k = lagosDateKey(o.createdAt);
    const cur = perDay.get(k) || { orders: 0, fees: 0 };
    cur.orders += 1;
    cur.fees += Number(o.deliveryFee) || 0;
    perDay.set(k, cur);
  }
  const expensePerDay = new Map<string, number>();
  let allExpenses = 0;
  for (const e of expenses) {
    const k = lagosDateKey(e.date);
    const amt = Number(e.amount) || 0;
    expensePerDay.set(k, (expensePerDay.get(k) || 0) + amt);
    allExpenses += amt;
  }

  const days: CalendarDay[] = [];
  let feesBefore = 0; // sprint fees on days before the one being looked at
  let expensesBefore = 0;
  let ordersThrough = 0; // sprint orders up to and including this day (fallback average)
  let feesThrough = 0;
  const totalDays = daysBetween(config.startDate, config.endDate) + 1;

  for (let i = 0; i < totalDays; i++) {
    const date = addDays(config.startDate, i);
    const day = perDay.get(date) || { orders: 0, fees: 0 };
    ordersThrough += day.orders;
    feesThrough += day.fees;

    if (date > today) {
      days.push({ date, orders: 0, fees: 0, target: null, needed: null, hitBy: null, status: 'future' });
      continue;
    }

    // Average fee over the 14 days before this one (falls back to the sprint average)
    let recentOrders = 0;
    let recentFees = 0;
    for (let b = 1; b <= FEE_LOOKBACK_DAYS; b++) {
      const r = perDay.get(addDays(date, -b));
      if (r) {
        recentOrders += r.orders;
        recentFees += r.fees;
      }
    }
    const feePerOrder = recentOrders > 0 ? recentFees / recentOrders : ordersThrough > 0 ? feesThrough / ordersThrough : 0;

    // Today counts every expense logged so far, exactly like the target page
    const spent = date === today ? allExpenses : expensesBefore;
    const remaining = Math.max(0, config.targetAmount - (feesBefore - spent));
    const daysLeft = Math.max(1, daysBetween(date, config.endDate) + 1);
    const target = feePerOrder > 0 ? Math.ceil(remaining / daysLeft / feePerOrder) : 0;

    // Hit by orders, or by money: a day with fewer but higher-fee orders still counts
    const needed = remaining / daysLeft;
    const byOrders = target === 0 || day.orders >= target;
    const byMoney = needed <= 0 || day.fees >= needed;
    const share = Math.max(target > 0 ? day.orders / target : 1, needed > 0 ? day.fees / needed : 1);
    const hitBy: CalendarDay['hitBy'] = byOrders && byMoney ? 'both' : byOrders ? 'orders' : byMoney ? 'money' : null;
    const status: CalendarDay['status'] =
      date === today ? 'today' : hitBy ? 'hit' : share >= 0.8 ? 'near' : 'missed';
    days.push({ date, orders: day.orders, fees: Math.round(day.fees), target, needed: Math.round(needed), hitBy, status });

    feesBefore += day.fees;
    expensesBefore += expensePerDay.get(date) || 0;
  }

  return { config, today, days };
}
