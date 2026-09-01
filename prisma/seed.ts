import { PrismaClient } from '@prisma/client';
import { generateSeedOrders, initialMockExpenses } from '../src/lib/mockData';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Go Choww database seeding...');

  // 1. Seed Orders
  const orders = generateSeedOrders(280);
  console.log(`📦 Inserting ${orders.length} delivery orders...`);

  let insertedOrders = 0;
  for (const order of orders) {
    await prisma.deliveryOrder.upsert({
      where: { orderId: order.orderId },
      update: {},
      create: {
        orderId: order.orderId,
        createdAt: order.createdAt,
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
    insertedOrders++;
  }

  // 2. Seed Expenses
  console.log(`💳 Inserting ${initialMockExpenses.length} operational expenses...`);
  let insertedExpenses = 0;
  for (const exp of initialMockExpenses) {
    await prisma.expense.create({
      data: {
        date: exp.date,
        category: exp.category,
        description: exp.description,
        amount: exp.amount,
        createdAt: exp.createdAt,
      },
    });
    insertedExpenses++;
  }

  console.log(`✅ Seeded ${insertedOrders} orders and ${insertedExpenses} expenses successfully!`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
