import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, getCustomerOrders } from '@/lib/customers';

export const dynamic = 'force-dynamic';

// GET /api/customers            -> everyone, plus today / losing lists and totals
// GET /api/customers?key=<key>  -> one customer's orders, newest first
export async function GET(request: NextRequest) {
  try {
    const key = request.nextUrl.searchParams.get('key');
    if (key) {
      const orders = await getCustomerOrders(key);
      return NextResponse.json({ success: true, orders });
    }
    const data = await getCustomers();
    return NextResponse.json({ success: true, ...data });
  } catch (err: any) {
    console.error('[GET /api/customers]', err);
    return NextResponse.json({ success: false, error: 'Could not load customers.' }, { status: 503 });
  }
}
