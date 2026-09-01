import { NextResponse } from 'next/server';
import { prisma, appendMockOrder } from '@/lib/prisma';
import { generateSeedOrders, GeneratedOrder } from '@/lib/mockData';

export async function POST() {
  try {
    // Generate 5-10 fresh incoming real-time orders
    const batchSize = Math.floor(Math.random() * 6) + 5;
    const freshBatch = generateSeedOrders(batchSize);

    let insertedDb = 0;
    try {
      for (const order of freshBatch) {
        await prisma.deliveryOrder.create({
          data: {
            orderId: order.orderId,
            createdAt: new Date(),
            time: order.time,
            customerName: order.customerName,
            cafeteriaName: order.cafeteriaName,
            deliveryAddress: order.deliveryAddress,
            deliveryFee: order.deliveryFee,
            foodTotal: order.foodTotal,
            totalAmountPaid: order.totalAmountPaid,
            deliveryType: order.deliveryType,
            orderStatus: order.orderStatus,
            paymentStatus: order.paymentStatus,
          },
        });
        insertedDb++;
      }
    } catch {
      // In-memory update
      for (const order of freshBatch) {
        appendMockOrder(order);
      }
    }

    return NextResponse.json({
      success: true,
      syncedCount: freshBatch.length,
      insertedDb,
      message: `Successfully synchronized and imported ${freshBatch.length} new orders!`,
    });
  } catch (error: any) {
    console.error('Sync API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Sync failed' },
      { status: 500 }
    );
  }
}
