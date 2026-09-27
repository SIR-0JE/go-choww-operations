import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, getCustomerOrders, getLocationLeaderboard, type LocationRange } from '@/lib/customers';
import { getSprintConfig } from '@/lib/sprint';

export const dynamic = 'force-dynamic';

// GET /api/customers            -> everyone, plus today / losing lists and totals
// GET /api/customers?key=<key>  -> one customer's orders, newest first
// GET /api/customers?view=locations&range=today|week|sprint|all -> orders per delivery location
export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get('view');
    if (view === 'locations') {
      const r = request.nextUrl.searchParams.get('range');
      const range: LocationRange = r === 'today' || r === 'week' || r === 'all' ? r : 'sprint';
      const sprint = await getSprintConfig();
      const data = await getLocationLeaderboard(range, sprint.startDate);
      return NextResponse.json({ success: true, ...data });
    }
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
