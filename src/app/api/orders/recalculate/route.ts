import { NextResponse } from 'next/server';
import { prisma, getInMemoryOrders } from '@/lib/prisma';
import { classifyDeliveryType } from '@/lib/locations';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    let orders: any[] = [];
    let isDb = true;

    try {
      orders = await prisma.deliveryOrder.findMany({
        select: {
          id: true,
          orderId: true,
          cafeteriaName: true,
          deliveryAddress: true,
          deliveryType: true,
        },
      });
    } catch {
      orders = getInMemoryOrders();
      isDb = false;
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders found to recalculate.',
        totalProcessed: 0,
        updatedCount: 0,
      });
    }

    const updates: Array<{ id: string; newDeliveryType: string }> = [];
    let sameSideCount = 0;
    let differentSideCount = 0;
    let pickUpCount = 0;
    let otherCount = 0;

    for (const order of orders) {
      const currentType = (order.deliveryType || '').trim().toLowerCase();
      const addressLower = (order.deliveryAddress || '').trim().toLowerCase();

      // 1. Strictly preserve Pickups
      if (
        currentType === 'pick up' ||
        currentType === 'pickup' ||
        addressLower.includes('pickup') ||
        addressLower.includes('pick up')
      ) {
        pickUpCount++;
        if (order.deliveryType !== 'Pick up') {
          updates.push({ id: order.id, newDeliveryType: 'Pick up' });
          order.deliveryType = 'Pick up';
        }
        continue;
      }

      // 2. Classify Origin-to-Destination
      const newType = classifyDeliveryType(order.cafeteriaName, order.deliveryAddress, order.deliveryType);

      if (newType === 'Same side') sameSideCount++;
      else if (newType === 'Different side') differentSideCount++;
      else if (newType === 'Pick up') pickUpCount++;
      else otherCount++;

      if (newType !== order.deliveryType) {
        updates.push({ id: order.id, newDeliveryType: newType });
        order.deliveryType = newType;
      }
    }

    let updatedCount = 0;

    if (isDb && updates.length > 0) {
      const BATCH_SIZE = 200;
      const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

      for (let b = 0; b < totalBatches; b++) {
        const batch = updates.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        await prisma.$transaction(
          batch.map((item) =>
            prisma.deliveryOrder.update({
              where: { id: item.id },
              data: { deliveryType: item.newDeliveryType },
            })
          )
        );
        updatedCount += batch.length;
      }
    } else {
      updatedCount = updates.length;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully recalculated ${orders.length} orders (${updatedCount} updated).`,
      totalProcessed: orders.length,
      updatedCount,
      breakdown: {
        sameSideCount,
        differentSideCount,
        pickUpCount,
        otherCount,
      },
    });
  } catch (error: any) {
    console.error('Recalculation error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to recalculate orders' },
      { status: 500 }
    );
  }
}
