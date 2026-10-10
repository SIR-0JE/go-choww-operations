import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, verifySessionToken } from '@/lib/adminSession';
import { getAdminPasswordHash } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

/** GET /api/auth/status: is a password set up yet, and is this browser signed in? */
export async function GET(request: NextRequest) {
  try {
    const [hash, authenticated] = await Promise.all([
      getAdminPasswordHash(),
      verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value),
    ]);
    return NextResponse.json({ success: true, configured: !!hash, authenticated }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ success: false, error: 'Server is busy. Try again.' }, { status: 503 });
  }
}
