import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry, getInMemoryOrders, updateInMemoryOrder, updateInMemoryOrderRider } from '@/lib/prisma';
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
      rawOrders = await withDbRetry(async () => {
        try {
          return await prisma.deliveryOrder.findMany({
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
          // Safe fallback if rider relation column is not yet pushed to DB
          return await prisma.deliveryOrder.findMany({
            orderBy: { createdAt: 'desc' },
          });
        }
      }, 3, 400);
    } catch (dbErr) {
      console.error('[Orders GET DB error]:', dbErr);
      if (process.env.NODE_ENV === 'development') {
        rawOrders = getInMemoryOrders();
      } else {
        return NextResponse.json(
          { success: false, error: 'Database connection busy. Please refresh.' },
          { status: 503 }
        );
      }
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
          (o.pickupCode && String(o.pickupCode).toLowerCase().includes(search)) ||
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
      const target = orderStatus.toLowerCase();
      processed = processed.filter((o) => {
        const cur = (o.orderStatus || '').toLowerCase();
        if (target === 'delivered' || target === 'completed') {
          return cur === 'delivered' || cur === 'completed';
        }
        return cur === target;
      });
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
    const activeTotalCount = processed.filter(
      (o) => !o.orderStatus.toLowerCase().includes('canc')
    ).length;
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
        activeTotalCount,
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
    const { orderId, id, riderId, deliveryType, orderType, deliveryFee, orderStatus, paymentStatus, deliveryAddress } = body;

    const targetKey = orderId || id;
    if (!targetKey) {
      return NextResponse.json(
        { success: false, error: 'orderId or id is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};

    if (riderId !== undefined) {
      updateData.riderId = riderId === 'unassigned' || !riderId ? null : String(riderId);
    }

    const finalDeliveryType = deliveryType || orderType;
    if (finalDeliveryType !== undefined && typeof finalDeliveryType === 'string') {
      const trimmed = finalDeliveryType.trim();
      const lower = trimmed.toLowerCase();
      if (lower.includes('same')) {
        updateData.deliveryType = 'Same side';
      } else if (lower.includes('diff')) {
        updateData.deliveryType = 'Different side';
      } else if (lower.includes('pick')) {
        updateData.deliveryType = 'Pick up';
      } else {
        updateData.deliveryType = trimmed;
      }
    }

    if (deliveryFee !== undefined && deliveryFee !== null) {
      const parsedFee = Number(deliveryFee);
      if (isNaN(parsedFee) || parsedFee < 0) {
        return NextResponse.json(
          { success: false, error: 'Delivery fee must be a valid non-negative number' },
          { status: 400 }
        );
      }
      updateData.deliveryFee = parsedFee;
    }

    if (orderStatus !== undefined) {
      updateData.orderStatus = String(orderStatus).trim();
    }

    if (paymentStatus !== undefined) {
      updateData.paymentStatus = String(paymentStatus).trim();
    }

    if (deliveryAddress !== undefined) {
      updateData.deliveryAddress = String(deliveryAddress).trim();
    }

    let updated: any = null;

    try {
      updated = await withDbRetry(async () => {
        const existing = await prisma.deliveryOrder.findFirst({
          where: {
            OR: [{ id: targetKey }, { orderId: targetKey }],
          },
        });

        if (!existing) {
          return null;
        }

        return await prisma.deliveryOrder.update({
          where: { id: existing.id },
          data: updateData,
          include: {
            rider: {
              select: { id: true, name: true, phone: true, status: true },
            },
          },
        });
      }, 2, 250);
    } catch {
      updated = updateInMemoryOrder(targetKey, updateData);
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Failed to update order' },
        { status: 500 }
      );
    }

    const fee = Number(updated.deliveryFee);
    const settled = isSettledOrder(updated);
    const riderPayout = settled ? calculateRiderPayout(updated.deliveryType) : 0;
    const netProfit = settled ? fee - riderPayout : 0;

    return NextResponse.json({
      success: true,
      order: {
        ...updated,
        deliveryFee: fee,
        foodTotal: Number(updated.foodTotal),
        totalAmountPaid: Number(updated.totalAmountPaid),
        riderPayout,
        netProfit,
        isSettled: settled,
        createdAt: new Date(updated.createdAt).toISOString(),
      },
      message: 'Order updated successfully!',
    });
  } catch (error: any) {
    console.error('Order PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update order' },
      { status: 500 }
    );
  }
}
