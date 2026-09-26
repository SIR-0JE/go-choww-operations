import { NextResponse } from 'next/server';
import { getDispatchStatus } from '@/lib/dispatchStatus';

export const dynamic = 'force-dynamic';

/** GET /api/dispatch/status — orders waiting for a rider and riders online. */
export async function GET() {
  try {
    const status = await getDispatchStatus();
    return NextResponse.json({ success: true, ...status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('[dispatch/status] Error:', error);
    return NextResponse.json({ success: false, error: 'Server is busy — retrying.' }, { status: 503 });
  }
}
