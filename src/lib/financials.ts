/**
 * Core Financial Logic & Business Rules for Go Choww Operations & Debt Recovery
 */

export interface OrderFinancials {
  deliveryFee: number;
  foodTotal: number;
  totalAmountPaid: number;
  deliveryType: string;
  orderStatus: string;
  paymentStatus: string;
  createdAt?: string | Date;
}

export interface ExpenseFinancials {
  amount: number;
  date: string | Date;
  category: string;
  description: string;
}

export const DEBT_RECOVERY_TARGET = 3500000; // ₦3,500,000
export const DAILY_ORDER_TARGET = 126; // 126 completed orders/day
export const DAILY_NET_PROFIT_TARGET = 36842; // ₦36,842 net profit/day
export const SPRINT_DEADLINE = new Date('2026-12-10T23:59:59Z');

/**
 * Check if order is a verified settled order
 * Rule: orderStatus == "Completed" AND paymentStatus == "success"
 */
export function isSettledOrder(order: { orderStatus: string; paymentStatus: string }): boolean {
  return (
    order.orderStatus.toLowerCase() === 'completed' &&
    order.paymentStatus.toLowerCase() === 'success'
  );
}

/**
 * Calculate rider payout for an individual order
 * - "Same side" = ₦50
 * - "Different side" = ₦90
 * - "Pick up" or "Other" = ₦0
 */
export function calculateRiderPayout(deliveryType: string): number {
  const type = deliveryType.trim().toLowerCase();
  if (type === 'same side') {
    return 50;
  }
  if (type === 'different side') {
    return 90;
  }
  return 0; // "Pick up", "Other", etc.
}

/**
 * Format any numerical amount to Nigerian Naira (₦)
 */
export function formatNaira(amount: number, options?: { showDecimals?: boolean; compact?: boolean }): string {
  const showDecimals = options?.showDecimals ?? false;
  
  if (options?.compact && Math.abs(amount) >= 1000000) {
    return `₦${(amount / 1000000).toFixed(2)}M`;
  }
  if (options?.compact && Math.abs(amount) >= 1000) {
    return `₦${(amount / 1000).toFixed(1)}k`;
  }

  const formatted = new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount);

  return `₦${formatted}`;
}

export interface MetricsSummary {
  totalOrdersCount: number;
  settledOrdersCount: number;
  unsettledOrdersCount: number;
  grossDeliveryRevenue: number;
  totalRiderPayout: number;
  grossMargin: number;
  totalExpenses: number;
  netProfit: number; // True Net Profit: Gross Margin - Total Expenses
  debtTarget: number;
  debtProgressPercent: number;
  remainingDebt: number;
  dailyAverageNetProfit: number;
  dailyAverageSettledOrders: number;
  targetDailyOrders: number;
  targetDailyNetProfit: number;
  velocityPercent: number;
  daysRemainingInSprint: number;
  deliveryTypeBreakdown: {
    sameSideCount: number;
    differentSideCount: number;
    pickUpCount: number;
    otherCount: number;
    sameSidePayout: number;
    differentSidePayout: number;
  };
}

/**
 * Calculate full platform metrics incorporating Settled Orders, Rider Payouts, and Expenses
 */
export function calculateMetrics(
  orders: OrderFinancials[],
  expenses: ExpenseFinancials[] = [],
  referenceDate = new Date('2026-09-01T00:00:00Z')
): MetricsSummary {
  const totalOrdersCount = orders.length;
  let settledOrdersCount = 0;
  let grossDeliveryRevenue = 0;
  let totalRiderPayout = 0;

  const typeCounts = {
    sameSideCount: 0,
    differentSideCount: 0,
    pickUpCount: 0,
    otherCount: 0,
    sameSidePayout: 0,
    differentSidePayout: 0,
  };

  const datesSeen = new Set<string>();

  for (const order of orders) {
    const isSettled = isSettledOrder(order);

    if (isSettled) {
      settledOrdersCount++;
      const fee = Number(order.deliveryFee) || 0;
      grossDeliveryRevenue += fee;

      const riderPayout = calculateRiderPayout(order.deliveryType);
      totalRiderPayout += riderPayout;

      const normalizedType = order.deliveryType.trim().toLowerCase();
      if (normalizedType === 'same side') {
        typeCounts.sameSideCount++;
        typeCounts.sameSidePayout += riderPayout;
      } else if (normalizedType === 'different side') {
        typeCounts.differentSideCount++;
        typeCounts.differentSidePayout += riderPayout;
      } else if (normalizedType === 'pick up' || normalizedType === 'pickup') {
        typeCounts.pickUpCount++;
      } else {
        typeCounts.otherCount++;
      }

      if (order.createdAt) {
        const dateStr = new Date(order.createdAt).toISOString().split('T')[0];
        datesSeen.add(dateStr);
      }
    }
  }

  // Calculate Total Expenses
  let totalExpenses = 0;
  for (const exp of expenses) {
    totalExpenses += Number(exp.amount) || 0;
  }

  // Financial Formulas:
  // 1. Gross Margin = Gross Delivery Revenue - Total Rider Pay
  const grossMargin = grossDeliveryRevenue - totalRiderPayout;
  // 2. True Net Profit = Gross Margin - Total Expenses
  const netProfit = grossMargin - totalExpenses;

  const debtProgressPercent = Math.min(100, Math.max(0, (netProfit / DEBT_RECOVERY_TARGET) * 100));
  const remainingDebt = Math.max(0, DEBT_RECOVERY_TARGET - netProfit);

  const activeDays = Math.max(1, datesSeen.size);
  const dailyAverageNetProfit = Math.round(netProfit / activeDays);
  const dailyAverageSettledOrders = Math.round(settledOrdersCount / activeDays);
  const velocityPercent = Math.round((dailyAverageSettledOrders / DAILY_ORDER_TARGET) * 100);

  const diffTime = Math.max(0, SPRINT_DEADLINE.getTime() - referenceDate.getTime());
  const daysRemainingInSprint = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    totalOrdersCount,
    settledOrdersCount,
    unsettledOrdersCount: totalOrdersCount - settledOrdersCount,
    grossDeliveryRevenue,
    totalRiderPayout,
    grossMargin,
    totalExpenses,
    netProfit,
    debtTarget: DEBT_RECOVERY_TARGET,
    debtProgressPercent,
    remainingDebt,
    dailyAverageNetProfit,
    dailyAverageSettledOrders,
    targetDailyOrders: DAILY_ORDER_TARGET,
    targetDailyNetProfit: DAILY_NET_PROFIT_TARGET,
    velocityPercent,
    daysRemainingInSprint,
    deliveryTypeBreakdown: typeCounts,
  };
}
