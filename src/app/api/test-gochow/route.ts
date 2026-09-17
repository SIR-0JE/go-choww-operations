import { NextResponse } from 'next/server';
import { fetchLiveGoChowOrders } from '@/services/gochowApi';

export async function GET() {
    const orders = await fetchLiveGoChowOrders();
    return NextResponse.json({ success: true, count: orders.length, orders });
}