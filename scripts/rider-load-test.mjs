/**
 * Rider pool load test — simulates many rider phones against the live site
 * without needing real riders online. Needs only Node and internet access
 * (no database connection, no npm packages).
 *
 *   node scripts/rider-load-test.mjs
 *
 * Options (environment variables):
 *   LOAD_TEST_URL  site to test          (default https://go-choww-operations.vercel.app)
 *   PHONES         simulated phones      (default 10)
 *   SECONDS        polling test length   (default 30)
 *
 * Before running, create an unclaimed order whose orderId starts with "LOADTEST-"
 * (paymentStatus 'pending' keeps it out of revenue). It keeps the pool non-empty,
 * so an empty pool means a real failure, and every phone races to Accept it.
 * Delete it afterwards.
 */
const BASE = (process.env.LOAD_TEST_URL || 'https://go-choww-operations.vercel.app').replace(/\/$/, '');
const PHONES = Number(process.env.PHONES || 10);
const SECONDS = Number(process.env.SECONDS || 30);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const percentile = (values, p) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

let testOrder = null;

async function pollOnce(riderId) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/rider/orders?_t=${Date.now()}`, {
      headers: { 'x-rider-id': riderId },
      cache: 'no-store',
    });
    const ms = Date.now() - started;
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      const pool = data.available || [];
      if (!testOrder) testOrder = pool.find((o) => String(o.orderId).startsWith('LOADTEST-')) || null;
      return { result: pool.length === 0 ? 'EMPTY POOL' : 'OK', ms };
    }
    if (res.status === 503) return { result: 'BUSY (503, phone keeps list)', ms };
    return { result: `ERROR ${res.status}`, ms };
  } catch {
    return { result: 'NETWORK FAILURE', ms: Date.now() - started };
  }
}

async function pollingTest(riderIds) {
  console.log(`\n① ${PHONES} phones polling the pool for ${SECONDS}s (plus a sync every 15s each)...`);
  const tally = {};
  const latencies = [];
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

async function acceptRaceTest(riderIds) {
  console.log(`\n② ${PHONES} phones tap Accept on the same TEST order at the same moment...`);
  if (!testOrder) {
    console.log('   ⚠️  No LOADTEST- order found in the pool — skipping this part.');
    return null;
  }
  const results = await Promise.all(
    Array.from({ length: PHONES }, async (_, i) => {
      const riderId = riderIds[i % riderIds.length];
      const res = await fetch(`${BASE}/api/rider/orders`, {
        method: 'POST',
        headers: { 'x-rider-id': riderId, 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: testOrder.id, action: 'claim' }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      return { riderId, accepted: Boolean(data.success), status: res?.status ?? 0 };
    })
  );

  const winners = new Set(results.filter((r) => r.accepted).map((r) => r.riderId));
  console.log(
    `   Told "accepted": ${results.filter((r) => r.accepted).length}   Told "someone else took it": ${results.filter((r) => r.status === 409).length}   Other: ${results.filter((r) => !r.accepted && r.status !== 409).length}`
  );
  // Phones share rider accounts when there are fewer riders than phones, so every
  // phone of the single winning rider is legitimately told "accepted".
  const pass = winners.size === 1;
  console.log(pass ? '   ✅ PASS — exactly one rider won' : `   ❌ FAIL — ${winners.size} different riders were told they won`);
  return pass;
}

async function main() {
  console.log(`Rider load test against ${BASE}`);
  const res = await fetch(`${BASE}/api/riders`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  const riders = (data.riders || []).filter((r) => (r.status || 'Active') === 'Active');
  if (riders.length === 0) throw new Error(`Could not load active riders from ${BASE}/api/riders (HTTP ${res.status}).`);
  console.log(`Using ${riders.length} active rider account(s): ${riders.map((r) => r.name).join(', ')}`);
  const riderIds = riders.map((r) => r.id);

  const tally = await pollingTest(riderIds);
  const racePass = await acceptRaceTest(riderIds);

  const empties = tally['EMPTY POOL'] || 0;
  console.log('\n──────── Summary ────────');
  console.log(empties === 0 ? '✅ Pool never came back empty' : `❌ Pool came back empty ${empties} time(s)`);
  if (racePass !== null) console.log(racePass ? '✅ Accept race safe' : '❌ Accept race NOT safe');
}

main().catch((err) => {
  console.error('Load test failed to run:', err?.message || err);
  process.exitCode = 1;
});
