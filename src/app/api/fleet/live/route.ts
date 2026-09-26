import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGeofenceSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const FINISHED_STATUSES = ['Delivered', 'Completed', 'delivered', 'completed', 'Cancelled', 'cancelled', 'Canceled', 'canceled'];

export async function GET() {
  try {
    // 1. Fetch geofence configuration
    const geofenceSettings = await getGeofenceSettings();

    // 2. Fetch all active riders with their latest telemetry
    const riders = await prisma.rider.findMany({
      where: {
        status: { in: ['Active', 'active'] },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        isOnline: true,
        lastLat: true,
        lastLng: true,
        lastHeading: true,
        lastSpeed: true,
        lastLocationAt: true,
        orders: {
          // Same rule as the rider app: anything assigned and not finished is still with the rider
          where: {
            orderStatus: { notIn: FINISHED_STATUSES },
          },
          select: {
            id: true,
            orderId: true,
            customerName: true,
            cafeteriaName: true,
            deliveryAddress: true,
            deliveryType: true,
            orderStatus: true,
            deliveryFee: true,
            totalAmountPaid: true,
            time: true,
            createdAt: true,
            customerPhone: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const now = Date.now();

    // 3. Enrich rider telemetry with movement status and elapsed time
    const enrichedRiders = riders.map((r) => {
      let locationFreshness: 'live' | 'idle' | 'stale' | 'none' = 'none';
      let minutesSinceUpdate: number | null = null;

      if (r.lastLocationAt) {
        const diffMs = now - new Date(r.lastLocationAt).getTime();
        minutesSinceUpdate = Math.floor(diffMs / 60000);

        if (diffMs <= 2 * 60 * 1000) {
          locationFreshness = 'live'; // Updated <2 minutes ago
        } else if (diffMs <= 10 * 60 * 1000) {
          locationFreshness = 'idle'; // Updated 2-10 minutes ago
        } else {
          locationFreshness = 'stale'; // >10 minutes ago
        }
      }

      return {
        id: r.id,
        name: r.name,
        phone: r.phone || '',
        isOnline: r.isOnline,
        status: r.status,
        lastLat: r.lastLat,
        lastLng: r.lastLng,
        lastHeading: r.lastHeading,
        lastSpeed: r.lastSpeed,
        lastLocationAt: r.lastLocationAt,
        minutesSinceUpdate,
        locationFreshness,
        activeOrdersCount: r.orders.length,
        activeOrders: r.orders,
      };
    });

    // 4. Summary metrics
    const totalRiders = enrichedRiders.length;
    const onlineRiders = enrichedRiders.filter((r) => r.isOnline).length;
    const liveMovingRiders = enrichedRiders.filter(
      (r) => r.isOnline && r.locationFreshness === 'live'
    ).length;
    const idleRiders = enrichedRiders.filter(
      (r) => r.isOnline && r.locationFreshness === 'idle'
    ).length;
    const freeRiders = enrichedRiders.filter((r) => r.isOnline && r.activeOrdersCount === 0).length;
    const totalOrdersInTransit = enrichedRiders.reduce(
      (acc, r) => acc + r.activeOrdersCount,
      0
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalRiders,
        onlineRiders,
        liveMovingRiders,
        idleRiders,
        freeRiders,
        totalOrdersInTransit,
      },
      cafeterias: geofenceSettings.cafeterias,
      geofenceRadiusMeters: geofenceSettings.radiusMeters || 200,
      riders: enrichedRiders,
    });
  } catch (err: any) {
    console.error('[GET /api/fleet/live] Error fetching fleet telemetry:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch live fleet' },
      { status: 500 }
    );
  }
}
