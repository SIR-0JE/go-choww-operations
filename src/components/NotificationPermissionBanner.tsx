'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, BellRing, Check, Smartphone, X, Loader2, Sparkles } from 'lucide-react';

interface NotificationPermissionBannerProps {
  userType?: 'admin' | 'rider';
  riderId?: string;
  variant?: 'banner' | 'compact';
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const NotificationPermissionBanner: React.FC<NotificationPermissionBannerProps> = ({
  userType = 'admin',
  riderId,
  variant = 'banner',
}) => {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const checkSubscription = useCallback(async () => {
    if (typeof window === 'undefined') return;

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription]);

  const subscribeToPush = async () => {
    if (!isSupported) {
      alert('Push notifications are not supported on this browser/device.');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setMessage('Notification permission was not granted.');
        setIsLoading(false);
        return;
      }

      // 2. Register Service Worker
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // 3. Fetch VAPID Public Key
      const keyRes = await fetch('/api/notifications/vapid-key');
      const keyData = await keyRes.json();

      if (!keyData.success || !keyData.publicKey) {
        throw new Error('Failed to retrieve VAPID public key');
      }

      const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);

      // 4. Subscribe with PushManager
      let subscription = await reg.pushManager.getSubscription();
      if (!subscription) {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }

      // 5. Save subscription to backend
      const subJson = subscription.toJSON();
      const saveRes = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subJson.keys,
          userType,
          riderId,
        }),
      });

      const saveData = await saveRes.json();
      if (!saveData.success) {
        throw new Error(saveData.error || 'Failed to register subscription on server');
      }

      setIsSubscribed(true);
      setMessage('🔔 Phone notifications enabled! Sending a test pop-up...');

      // 6. Trigger immediate test notification so user sees it pop up on their phone
      setTimeout(async () => {
        try {
          await fetch('/api/notifications/test-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userType,
              riderId,
              title: userType === 'rider' ? '🛵 Rider Alerts Enabled!' : '🔔 Phone Notifications Active!',
              message: 'Great! You will now receive instant pop-up alerts on your phone status bar.',
            }),
          });
        } catch {
          // ignore
        }
      }, 500);
    } catch (err: any) {
      console.error('Subscription error:', err);
      setMessage(`Error enabling notifications: ${err?.message || 'Please try again.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestPush = async () => {
    setIsTesting(true);
    try {
      const res = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userType,
          riderId,
          title: '🛵 GoChoww Phone Alert Test',
          message: 'Sound, vibration, and phone status bar notifications are working properly!',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Test notification sent to your phone status bar!');
      } else {
        setMessage('Could not send test push. Please check your connection.');
      }
    } catch {
      setMessage('Failed to send test push.');
    } finally {
      setIsTesting(false);
    }
  };

  if (!isSupported || isDismissed) return null;

  // If already subscribed and variant is compact, show test button pill
  if (isSubscribed) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={sendTestPush}
          disabled={isTesting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 transition-colors shadow-xs"
          title="Send a test notification to your phone status bar"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BellRing className="w-3.5 h-3.5 text-emerald-600" />
          )}
          <span>{isTesting ? 'Sending Alert...' : 'Test Phone Pop-up'}</span>
        </button>
        {message && <span className="text-[11px] text-emerald-600 font-medium">{message}</span>}
      </div>
    );
  }

  return (
    <div className="relative bg-linear-to-r from-brand-600 via-orange-600 to-amber-600 rounded-2xl p-4 sm:p-5 text-white shadow-lg border border-brand-500/30 overflow-hidden mb-6">
      {/* Decorative backdrop glow */}
      <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 shrink-0 mt-0.5">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black tracking-tight text-white flex items-center gap-1.5">
                Enable Phone Status Bar Notifications
                <Sparkles className="w-4 h-4 text-amber-300" />
              </h3>
            </div>
            <p className="text-xs text-orange-100 font-medium mt-1 max-w-xl leading-relaxed">
              Get pop-up alerts with sound and vibration directly on your phone notification bar whenever new orders
              arrive, are picked up, or completed!
            </p>
            {message && <p className="text-xs text-amber-200 font-bold mt-2">{message}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={subscribeToPush}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white text-brand-700 font-black text-xs hover:bg-orange-50 active:scale-95 transition-all shadow-md"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                <span>Activating...</span>
              </>
            ) : (
              <>
                <BellRing className="w-4 h-4 text-brand-600" />
                <span>Enable Phone Pop-ups 🔔</span>
              </>
            )}
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            title="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
