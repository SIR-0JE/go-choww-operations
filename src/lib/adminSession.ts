/**
 * Admin sign-in session: a signed cookie, checked in middleware (edge) and in routes.
 * Uses only Web Crypto so it runs in both places.
 *
 * The signing key is ADMIN_SESSION_SECRET if set, otherwise the server's database
 * connection string (secret, and only on the server). With neither, nobody can sign in.
 */

export const ADMIN_COOKIE = 'admin_session';
export const ADMIN_SESSION_DAYS = 30;

const enc = new TextEncoder();

function keyMaterial(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.DATABASE_URL || process.env.DIRECT_URL || '';
}

async function sign(data: string): Promise<string> {
  const material = keyMaterial();
  if (!material) return '';
  const key = await crypto.subtle.importKey('raw', enc.encode(material), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const exp = String(Date.now() + ADMIN_SESSION_DAYS * 24 * 60 * 60 * 1000);
  const sig = await sign('admin:' + exp);
  return sig ? exp + '.' + sig : '';
}

export async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expected = await sign('admin:' + exp);
  return !!expected && sameString(sig, expected);
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: ADMIN_SESSION_DAYS * 24 * 60 * 60,
};
