import { NextRequest, NextResponse } from 'next/server';
import {
  getWhatsAppStatus,
  initWhatsAppSocket,
  requestWhatsAppPairingCode,
} from '@/lib/whatsapp';

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

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch (e) {
      body = {};
    }

    const { forceFresh = false, phoneNumber } = body;

    // If phone number is supplied, request pairing code
    if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim()) {
      const code = await requestWhatsAppPairingCode(phoneNumber.trim());
      return NextResponse.json({
        success: true,
        pairingCode: code,
        status: 'pairing_code_ready',
      });
    }

    // Otherwise initialize QR socket
    const state = await initWhatsAppSocket(Boolean(forceFresh));
    return NextResponse.json({
      success: true,
      ...state,
    });
  } catch (error: any) {
    console.error('[WhatsApp Status API Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to initialize WhatsApp connection' },
      { status: 500 }
    );
  }
}
