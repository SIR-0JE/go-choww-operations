import { NextRequest } from 'next/server';
import { POST as syncOrdersPost, GET as syncOrdersGet } from '@/app/api/sync-orders/route';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return syncOrdersPost(request);
}

export async function GET(request: NextRequest) {
  return syncOrdersGet(request);
}
