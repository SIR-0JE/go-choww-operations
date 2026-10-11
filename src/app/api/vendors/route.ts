import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSlowLimits, saveSlowLimits } from '@/lib/orderEvents';

export const dynamic = 'force-dynamic';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

type StageRow = { n: number; median: number | null; p90: number | null };
const stage = (n: bigint | number | null, median: number | null, p90: number | null): StageRow => ({
  n: Number(n || 0),
  median: median === null ? null : Number(median),
  p90: p90 === null ? null : Number(p90),
});

/**
 * GET /api/vendors?days=7
 * Per cafeteria: how fast they acknowledge, prepare, how long food waits for a rider,
 * ride time and door-to-door (median and slowest 10%, in minutes), plus the slow limits.
 * Computed in the database so only a few small rows come back.
 */
export async function GET(request: NextRequest) {
  try {
    const days = Math.min(90, Math.max(1, parseInt(request.nextUrl.searchParams.get('days') || '7', 10) || 7));
    const todayStart = new Date(Date.parse(new Date(Date.now() + LAGOS_OFFSET_MS).toISOString().slice(0, 10) + 'T00:00:00Z') - LAGOS_OFFSET_MS);
    const since = new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    const [limits, rows, tracking] = await Promise.all([
      getSlowLimits(),
      prisma.$queryRaw<any[]>`
        with t as (
          select o."id", o."cafeteriaName" as cafe, o."createdAt" as placed, o."orderStatus" as status,
            min(e."at") filter (where e."kind" = 'gochow_preparing') as preparing,
            min(e."at") filter (where e."kind" in ('gochow_preparing','gochow_ready','gochow_dispatched')) as vendor_start,
            coalesce(min(e."at") filter (where e."kind" = 'gochow_ready'), min(e."at") filter (where e."kind" = 'gochow_dispatched')) as ready,
            min(e."at") filter (where e."kind" = 'rider_picked_up') as picked,
            coalesce(min(e."at") filter (where e."kind" = 'rep_received'), max(e."at") filter (where e."kind" = 'rider_delivered')) as arrived,
            coalesce(max(e."at") filter (where e."kind" = 'rep_delivered'), max(e."at") filter (where e."kind" = 'rider_delivered'), min(e."at") filter (where e."kind" = 'gochow_delivered')) as done
          from "DeliveryOrder" o
          left join "OrderEvent" e on e."orderDbId" = o."id"
          where o."createdAt" >= ${since} and lower(o."deliveryType") not like 'pick%'
          group by o."id"
        ),
        d as (
          select cafe, status,
            extract(epoch from (vendor_start - placed)) / 60 as ack,
            extract(epoch from (ready - preparing)) / 60 as prep,
            extract(epoch from (picked - ready)) / 60 as wait,
            extract(epoch from (arrived - picked)) / 60 as ride,
            extract(epoch from (done - placed)) / 60 as total
          from t
        )
        select cafe, count(*) as orders,
          count(*) filter (where lower(status) like 'canc%') as cancelled,
          count(ack) filter (where ack >= 0) as ack_n, percentile_cont(0.5) within group (order by ack) filter (where ack >= 0) as ack_med, percentile_cont(0.9) within group (order by ack) filter (where ack >= 0) as ack_p90,
          count(prep) filter (where prep >= 0) as prep_n, percentile_cont(0.5) within group (order by prep) filter (where prep >= 0) as prep_med, percentile_cont(0.9) within group (order by prep) filter (where prep >= 0) as prep_p90,
          count(wait) filter (where wait >= 0) as wait_n, percentile_cont(0.5) within group (order by wait) filter (where wait >= 0) as wait_med, percentile_cont(0.9) within group (order by wait) filter (where wait >= 0) as wait_p90,
          count(ride) filter (where ride >= 0) as ride_n, percentile_cont(0.5) within group (order by ride) filter (where ride >= 0) as ride_med, percentile_cont(0.9) within group (order by ride) filter (where ride >= 0) as ride_p90,
          count(total) filter (where total >= 0) as total_n, percentile_cont(0.5) within group (order by total) filter (where total >= 0) as total_med, percentile_cont(0.9) within group (order by total) filter (where total >= 0) as total_p90
        from d group by cafe order by count(*) desc`,
      prisma.$queryRaw<any[]>`select min("at") as first_gochow, count(*) as events from "OrderEvent" where "source" = 'gochow'`,
    ]);

    const vendors = rows.map((r) => ({
      cafeteria: r.cafe,
      orders: Number(r.orders),
      cancelled: Number(r.cancelled),
      ack: stage(r.ack_n, r.ack_med, r.ack_p90),
      prep: stage(r.prep_n, r.prep_med, r.prep_p90),
      wait: stage(r.wait_n, r.wait_med, r.wait_p90),
      ride: stage(r.ride_n, r.ride_med, r.ride_p90),
      total: stage(r.total_n, r.total_med, r.total_p90),
    }));

    return NextResponse.json(
      {
        success: true,
        days,
        since: since.toISOString(),
        limits,
        trackingSince: tracking[0]?.first_gochow ? new Date(tracking[0].first_gochow).toISOString() : null,
        vendors,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[GET /api/vendors]', err);
    return NextResponse.json({ success: false, error: 'Could not load vendor speed. Has the timeline table been created?' }, { status: 503 });
  }
}

/** PUT /api/vendors { ack, prep, wait, ride, total }: the minutes after which a step counts as slow */
export async function PUT(request: NextRequest) {
  try {
    const limits = await saveSlowLimits(await request.json());
    return NextResponse.json({ success: true, limits });
  } catch (err) {
    console.error('[PUT /api/vendors]', err);
    return NextResponse.json({ success: false, error: 'Could not save.' }, { status: 503 });
  }
}
