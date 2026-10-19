import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const isDateKey = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const lagosDayStart = (key: string) => new Date(Date.parse(`${key}T00:00:00Z`) - LAGOS_OFFSET_MS);
const lagosToday = () => new Date(Date.now() + LAGOS_OFFSET_MS).toISOString().slice(0, 10);

// A pick-up to delivery under this is almost certainly two quick taps, not a real ride
const QUICK_TAP_MINUTES = 2;
// Times longer than this are treated as forgotten taps, not real preparation (cafeterias only)
const MAX_PREP_MINUTES = 300;

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * GET /api/performance?from=YYYY-MM-DD&to=YYYY-MM-DD   (Lagos days, both included)
 *
 * Cafeterias: minutes from the order coming in to GoChow showing it Ready.
 * Riders: only orders a rider accepted, picked up and delivered themselves (never dropped or
 * passed on): accept -> pick up, pick up -> delivered, and accept -> delivered. Orders count in
 * the period they were delivered. Drops are counted separately.
 */
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const today = lagosToday();
    const to = isDateKey(p.get('to')) ? p.get('to')! : today;
    const from = isDateKey(p.get('from')) ? p.get('from')! : new Date(Date.parse(to) - 6 * DAY_MS).toISOString().slice(0, 10);
    if (from > to) return NextResponse.json({ success: false, error: 'The start date must be before the end date.' }, { status: 400 });
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 120) {
      return NextResponse.json({ success: false, error: 'Pick a range of 120 days or less.' }, { status: 400 });
    }
    const start = lagosDayStart(from);
    const end = new Date(lagosDayStart(to).getTime() + DAY_MS);

    const [cafes, riders, drops, tracking] = await Promise.all([
      prisma.$queryRaw<any[]>`
        with t as (
          select o."cafeteriaName" as cafe, o."createdAt" as placed,
            min(e."at") filter (where e."kind" in ('gochow_preparing','gochow_ready','gochow_dispatched')) as started,
            coalesce(min(e."at") filter (where e."kind" = 'gochow_ready'), min(e."at") filter (where e."kind" = 'gochow_dispatched')) as ready
          from "DeliveryOrder" o
          join "OrderEvent" e on e."orderDbId" = o."id"
          where o."createdAt" >= ${start} and o."createdAt" < ${end}
            and lower(o."orderStatus") not like 'canc%'
          group by o."id"
        ), d as (
          select cafe,
            extract(epoch from (ready - placed)) / 60 as to_ready,
            extract(epoch from (started - placed)) / 60 as to_start
          from t
        )
        select cafe,
          count(*) filter (where to_ready between 0 and ${MAX_PREP_MINUTES})::int as n,
          (avg(to_ready) filter (where to_ready between 0 and ${MAX_PREP_MINUTES}))::float8 as avg_ready,
          (percentile_cont(0.5) within group (order by to_ready) filter (where to_ready between 0 and ${MAX_PREP_MINUTES}))::float8 as med_ready,
          (percentile_cont(0.9) within group (order by to_ready) filter (where to_ready between 0 and ${MAX_PREP_MINUTES}))::float8 as p90_ready,
          (avg(to_start) filter (where to_start between 0 and ${MAX_PREP_MINUTES}))::float8 as avg_start
        from d group by cafe`,
      prisma.$queryRaw<any[]>`
        with d as (
          select "orderDbId" as o, "actorName" as who, max("at") as delivered
          from "OrderEvent"
          where "kind" = 'rider_delivered' and "actorName" is not null and "at" >= ${start} and "at" < ${end}
          group by 1, 2
        ), j as (
          select d.who, d.delivered,
            (select max(a."at") from "OrderEvent" a where a."orderDbId" = d.o and a."kind" = 'rider_accepted' and a."actorName" = d.who and a."at" <= d.delivered) as accepted,
            (select max(k."at") from "OrderEvent" k where k."orderDbId" = d.o and k."kind" = 'rider_picked_up' and k."actorName" = d.who and k."at" <= d.delivered) as picked,
            exists (select 1 from "OrderEvent" x where x."orderDbId" = d.o and x."actorName" = d.who and x."kind" in ('rider_dropped','rider_transferred')) as gave_away
          from d
        ), m as (
          select who, 1 as delivered_all,
            case when accepted is not null and picked is not null and accepted <= picked and not gave_away then 1 else 0 end as measured,
            extract(epoch from (picked - accepted)) / 60 as pickup_wait,
            extract(epoch from (delivered - picked)) / 60 as ride,
            extract(epoch from (delivered - accepted)) / 60 as total
          from j
        )
        select who,
          sum(delivered_all)::int as delivered,
          sum(measured)::int as measured,
          (avg(pickup_wait) filter (where measured = 1))::float8 as avg_pickup,
          (percentile_cont(0.5) within group (order by pickup_wait) filter (where measured = 1))::float8 as med_pickup,
          (avg(ride) filter (where measured = 1))::float8 as avg_ride,
          (percentile_cont(0.5) within group (order by ride) filter (where measured = 1))::float8 as med_ride,
          (avg(total) filter (where measured = 1))::float8 as avg_total,
          (percentile_cont(0.5) within group (order by total) filter (where measured = 1))::float8 as med_total,
          (count(*) filter (where measured = 1 and ride < ${QUICK_TAP_MINUTES}))::int as quick_taps
        from m group by who`,
      prisma.$queryRaw<any[]>`
        select "actorName" as who, count(*)::int as drops
        from "OrderEvent"
        where "kind" in ('rider_dropped','rider_transferred') and "actorName" is not null and "at" >= ${start} and "at" < ${end}
        group by 1`,
      prisma.$queryRaw<any[]>`
        select min("at") filter (where "source" = 'gochow') as first_gochow,
               min("at") filter (where "source" = 'rider') as first_rider
        from "OrderEvent"`,
    ]);

    const dropMap = new Map<string, number>(drops.map((d) => [d.who, Number(d.drops)]));

    const cafeterias = cafes
      .filter((c) => Number(c.n) > 0)
      .map((c) => ({
        cafeteria: c.cafe as string,
        orders: Number(c.n),
        avgReady: n(c.avg_ready),
        medianReady: n(c.med_ready),
        slowest10: n(c.p90_ready),
        avgStart: n(c.avg_start),
      }))
      .sort((a, b) => (a.avgReady ?? 1e9) - (b.avgReady ?? 1e9))
      .map((c, i) => ({ ...c, rank: i + 1 }));

    const names = new Set<string>([...riders.map((r) => r.who as string), ...dropMap.keys()]);
    const riderRows = Array.from(names).map((who) => {
      const r = riders.find((x) => x.who === who);
      return {
        name: who,
        delivered: Number(r?.delivered || 0),
        measured: Number(r?.measured || 0),
        avgPickup: n(r?.avg_pickup),
        medianPickup: n(r?.med_pickup),
        avgRide: n(r?.avg_ride),
        medianRide: n(r?.med_ride),
        avgTotal: n(r?.avg_total),
        medianTotal: n(r?.med_total),
        drops: dropMap.get(who) || 0,
        quickTaps: Number(r?.quick_taps || 0),
      };
    });
    const ranked = riderRows
      .filter((r) => r.measured > 0)
      .sort((a, b) => (a.avgTotal ?? 1e9) - (b.avgTotal ?? 1e9))
      .map((r, i) => ({ ...r, rank: i + 1 as number | null }));
    const unranked = riderRows
      .filter((r) => r.measured === 0)
      .sort((a, b) => b.delivered - a.delivered)
      .map((r) => ({ ...r, rank: null as number | null }));

    return NextResponse.json(
      {
        success: true,
        from,
        to,
        quickTapMinutes: QUICK_TAP_MINUTES,
        maxPrepMinutes: MAX_PREP_MINUTES,
        team: {
          ready: mean(cafeterias.map((c) => c.avgReady)),
          pickup: mean(ranked.map((r) => r.avgPickup)),
          ride: mean(ranked.map((r) => r.avgRide)),
          total: mean(ranked.map((r) => r.avgTotal)),
        },
        cafeterias,
        riders: [...ranked, ...unranked],
        cafeteriaTimesSince: tracking[0]?.first_gochow ? new Date(tracking[0].first_gochow).toISOString() : null,
        riderTimesSince: tracking[0]?.first_rider ? new Date(tracking[0].first_rider).toISOString() : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[GET /api/performance]', err);
    return NextResponse.json({ success: false, error: 'Could not load performance. Has the timeline table been created?' }, { status: 503 });
  }
}
