import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { riderId, lat, lng, heading, speed } = body;

    if (!riderId) {
      return NextResponse.json(
        { success: false, error: 'riderId is required' },
        { status: 400 }
      );
    }

    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return NextResponse.json(
        { success: false, error: 'Valid numerical lat and lng are required' },
        { status: 400 }
      );
    }

    // Update rider's telemetry record
    const updatedRider = await prisma.rider.update({
      where: { id: riderId },
      data: {
        lastLat: lat,
        lastLng: lng,
        lastHeading: typeof heading === 'number' && !isNaN(heading) ? heading : null,
        lastSpeed: typeof speed === 'number' && !isNaN(speed) ? speed : null,
        lastLocationAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        isOnline: true,
        lastLat: true,
        lastLng: true,
        lastLocationAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      rider: updatedRider,
    });
  } catch (err: any) {
    console.error('[POST /api/rider/location] Telemetry ingestion error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to update location' },
      { status: 500 }
    );
  }
}
