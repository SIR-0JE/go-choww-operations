import { PrismaClient } from '@prisma/client';
import { GeneratedOrder, GeneratedExpense, GeneratedRider } from './mockData';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  mockOrders: GeneratedOrder[] | undefined;
  mockExpenses: GeneratedExpense[] | undefined;
  mockRiders: GeneratedRider[] | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

if (!globalForPrisma.mockOrders) {
  globalForPrisma.mockOrders = [];
}

if (!globalForPrisma.mockExpenses) {
  globalForPrisma.mockExpenses = [];
}

if (!globalForPrisma.mockRiders) {
  globalForPrisma.mockRiders = [];
}

export const getInMemoryOrders = () => globalForPrisma.mockOrders || [];

export const appendMockOrder = (newOrder: GeneratedOrder) => {
  if (!globalForPrisma.mockOrders) globalForPrisma.mockOrders = [];
  globalForPrisma.mockOrders.unshift(newOrder);
};

export const updateInMemoryOrderRider = (orderId: string, riderId: string | null) => {
  if (!globalForPrisma.mockOrders) return;
  const ord = globalForPrisma.mockOrders.find((o) => o.orderId === orderId || o.id === orderId);
  if (ord) {
    ord.riderId = riderId;
    if (riderId && globalForPrisma.mockRiders) {
      ord.rider = globalForPrisma.mockRiders.find((r) => r.id === riderId) || null;
    } else {
      ord.rider = null;
    }
  }
};

export const getInMemoryExpenses = () => globalForPrisma.mockExpenses || [];

export const appendMockExpense = (newExpense: GeneratedExpense) => {
  if (!globalForPrisma.mockExpenses) globalForPrisma.mockExpenses = [];
  globalForPrisma.mockExpenses.unshift(newExpense);
};

export const deleteMockExpense = (id: string) => {
  if (!globalForPrisma.mockExpenses) globalForPrisma.mockExpenses = [];
  globalForPrisma.mockExpenses = globalForPrisma.mockExpenses.filter((e) => e.id !== id);
};

export const getInMemoryRiders = () => globalForPrisma.mockRiders || [];

export const appendMockRider = (newRider: GeneratedRider) => {
  if (!globalForPrisma.mockRiders) globalForPrisma.mockRiders = [];
  globalForPrisma.mockRiders.unshift(newRider);
};

export const updateMockRiderStatus = (id: string, status: 'Active' | 'Inactive' | 'On Leave') => {
  if (!globalForPrisma.mockRiders) return;
  const rider = globalForPrisma.mockRiders.find((r) => r.id === id);
  if (rider) {
    rider.status = status;
  }
};

export const clearAllInMemoryData = () => {
  globalForPrisma.mockOrders = [];
  globalForPrisma.mockExpenses = [];
  globalForPrisma.mockRiders = [];
};
