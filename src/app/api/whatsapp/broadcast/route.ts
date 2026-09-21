import { NextRequest, NextResponse } from 'next/server';
import {
  getBroadcastQueueStatus,
  startBackgroundBroadcast,
  controlBroadcastQueue,
} from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const queue = getBroadcastQueueStatus();
    return NextResponse.json({
      success: true,
      queue,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to get broadcast status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action = 'start', campaignId, recipients, template } = body;

    if (action === 'start') {
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Recipient list cannot be empty' },
          { status: 400 }
        );
      }
      if (!template || !template.trim()) {
        return NextResponse.json(
          { success: false, error: 'Broadcast message template is required' },
          { status: 400 }
        );
      }

      const queue = await startBackgroundBroadcast(campaignId, recipients, template);
      return NextResponse.json({
        success: true,
        message: `Broadcast started for ${queue.total} recipients in background`,
        queue,
      });
    } else if (['pause', 'resume', 'stop'].includes(action)) {
      const queue = controlBroadcastQueue(action as any);
      return NextResponse.json({
        success: true,
        message: `Broadcast ${action}d successfully`,
        queue,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action specified' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Broadcast action failed' },
      { status: 500 }
    );
  }
}
