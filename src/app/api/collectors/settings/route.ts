import { NextRequest, NextResponse } from 'next/server';
import { attachCollectors, isCollectorModeActive, saveCollectorSettings } from '@/lib/collectors';

export const dynamic = 'force-dynamic';

/** PUT /api/collectors/settings: switch collector mode, its schedule, and the rider limits */
export async function PUT(request: NextRequest) {
  try {
    const settings = await saveCollectorSettings(await request.json());
    // Apply straight away rather than waiting for the next sync
    const applied = await attachCollectors().catch(() => null);
    return NextResponse.json({ success: true, settings, modeActive: isCollectorModeActive(settings), applied });
  } catch (err) {
    console.error('[PUT /api/collectors/settings]', err);
    return NextResponse.json({ success: false, error: 'Could not save settings.' }, { status: 503 });
  }
}
