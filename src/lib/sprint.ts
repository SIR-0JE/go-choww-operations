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
