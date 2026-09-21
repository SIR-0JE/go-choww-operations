import { NextRequest, NextResponse } from 'next/server';
import {
  prisma,
  getInMemoryRiders,
  getInMemoryOrders,
} from '@/lib/prisma';
import { isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    let rider: any = null;
    let isDb = true;

    try {
      rider = await prisma.rider.findUnique({
        where: { id },
        include: {
          orders: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              orderId: true,
              createdAt: true,
              time: true,
              customerName: true,
              cafeteriaName: true,
              deliveryAddress: true,
              deliveryFee: true,
              deliveryType: true,
              orderStatus: true,
              paymentStatus: true,
            },
          },
        },
      });
      isDb = true;
    } catch {
      const memRiders = getInMemoryRiders();
      const memOrders = getInMemoryOrders();
      const found = memRiders.find((r) => r.id === id);
      if (found) {
        rider = {
          ...found,
          orders: memOrders.filter((o) => o.riderId === id),
        };
      }
      isDb = false;
    }

    if (!rider) {
      return NextResponse.json(
        { success: false, error: 'Rider not found' },
        { status: 404 }
      );
    }

    let riderOrders = rider.orders || [];

    // Date filtering
    if (startDate) {
      const start = new Date(startDate).getTime();
      riderOrders = riderOrders.filter(
        (o: any) => new Date(o.createdAt).getTime() >= start
      );
    }
    if (endDate) {
      const end = new Date(endDate).getTime();
      riderOrders = riderOrders.filter(
        (o: any) => new Date(o.createdAt).getTime() <= end
      );
    }

    // Sort strictly chronological (newest first)
    riderOrders.sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Compute metrics
    const settledOrders = riderOrders.filter((o: any) => isSettledOrder(o));

    let sameSideCount = 0;
    let differentSideCount = 0;
    let pickUpCount = 0;
    let otherCount = 0;

    for (const ord of settledOrders) {
      const type = (ord.deliveryType || '').trim().toLowerCase();
      if (type === 'same side') sameSideCount++;
      else if (type === 'different side') differentSideCount++;
      else if (type === 'pick up' || type === 'pickup') pickUpCount++;
      else otherCount++;
    }

    const sameSideEarnings = sameSideCount * 50;
    const differentSideEarnings = differentSideCount * 90;
    const totalEarnings = sameSideEarnings + differentSideEarnings;

    const formattedRider = {
      id: rider.id,
      name: rider.name,
      phone: rider.phone || 'N/A',
      status: rider.status || 'Active',
      isOnline: Boolean(rider.isOnline),
      assignedCafeterias: rider.assignedCafeterias || [],
      createdAt: rider.createdAt,
      totalOrdersAssigned: riderOrders.length,
      settledOrdersCount: settledOrders.length,
      sameSideCount,
      differentSideCount,
      pickUpCount,
      otherCount,
      sameSideEarnings,
      differentSideEarnings,
      totalEarnings,
      orders: riderOrders.map((o: any) => ({
        ...o,
        deliveryFee: Number(o.deliveryFee),
        createdAt: new Date(o.createdAt).toISOString(),
      })),
    };

    return NextResponse.json({
      success: true,
      rider: formattedRider,
    });
  } catch (error: any) {
    console.error('Rider detail GET API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch rider details' },
      { status: 500 }
    );
  }
}
