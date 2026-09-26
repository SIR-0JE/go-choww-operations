/**
 * Rider day simulation — simulated riders work a replayed day of orders on the live site.
 * Needs only Node and internet access (no database connection, no npm packages).
 *
 *   node scripts/rider-day-simulation.mjs
 *
 * Orders are released separately (by a database job) with orderIds starting "SIM-".
 * Each simulated rider behaves like the real app: polls the pool every 3.5s, accepts
 * up to 5 orders (preferring one cafeteria), picks them up together, then delivers
 * them one by one. Real-world delays are compressed by SPEEDUP.
 *
 * Options (environment variables):
 *   LOAD_TEST_URL  site to test                       (default https://go-choww-operations.vercel.app)
 *   RIDERS         number of simulated riders         (default 3)
 *   EXPECTED       number of SIM orders in the replay (default 127)
 *   SPEEDUP        time compression                   (default 12)
 */
const BASE = (process.env.LOAD_TEST_URL || 'https://go-choww-operations.vercel.app').replace(/\/$/, '');
const RIDER_COUNT = Number(process.env.RIDERS || 3);
const EXPECTED = Number(process.env.EXPECTED || 127);
const SPEEDUP = Number(process.env.SPEEDUP || 12);
const POLL_MS = 3500;
const MAX_ACTIVE = 5;
const HARD_TIMEOUT_MS = 100 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const realMinutes = (min, max) => (rand(min, max) * 60 * 1000) / SPEEDUP;
const isSim = (o) => String(o.orderId || '').startsWith('SIM-');
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const clock = () => new Date().toLocaleTimeString();

// ── Shared measurements ──────────────────────────────────────────────────────
const stats = {
  polls: {},            // outcome -> count
  pollMs: [],
  actions: {},          // "claim OK" / "claim 409" / "pickup 503" ...
  firstSeenAgeMs: [],   // order age when it first appeared on any phone
  acceptAgeMs: [],      // order age when a rider accepted it
  flickers: 0,          // order vanished from a successful pool response, then came back
  flickerOrders: new Set(),
};
const skewSamples = []; // serverTime - localTime
const firstSeen = new Map(); // orderId -> true
const createdAt = new Map(); // orderId -> server ms
const claimedBy = new Map(); // order uuid -> rider name (from successful claims)
const delivered = new Map(); // order uuid -> rider name
let lastNewOrderAt = 0;

const serverNow = () => Date.now() + (skewSamples.length ? pct(skewSamples, 50) : 0);
const bump = (obj, key) => (obj[key] = (obj[key] || 0) + 1);

async function call(method, path, riderId, body) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'x-rider-id': riderId, ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const ms = Date.now() - started;
    const date = res.headers.get('date');
    if (date) skewSamples.push(new Date(date).getTime() + 500 - (started + ms / 2));
    if (skewSamples.length > 200) skewSamples.shift();
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data, ms };
  } catch {
    return { status: 0, data: {}, ms: Date.now() - started };
  }
}

// ── One simulated rider ──────────────────────────────────────────────────────
async function runRider(rider, isDone) {
  const claimed = new Map();   // uuid -> { orderId, caf }
  const inTransit = new Map(); // uuid -> { orderId, deliverAt }
  let pickupAt = 0;
  let lastPool = new Set();    // SIM orderIds seen in last successful pool
  const missing = new Set();   // orderIds that vanished while still expected

  await sleep(rand(0, POLL_MS));
  while (!isDone()) {
    // 1. Poll the pool like the phone does
    const r = await call('GET', `/api/rider/orders?_t=${Date.now()}`, rider.id);
    stats.pollMs.push(r.ms);
    let pool = [];
    if (r.status === 200 && r.data.success) {
      bump(stats.polls, 'OK');
      pool = (r.data.available || []).filter(isSim);
      const now = serverNow();
      const current = new Set(pool.map((o) => o.orderId));
      for (const o of pool) {
        if (!firstSeen.has(o.orderId)) {
          firstSeen.set(o.orderId, true);
          const c = new Date(o.createdAt).getTime();
          createdAt.set(o.orderId, c);
          stats.firstSeenAgeMs.push(Math.max(0, now - c));
          lastNewOrderAt = Date.now();
        }
        if (missing.has(o.orderId)) {
          stats.flickers++;
          stats.flickerOrders.add(o.orderId);
          missing.delete(o.orderId);
        }
      }
      // An order that left the pool is only "missing" if nobody has picked it up yet
      for (const id of lastPool) {
        if (!current.has(id)) missing.add(id);
      }
      for (const a of r.data.active || []) missing.delete(a.orderId);
      lastPool = current;
    } else {
      bump(stats.polls, r.status === 503 ? 'BUSY 503 (phone keeps list)' : r.status === 0 ? 'NO RESPONSE' : `ERROR ${r.status}`);
    }

    const now = Date.now();

    // 2. Deliver orders whose ride time is up
    for (const [uuid, t] of inTransit) {
      if (now < t.deliverAt) continue;
      const d = await call('POST', '/api/rider/orders', rider.id, { orderId: uuid, action: 'deliver' });
      bump(stats.actions, `deliver ${d.data.success ? 'OK' : d.status}`);
      if (d.data.success) {
        inTransit.delete(uuid);
        delivered.set(uuid, rider.name);
        missing.delete(t.orderId);
      }
    }

    // 3. Pick up everything accepted once the rider reaches the cafeteria
    if (claimed.size > 0 && inTransit.size === 0 && now >= pickupAt) {
      let deliverAt = now;
      for (const [uuid, c] of claimed) {
        const p = await call('POST', '/api/rider/orders', rider.id, { orderId: uuid, action: 'pickup' });
        bump(stats.actions, `pickup ${p.data.success ? 'OK' : p.status}`);
        if (p.data.success) {
          deliverAt += realMinutes(3, 7); // deliveries happen one after another
          inTransit.set(uuid, { orderId: c.orderId, deliverAt });
          claimed.delete(uuid);
          missing.delete(c.orderId);
        }
      }
    }

    // 4. Accept new orders while not out delivering (max 5, same cafeteria as current batch)
    if (inTransit.size === 0 && claimed.size < MAX_ACTIVE && pool.length > 0) {
      const batchCaf = claimed.size ? [...claimed.values()][0].caf : null;
      const open = pool
        .filter((o) => !o.riderId && !claimedBy.has(o.id))
        .filter((o) => !batchCaf || o.cafeteriaName === batchCaf)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      for (const o of open.slice(0, Math.min(2, MAX_ACTIVE - claimed.size))) {
        const c = await call('POST', '/api/rider/orders', rider.id, { orderId: o.id, action: 'claim' });
        bump(stats.actions, `accept ${c.data.success ? 'OK' : c.status === 409 ? '409 (someone else took it)' : c.status}`);
        if (c.data.success) {
          if (claimedBy.has(o.id) && claimedBy.get(o.id) !== rider.name) bump(stats.actions, 'DOUBLE ACCEPT');
          claimedBy.set(o.id, rider.name);
          if (claimed.size === 0) pickupAt = Date.now() + realMinutes(4, 9); // walk/wait at cafeteria
          claimed.set(o.id, { orderId: o.orderId, caf: o.cafeteriaName });
          const created = createdAt.get(o.orderId);
          if (created) stats.acceptAgeMs.push(Math.max(0, serverNow() - created));
        }
      }
    }

    await sleep(POLL_MS);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Rider day simulation against ${BASE}`);
  const res = await fetch(`${BASE}/api/riders`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  const riders = (data.riders || []).filter((r) => (r.status || 'Active') === 'Active').slice(0, RIDER_COUNT);
  if (riders.length === 0) throw new Error(`Could not load riders (HTTP ${res.status}).`);
  console.log(`Simulated riders: ${riders.map((r) => r.name).join(', ')}  |  expecting ${EXPECTED} SIM orders at ${SPEEDUP}x speed`);
  console.log('Waiting for the first SIM order to arrive... (keep this window open and the laptop awake)\n');

  const started = Date.now();
  const allAcceptedDelivered = () => [...claimedBy.keys()].every((k) => delivered.has(k));
  const isDone = () =>
    delivered.size >= EXPECTED ||
    Date.now() - started > HARD_TIMEOUT_MS ||
    // nothing new for 10 minutes and every accepted order delivered
    (lastNewOrderAt > 0 && Date.now() - lastNewOrderAt > 10 * 60 * 1000 && allAcceptedDelivered());

  const progress = setInterval(() => {
    const busy = Object.entries(stats.polls).filter(([k]) => k !== 'OK').reduce((a, [, v]) => a + v, 0);
    console.log(
      `[${clock()}] arrived ${firstSeen.size}/${EXPECTED}  accepted ${claimedBy.size}  delivered ${delivered.size}  ` +
        `| polls OK ${stats.polls.OK || 0}, not OK ${busy}  | vanished-then-returned ${stats.flickers}`
    );
  }, 30000);

  await Promise.all(riders.map((r) => runRider(r, isDone)));
  clearInterval(progress);

  // ── Report ─────────────────────────────────────────────────────────────────
  const totalPolls = Object.values(stats.polls).reduce((a, b) => a + b, 0);
  console.log('\n════════════ SIMULATION REPORT ════════════');
  console.log(`Duration: ${((Date.now() - started) / 60000).toFixed(1)} min   Riders: ${riders.length}`);
  console.log(`Orders   arrived on phones: ${firstSeen.size}/${EXPECTED}   accepted: ${claimedBy.size}   delivered: ${delivered.size}`);
  console.log('\nPool refreshes:');
  for (const [k, v] of Object.entries(stats.polls)) console.log(`   ${k.padEnd(30)} ${v} / ${totalPolls}`);
  console.log(`   Response time: typical ${pct(stats.pollMs, 50)}ms, slowest 5% over ${pct(stats.pollMs, 95)}ms`);
  console.log('\nRider actions:');
  for (const [k, v] of Object.entries(stats.actions).sort()) console.log(`   ${k.padEnd(30)} ${v}`);
  console.log('\nSpeed (real seconds, at simulation speed):');
  console.log(`   New order → visible on a phone: typical ${secs(pct(stats.firstSeenAgeMs, 50))}, worst ${secs(pct(stats.firstSeenAgeMs, 100))}`);
  console.log(`   New order → accepted by a rider: typical ${secs(pct(stats.acceptAgeMs, 50))}, worst ${secs(pct(stats.acceptAgeMs, 100))}`);
  const perRider = {};
  for (const name of delivered.values()) perRider[name] = (perRider[name] || 0) + 1;
  console.log('\nDeliveries per rider:', JSON.stringify(perRider));

  const stuck = [...claimedBy.keys()].filter((k) => !delivered.has(k)).length;
  const problems = [];
  if (firstSeen.size < EXPECTED) problems.push(`${EXPECTED - firstSeen.size} order(s) never reached a phone`);
  if (stats.flickers > 0) problems.push(`orders vanished from the pool and came back ${stats.flickers} time(s) (${stats.flickerOrders.size} orders)`);
  if (stats.actions['DOUBLE ACCEPT']) problems.push(`${stats.actions['DOUBLE ACCEPT']} order(s) accepted by two riders`);
  if (stuck > 0) problems.push(`${stuck} accepted order(s) not delivered`);
  console.log('\n──────── Verdict ────────');
  if (problems.length === 0) console.log('✅ No orders lost, no vanishing pool, no double accepts, everything delivered');
  else problems.forEach((p) => console.log(`❌ ${p}`));
}

main().catch((err) => {
  console.error('Simulation failed to run:', err?.message || err);
  process.exitCode = 1;
});
