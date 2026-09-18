/**
 * Notification Storage Utility
 * Persists rider activity + new order notifications in localStorage.
 * All entries older than 24 hours are automatically purged on read/write.
 */

export type NotificationType = 'claim' | 'pickup' | 'deliver' | 'new_order' | 'transfer';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** ISO string timestamp */
  timestamp: string;
  read: boolean;
  /** Short order ID fragment for linking */
  orderId?: string;
}

const STORAGE_KEY = 'gochoww_notifications';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Load all non-expired notifications from localStorage */
export function loadNotifications(): AppNotification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: AppNotification[] = JSON.parse(raw);
    const cutoff = Date.now() - TTL_MS;
    return parsed.filter((n) => new Date(n.timestamp).getTime() > cutoff);
  } catch {
    return [];
  }
}

/** Save notifications to localStorage (always purges entries older than 24h) */
function saveNotifications(notifications: AppNotification[]): void {
  if (typeof window === 'undefined') return;
  try {
    const cutoff = Date.now() - TTL_MS;
    const fresh = notifications.filter((n) => new Date(n.timestamp).getTime() > cutoff);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    // Storage quota exceeded or private mode — silently ignore
  }
}

/** Push a new notification to storage */
export function pushNotification(notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): AppNotification {
  const existing = loadNotifications();
  const newNotif: AppNotification = {
    ...notification,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };
  saveNotifications([newNotif, ...existing]);
  // Dispatch storage event so other tabs/components can react
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
  return newNotif;
}

/** Mark all notifications as read */
export function markAllRead(): void {
  const existing = loadNotifications();
  saveNotifications(existing.map((n) => ({ ...n, read: true })));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
}

/** Clear all notifications from storage */
export function clearAllNotifications(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('notifications-updated'));
  }
}

/** Count unread notifications */
export function countUnread(): number {
  return loadNotifications().filter((n) => !n.read).length;
}

/** Build a notification from a rider action */
export function buildRiderNotification(
  action: NotificationType,
  riderName: string,
  orderId: string
): Omit<AppNotification, 'id' | 'timestamp' | 'read'> {
  const shortId = `#${orderId?.slice(-8) || orderId}`;
  switch (action) {
    case 'claim':
      return {
        type: 'claim',
        title: 'Order Accepted',
        body: `${riderName} accepted order ${shortId}`,
        orderId,
      };
    case 'pickup':
      return {
        type: 'pickup',
        title: 'Order Picked Up',
        body: `${riderName} picked up order ${shortId} — now in transit`,
        orderId,
      };
    case 'deliver':
      return {
        type: 'deliver',
        title: 'Order Delivered ✓',
        body: `${riderName} completed delivery of order ${shortId}`,
        orderId,
      };
    case 'transfer':
      return {
        type: 'transfer',
        title: 'Order Transferred',
        body: `${riderName} transferred order ${shortId} to another rider`,
        orderId,
      };
    default:
      return {
        type: action,
        title: 'Rider Activity',
        body: `${riderName} performed an action on order ${shortId}`,
        orderId,
      };
  }
}
