/**
 * Rider pool load test — simulates many rider phones against the live site
 * without needing real riders online.
 *
 *   npx tsx scripts/rider-load-test.ts
 *
 * Options (environment variables):
 *   LOAD_TEST_URL  site to test          (default https://go-choww-operations.vercel.app)
 *   PHONES         simulated phones      (default 10)
 *   SECONDS        polling test length   (default 30)
 *
 * What it does:
 *   1. Every phone polls the rider pool every 3.5s (like the real app) and
 *      triggers a GoChow sync every 15s, reporting OK / EMPTY POOL / BUSY / errors.
 *   2. Every phone taps Accept on one clearly-labelled TEST order at the same
 *      moment; checks exactly one rider won. The TEST order exists for the whole
 *      run (so the pool is never genuinely empty) and is deleted at the end.
 *
 * Uses DATABASE_URL from .env only to read rider IDs and to create/delete the
 * test order. Best run when no real riders are online (the test order is
 * visible in the pool for a few seconds and sends one "Order Claimed" push).
 */
import { prisma } from '../src/lib/prisma';

const BASE = (process.env.LOAD_TEST_URL || 'https://go-choww-operations.vercel.app').replace(/\/$/, '');
const PHONES = Number(process.env.PHONES || 10);
const SECONDS = Number(process.env.SECONDS || 30);
const TEST_ORDER_ID = `LOADTEST-${Date.now()}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function pollOnce(riderId: string) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/rider/orders?_t=${Date.now()}`, {
      headers: { 'x-rider-id': riderId },
      cache: 'no-store',
    });
    const ms = Date.now() - started;
    const data: any = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      return { result: (data.available?.length ?? 0) === 0 ? 'EMPTY POOL' : 'OK', ms };
    }
    if (res.status === 503) return { result: 'BUSY (503, phone keeps list)', ms };
    return { result: `ERROR ${res.status}`, ms };
  } catch {
    return { result: 'NETWORK FAILURE', ms: Date.now() - started };
  }
}

async function pollingTest(riderIds: string[]) {
  console.log(`\n① ${PHONES} phones polling the pool for ${SECONDS}s (plus a sync every 15s each)...`);
  const tally: Record<string, number> = {};
  const latencies: number[] = [];
  const end = Date.now() + SECONDS * 1000;

  await Promise.all(
    Array.from({ length: PHONES }, async (_, i) => {
      const riderId = riderIds[i % riderIds.length];
      let nextSync = Date.now() + Math.random() * 15000;
      await sleep(Math.random() * 3500); // stagger like real phones
      while (Date.now() < end) {
        const { result, ms } = await pollOnce(riderId);
        tally[result] = (tally[result] || 0) + 1;
        latencies.push(ms);
        if (Date.now() >= nextSync) {
          fetch(`${BASE}/api/sync-orders`, { method: 'POST' }).catch(() => {});
          nextSync = Date.now() + 15000;
        }
        await sleep(3500);
      }
    })
  );

  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(tally)) console.log(`   ${k.padEnd(30)} ${v} / ${total}`);
  console.log(`   Response time: typical ${percentile(latencies, 50)}ms, slowest 5% over ${percentile(latencies, 95)}ms`);
  return tally;
}

async function createTestOrder() {
  return prisma.deliveryOrder.create({
    data: {
      orderId: TEST_ORDER_ID,
      time: '12:00 PM',
      customerName: 'LOAD TEST — ignore',
      cafeteriaName: 'LOAD TEST',
      deliveryAddress: 'LOAD TEST',
      deliveryFee: 0,
      foodTotal: 0,
      totalAmountPaid: 0,
      deliveryType: 'Other',
      orderStatus: 'Confirmed',
      paymentStatus: 'pending', // keeps it out of revenue figures
    },
  });
}

async function acceptRaceTest(riderIds: string[], testOrder: { id: string }) {
  console.log(`\n② ${PHONES} phones tap Accept on the same TEST order at the same moment...`);
  {
    const results = await Promise.all(
      Array.from({ length: PHONES }, async (_, i) => {
        const riderId = riderIds[i % riderIds.length];
        const res = await fetch(`${BASE}/api/rider/orders`, {
          method: 'POST',
          headers: { 'x-rider-id': riderId, 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: testOrder.id, action: 'claim' }),
        }).catch(() => null);
        const data: any = res ? await res.json().catch(() => ({})) : {};
        return { riderId, accepted: Boolean(data.success), status: res?.status ?? 0, error: data.error };
      })
    );

    const winners = results.filter((r) => r.accepted);
    const saved = await prisma.deliveryOrder.findUnique({ where: { id: testOrder.id }, select: { riderId: true } });
    const distinctRiders = new Set(riderIds.slice(0, PHONES)).size;

    console.log(`   Told "accepted": ${winners.length}   Told "someone else took it": ${results.filter((r) => r.status === 409).length}   Other: ${results.filter((r) => !r.accepted && r.status !== 409).length}`);
    console.log(`   Saved in database to rider: ${saved?.riderId ?? 'nobody'}`);

    // With fewer real riders than phones, the same rider may appear on several phones;
    // every phone of the winning rider is legitimately told "accepted".
    const winnerIds = new Set(winners.map((w) => w.riderId));
    const pass = winnerIds.size === 1 && winnerIds.has(saved?.riderId ?? '');
    console.log(pass ? '   ✅ PASS — exactly one rider won, and it matches the database' : '   ❌ FAIL — more than one rider was told they won, or the database disagrees');
    if (distinctRiders < PHONES) console.log(`   (note: only ${distinctRiders} distinct riders exist, so phones share rider accounts)`);
    return pass;
  }
}

async function main() {
  console.log(`Rider load test against ${BASE}`);
  const riders = await prisma.rider.findMany({ where: { status: 'Active' }, select: { id: true, name: true } });
  if (riders.length === 0) throw new Error('No Active riders found in the database.');
  console.log(`Using ${riders.length} active rider account(s): ${riders.map((r) => r.name).join(', ')}`);
  const riderIds = riders.map((r) => r.id);

  // The unclaimed TEST order keeps the pool non-empty, so an empty pool means a real failure
  const testOrder = await createTestOrder();
  let tally: Record<string, number>;
  let racePass: boolean;
  try {
    tally = await pollingTest(riderIds);
    racePass = await acceptRaceTest(riderIds, testOrder);
  } finally {
    await prisma.deliveryOrder.delete({ where: { id: testOrder.id } }).catch(() => {});
    console.log('   Test order deleted.');
  }

  const empties = tally['EMPTY POOL'] || 0;
  console.log('\n──────── Summary ────────');
  console.log(empties === 0 ? '✅ Pool never came back empty' : `❌ Pool came back empty ${empties} time(s)`);
  console.log(racePass ? '✅ Accept race safe' : '❌ Accept race NOT safe');
}

main()
  .catch((err) => {
    console.error('Load test failed to run:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
