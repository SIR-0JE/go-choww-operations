import { cookies } from 'next/headers';
import { prisma } from './prisma';
import { normalizePhone } from './collectors';
import { sameString, signData } from './adminSession';

/**
 * Runners: stationed at one cafeteria, they pack new orders early and tap Ready.
 * The tap is stored as an order timeline step (OrderEvent kind "runner_ready"), so it
 * shows up everywhere the timeline does, with no new columns on the orders table.
 */

export const RUNNER_COOKIE = 'runner_session';
const RUNNER_SESSION_DAYS = 90;

// ── Sign-in session: a signed cookie (id.expiry.signature), so it can't be forged ──
export async function createRunnerToken(runnerId: string): Promise<string> {
  const exp = String(Date.now() + RUNNER_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const sig = await signData(`runner:${runnerId}:${exp}`);
  return sig ? `${runnerId}.${exp}.${sig}` : '';
}

export async function runnerIdFromToken(token?: string | null): Promise<string | null> {
  if (!token) return null;
  const [id, exp, sig] = token.split('.');
  if (!id || !exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return null;
  const expected = await signData(`runner:${id}:${exp}`);
  return expected && sameString(sig, expected) ? id : null;
}

export const RUNNER_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: RUNNER_SESSION_DAYS * 24 * 60 * 60,
};

/** The signed-in runner (must still be switched on). */
export async function getRunnerFromCookies() {
  const id = await runnerIdFromToken((await cookies()).get(RUNNER_COOKIE)?.value);
  if (!id) return null;
  const runner = await prisma.runner.findUnique({ where: { id } });
  return runner && runner.status === 'Active' ? runner : null;
}

// ── Settings ──
export interface RunnerSettings {
  alertMinutes: number; // an order not packed after this long is flagged on the Dispatch card
}
export const DEFAULT_RUNNER_SETTINGS: RunnerSettings = { alertMinutes: 10 };
const SETTINGS_KEY = 'runner_settings';

export async function getRunnerSettings(): Promise<RunnerSettings> {
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
    return { ...DEFAULT_RUNNER_SETTINGS, ...(row?.value ? JSON.parse(row.value) : {}) };
  } catch {
    return DEFAULT_RUNNER_SETTINGS;
  }
}
export async function saveRunnerSettings(input: Partial<RunnerSettings>): Promise<RunnerSettings> {
  const n = Math.round(Number(input.alertMinutes));
  const next: RunnerSettings = { alertMinutes: Number.isFinite(n) ? Math.min(240, Math.max(1, n)) : (await getRunnerSettings()).alertMinutes };
  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTINGS_KEY, value: JSON.stringify(next) },
  });
  return next;
}

// ── Helpers ──
export const sameCafeteria = (a?: string | null, b?: string | null) =>
  (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

const FINISHED_OR_TAKEN = ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled', 'Canceled', 'canceled', 'In Transit', 'in transit'];

/** Orders still waiting to be packed (never marked Ready by a runner, not yet taken or finished). */
export const toPackWhere = (cafeteria: string | null, since: Date) => ({
  ...(cafeteria ? { cafeteriaName: { equals: cafeteria, mode: 'insensitive' as const } } : {}),
  createdAt: { gte: since },
  orderStatus: { notIn: FINISHED_OR_TAKEN },
  NOT: { gochowStatus: 'Cancelled' },
  events: { none: { kind: 'runner_ready' } },
});

export async function validateRunner(
  data: { name?: string; phone?: string; pin?: string; cafeteria?: string; status?: string },
  selfId?: string
): Promise<string | null> {
  if (data.name !== undefined && !data.name.trim()) return 'Name is required.';
  if (data.cafeteria !== undefined && !data.cafeteria.trim()) return 'Pick the cafeteria.';
  if (data.pin !== undefined && !/^\d{4}$/.test(data.pin)) return 'PIN must be 4 digits.';
  const others = await prisma.runner.findMany({ where: selfId ? { id: { not: selfId } } : {} });
  if (data.phone !== undefined) {
    const p = normalizePhone(data.phone);
    if (p.length < 10) return 'Enter a full phone number.';
    if (others.some((r) => normalizePhone(r.phone) === p)) return 'Another runner already uses this phone number.';
  }
  if (data.cafeteria !== undefined) {
    const owner = others.find((r) => r.status === 'Active' && sameCafeteria(r.cafeteria, data.cafeteria));
    if (owner && (data.status ?? 'Active') === 'Active') return `${data.cafeteria} already has ${owner.name} on duty. Switch them off first.`;
  }
  return null;
}

/** Cafeteria names seen on orders lately, for the pick list. */
export async function knownCafeterias(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    select "cafeteriaName" as name from "DeliveryOrder"
    where "createdAt" > now() - interval '60 days'
    group by 1 order by count(*) desc limit 40`;
  return rows.map((r) => r.name);
}
