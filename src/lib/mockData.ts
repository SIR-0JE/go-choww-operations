/**
 * Types and Empty Data Cache for Go Choww Operations, Expenses & Riders
 */

export interface GeneratedRider {
  id: string;
  name: string;
  phone?: string | null;
  status: 'Active' | 'Inactive' | 'On Leave';
  createdAt: Date;
}

export interface GeneratedOrder {
  id?: string;
  orderId: string;
  createdAt: Date;
  time: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryFee: number;
  foodTotal: number;
  totalAmountPaid: number;
  deliveryType: 'Same side' | 'Different side' | 'Pick up' | 'Other';
  orderStatus: 'Delivered' | 'Dispatched' | 'Ready' | 'Preparing' | 'Confirmed' | 'Completed' | 'Cancelled' | 'Pending' | string;
  paymentStatus: 'success' | 'failed' | 'pending';
  riderId?: string | null;
  rider?: GeneratedRider | null;
  handoverRequestedById?: string | null;
  handoverRequestedByName?: string | null;
}

export interface GeneratedExpense {
  id: string;
  date: Date;
  category: 'Software' | 'Fuel' | 'Marketing' | 'Salaries' | 'Miscellaneous';
  description: string;
  amount: number;
  createdAt: Date;
}

export const initialMockExpenses: GeneratedExpense[] = [];
export const staticOrdersCache: GeneratedOrder[] = [];
export const staticRidersCache: GeneratedRider[] = [];
