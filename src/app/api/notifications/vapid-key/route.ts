import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/pushService';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const publicKey = getVapidPublicKey();
    return NextResponse.json({ success: true, publicKey });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get VAPID key' },
      { status: 500 }
    );
  }
}
