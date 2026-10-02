/**
 * Voice & Audio Notifications Service
 * Hands-free spoken announcements for operational delivery events.
 * 
 * Powered 100% by browser-native Web Audio API and SpeechSynthesis API:
 * - Zero external npm dependencies
 * - Zero backend API roundtrips / zero Supabase egress
 * - Runs completely on-device (laptop/phone)
 */

export interface VoiceOrderSummary {
  customerName?: string | null;
  cafeteriaName?: string | null;
}

const VOICE_STORAGE_KEY = 'gochoww_voice_enabled';

/**
 * Check if voice notifications are enabled.
 * Defaults to true if user hasn't explicitly disabled it.
 */
export function isVoiceEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const saved = localStorage.getItem(VOICE_STORAGE_KEY);
    return saved === null ? true : saved === 'true';
  } catch {
    return false;
  }
}

/**
 * Set voice notifications enabled / disabled state
 */
export function setVoiceEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('voice-settings-updated', { detail: { enabled } }));
  } catch {
    // Ignore storage quota errors
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO CONTEXT CHIME SYNTHESIZER
// ─────────────────────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

export function getOrInitAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Global audio unlocker — call on any user click / tap to bypass browser autoplay policies
 */
export function unlockAudioOnFirstInteraction(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    getOrInitAudioContext();
    // Warm up speech synthesis engine if paused
    if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  };
  window.addEventListener('click', unlock, { once: true });
  window.addEventListener('touchstart', unlock, { once: true });
}

/**
 * Plays a pleasant ascending two-tone chime (*ding-dong*)
 */
export function playAlertChime(): void {
  if (!isVoiceEnabled()) return;
  try {
    const ctx = getOrInitAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Tone 2: 880 Hz (A5) — slightly higher and brighter
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);

    // Haptic vibration on mobile phones
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([150, 80, 150]);
    }
  } catch (err) {
    console.warn('[VoiceNotifications] Chime error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRONUNCIATION FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format cafeteria names so TTS spells abbreviations cleanly (e.g. BBSF -> B-B-S-F Cafeteria)
 */
export function formatSpokenCafeteria(rawName?: string | null): string {
  if (!rawName) return 'the cafeteria';
  const name = rawName.trim();
  const lower = name.toLowerCase();

  if (lower === 'bbsf' || lower.includes('bbsf')) {
    return name.replace(/bbsf/gi, 'B B S F') + (lower.includes('caf') ? '' : ' Cafeteria');
  }
  if (lower === 'caf 2' || lower === 'caf2') return 'Cafeteria 2';
  if (lower === 'caf 1' || lower === 'caf1') return 'Cafeteria 1';
  if (lower === 'student center' || lower === 'sc') return 'Student Center';

  if (
    !lower.includes('cafeteria') &&
    !lower.includes('kitchen') &&
    !lower.includes('restaurant') &&
    !lower.includes('canteen')
  ) {
    return `${name} Cafeteria`;
  }
  return name;
}

/**
 * Extract clean spoken first name for customers (e.g. "Tola Adebayo" -> "Tola")
 */
export function formatSpokenCustomer(rawName?: string | null): string {
  if (!rawName) return 'Customer';
  const trimmed = rawName.trim();
  // Strip out numeric student IDs or extra metadata in brackets
  const clean = trimmed.replace(/\(.*?\)/g, '').replace(/[0-9]/g, '').trim();
  const firstName = clean.split(/\s+/)[0];
  return firstName || 'Customer';
}

/**
 * Format rider name (e.g. "Mr Sodiq" or "Sodiq")
 */
export function formatSpokenRider(rawName?: string | null): string {
  if (!rawName) return 'A rider';
  const clean = rawName.trim().replace(/\(.*?\)/g, '').trim();
  if (!clean.toLowerCase().startsWith('mr') && !clean.toLowerCase().startsWith('rider')) {
    return `Mr ${clean}`;
  }
  return clean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SPEECH SYNTHESIS ENGINE WITH QUEUE
// ─────────────────────────────────────────────────────────────────────────────

interface QueuedSpeech {
  text: string;
  withChime: boolean;
}

const speechQueue: QueuedSpeech[] = [];
let isSpeaking = false;

function processQueue(): void {
  if (speechQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!isVoiceEnabled()) {
    speechQueue.length = 0;
    isSpeaking = false;
    return;
  }

  isSpeaking = true;
  const item = speechQueue.shift()!;

  if (item.withChime) {
    playAlertChime();
  }

  // Slight pause after chime so chime finishes cleanly before speaking
  setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance(item.text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Pick natural sounding voice if available
      const voices = window.speechSynthesis.getVoices();
      const bestVoice = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Victoria'))
      );
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      utterance.onend = () => {
        setTimeout(processQueue, 250);
      };

      utterance.onerror = (e) => {
        console.warn('[VoiceNotifications] Utterance error:', e);
        setTimeout(processQueue, 100);
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[VoiceNotifications] Speech synthesis error:', err);
      processQueue();
    }
  }, item.withChime ? 350 : 50);
}

/**
 * Queue a sentence to be spoken aloud.
 */
export function speakAnnouncement(
  text: string,
  options: { withChime?: boolean; interrupt?: boolean } = {}
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  if (!isVoiceEnabled()) return;

  const withChime = options.withChime !== false;

  if (options.interrupt) {
    window.speechSynthesis.cancel();
    speechQueue.length = 0;
  }

  speechQueue.push({ text, withChime });
  if (!isSpeaking) {
    processQueue();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-LEVEL OPERATIONAL EVENT ANNOUNCERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Announce new orders received from sync.
 * Handles both single orders ("New order received from B-B-S-F Cafeteria for Tola")
 * and smart batch summarization ("3 new orders received: 2 from B-B-S-F and 1 from Cafeteria 2")
 */
export function announceNewOrders(orders: VoiceOrderSummary[]): void {
  if (!orders || orders.length === 0) return;

  if (orders.length === 1) {
    const o = orders[0];
    const caf = formatSpokenCafeteria(o.cafeteriaName);
    const customer = formatSpokenCustomer(o.customerName);
    speakAnnouncement(`New order received from ${caf} for ${customer}.`, { withChime: true });
    return;
  }

  // Batch summary: count by cafeteria
  const cafeCounts = new Map<string, number>();
  orders.forEach((o) => {
    const caf = formatSpokenCafeteria(o.cafeteriaName);
    cafeCounts.set(caf, (cafeCounts.get(caf) || 0) + 1);
  });

  const cafeBreakdown = Array.from(cafeCounts.entries())
    .map(([caf, count]) => `${count} from ${caf}`)
    .join(' and ');

  speakAnnouncement(`${orders.length} new orders received: ${cafeBreakdown}.`, { withChime: true });
}

/**
 * Announce rider lifecycle events:
 * - claim: "Mr Sodiq has accepted Tola's order from B-B-S-F Cafeteria"
 * - pickup: "Mr Sodiq picked up Tola's order from B-B-S-F Cafeteria"
 * - deliver: "Mr Sodiq completed delivery of Tola's order"
 */
export function announceRiderAction(
  action: 'claim' | 'pickup' | 'deliver' | string,
  riderName: string,
  customerName?: string | null,
  cafeteriaName?: string | null
): void {
  const rider = formatSpokenRider(riderName);
  const customer = customerName ? `${formatSpokenCustomer(customerName)}'s` : 'an';
  const caf = cafeteriaName ? ` from ${formatSpokenCafeteria(cafeteriaName)}` : '';

  if (action === 'claim' || action === 'accept') {
    speakAnnouncement(`${rider} has accepted ${customer} order${caf}.`, { withChime: true });
  } else if (action === 'deliver' || action === 'completed') {
    speakAnnouncement(`${rider} completed delivery of ${customer} order.`, { withChime: true });
  } else if (action === 'pickup') {
    speakAnnouncement(`${rider} picked up ${customer} order${caf}.`, { withChime: true });
  }
}
