/**
 * Rider collision test — fires conflicting rider actions at the same instant on the
 * live site. Needs only Node and internet access.
 *
 *   node scripts/rider-collision-test.mjs
 *
 * Test orders (orderId "COL-<scenario>-<nn>") must be created beforehand in the
 * states each scenario expects, with the rider roles below, and deleted afterwards.
 * The script prints what every tap was told; the final database state is checked
 * separately against those answers.
 *
 * Rider roles (by name, override with env): OWNER, RIVAL_1, RIVAL_2, CAP_RIDER.
 */
const BASE = (process.env.LOAD_TEST_URL || 'https://go-choww-operations.vercel.app').replace(/\/$/, '');
const TRIALS = Number(process.env.TRIALS || 10);
const ROLES = {
  owner: process.env.OWNER || 'NIYI',
  rival1: process.env.RIVAL_1 || 'MR SODIQ',
  rival2: process.env.RIVAL_2 || 'MR QUDUS',
  capRider: process.env.CAP_RIDER || 'MR ISHOLA',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const id = (s, n) => `COL-${s}-${String(n).padStart(2, '0')}`;

let R = {};
async function act(riderId, orderId, action, extra = {}) {
  try {
    const res = await fetch(`${BASE}/api/rider/orders`, {
      method: 'POST',
      headers: { 'x-rider-id': riderId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, action, ...extra }),
    });
    const d = await res.json().catch(() => ({}));
    return d.success ? 'ok' : String(res.status);
  } catch {
    return 'net';
  }
}
async function adminCancel(orderId) {
  try {
    const res = await fetch(`${BASE}/api/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderStatus: 'Cancelled' }),
    });
    return res.ok ? 'ok' : String(res.status);
  } catch {
    return 'net';
  }
}

const scenarios = [
  ['1', 'Two riders accept the same order', async (o) => {
    const [a, b] = await Promise.all([act(R.rival1, o, 'claim'), act(R.rival2, o, 'claim')]);
    // winner finishes the order so the 5-order limit doesn't interfere with later trials
    const winner = a === 'ok' ? R.rival1 : b === 'ok' ? R.rival2 : null;
    if (winner) { await act(winner, o, 'pickup'); await act(winner, o, 'deliver'); }
    return `${ROLES.rival1}:${a} ${ROLES.rival2}:${b}`;
  }],
  ['7', 'Admin cancels as a rider accepts', async (o) => {
    const [c, x] = await Promise.all([act(R.capRider, o, 'claim'), adminCancel(o)]);
    return `accept:${c} cancel:${x}`;
  }],
  ['3', 'Owner drops and picks up at once', async (o) => {
    const [d, p] = await Promise.all([act(R.owner, o, 'drop_order'), act(R.owner, o, 'pickup')]);
    return `drop:${d} pickup:${p}`;
  }],
  ['4', 'Requester cancels handover as owner accepts it', async (o) => {
    const [a, c] = await Promise.all([act(R.owner, o, 'accept_handover'), act(R.rival1, o, 'cancel_handover')]);
    return `release:${a} cancel:${c}`;
  }],
  ['5', 'Owner releases handover as they pick up', async (o) => {
    const [a, p] = await Promise.all([act(R.owner, o, 'accept_handover'), act(R.owner, o, 'pickup')]);
    return `release:${a} pickup:${p}`;
  }],
  ['6', 'Owner transfers as they tap delivered', async (o) => {
    const [t, d] = await Promise.all([act(R.owner, o, 'transfer', { targetRiderId: R.rival2 }), act(R.owner, o, 'deliver')]);
    // if the order ended up with the recipient, they finish it so their limit stays free
    if (t === 'ok') { await act(R.rival2, o, 'pickup'); await act(R.rival2, o, 'deliver'); }
    return `transfer:${t} deliver:${d}`;
  }],
  ['8', "A stranger cancels someone else's handover request", async (o) => {
    return `stranger-cancel:${await act(R.rival2, o, 'cancel_handover')}`;
  }],
];

async function main() {
  console.log(`Rider collision test against ${BASE}`);
  const res = await fetch(`${BASE}/api/riders`, { cache: 'no-store' });
  const riders = ((await res.json().catch(() => ({}))).riders || []);
  for (const [role, name] of Object.entries(ROLES)) {
    const r = riders.find((x) => x.name === name);
    if (!r) throw new Error(`Rider "${name}" (${role}) not found`);
    R[role] = r.id;
  }

  for (const [s, name, run] of scenarios) {
    console.log(`\n${s}. ${name}`);
    for (let n = 1; n <= TRIALS; n++) {
      console.log(`   ${id(s, n)}  ${await run(id(s, n))}`);
      await sleep(250);
    }
  }

  console.log(`\n2. ${ROLES.capRider} (at 4 orders) taps Accept on 6 orders at once`);
  const caps = await Promise.all(Array.from({ length: 6 }, (_, i) => act(R.capRider, id('2', i + 1), 'claim')));
  console.log(`   accepted ${caps.filter((c) => c === 'ok').length}, refused ${caps.filter((c) => c !== 'ok').length}  (${caps.join(' ')})`);
  console.log('\nDone — send this output back so the database state can be checked against it.');
}

main().catch((err) => {
  console.error('Collision test failed to run:', err?.message || err);
  process.exitCode = 1;
});
