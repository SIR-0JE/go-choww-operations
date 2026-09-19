'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BellRing, Smartphone, X, Loader2, Sparkles, CheckCircle2 } from 'lucide-react';

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
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      alert('Push notifications are not supported on this browser.');
      return;
    }

    setIsLoading(true);
    setFeedback(null);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm !== 'granted') {
        setFeedback({ type: 'error', text: 'Permission was blocked or closed.' });
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
        throw new Error('Failed to retrieve VAPID key');
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
        throw new Error(saveData.error || 'Server registration failed');
      }

      setIsSubscribed(true);
      setFeedback({ type: 'success', text: 'Enabled! Sending test alert...' });

      // 6. Trigger immediate test notification so user sees it pop up on their phone
      setTimeout(async () => {
        try {
          await fetch('/api/notifications/test-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userType,
              riderId,
              title: userType === 'rider' ? '🛵 Rider Alerts Active!' : '🔔 GoChoww Phone Alerts Active!',
              message: 'Great! You will now receive instant pop-up alerts on your phone status bar.',
            }),
          });
        } catch {
          // ignore
        }
      }, 400);
    } catch (err: any) {
      console.error('Subscription error:', err);
      setFeedback({
        type: 'error',
        text: 'Could not enable. Please ensure permissions are allowed and retry.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestPush = async () => {
    setIsTesting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userType,
          riderId,
          title: '🛵 GoChoww Phone Alert Test',
          message: 'Sound, vibration, and phone status bar notifications are working!',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', text: 'Test alert sent to your phone!' });
      } else {
        setFeedback({ type: 'error', text: 'Could not send test. Try again.' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'Failed to send test push.' });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isSupported || isDismissed) return null;

  // If already subscribed, show slim active pill
  if (isSubscribed) {
    return (
      <div className="flex items-center gap-2 text-xs py-1">
        <button
          onClick={sendTestPush}
          disabled={isTesting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold hover:bg-emerald-100 active:scale-95 transition-all shadow-2xs"
          title="Send test pop-up alert to your phone"
        >
          {isTesting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BellRing className="w-3.5 h-3.5 text-emerald-600" />
          )}
          <span>{isTesting ? 'Sending...' : '🔔 Test Phone Alert'}</span>
        </button>
        {feedback && (
          <span
            className={`text-[11px] font-medium ${
              feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {feedback.text}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-r from-brand-600 to-amber-600 rounded-xl p-3 sm:py-2.5 sm:px-4 text-white shadow-md border border-brand-500/30 overflow-hidden mb-4">
      <div className="relative z-10 flex items-center justify-between gap-3">
        {/* Left icon + text */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-white/20 backdrop-blur-md shrink-0">
            <Smartphone className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
              <span>Enable Phone Pop-Up Alerts</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            </p>
            <p className="text-[11px] text-orange-100 font-normal truncate hidden sm:block">
              Get sound & vibration alerts on your phone status bar for new dispatches.
            </p>
          </div>
        </div>

        {/* Right CTA buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={subscribeToPush}
            disabled={isLoading}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-brand-700 font-black text-xs hover:bg-orange-50 active:scale-95 transition-all shadow-xs"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-600" />
                <span>Enabling...</span>
              </>
            ) : (
              <>
                <BellRing className="w-3.5 h-3.5 text-brand-600" />
                <span>Turn On 🔔</span>
              </>
            )}
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/15 transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mt-2 text-[11px] font-bold px-2 py-1 rounded-md ${
            feedback.type === 'success' ? 'bg-emerald-950/40 text-emerald-200' : 'bg-rose-950/40 text-rose-200'
          }`}
        >
          {feedback.text}
        </div>
      )}
    </div>
  );
};
