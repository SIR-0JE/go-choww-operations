import { scrypt, randomBytes, timingSafeEqual, createHash } from 'crypto';
import { prisma } from './prisma';

const AUTH_KEY = 'admin_auth';

/**
 * SHA-256 of the one-time setup code (given to the owner in person, never stored in plain text).
 * It only works while no password exists; once one is chosen it is permanently useless.
 */
const SETUP_CODE_HASH = 'a244db05b8abba88844988c808ed74a6ac4ba56e154223ec86e89bb4787a4b5a';

const hashSetupCode = (code: string) => createHash('sha256').update(code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()).digest('hex');

export function setupCodeValid(code: string): boolean {
  const a = Buffer.from(hashSetupCode(code || ''), 'hex');
  const b = Buffer.from(SETUP_CODE_HASH, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key))));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return salt.toString('hex') + ':' + key.toString('hex');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function getAdminPasswordHash(): Promise<string | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: AUTH_KEY } });
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value).hash || null;
  } catch {
    return null;
  }
}

/** Creates the password once. Returns false if one already exists (so setup can't be repeated). */
export async function createAdminPassword(password: string): Promise<boolean> {
  const value = JSON.stringify({ hash: await hashPassword(password), createdAt: new Date().toISOString() });
  try {
    await prisma.systemSetting.create({ data: { key: AUTH_KEY, value } });
    return true;
  } catch {
    return false; // unique key already taken
  }
}

// Slow down guessing: 5 wrong tries per address, then locked for 15 minutes (per server instance)
const attempts = new Map<string, { n: number; until: number }>();
const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;

export function clientKey(headers: Headers): string {
  return (headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
}
export function lockedFor(key: string): number {
  const a = attempts.get(key);
  return a && a.n >= MAX_TRIES && a.until > Date.now() ? Math.ceil((a.until - Date.now()) / 60000) : 0;
}
export function recordFailure(key: string) {
  const a = attempts.get(key);
  const n = a && a.until > Date.now() ? a.n + 1 : 1;
  attempts.set(key, { n, until: Date.now() + LOCK_MS });
}
export function clearFailures(key: string) {
  attempts.delete(key);
}
