import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry, getInMemoryOrders, getInMemoryRiders } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/reconciliation
 * Fetches all unassigned delivery orders (riderId is null) and active riders
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim().toLowerCase() || '';
    const cafeteria = searchParams.get('cafeteria')?.trim() || '';
    const dateParam = searchParams.get('date')?.trim() || ''; // YYYY-MM-DD
    const startDateParam = searchParams.get('startDate')?.trim() || '';
    const endDateParam = searchParams.get('endDate')?.trim() || '';

    let unassignedOrders: any[] = [];
    let riders: any[] = [];

    // Construct date filter
    let dateFilter: any = undefined;
    if (dateParam) {
      const startOfDay = new Date(`${dateParam}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateParam}T23:59:59.999Z`);
      dateFilter = { gte: startOfDay, lte: endOfDay };
    } else if (startDateParam || endDateParam) {
      dateFilter = {};
      if (startDateParam) {
        dateFilter.gte = new Date(`${startDateParam}T00:00:00.000Z`);
      }
      if (endDateParam) {
        dateFilter.lte = new Date(`${endDateParam}T23:59:59.999Z`);
      }
    }

    try {
      const [fetchedOrders, fetchedRiders] = await withDbRetry(async () => {
        return await Promise.all([
          // 1. Fetch unassigned orders from PostgreSQL
          prisma.deliveryOrder.findMany({
            where: {
              riderId: null,
              ...(cafeteria && cafeteria !== 'ALL' ? { cafeteriaName: { contains: cafeteria, mode: 'insensitive' } } : {}),
              ...(dateFilter ? { createdAt: dateFilter } : {}),
            },
            orderBy: { createdAt: 'desc' },
          }),

          // 2. Fetch active riders for assignment dropdown
          prisma.rider.findMany({
            where: { status: 'Active' },
            select: { id: true, name: true, phone: true, isOnline: true },
            orderBy: { name: 'asc' },
          }),
        ]);
      }, 3, 400);

      unassignedOrders = fetchedOrders;
      riders = fetchedRiders;
    } catch (dbErr) {
      console.error('[Reconciliation GET DB error]:', dbErr);
      if (process.env.NODE_ENV === 'development') {
        const memOrders = getInMemoryOrders();
        unassignedOrders = memOrders.filter((o) => {
          if (o.riderId) return false;
          if (cafeteria && cafeteria !== 'ALL' && !o.cafeteriaName?.toLowerCase().includes(cafeteria.toLowerCase())) {
            return false;
          }
          if (dateParam) {
            const ordDate = new Date(o.createdAt).toISOString().split('T')[0];
            if (ordDate !== dateParam) return false;
          }
          return true;
        });
        const memRiders = getInMemoryRiders();
        riders = memRiders.filter((r) => r.status === 'Active');
      } else {
        return NextResponse.json(
          { success: false, error: 'Database connection busy. Please refresh.' },
          { status: 503 }
        );
      }
    }

    // Client search filter if specified
    if (search) {
      unassignedOrders = unassignedOrders.filter((o) => {
        const orderId = (o.orderId || '').toLowerCase();
        const customer = (o.customerName || '').toLowerCase();
        const cafe = (o.cafeteriaName || '').toLowerCase();
        const address = (o.deliveryAddress || '').toLowerCase();
        return (
          orderId.includes(search) ||
          customer.includes(search) ||
          cafe.includes(search) ||
          address.includes(search)
        );
      });
    }

    return NextResponse.json({
      success: true,
      orders: unassignedOrders,
      totalUnassigned: unassignedOrders.length,
      riders,
    });
  } catch (error: any) {
    console.error('Error in GET /api/reconciliation:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch unassigned orders' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reconciliation
 * Bulk or single assignment of riders to historical unassigned orders
 * Payload format:
 * - Single: { orderId: string, riderId: string }
 * - Bulk: { updates: [{ orderId: string, riderId: string }] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let updates: { orderId: string; riderId: string }[] = [];

    if (Array.isArray(body.updates)) {
      updates = body.updates;
    } else if (body.orderId && body.riderId) {
      updates = [{ orderId: body.orderId, riderId: body.riderId }];
    } else if (Array.isArray(body)) {
      updates = body;
    }

    if (!updates || updates.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No assignment updates provided' },
        { status: 400 }
      );
    }

    let updatedCount = 0;

    try {
      // Execute in PostgreSQL transaction or batch update
      await prisma.$transaction(
        updates.map((item) =>
          prisma.deliveryOrder.update({
            where: { orderId: item.orderId },
            data: {
              riderId: item.riderId || null,
              orderStatus: 'delivered',
            },
          })
        )
      );
      updatedCount = updates.length;
    } catch (dbError: any) {
      // Fallback single updates loop if batch fails on individual record
      console.warn('Batch transaction failed, falling back to sequential update:', dbError.message);
      for (const item of updates) {
        try {
          await prisma.deliveryOrder.update({
            where: { orderId: item.orderId },
            data: {
              riderId: item.riderId || null,
              orderStatus: 'delivered',
            },
          });
          updatedCount++;
        } catch (e) {
          console.error(`Failed to assign order ${item.orderId}:`, e);
        }
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Successfully assigned ${updatedCount} order(s) to riders`,
    });
  } catch (error: any) {
    console.error('Error in POST /api/reconciliation:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update order assignments' },
      { status: 500 }
    );
  }
}
