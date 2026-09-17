import { prisma } from './prisma';

export interface SyncScheduleSettings {
  mode: 'scheduled' | 'always' | 'paused';
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "22:00"
  timezone: string;  // e.g. "Africa/Lagos" (West Africa Time, UTC+1)
  intervalSeconds: number; // e.g. 15
  daysOfWeek: number[]; // 0=Sunday, 1=Monday ... 6=Saturday
  lastUpdated?: string;
}

export const DEFAULT_SYNC_SETTINGS: SyncScheduleSettings = {
  mode: 'scheduled',
  startTime: '08:00', // 8:00 AM
  endTime: '22:00',   // 10:00 PM
  timezone: 'Africa/Lagos',
  intervalSeconds: 15,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Active all 7 days by default
  lastUpdated: new Date().toISOString(),
};

const SETTINGS_KEY = 'sync_schedule';

// Module-level in-memory cache for sub-millisecond lookups and instant offline resilience
let cachedSettings: SyncScheduleSettings = { ...DEFAULT_SYNC_SETTINGS };

/**
 * Format 24-hour time "08:00" to friendly 12-hour "08:00 AM"
 */
export function formatTimeTo12h(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24 || '08:00 AM';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get current time details in the specified timezone (default Nigeria Africa/Lagos)
 */
export function getCurrentTimeInZone(timezone: string = 'Africa/Lagos', baseDate: Date = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });

    const parts = formatter.formatToParts(baseDate);
    const hourPart = parts.find((p) => p.type === 'hour')?.value || '00';
    const minutePart = parts.find((p) => p.type === 'minute')?.value || '00';

    const hour = parseInt(hourPart, 10);
    const minute = parseInt(minutePart, 10);

    const nowTzString = baseDate.toLocaleString('en-US', { timeZone: timezone });
    const nowInTz = new Date(nowTzString);
    const dayOfWeek = nowInTz.getDay();

    const timeString24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    const timeString12 = formatTimeTo12h(timeString24);

    return {
      hour,
      minute,
      dayOfWeek,
      timeString24,
      timeString12,
      nowInTz,
    };
  } catch {
    // Fallback if timezone string is invalid
    const h = baseDate.getHours();
    const m = baseDate.getMinutes();
    const timeString24 = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    return {
      hour: h,
      minute: m,
      dayOfWeek: baseDate.getDay(),
      timeString24,
      timeString12: formatTimeTo12h(timeString24),
      nowInTz: baseDate,
    };
  }
}

/**
 * Checks whether the current moment falls within the operating schedule
 */
export function isWithinOperatingWindow(
  settings: SyncScheduleSettings = cachedSettings,
  baseDate: Date = new Date()
): boolean {
  if (settings.mode === 'always') return true;
  if (settings.mode === 'paused') return false;

  const { hour, minute, dayOfWeek } = getCurrentTimeInZone(settings.timezone || 'Africa/Lagos', baseDate);

  // Check if day of week is enabled
  if (Array.isArray(settings.daysOfWeek) && settings.daysOfWeek.length > 0) {
    if (!settings.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }
  }

  const currentMinutes = hour * 60 + minute;

  const [startH, startM] = (settings.startTime || '08:00').split(':').map((s) => parseInt(s, 10) || 0);
  const startMinutes = startH * 60 + startM;

  const [endH, endM] = (settings.endTime || '22:00').split(':').map((s) => parseInt(s, 10) || 0);
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Standard daytime shift (e.g. 08:00 to 22:00)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight shift (e.g. 18:00 to 02:00)
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

/**
 * Returns comprehensive operational status and human-readable metadata
 */
export function getOperationalStatus(
  settings: SyncScheduleSettings = cachedSettings,
  baseDate: Date = new Date()
) {
  const { timeString12 } = getCurrentTimeInZone(settings.timezone || 'Africa/Lagos', baseDate);
  const isOperating = isWithinOperatingWindow(settings, baseDate);
  const start12 = formatTimeTo12h(settings.startTime);
  const end12 = formatTimeTo12h(settings.endTime);

  let statusText = '';
  let badgeText = '';
  let nextWindowText = '';

  if (settings.mode === 'paused') {
    statusText = 'Auto-Sync is manually paused. Background polling is disabled.';
    badgeText = 'Paused';
    nextWindowText = 'Paused by administrator. Enable schedule in Settings to resume.';
  } else if (settings.mode === 'always') {
    statusText = `Auto-Sync is continuously active (24/7). Polling every ${settings.intervalSeconds}s.`;
    badgeText = 'Live';
    nextWindowText = 'Running 24/7 continuous operations.';
  } else {
    // Scheduled window
    if (isOperating) {
      statusText = `Auto-Sync is ACTIVE (${start12} – ${end12} WAT). Polling every ${settings.intervalSeconds}s.`;
      badgeText = 'Live';
      nextWindowText = `Operating window is open until ${end12} today.`;
    } else {
      statusText = `Auto-Sync is SLEEPING outside operating window (${start12} – ${end12} WAT).`;
      badgeText = 'Sleeping';
      nextWindowText = `Auto-sync will automatically resume at ${start12}.`;
    }
  }

  return {
    isOperating,
    mode: settings.mode,
    statusText,
    badgeText,
    currentTimeFormatted: `${timeString12} WAT`,
    startFormatted: start12,
    endFormatted: end12,
    nextWindowText,
  };
}

/**
 * Fetch settings from database with resilient fallback to cached settings
 */
export async function getSyncSettings(): Promise<SyncScheduleSettings> {
  try {
    const record = await (prisma as any).systemSetting?.findUnique({
      where: { key: SETTINGS_KEY },
    });

    if (record?.value) {
      const parsed = JSON.parse(record.value);
      cachedSettings = {
        ...DEFAULT_SYNC_SETTINGS,
        ...parsed,
      };
      return cachedSettings;
    }
  } catch (err) {
    console.warn('[getSyncSettings] DB read notice, using cached settings:', err);
  }

  return cachedSettings;
}

/**
 * Save settings to database and immediately update cached settings
 */
export async function saveSyncSettings(newSettings: Partial<SyncScheduleSettings>): Promise<SyncScheduleSettings> {
  const merged: SyncScheduleSettings = {
    ...cachedSettings,
    ...newSettings,
    lastUpdated: new Date().toISOString(),
  };

  cachedSettings = merged;

  try {
    await (prisma as any).systemSetting?.upsert({
      where: { key: SETTINGS_KEY },
      update: {
        value: JSON.stringify(merged),
      },
      create: {
        key: SETTINGS_KEY,
        value: JSON.stringify(merged),
      },
    });
  } catch (err) {
    console.warn('[saveSyncSettings] DB write notice, settings cached in memory:', err);
  }

  return merged;
}
