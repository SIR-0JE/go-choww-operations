import { NextRequest, NextResponse } from 'next/server';
import { prisma, withDbRetry, getInMemoryOrders, updateInMemoryOrder, updateInMemoryOrderRider } from '@/lib/prisma';
import { calculateRiderPayout, isSettledOrder } from '@/lib/financials';
import { effectiveGochowStatus, isPickup } from '@/lib/orderStatus';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const deliveryType = searchParams.get('deliveryType') || 'All';
    const orderStatus = searchParams.get('orderStatus') || 'All';
    const riderId = searchParams.get('riderId') || 'All';
    const cafeteria = (searchParams.get('cafeteria') || '').trim().toLowerCase();
    const gochowStatus = (searchParams.get('gochowStatus') || 'All').toLowerCase();
    const day = searchParams.get('date') || ''; // YYYY-MM-DD, Lagos
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limitParam = searchParams.get('limit') || '20';
    const fetchAll = limitParam === 'all';
    // Cap at 500 for safety; ?limit=all uses a date-windowed query instead
    const limit = fetchAll ? 500 : Math.min(500, Math.max(5, parseInt(limitParam, 10)));

    // ── Date-window scoping ──────────────────────────────────────────────────
    // ?startDate / ?endDate: explicit range from the orders page date pickers
    // ?limit=all with no date: dashboard KPI view — default to last 90 days so
    //   we get all recent operational data without scanning lifetime history.
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    let createdAtFilter: any = undefined;
    if (startDateParam || endDateParam) {
      createdAtFilter = {};
      if (startDateParam) createdAtFilter.gte = new Date(startDateParam);
      if (endDateParam) createdAtFilter.lte = new Date(endDateParam);
    } else if (fetchAll) {
      // Dashboard calls ?limit=all — scope to last 90 days
      createdAtFilter = { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) };
    }

    // ── Build Prisma WHERE clause ────────────────────────────────────────────
    const where: any = {};

    if (createdAtFilter) where.createdAt = createdAtFilter;

    // Search — partial match on orderId, customerName, cafeteriaName, address
    if (search) {
      where.OR = [
        { orderId: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { cafeteriaName: { contains: search, mode: 'insensitive' } },
        { deliveryAddress: { contains: search, mode: 'insensitive' } },
        { rider: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (deliveryType !== 'All') {
      where.deliveryType = { equals: deliveryType, mode: 'insensitive' };
    }

    if (orderStatus !== 'All') {
      const target = orderStatus.toLowerCase();
      if (target === 'delivered' || target === 'completed') {
        where.orderStatus = { in: ['Delivered', 'Completed', 'delivered', 'completed'] };
      } else {
        where.orderStatus = { equals: orderStatus, mode: 'insensitive' };
      }
    }

    if (riderId !== 'All') {
      where.riderId = riderId === 'unassigned' ? null : riderId;
    }

    let rawOrders: any[] = [];
    let totalCount = 0;
    let activeTotalCount = 0;

    try {
      const [fetchedOrders, fetchedTotal, fetchedActive] = await withDbRetry(async () => {
        return await Promise.all([
          prisma.deliveryOrder.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
            include: {
              rider: {
                select: { id: true, name: true, phone: true, status: true },
              },
            },
          }),
          // Total count with all filters applied
          prisma.deliveryOrder.count({ where }),
          // Active (non-cancelled) count with all filters applied
          prisma.deliveryOrder.count({
            where: {
              ...where,
              orderStatus: { not: { contains: 'canc', mode: 'insensitive' } },
            },
          }),
        ]);
      }, 3, 400);

      rawOrders = fetchedOrders;
      totalCount = fetchedTotal;
      activeTotalCount = fetchedActive;
    } catch (dbErr) {
      console.error('[Orders GET DB error]:', dbErr);
      if (process.env.NODE_ENV === 'development') {
        rawOrders = getInMemoryOrders();
        totalCount = rawOrders.length;
        activeTotalCount = rawOrders.filter(
          (o: any) => !(o.orderStatus || '').toLowerCase().includes('canc')
        ).length;
      } else {
        return NextResponse.json(
          { success: false, error: 'Database connection busy. Please refresh.' },
          { status: 503 }
        );
      }
    }

    if (!rawOrders) rawOrders = [];

    // Convert decimal values to numbers and format calculations
    // Items are only needed in the single-order view (/api/orders/[id]); keep the list light
    let processed = rawOrders.map(({ items: _items, ...o }) => {
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
        serviceCharge: o.serviceCharge != null ? Number(o.serviceCharge) : null,
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

    // 5. Filter by cafeteria, GoChow status and Lagos day (used by the "By cafeteria" board)
    if (cafeteria) {
      processed = processed.filter((o) => (o.cafeteriaName || '').trim().toLowerCase() === cafeteria);
    }
    if (gochowStatus === 'open') {
      processed = processed.filter(
        (o) =>
          effectiveGochowStatus(o) !== 'Cancelled' &&
          !(o.orderStatus || '').toLowerCase().startsWith('canc') &&
          !isPickup(o.deliveryType)
      );
    } else if (gochowStatus !== 'all') {
      processed = processed.filter((o) => effectiveGochowStatus(o).toLowerCase() === gochowStatus);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const start = Date.parse(`${day}T00:00:00Z`) - 60 * 60 * 1000; // midnight WAT
      const end = start + 24 * 60 * 60 * 1000;
      processed = processed.filter((o) => {
        const t = Date.parse(o.createdAt);
        return t >= start && t < end;
      });
    }


    const totalPages = Math.ceil(totalCount / limit) || 1;

    return NextResponse.json({
      success: true,
      orders: processed,
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
