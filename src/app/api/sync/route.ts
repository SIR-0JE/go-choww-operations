import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    return NextResponse.json({
      success: true,
      message: 'Ready for CSV sheet upload via the Raw Data page.',
      syncedCount: 0,
    });
  } catch (error: any) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to sync data' },
      { status: 500 }
    );
  }
}
