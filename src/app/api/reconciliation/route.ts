import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, getInMemoryRiders } from '@/lib/prisma';

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

    let unassignedOrders: any[] = [];
    let riders: any[] = [];

    try {
      // 1. Fetch unassigned orders from PostgreSQL
      unassignedOrders = await prisma.deliveryOrder.findMany({
        where: {
          riderId: null,
          ...(cafeteria ? { cafeteriaName: { contains: cafeteria, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });

      // 2. Fetch active riders for assignment dropdown
      riders = await prisma.rider.findMany({
        where: { status: 'Active' },
        select: { id: true, name: true, phone: true, isOnline: true },
        orderBy: { name: 'asc' },
      });
    } catch {
      // Fallback in memory
      const memOrders = getInMemoryOrders();
      unassignedOrders = memOrders.filter((o) => !o.riderId);
      const memRiders = getInMemoryRiders();
      riders = memRiders.filter((r) => r.status === 'Active');
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
