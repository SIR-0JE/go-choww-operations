import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRunnerSettings, knownCafeterias, sameCafeteria, toPackWhere, validateRunner } from '@/lib/runners';

export const dynamic = 'force-dynamic';

const LAGOS_OFFSET_MS = 60 * 60 * 1000;

/**
 * GET /api/runners
 * Runners with their cafeteria, how many orders each has still to pack (and how long the
 * oldest has waited), and today's packing: orders packed and average minutes from order to Ready.
 * ?lite=1 returns just the runners.
 */
export async function GET(request: NextRequest) {
  try {
    const runners = await prisma.runner.findMany({ orderBy: { createdAt: 'asc' } });
    const publicRunners = runners.map(({ pin: _pin, ...r }) => r); // PINs are set, never shown
    if (request.nextUrl.searchParams.get('lite') === '1') {
      return NextResponse.json({ success: true, runners: publicRunners }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const now = Date.now();
    const todayStart = new Date(Date.parse(new Date(now + LAGOS_OFFSET_MS).toISOString().slice(0, 10) + 'T00:00:00Z') - LAGOS_OFFSET_MS);
    const since = new Date(now - 8 * 60 * 60 * 1000);

    const [settings, cafeterias, waiting, packedToday] = await Promise.all([
      getRunnerSettings(),
      knownCafeterias(),
      prisma.deliveryOrder.findMany({ where: toPackWhere(null, since), select: { cafeteriaName: true, createdAt: true } }),
      prisma.$queryRaw<{ actor: string | null; n: bigint; avg_min: number | null }[]>`
        select e."actorName" as actor, count(*) as n,
               avg(greatest(0, extract(epoch from (e."at" - o."createdAt")) / 60)) as avg_min
        from "OrderEvent" e join "DeliveryOrder" o on o."id" = e."orderDbId"
        where e."kind" = 'runner_ready' and e."at" >= ${todayStart}
        group by 1`,
    ]);

    const board = publicRunners.map((r) => {
      const mine = waiting.filter((o) => sameCafeteria(o.cafeteriaName, r.cafeteria));
      const oldest = mine.length ? Math.max(...mine.map((o) => Math.floor((now - o.createdAt.getTime()) / 60000))) : 0;
      const today = packedToday.find((p) => p.actor === r.name);
      return {
        runnerId: r.id,
        toPack: mine.length,
        oldestMinutes: oldest,
        late: mine.filter((o) => now - o.createdAt.getTime() > settings.alertMinutes * 60000).length,
        packedToday: Number(today?.n || 0),
        avgPackMinutes: today?.avg_min != null ? Math.round(Number(today.avg_min) * 10) / 10 : null,
      };
    });

    return NextResponse.json(
      { success: true, settings, runners: publicRunners, board, cafeterias },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[GET /api/runners]', err);
    return NextResponse.json({ success: false, error: 'Could not load runners. Has the Runner table been created?' }, { status: 503 });
  }
}

/** POST /api/runners: add a runner */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = {
      name: String(body.name || '').trim(),
      phone: String(body.phone || '').trim(),
      pin: String(body.pin || '1234').trim(),
      cafeteria: String(body.cafeteria || '').trim(),
    };
    const error = await validateRunner(data);
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });
    const { pin: _pin, ...runner } = await prisma.runner.create({ data });
    return NextResponse.json({ success: true, runner });
  } catch (err) {
    console.error('[POST /api/runners]', err);
    return NextResponse.json({ success: false, error: 'Could not add the runner.' }, { status: 503 });
  }
}
