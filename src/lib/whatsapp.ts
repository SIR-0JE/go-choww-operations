import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import path from 'path';
import fs from 'fs';

export interface WhatsAppUserState {
  id?: string;
  name?: string;
  phone?: string;
}

export interface BroadcastLogItem {
  id: string;
  timestamp: string;
  name: string;
  phone: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface BroadcastQueueState {
  campaignId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';
  total: number;
  sent: number;
  failed: number;
  currentIndex: number;
  currentContact: { name: string; phone: string } | null;
  startedAt?: string;
  finishedAt?: string;
  logs: BroadcastLogItem[];
}

export interface WhatsAppServiceState {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';
  qrCodeDataUrl: string | null;
  pairingCode: string | null;
  user: WhatsAppUserState | null;
  lastError: string | null;
}

// Global singleton declaration to preserve WhatsApp socket across Next.js reloads
declare global {
  // eslint-disable-next-line no-var
  var __wa_client_instance__: WASocket | null | undefined;
  // eslint-disable-next-line no-var
  var __wa_state__: WhatsAppServiceState | undefined;
  // eslint-disable-next-line no-var
  var __wa_broadcast_queue__: BroadcastQueueState | undefined;
  // eslint-disable-next-line no-var
  var __wa_is_initializing__: boolean | undefined;
}

const AUTH_FOLDER = path.join(process.cwd(), '.whatsapp-session');

// Ensure directory exists
if (!fs.existsSync(AUTH_FOLDER)) {
  fs.mkdirSync(AUTH_FOLDER, { recursive: true });
}

if (!globalThis.__wa_state__) {
  globalThis.__wa_state__ = {
    status: 'disconnected',
    qrCodeDataUrl: null,
    pairingCode: null,
    user: null,
    lastError: null,
  };
}

if (!globalThis.__wa_broadcast_queue__) {
  globalThis.__wa_broadcast_queue__ = {
    campaignId: '',
    status: 'idle',
    total: 0,
    sent: 0,
    failed: 0,
    currentIndex: 0,
    currentContact: null,
    logs: [],
  };
}

/**
 * Normalizes phone numbers to standard format (e.g. 08012345678 -> 2348012345678)
 */
export function cleanPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0') && digits.length === 11) {
    digits = '234' + digits.slice(1);
  } else if (!digits.startsWith('234') && digits.length === 10) {
    digits = '234' + digits;
  }
  return digits;
}

/**
 * Initializes and connects the WhatsApp Baileys Multi-Device Socket
 * Waits for the first QR code / connection event before returning so the UI gets instant response.
 */
export async function initWhatsAppSocket(forceFresh = false): Promise<WhatsAppServiceState> {
  if (!forceFresh && globalThis.__wa_client_instance__ && globalThis.__wa_state__?.status === 'connected') {
    return globalThis.__wa_state__;
  }

  if (forceFresh) {
    try {
      if (globalThis.__wa_client_instance__) {
        globalThis.__wa_client_instance__.end(undefined);
        globalThis.__wa_client_instance__ = null;
      }
      if (fs.existsSync(AUTH_FOLDER)) {
        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        fs.mkdirSync(AUTH_FOLDER, { recursive: true });
      }
    } catch (e) {
      console.warn('Failed to clean auth folder on fresh init:', e);
    }
  }

  globalThis.__wa_state__!.status = 'connecting';
  globalThis.__wa_state__!.lastError = null;
  globalThis.__wa_state__!.qrCodeDataUrl = null;
  globalThis.__wa_state__!.pairingCode = null;

  return new Promise<WhatsAppServiceState>(async (resolve) => {
    let hasResolved = false;
    const safeResolve = (state: WhatsAppServiceState) => {
      if (!hasResolved) {
        hasResolved = true;
        resolve(state);
      }
    };

    // Timeout safeguard: resolve after 8s even if QR is still negotiating
    const timeoutTimer = setTimeout(() => {
      safeResolve(globalThis.__wa_state__!);
    }, 8000);

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
      
      let version = [2, 3000, 1015901307] as any;
      try {
        const remoteVersion = await fetchLatestBaileysVersion();
        if (remoteVersion?.version) version = remoteVersion.version;
      } catch (e) {
        console.warn('Using fallback Baileys version:', e);
      }

      const logger = pino({ level: 'silent' });

      const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false,
        connectTimeoutMs: 60_000,
        defaultQueryTimeoutMs: 60_000,
        keepAliveIntervalMs: 25_000,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
      });

      globalThis.__wa_client_instance__ = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 2,
              scale: 7,
              color: {
                dark: '#0f172a',
                light: '#ffffff',
              },
            });
            globalThis.__wa_state__!.status = 'qr_ready';
            globalThis.__wa_state__!.qrCodeDataUrl = qrDataUrl;
            clearTimeout(timeoutTimer);
            safeResolve(globalThis.__wa_state__!);
          } catch (err: any) {
            console.error('[WhatsApp QR generation error]:', err);
          }
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.log(`[WhatsApp Connection Closed] code=${statusCode}, reconnecting=${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            globalThis.__wa_state__ = {
              status: 'disconnected',
              qrCodeDataUrl: null,
              pairingCode: null,
              user: null,
              lastError: 'WhatsApp session logged out. Please scan QR again.',
            };
            globalThis.__wa_client_instance__ = null;
            try {
              if (fs.existsSync(AUTH_FOLDER)) {
                fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
                fs.mkdirSync(AUTH_FOLDER, { recursive: true });
              }
            } catch (e) {
              console.warn('Failed to clear auth folder:', e);
            }
          } else {
            globalThis.__wa_state__!.status = 'disconnected';
            globalThis.__wa_client_instance__ = null;
          }
        } else if (connection === 'open') {
          const rawJid = sock.user?.id || '';
          const phone = rawJid.split(':')[0] || rawJid.split('@')[0] || '';
          const name = sock.user?.name || 'GoChow Operations';

          globalThis.__wa_state__ = {
            status: 'connected',
            qrCodeDataUrl: null,
            pairingCode: null,
            user: {
              id: rawJid,
              name,
              phone,
            },
            lastError: null,
          };
          console.log(`[WhatsApp Connected Successfully] user=${name} (${phone})`);
          clearTimeout(timeoutTimer);
          safeResolve(globalThis.__wa_state__!);
        }
      });
    } catch (error: any) {
      console.error('[WhatsApp Socket Init Error]:', error);
      globalThis.__wa_state__ = {
        status: 'error',
        qrCodeDataUrl: null,
        pairingCode: null,
        user: null,
        lastError: error?.message || 'Failed to initialize WhatsApp engine.',
      };
      clearTimeout(timeoutTimer);
      safeResolve(globalThis.__wa_state__!);
    }
  });
}

/**
 * Generates an 8-character Pairing Code for phone pairing without camera QR scan
 */
export async function requestWhatsAppPairingCode(phoneNumber: string): Promise<string | null> {
  const clean = cleanPhoneNumber(phoneNumber);
  if (!clean) throw new Error('Please enter a valid phone number (e.g. 08012345678 or +234...)');

  // Initialize socket first if not running
  if (!globalThis.__wa_client_instance__) {
    await initWhatsAppSocket(true);
  }

  const sock = globalThis.__wa_client_instance__;
  if (!sock) throw new Error('WhatsApp engine could not start.');

  try {
    if (typeof (sock as any).requestPairingCode === 'function') {
      const code = await (sock as any).requestPairingCode(clean);
      globalThis.__wa_state__!.pairingCode = code;
      return code;
    }
    throw new Error('Pairing code is not supported by this WhatsApp version. Please use the QR code.');
  } catch (err: any) {
    console.error('[WhatsApp Pairing Code Error]:', err);
    throw new Error(err?.message || 'Failed to generate pairing code.');
  }
}

/**
 * Gets current WhatsApp connection state
 */
export function getWhatsAppStatus(): WhatsAppServiceState {
  return globalThis.__wa_state__ || {
    status: 'disconnected',
    qrCodeDataUrl: null,
    pairingCode: null,
    user: null,
    lastError: null,
  };
}

/**
 * Disconnects and unlinks current WhatsApp account
 */
export async function logoutWhatsApp(): Promise<boolean> {
  try {
    if (globalThis.__wa_client_instance__) {
      await globalThis.__wa_client_instance__.logout().catch(() => {});
      globalThis.__wa_client_instance__ = null;
    }
    if (fs.existsSync(AUTH_FOLDER)) {
      fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
      fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    }
    globalThis.__wa_state__ = {
      status: 'disconnected',
      qrCodeDataUrl: null,
      pairingCode: null,
      user: null,
      lastError: null,
    };
    return true;
  } catch (err) {
    console.error('[WhatsApp Logout Error]:', err);
    return false;
  }
}

/**
 * Sends a single WhatsApp message directly via the active socket
 */
export async function sendDirectMessage(phone: string, text: string): Promise<boolean> {
  const clean = cleanPhoneNumber(phone);
  if (!clean) throw new Error('Invalid recipient phone number');

  if (!globalThis.__wa_client_instance__ || globalThis.__wa_state__?.status !== 'connected') {
    throw new Error('WhatsApp is not connected. Please scan the QR code to link your WhatsApp account.');
  }

  const jid = `${clean}@s.whatsapp.net`;
  await globalThis.__wa_client_instance__.sendMessage(jid, { text });
  return true;
}

/**
 * Starts automated background broadcast queue
 */
export async function startBackgroundBroadcast(
  campaignId: string,
  recipients: Array<{
    id: string;
    name: string;
    phone: string | null;
    favoriteCafeteria?: string;
    orderCount?: number;
    lastAddress?: string;
  }>,
  template: string
): Promise<BroadcastQueueState> {
  if (!globalThis.__wa_client_instance__ || globalThis.__wa_state__?.status !== 'connected') {
    throw new Error('WhatsApp is not connected. Please scan QR code first.');
  }

  const validRecipients = recipients.filter((r) => Boolean(r.phone && cleanPhoneNumber(r.phone)));

  if (validRecipients.length === 0) {
    throw new Error('No valid recipients with phone numbers found.');
  }

  const queue: BroadcastQueueState = {
    campaignId: campaignId || `campaign_${Date.now()}`,
    status: 'running',
    total: validRecipients.length,
    sent: 0,
    failed: 0,
    currentIndex: 0,
    currentContact: null,
    startedAt: new Date().toISOString(),
    logs: [],
  };

  globalThis.__wa_broadcast_queue__ = queue;

  // Run the background loop asynchronously
  (async () => {
    for (let i = 0; i < validRecipients.length; i++) {
      if (globalThis.__wa_broadcast_queue__?.status !== 'running') {
        console.log(`[Broadcast Queue] Halted at index ${i}, status: ${globalThis.__wa_broadcast_queue__?.status}`);
        break;
      }

      const rec = validRecipients[i];
      const cleanPhone = cleanPhoneNumber(rec.phone)!;
      const firstName = rec.name.split(' ')[0] || rec.name || 'Valued Customer';

      const personalized = template
        .replace(/\{\{name\}\}/gi, firstName)
        .replace(/\{\{fullname\}\}/gi, rec.name || 'Valued Customer')
        .replace(/\{\{cafeteria\}\}/gi, rec.favoriteCafeteria || 'Campus Cafeteria')
        .replace(/\{\{orders\}\}/gi, String(rec.orderCount || 1))
        .replace(/\{\{phone\}\}/gi, rec.phone || '')
        .replace(/\{\{address\}\}/gi, rec.lastAddress || 'Campus Hostel');

      globalThis.__wa_broadcast_queue__!.currentIndex = i + 1;
      globalThis.__wa_broadcast_queue__!.currentContact = {
        name: rec.name,
        phone: rec.phone!,
      };

      try {
        const jid = `${cleanPhone}@s.whatsapp.net`;
        await globalThis.__wa_client_instance__!.sendMessage(jid, { text: personalized });

        globalThis.__wa_broadcast_queue__!.sent += 1;
        globalThis.__wa_broadcast_queue__!.logs.unshift({
          id: `${rec.id}_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          name: rec.name,
          phone: rec.phone!,
          status: 'success',
        });
      } catch (sendErr: any) {
        console.error(`[Broadcast Send Failure for ${rec.name} (${rec.phone})]:`, sendErr?.message);
        globalThis.__wa_broadcast_queue__!.failed += 1;
        globalThis.__wa_broadcast_queue__!.logs.unshift({
          id: `${rec.id}_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          name: rec.name,
          phone: rec.phone!,
          status: 'failed',
          error: sendErr?.message || 'Delivery error',
        });
      }

      // Safe pacing delay between 1.8s and 2.8s
      const jitterDelay = 1800 + Math.floor(Math.random() * 1000);
      await new Promise((resolve) => setTimeout(resolve, jitterDelay));
    }

    if (globalThis.__wa_broadcast_queue__?.status === 'running') {
      globalThis.__wa_broadcast_queue__!.status = 'completed';
      globalThis.__wa_broadcast_queue__!.finishedAt = new Date().toISOString();
      globalThis.__wa_broadcast_queue__!.currentContact = null;
    }
  })().catch((fatalErr) => {
    console.error('[Broadcast Fatal Loop Error]:', fatalErr);
    if (globalThis.__wa_broadcast_queue__) {
      globalThis.__wa_broadcast_queue__.status = 'error';
    }
  });

  return queue;
}

/**
 * Gets the current active broadcast queue state
 */
export function getBroadcastQueueStatus(): BroadcastQueueState {
  return (
    globalThis.__wa_broadcast_queue__ || {
      campaignId: '',
      status: 'idle',
      total: 0,
      sent: 0,
      failed: 0,
      currentIndex: 0,
      currentContact: null,
      logs: [],
    }
  );
}

/**
 * Controls the active broadcast queue (pause, resume, stop)
 */
export function controlBroadcastQueue(action: 'pause' | 'resume' | 'stop'): BroadcastQueueState {
  if (!globalThis.__wa_broadcast_queue__) {
    throw new Error('No active broadcast campaign found.');
  }

  if (action === 'pause') {
    globalThis.__wa_broadcast_queue__.status = 'paused';
  } else if (action === 'resume') {
    globalThis.__wa_broadcast_queue__.status = 'running';
  } else if (action === 'stop') {
    globalThis.__wa_broadcast_queue__.status = 'stopped';
    globalThis.__wa_broadcast_queue__.finishedAt = new Date().toISOString();
  }

  return globalThis.__wa_broadcast_queue__;
}
