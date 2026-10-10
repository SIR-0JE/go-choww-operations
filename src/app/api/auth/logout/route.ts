import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/adminSession';

export const dynamic = 'force-dynamic';

/** POST /api/auth/logout */
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
