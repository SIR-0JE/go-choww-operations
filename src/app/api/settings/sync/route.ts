import { NextRequest, NextResponse } from 'next/server';
import {
  getSyncSettings,
  saveSyncSettings,
  getOperationalStatus,
  SyncScheduleSettings,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getSyncSettings();
    const status = getOperationalStatus(settings);

    return NextResponse.json({
      success: true,
      settings,
      status,
    });
  } catch (error: any) {
    console.error('[GET /api/settings/sync error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const mode = body.mode;
    if (mode && !['scheduled', 'always', 'paused'].includes(mode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mode. Must be scheduled, always, or paused.' },
        { status: 400 }
      );
    }

    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (body.startTime && !timeRegex.test(body.startTime)) {
      return NextResponse.json(
        { success: false, error: 'Invalid start time format. Use HH:mm (e.g. 08:00).' },
        { status: 400 }
      );
    }

    if (body.endTime && !timeRegex.test(body.endTime)) {
      return NextResponse.json(
        { success: false, error: 'Invalid end time format. Use HH:mm (e.g. 22:00).' },
        { status: 400 }
      );
    }

    let interval = body.intervalSeconds;
    if (interval !== undefined) {
      interval = Math.max(5, Math.min(300, parseInt(String(interval), 10) || 15));
    }

    let days = body.daysOfWeek;
    if (days !== undefined && !Array.isArray(days)) {
      return NextResponse.json(
        { success: false, error: 'daysOfWeek must be an array of numbers 0-6.' },
        { status: 400 }
      );
    }

    const updates: Partial<SyncScheduleSettings> = {};
    if (mode) updates.mode = mode;
    if (body.startTime) updates.startTime = body.startTime;
    if (body.endTime) updates.endTime = body.endTime;
    if (interval !== undefined) updates.intervalSeconds = interval;
    if (days !== undefined) updates.daysOfWeek = days;
    if (body.timezone) updates.timezone = body.timezone;

    const saved = await saveSyncSettings(updates);
    const status = getOperationalStatus(saved);

    return NextResponse.json({
      success: true,
      message: 'Auto-sync operating schedule saved successfully!',
      settings: saved,
      status,
    });
  } catch (error: any) {
    console.error('[POST /api/settings/sync error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
