import { NextResponse } from 'next/server';
import { getSprintCalendar } from '@/lib/sprint';

export const dynamic = 'force-dynamic';

// GET /api/sprint/calendar -> every day of the sprint with its orders and the target it had that morning
export async function GET() {
  try {
    const calendar = await getSprintCalendar();
    return NextResponse.json({ success: true, calendar }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[GET /api/sprint/calendar]', err);
    return NextResponse.json({ success: false, error: 'Could not load the calendar.' }, { status: 503 });
  }
}
