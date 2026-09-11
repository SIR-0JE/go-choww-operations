import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, updateInMemoryOrder } from '@/lib/prisma';
import { calculateRiderPayout, isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    let order: any = null;
    try {
      order = await prisma.deliveryOrder.findFirst({
        where: {
          OR: [{ id }, { orderId: id }],
        },
        include: {
          rider: {
            select: { id: true, name: true, phone: true, status: true },
          },
        },
      });
    } catch {
      const memOrders = getInMemoryOrders();
      order = memOrders.find((o) => o.id === id || o.orderId === id) || null;
    }

    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    const deliveryFee = Number(order.deliveryFee);
    const settled = isSettledOrder(order);
    const riderPayout = settled ? calculateRiderPayout(order.deliveryType) : 0;
    const netProfit = settled ? deliveryFee - riderPayout : 0;

    return NextResponse.json({
      success: true,
      order: {
        ...order,
        deliveryFee,
        foodTotal: Number(order.foodTotal),
        totalAmountPaid: Number(order.totalAmountPaid),
        riderPayout,
        netProfit,
        isSettled: settled,
        createdAt: new Date(order.createdAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Order GET [id] API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { deliveryType, orderType, deliveryFee, riderId, orderStatus, paymentStatus, deliveryAddress } = body;

    const finalDeliveryType = deliveryType || orderType;
    const updateData: any = {};

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

    if (riderId !== undefined) {
      updateData.riderId = riderId === 'unassigned' || !riderId ? null : String(riderId);
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

    let updatedOrder: any = null;

    try {
      const existing = await prisma.deliveryOrder.findFirst({
        where: {
          OR: [{ id }, { orderId: id }],
        },
      });

      if (!existing) {
        return NextResponse.json(
          { success: false, error: 'Order not found' },
          { status: 404 }
        );
      }

      updatedOrder = await prisma.deliveryOrder.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          rider: {
            select: { id: true, name: true, phone: true, status: true },
          },
        },
      });
    } catch (dbErr) {
      console.warn('DB update failed, using in-memory update:', dbErr);
      updatedOrder = updateInMemoryOrder(id, updateData);
    }

    if (!updatedOrder) {
      return NextResponse.json(
        { success: false, error: 'Failed to update order' },
        { status: 500 }
      );
    }

    const fee = Number(updatedOrder.deliveryFee);
    const settled = isSettledOrder(updatedOrder);
    const riderPayout = settled ? calculateRiderPayout(updatedOrder.deliveryType) : 0;
    const netProfit = settled ? fee - riderPayout : 0;

    return NextResponse.json({
      success: true,
      order: {
        ...updatedOrder,
        deliveryFee: fee,
        foodTotal: Number(updatedOrder.foodTotal),
        totalAmountPaid: Number(updatedOrder.totalAmountPaid),
        riderPayout,
        netProfit,
        isSettled: settled,
        createdAt: new Date(updatedOrder.createdAt).toISOString(),
      },
      message: 'Order updated successfully!',
    });
  } catch (error: any) {
    console.error('Order PATCH [id] API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update order' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  return PATCH(request, context);
}