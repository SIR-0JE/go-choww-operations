import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, updateInMemoryOrderRider } from '@/lib/prisma';
import { calculateRiderPayout, isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const deliveryType = searchParams.get('deliveryType') || 'All';
    const orderStatus = searchParams.get('orderStatus') || 'All';
    const riderId = searchParams.get('riderId') || 'All';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limitParam = searchParams.get('limit') || '20';
    const fetchAll = limitParam === 'all';
    const limit = fetchAll ? 999999 : Math.min(5000, Math.max(5, parseInt(limitParam, 10)));

    let rawOrders: any[] = [];

    try {
      rawOrders = await prisma.deliveryOrder.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phone: true,
              status: true,
            },
          },
        },
      });
    } catch {
      rawOrders = getInMemoryOrders();
    }

    if (!rawOrders) rawOrders = [];

    // Convert decimal values to numbers and format calculations
    let processed = rawOrders.map((o) => {
      const deliveryFee = Number(o.deliveryFee);
      const foodTotal = Number(o.foodTotal);
      const totalAmountPaid = Number(o.totalAmountPaid);
      const settled = isSettledOrder(o);
      const riderPayout = settled ? calculateRiderPayout(o.deliveryType) : 0;
      const netProfit = settled ? deliveryFee - riderPayout : 0;

      return {
        ...o,
        deliveryFee,
        foodTotal,
        totalAmountPaid,
        riderPayout,
        netProfit,
        isSettled: settled,
        riderId: o.riderId || null,
        rider: o.rider || null,
        createdAt: new Date(o.createdAt).toISOString(),
      };
    });

    // 1. Filter by Search Query
    if (search) {
      processed = processed.filter(
        (o) =>
          o.orderId.toLowerCase().includes(search) ||
          o.customerName.toLowerCase().includes(search) ||
          o.cafeteriaName.toLowerCase().includes(search) ||
          o.deliveryAddress.toLowerCase().includes(search) ||
          (o.rider?.name && o.rider.name.toLowerCase().includes(search))
      );
    }

    // 2. Filter by Delivery Type
    if (deliveryType !== 'All') {
      processed = processed.filter(
        (o) => o.deliveryType.toLowerCase() === deliveryType.toLowerCase()
      );
    }

    // 3. Filter by Order Status
    if (orderStatus !== 'All') {
      processed = processed.filter(
        (o) => o.orderStatus.toLowerCase() === orderStatus.toLowerCase()
      );
    }

    // 4. Filter by Rider ID
    if (riderId !== 'All') {
      if (riderId === 'unassigned') {
        processed = processed.filter((o) => !o.riderId);
      } else {
        processed = processed.filter((o) => o.riderId === riderId);
      }
    }

    // Pagination
    const totalCount = processed.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedOrders = processed.slice(startIndex, startIndex + limit);

    return NextResponse.json({
      success: true,
      orders: paginatedOrders,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('Orders GET API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, id, riderId } = body;

    const targetKey = orderId || id;
    if (!targetKey) {
      return NextResponse.json(
        { success: false, error: 'orderId or id is required' },
        { status: 400 }
      );
    }

    const assignedRiderId = riderId === 'unassigned' || !riderId ? null : String(riderId);

    try {
      const updated = await prisma.deliveryOrder.update({
        where: orderId ? { orderId } : { id },
        data: { riderId: assignedRiderId },
        include: {
          rider: {
            select: { id: true, name: true, phone: true, status: true },
          },
        },
      });

      return NextResponse.json({
        success: true,
        order: updated,
        message: assignedRiderId ? 'Rider assigned successfully!' : 'Rider unassigned.',
      });
    } catch {
      updateInMemoryOrderRider(targetKey, assignedRiderId);
      return NextResponse.json({
        success: true,
        message: assignedRiderId ? 'Rider assigned successfully!' : 'Rider unassigned.',
      });
    }
  } catch (error: any) {
    console.error('Order Rider Assignment PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update order rider' },
      { status: 500 }
    );
  }
}
