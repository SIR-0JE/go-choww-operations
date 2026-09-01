import { NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, getInMemoryExpenses } from '@/lib/prisma';
import { calculateMetrics, calculateRiderPayout, isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let orders: any[] = [];
    let expenses: any[] = [];
    let isDbConnected = false;

    try {
      orders = await prisma.deliveryOrder.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expenses = await prisma.expense.findMany({
        orderBy: { date: 'asc' },
      });
      isDbConnected = true;
    } catch {
      orders = getInMemoryOrders();
      expenses = getInMemoryExpenses();
    }

    if (!orders || orders.length === 0) {
      orders = getInMemoryOrders();
    }
    if (!expenses || expenses.length === 0) {
      expenses = getInMemoryExpenses();
    }

    const normalizedOrders = orders.map((o) => ({
      ...o,
      deliveryFee: Number(o.deliveryFee),
      foodTotal: Number(o.foodTotal),
      totalAmountPaid: Number(o.totalAmountPaid),
      createdAt: new Date(o.createdAt),
    }));

    const normalizedExpenses = expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      date: new Date(e.date),
    }));

    // Calculate overall KPIs including True Net Profit
    const metrics = calculateMetrics(normalizedOrders, normalizedExpenses);

    // Group daily revenue and order trends
    const dailyMap = new Map<
      string,
      {
        date: string;
        displayDate: string;
        settledOrders: number;
        grossRevenue: number;
        riderPayout: number;
        expenses: number;
        netProfit: number;
        cumulativeNetProfit: number;
      }
    >();

    // 1. Process settled orders
    const sortedSettled = normalizedOrders
      .filter((o) => isSettledOrder(o))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (const order of sortedSettled) {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      const displayDate = new Date(order.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          displayDate,
          settledOrders: 0,
          grossRevenue: 0,
          riderPayout: 0,
          expenses: 0,
          netProfit: 0,
          cumulativeNetProfit: 0,
        });
      }

      const dayData = dailyMap.get(dateKey)!;
      const fee = order.deliveryFee;
      const payout = calculateRiderPayout(order.deliveryType);

      dayData.settledOrders += 1;
      dayData.grossRevenue += fee;
      dayData.riderPayout += payout;
    }

    // 2. Process daily expenses
    for (const exp of normalizedExpenses) {
      const dateKey = exp.date.toISOString().split('T')[0];
      const displayDate = new Date(exp.date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          displayDate,
          settledOrders: 0,
          grossRevenue: 0,
          riderPayout: 0,
          expenses: 0,
          netProfit: 0,
          cumulativeNetProfit: 0,
        });
      }

      const dayData = dailyMap.get(dateKey)!;
      dayData.expenses += exp.amount;
    }

    // 3. Sort daily entries and calculate net profit per day and running cumulative profit
    const sortedDays = Array.from(dailyMap.entries())
      .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
      .map(([_, data]) => data);

    let runningNetProfit = 0;
    for (const day of sortedDays) {
      day.netProfit = day.grossRevenue - day.riderPayout - day.expenses;
      runningNetProfit += day.netProfit;
      day.cumulativeNetProfit = runningNetProfit;
    }

    const dailyChartData = sortedDays.slice(-21);

    // Delivery Type Breakdown for Chart
    const breakdownChartData = [
      {
        type: 'Same side',
        count: metrics.deliveryTypeBreakdown.sameSideCount,
        rate: '₦50 / order',
        totalPayout: metrics.deliveryTypeBreakdown.sameSidePayout,
        fill: '#f97316',
      },
      {
        type: 'Different side',
        count: metrics.deliveryTypeBreakdown.differentSideCount,
        rate: '₦90 / order',
        totalPayout: metrics.deliveryTypeBreakdown.differentSidePayout,
        fill: '#3b82f6',
      },
      {
        type: 'Pick up',
        count: metrics.deliveryTypeBreakdown.pickUpCount,
        rate: '₦0 / order',
        totalPayout: 0,
        fill: '#10b981',
      },
      {
        type: 'Other',
        count: metrics.deliveryTypeBreakdown.otherCount,
        rate: '₦0 / order',
        totalPayout: 0,
        fill: '#8b5cf6',
      },
    ];

    return NextResponse.json({
      success: true,
      isDbConnected,
      metrics,
      dailyChartData,
      breakdownChartData,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to compute analytics' },
      { status: 500 }
    );
  }
}
