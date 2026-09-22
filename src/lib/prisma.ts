import { PrismaClient } from '@prisma/client';
import { GeneratedOrder, GeneratedExpense, GeneratedRider } from './mockData';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  mockOrders: GeneratedOrder[] | undefined;
  mockExpenses: GeneratedExpense[] | undefined;
  mockRiders: GeneratedRider[] | undefined;
  mockSubscriptions: any[] | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

globalForPrisma.prisma = prisma;

/**
 * Utility helper to retry database operations on transient pooler / socket disconnects
 */
export async function withDbRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 300): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

if (!globalForPrisma.mockOrders) {
  globalForPrisma.mockOrders = [];
}

if (!globalForPrisma.mockExpenses) {
  globalForPrisma.mockExpenses = [];
}

if (!globalForPrisma.mockRiders) {
  globalForPrisma.mockRiders = [];
}

if (!globalForPrisma.mockSubscriptions) {
  globalForPrisma.mockSubscriptions = [];
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

export const updateInMemoryOrder = (orderId: string, data: Partial<GeneratedOrder>) => {
  if (!globalForPrisma.mockOrders) return null;
  const ord = globalForPrisma.mockOrders.find((o) => o.orderId === orderId || o.id === orderId);
  if (ord) {
    Object.assign(ord, data);
    if (data.riderId !== undefined) {
      if (data.riderId && globalForPrisma.mockRiders) {
        ord.rider = globalForPrisma.mockRiders.find((r) => r.id === data.riderId) || null;
      } else if (!data.riderId) {
        ord.rider = null;
      }
    }
    return ord;
  }
  return null;
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

export const deleteMockRider = (id: string) => {
  if (!globalForPrisma.mockRiders) return;
  globalForPrisma.mockRiders = globalForPrisma.mockRiders.filter((r) => r.id !== id);
  if (globalForPrisma.mockOrders) {
    for (const ord of globalForPrisma.mockOrders) {
      if (ord.riderId === id) {
        ord.riderId = null;
        ord.rider = null;
      }
    }
  }
};

export const getInMemorySubscriptions = () => globalForPrisma.mockSubscriptions || [];

export const saveInMemorySubscription = (sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userType?: string;
  riderId?: string | null;
}) => {
  if (!globalForPrisma.mockSubscriptions) globalForPrisma.mockSubscriptions = [];
  const idx = globalForPrisma.mockSubscriptions.findIndex((s) => s.endpoint === sub.endpoint);
  const record = {
    id: `mem-sub-${Date.now()}`,
    ...sub,
    userType: sub.userType || 'admin',
    riderId: sub.riderId || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  if (idx >= 0) {
    globalForPrisma.mockSubscriptions[idx] = record;
  } else {
    globalForPrisma.mockSubscriptions.push(record);
  }
  return record;
};

export const deleteInMemorySubscription = (endpoint: string) => {
  if (!globalForPrisma.mockSubscriptions) return;
  globalForPrisma.mockSubscriptions = globalForPrisma.mockSubscriptions.filter((s) => s.endpoint !== endpoint);
};

export const clearAllInMemoryData = () => {
  globalForPrisma.mockOrders = [];
  globalForPrisma.mockExpenses = [];
  globalForPrisma.mockRiders = [];
  globalForPrisma.mockSubscriptions = [];
};
