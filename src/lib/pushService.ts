import webpush from 'web-push';
import { prisma } from './prisma';

// Fallback VAPID keys if not present in environment
const DEFAULT_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  'BNHhIvHDfjxsDB9Rk2i5_akq98rCoBbCLTsJAQ-kKgAwLETolWxGRr0eaDM33mu0j9eFFzU802shWQr-Eae-vPI';

const DEFAULT_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || '4qLleJiRj3ZJa4FdLiZiJD5BKwJOpJ2GCiHIkxbphhQ';

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@gochoww.com';

// Configure web-push details
try {
  webpush.setVapidDetails(VAPID_SUBJECT, DEFAULT_PUBLIC_KEY, DEFAULT_PRIVATE_KEY);
} catch (err) {
  console.warn('Failed to initialize webpush with VAPID details:', err);
}

export function getVapidPublicKey(): string {
  return DEFAULT_PUBLIC_KEY;
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: any;
  vibrate?: number[];
  requireInteraction?: boolean;
}

export interface PushFilter {
  userType?: 'admin' | 'rider' | 'all';
  riderId?: string;
}

/**
 * Dispatches a push notification to all subscribed devices matching the filter.
 */
export async function sendPushNotification(
  payload: PushPayload,
  filter?: PushFilter
): Promise<{ sent: number; failed: number }> {
  try {
    const where: any = {};
    if (filter?.userType && filter.userType !== 'all') {
      where.userType = filter.userType;
    }
    if (filter?.riderId) {
      where.riderId = filter.riderId;
    }

    let subscriptions: any[] = [];
    try {
      subscriptions = await prisma.pushSubscription.findMany({ where });
    } catch (err) {
      console.warn('Could not query push subscriptions from DB:', err);
      return { sent: 0, failed: 0 };
    }

    if (!subscriptions || subscriptions.length === 0) {
      return { sent: 0, failed: 0 };
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192.png',
      badge: payload.badge || '/icons/badge-72.png',
      url: payload.url || '/dashboard',
      tag: payload.tag || `gochow-${Date.now()}`,
      data: payload.data || {},
      vibrate: payload.vibrate || [200, 100, 200],
      requireInteraction: payload.requireInteraction ?? true,
    });

    let sent = 0;
    let failed = 0;
    const staleIds: string[] = [];

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadString, {
          TTL: 60 * 60 * 24, // 24 hours
          urgency: 'high',
        });
        sent++;
      } catch (err: any) {
        failed++;
        // If subscription is 404 or 410 Gone, mark for removal
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          console.error(`Error sending push notification to ${sub.endpoint}:`, err?.message || err);
        }
      }
    });

    await Promise.allSettled(sendPromises);

    // Clean up expired subscriptions
    if (staleIds.length > 0) {
      try {
        await prisma.pushSubscription.deleteMany({
          where: { id: { in: staleIds } },
        });
      } catch (err) {
        console.warn('Failed to prune stale push subscriptions:', err);
      }
    }

    return { sent, failed };
  } catch (err) {
    console.error('sendPushNotification error:', err);
    return { sent: 0, failed: 0 };
  }
}
