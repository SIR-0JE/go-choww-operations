import { PrismaClient } from '@prisma/client';
import { staticOrdersCache, initialMockExpenses, GeneratedOrder, GeneratedExpense } from './mockData';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  mockOrders: GeneratedOrder[] | undefined;
  mockExpenses: GeneratedExpense[] | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

if (!globalForPrisma.mockOrders) {
  globalForPrisma.mockOrders = [...staticOrdersCache];
}

if (!globalForPrisma.mockExpenses) {
  globalForPrisma.mockExpenses = [...initialMockExpenses];
}

export const getInMemoryOrders = () => globalForPrisma.mockOrders || staticOrdersCache;

export const appendMockOrder = (newOrder: GeneratedOrder) => {
  if (!globalForPrisma.mockOrders) globalForPrisma.mockOrders = [...staticOrdersCache];
  globalForPrisma.mockOrders.unshift(newOrder);
};

export const getInMemoryExpenses = () => globalForPrisma.mockExpenses || initialMockExpenses;

export const appendMockExpense = (newExpense: GeneratedExpense) => {
  if (!globalForPrisma.mockExpenses) globalForPrisma.mockExpenses = [...initialMockExpenses];
  globalForPrisma.mockExpenses.unshift(newExpense);
};

export const deleteMockExpense = (id: string) => {
  if (!globalForPrisma.mockExpenses) globalForPrisma.mockExpenses = [...initialMockExpenses];
  globalForPrisma.mockExpenses = globalForPrisma.mockExpenses.filter((e) => e.id !== id);
};
