import { NextRequest, NextResponse } from 'next/server';
import { sendPushNotification } from '@/lib/pushService';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body optional
    }

    const { userType = 'all', riderId, title, message } = body;

    const notifTitle = title || '🔔 GoChoww Phone Alert Test';
    const notifBody =
      message ||
      'Push notifications are working! You will now receive instant order updates on your phone status bar.';

    const result = await sendPushNotification(
      {
        title: notifTitle,
        body: notifBody,
        url: userType === 'rider' ? '/rider/portal' : '/dashboard',
        vibrate: [200, 100, 200, 100, 200],
      },
      {
        userType: userType as any,
        riderId,
      }
    );

    return NextResponse.json({
      success: true,
      message: `Test notification sent (${result.sent} delivered, ${result.failed} failed)`,
      result,
    });
  } catch (error: any) {
    console.error('Test push error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to send test push' },
      { status: 500 }
    );
  }
}
