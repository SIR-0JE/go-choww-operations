import { NextRequest, NextResponse } from 'next/server';
import { saveRunnerSettings } from '@/lib/runners';

export const dynamic = 'force-dynamic';

/** PUT /api/runners/settings { alertMinutes }: how long an order may wait to be packed before it's flagged */
export async function PUT(request: NextRequest) {
  try {
    const settings = await saveRunnerSettings(await request.json());
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    console.error('[PUT /api/runners/settings]', err);
    return NextResponse.json({ success: false, error: 'Could not save.' }, { status: 503 });
  }
}
