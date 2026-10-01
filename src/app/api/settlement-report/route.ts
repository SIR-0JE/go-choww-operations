/**
 * ONE-TIME settlement report endpoint — Sep 27 to present
 * GET /api/settlement-report
 * Returns rider payout breakdown for equal 3-way split.
 * DELETE this file after use.
 */
import { NextResponse } from 'next/server';
import { prisma, withDbRetry } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function isSettled(o: { orderStatus?: string | null; paymentStatus?: string | null }) {
  const s = (o.orderStatus || '').trim().toLowerCase();
  const p = (o.paymentStatus || '').trim().toLowerCase();
  return (s === 'delivered' || s === 'completed') && p === 'success';
}

function payout(deliveryType: string) {
  const t = (deliveryType || '').trim().toLowerCase();
  if (t === 'same side') return 50;
  if (t === 'different side') return 90;
  return 0;
}

export async function GET() {
  const from = new Date('2026-09-27T00:00:00+01:00');
  const to   = new Date();

  const orders = await withDbRetry(() =>
    prisma.deliveryOrder.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: {
        orderId:       true,
        orderStatus:   true,
        paymentStatus: true,
        deliveryType:  true,
        deliveryFee:   true,
        cafeteriaName: true,
        createdAt:     true,
      },
      orderBy: { createdAt: 'asc' },
    }), 2, 500
  );

  const settled    = orders.filter(isSettled);
  const pickups    = settled.filter(o => (o.deliveryType || '').toLowerCase().includes('pick'));
  const deliveries = settled.filter(o => !(o.deliveryType || '').toLowerCase().includes('pick'));

  const sameSide = deliveries.filter(o => o.deliveryType?.trim().toLowerCase() === 'same side');
  const diffSide = deliveries.filter(o => o.deliveryType?.trim().toLowerCase() === 'different side');
  const other    = deliveries.filter(o => !['same side','different side'].includes((o.deliveryType||'').trim().toLowerCase()));

  const totalPool   = deliveries.reduce((s, o) => s + payout(o.deliveryType), 0);
  const perRiderPay = Math.round(totalPool / 3);
  const base  = Math.floor(deliveries.length / 3);
  const extra = deliveries.length % 3;
  const niyiFeeRevenue = pickups.reduce((s, o) => s + Number(o.deliveryFee || 0), 0);

  // Per-day breakdown
  const byDay: Record<string, { total: number; settled: number; pickups: number; deliveries: number }> = {};
  for (const o of orders) {
    const d = new Date(o.createdAt).toLocaleDateString('en-NG', {
      timeZone: 'Africa/Lagos', weekday: 'short', day: '2-digit', month: 'short',
    });
    if (!byDay[d]) byDay[d] = { total: 0, settled: 0, pickups: 0, deliveries: 0 };
    byDay[d].total++;
    if (isSettled(o)) {
      byDay[d].settled++;
      if ((o.deliveryType||'').toLowerCase().includes('pick')) byDay[d].pickups++;
      else byDay[d].deliveries++;
    }
  }

  return NextResponse.json({
    period: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      totalOrders:     orders.length,
      settledOrders:   settled.length,
      deliveryOrders:  deliveries.length,
      pickupOrders:    pickups.length,
    },
    deliveryBreakdown: {
      sameSide:     { count: sameSide.length, rate: 50,  subtotal: sameSide.length * 50 },
      differentSide:{ count: diffSide.length, rate: 90,  subtotal: diffSide.length * 90 },
      other:        { count: other.length },
      totalPool,
    },
    riderSplit: {
      totalOrders: deliveries.length,
      basePerRider: base,
      leftoverOrders: extra,
      riders: ['Ishola', 'Qudus', 'Sodiq'].map((name, i) => ({
        name,
        orders: base + (i < extra ? 1 : 0),
        payout: perRiderPay,
      })),
    },
    niyi: {
      pickupOrders: pickups.length,
      systemPayoutRate: 0,
      deliveryFeeRevenue: niyiFeeRevenue,
    },
    dailyBreakdown: byDay,
  });
}
