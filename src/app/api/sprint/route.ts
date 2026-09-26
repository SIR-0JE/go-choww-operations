import { NextRequest, NextResponse } from 'next/server';
import { getSprintStatus, saveSprintConfig } from '@/lib/sprint';

export const dynamic = 'force-dynamic';

// GET  /api/sprint -> goal, progress and today's order target (shared by every page)
// POST /api/sprint { targetAmount?, startDate?, endDate? } -> save the sprint for everyone
export async function GET() {
  try {
    const sprint = await getSprintStatus();
    return NextResponse.json({ success: true, sprint });
  } catch (err) {
    console.error('[GET /api/sprint]', err);
    return NextResponse.json({ success: false, error: 'Could not load the sprint.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    await saveSprintConfig(body);
    const sprint = await getSprintStatus();
    return NextResponse.json({ success: true, sprint });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Could not save the sprint.' }, { status: 400 });
  }
}
