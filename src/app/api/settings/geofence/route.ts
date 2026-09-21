import { NextRequest, NextResponse } from 'next/server';
import {
  getGeofenceSettings,
  saveGeofenceSettings,
  getAllCafeterias,
  addOrUpdateCafeteria,
  deleteCafeteria,
  DEFAULT_GEOFENCE_SETTINGS,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * GET /api/settings/geofence
 * Retrieves current geofence configuration, configured coordinates, and auto-discovered cafeterias
 */
export async function GET() {
  try {
    const settings = await getGeofenceSettings();
    const allCafeterias = await getAllCafeterias();
    return NextResponse.json({
      success: true,
      settings,
      allCafeterias,
    });
  } catch (error: any) {
    console.error('[GET /api/settings/geofence error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch geofence settings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settings/geofence
 * Updates geofence radius, active toggle, and cafeteria coordinate list
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.action === 'reset_defaults') {
      const reset = await saveGeofenceSettings(DEFAULT_GEOFENCE_SETTINGS);
      const allCafeterias = await getAllCafeterias();
      return NextResponse.json({
        success: true,
        settings: reset,
        allCafeterias,
        message: 'Restored default cafeteria coordinates and 200m radius',
      });
    }

    if (body.action === 'add_cafeteria' && body.cafeteria) {
      const updated = await addOrUpdateCafeteria(body.cafeteria);
      const allCafeterias = await getAllCafeterias();
      return NextResponse.json({
        success: true,
        settings: updated,
        allCafeterias,
        message: `Cafeteria "${body.cafeteria.name}" saved successfully!`,
      });
    }

    if (body.action === 'delete_cafeteria' && body.idOrName) {
      const updated = await deleteCafeteria(body.idOrName);
      const allCafeterias = await getAllCafeterias();
      return NextResponse.json({
        success: true,
        settings: updated,
        allCafeterias,
        message: 'Cafeteria removed.',
      });
    }

    const radiusMeters = body.radiusMeters !== undefined
      ? Math.max(20, Math.min(2000, Number(body.radiusMeters) || 200))
      : undefined;

    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : undefined;
    const cafeterias = Array.isArray(body.cafeterias) ? body.cafeterias : undefined;

    const updated = await saveGeofenceSettings({
      ...(radiusMeters !== undefined && { radiusMeters }),
      ...(enabled !== undefined && { enabled }),
      ...(cafeterias !== undefined && { cafeterias }),
    });
    const allCafeterias = await getAllCafeterias();

    return NextResponse.json({
      success: true,
      settings: updated,
      allCafeterias,
      message: 'Geofence and cafeteria coordinate settings saved successfully',
    });
  } catch (error: any) {
    console.error('[POST /api/settings/geofence error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save geofence settings' },
      { status: 500 }
    );
  }
}
