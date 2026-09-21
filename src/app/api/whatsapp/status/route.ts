import { NextRequest, NextResponse } from 'next/server';
import { getWhatsAppStatus, initWhatsAppSocket } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = getWhatsAppStatus();
    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get WhatsApp status' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const state = await initWhatsAppSocket();
    return NextResponse.json({
      success: true,
      ...state,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to initialize WhatsApp connection' },
      { status: 500 }
    );
  }
}
