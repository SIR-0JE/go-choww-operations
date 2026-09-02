/**
 * Types and Empty Data Cache for Go Choww Operations & Expenses
 */

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
  orderStatus: 'Completed' | 'Cancelled' | 'Pending';
  paymentStatus: 'success' | 'failed' | 'pending';
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
