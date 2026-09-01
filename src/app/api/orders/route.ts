import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders } from '@/lib/prisma';
import { calculateRiderPayout, isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const deliveryType = searchParams.get('deliveryType') || 'All';
    const orderStatus = searchParams.get('orderStatus') || 'All';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(5, parseInt(searchParams.get('limit') || '15', 10)));

    let rawOrders: any[] = [];

    try {
      rawOrders = await prisma.deliveryOrder.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      rawOrders = getInMemoryOrders();
    }

    if (!rawOrders || rawOrders.length === 0) {
      rawOrders = getInMemoryOrders();
    }

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
        createdAt: new Date(o.createdAt).toISOString(),
      };
    });

    // 1. Filter by Search Query (Order ID, Customer Name, Cafeteria, Address)
    if (search) {
      processed = processed.filter(
        (o) =>
          o.orderId.toLowerCase().includes(search) ||
          o.customerName.toLowerCase().includes(search) ||
          o.cafeteriaName.toLowerCase().includes(search) ||
          o.deliveryAddress.toLowerCase().includes(search)
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
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error: any) {
    console.error('Orders API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
