import { PrismaClient } from '@prisma/client';
import { classifyDeliveryType } from '../src/lib/locations';

const prisma = new PrismaClient();

async function main() {
  console.log('====================================================');
  console.log('🔄 Starting Cross-Site Order Recalculation Migration');
  console.log('====================================================');

  // Fetch all orders
  const orders = await prisma.deliveryOrder.findMany({
    select: {
      id: true,
      orderId: true,
      cafeteriaName: true,
      deliveryAddress: true,
      deliveryType: true,
    },
  });

  console.log(`📦 Found ${orders.length} total orders in database.`);

  if (orders.length === 0) {
    console.log('⚠️ No orders found in database to recalculate.');
    return;
  }

  let updatedCount = 0;
  let sameSideCount = 0;
  let differentSideCount = 0;
  let pickUpCount = 0;
  let otherCount = 0;

  const updates: Array<{ id: string; newDeliveryType: string }> = [];

  for (const order of orders) {
    // 1. Preserve Pickups strictly
    const currentType = (order.deliveryType || '').trim().toLowerCase();
    const addressLower = (order.deliveryAddress || '').trim().toLowerCase();

    if (
      currentType === 'pick up' ||
      currentType === 'pickup' ||
      addressLower.includes('pickup') ||
      addressLower.includes('pick up')
    ) {
      pickUpCount++;
      if (order.deliveryType !== 'Pick up') {
        updates.push({ id: order.id, newDeliveryType: 'Pick up' });
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
    }
  }

  console.log(`🔍 Classification Analysis:`);
  console.log(`   - Same side (₦50):      ${sameSideCount}`);
  console.log(`   - Different side (₦90): ${differentSideCount}`);
  console.log(`   - Pick up (₦0):         ${pickUpCount}`);
  console.log(`   - Other:                ${otherCount}`);
  console.log(`   - Records to update:    ${updates.length}`);

  if (updates.length > 0) {
    console.log(`\n💾 Applying database updates in batches of 200...`);
    const BATCH_SIZE = 200;
    const totalBatches = Math.ceil(updates.length / BATCH_SIZE);

    for (let b = 0; b < totalBatches; b++) {
      const batch = updates.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      
      // Execute batch updates using transaction
      await prisma.$transaction(
        batch.map((item) =>
          prisma.deliveryOrder.update({
            where: { id: item.id },
            data: { deliveryType: item.newDeliveryType },
          })
        )
      );

      updatedCount += batch.length;
      console.log(`   [Batch ${b + 1}/${totalBatches}] Updated ${updatedCount}/${updates.length} orders...`);
    }
  } else {
    console.log('✅ All historical records are already accurately classified.');
  }

  console.log('====================================================');
  console.log('🎉 Database Recalculation Complete!');
  console.log(`✨ Total Processed: ${orders.length}`);
  console.log(`🔄 Total Updated:   ${updatedCount}`);
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('❌ Error during recalculation migration:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
