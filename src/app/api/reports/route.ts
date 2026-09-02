import { NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, getInMemoryExpenses } from '@/lib/prisma';
import { calculateRiderPayout, isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let orders: any[] = [];
    let expenses: any[] = [];

    try {
      orders = await prisma.deliveryOrder.findMany({
        orderBy: { createdAt: 'asc' },
      });
      expenses = await prisma.expense.findMany({
        orderBy: { date: 'asc' },
      });
    } catch {
      orders = getInMemoryOrders();
      expenses = getInMemoryExpenses();
    }

    if (!orders) orders = [];
    if (!expenses) expenses = [];

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

    // ─────────────────────────────────────────────────────────────
    // 1. DAILY SUMMARY AGGREGATION
    // ─────────────────────────────────────────────────────────────
    const dailyMap = new Map<
      string,
      {
        date: string;
        displayDate: string;
        totalOrders: number;
        completedOrders: number;
        grossRevenue: number;
        riderFees: number;
        expenses: number;
        netProfit: number;
      }
    >();

    for (const order of normalizedOrders) {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      const displayDate = new Date(order.createdAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          displayDate,
          totalOrders: 0,
          completedOrders: 0,
          grossRevenue: 0,
          riderFees: 0,
          expenses: 0,
          netProfit: 0,
        });
      }

      const day = dailyMap.get(dateKey)!;
      day.totalOrders += 1;

      if (isSettledOrder(order)) {
        day.completedOrders += 1;
        day.grossRevenue += order.deliveryFee;
        day.riderFees += calculateRiderPayout(order.deliveryType);
      }
    }

    for (const exp of normalizedExpenses) {
      const dateKey = exp.date.toISOString().split('T')[0];
      const displayDate = new Date(exp.date).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          displayDate,
          totalOrders: 0,
          completedOrders: 0,
          grossRevenue: 0,
          riderFees: 0,
          expenses: 0,
          netProfit: 0,
        });
      }

      const day = dailyMap.get(dateKey)!;
      day.expenses += exp.amount;
    }

    const dailySummaryList = Array.from(dailyMap.values()).map((day) => {
      day.netProfit = day.grossRevenue - day.riderFees - day.expenses;
      return day;
    });

    const dailySummaryDesc = [...dailySummaryList].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const dailyChartData = [...dailySummaryList]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-18);

    // ─────────────────────────────────────────────────────────────
    // 2. MONTHLY SUMMARY AGGREGATION
    // ─────────────────────────────────────────────────────────────
    const monthlyMap = new Map<
      string,
      {
        monthKey: string;
        monthName: string;
        totalOrders: number;
        completedOrders: number;
        grossRevenue: number;
        riderPayout: number;
        totalExpenses: number;
        netProfit: number;
      }
    >();

    for (const order of normalizedOrders) {
      const d = new Date(order.createdAt);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          monthKey,
          monthName,
          totalOrders: 0,
          completedOrders: 0,
          grossRevenue: 0,
          riderPayout: 0,
          totalExpenses: 0,
          netProfit: 0,
        });
      }

      const m = monthlyMap.get(monthKey)!;
      m.totalOrders += 1;

      if (isSettledOrder(order)) {
        m.completedOrders += 1;
        m.grossRevenue += order.deliveryFee;
        m.riderPayout += calculateRiderPayout(order.deliveryType);
      }
    }

    for (const exp of normalizedExpenses) {
      const d = new Date(exp.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      if (!monthlyMap.has(monthKey)) {
        monthlyMap.set(monthKey, {
          monthKey,
          monthName,
          totalOrders: 0,
          completedOrders: 0,
          grossRevenue: 0,
          riderPayout: 0,
          totalExpenses: 0,
          netProfit: 0,
        });
      }

      const m = monthlyMap.get(monthKey)!;
      m.totalExpenses += exp.amount;
    }

    const monthlySummary = Array.from(monthlyMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => {
        m.netProfit = m.grossRevenue - m.riderPayout - m.totalExpenses;
        return m;
      });

    // ─────────────────────────────────────────────────────────────
    // 3. TOP CAFETERIAS BREAKDOWN
    // ─────────────────────────────────────────────────────────────
    const cafeteriaMap = new Map<
      string,
      {
        cafeteriaName: string;
        orderCount: number;
        totalFoodValue: number;
        totalDeliveryFees: number;
      }
    >();

    for (const order of normalizedOrders) {
      const name = order.cafeteriaName;
      if (!cafeteriaMap.has(name)) {
        cafeteriaMap.set(name, {
          cafeteriaName: name,
          orderCount: 0,
          totalFoodValue: 0,
          totalDeliveryFees: 0,
        });
      }

      const cat = cafeteriaMap.get(name)!;
      cat.orderCount += 1;
      cat.totalFoodValue += order.foodTotal;
      if (isSettledOrder(order)) {
        cat.totalDeliveryFees += order.deliveryFee;
      }
    }

    const topCafeterias = Array.from(cafeteriaMap.values())
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);

    return NextResponse.json({
      success: true,
      dailySummary: dailySummaryDesc,
      dailyChartData,
      monthlySummary,
      topCafeterias,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Reports API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to generate reports' },
      { status: 500 }
    );
  }
}
