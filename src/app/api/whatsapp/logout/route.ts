import { NextResponse } from 'next/server';
import { logoutWhatsApp } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const success = await logoutWhatsApp();
    return NextResponse.json({
      success,
      message: 'WhatsApp account successfully unlinked.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to logout WhatsApp' },
      { status: 500 }
    );
  }
}
