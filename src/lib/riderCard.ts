/**
 * Draws a small order card for a rider, to send on WhatsApp when there's a
 * problem with an order: who the customer is, their number, the pickup code,
 * where from and to, and what they ordered. Drawn on a canvas in the browser.
 */

export interface RiderCardOrder {
  orderId: string;
  customerName: string;
  customerPhone?: string | null;
  pickupCode?: string | null;
  cafeteriaName: string;
  deliveryAddress: string;
  createdAt: string;
  items?: { pack: number | null; name: string; quantity: number }[] | null;
}

const FONT = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const MAX_ITEM_LINES = 8;

/** 0805 245 6433 style, from +2348052456433 / 2348052456433 / 08052456433 */
export function localPhone(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const local = digits.startsWith('234') && digits.length === 13 ? '0' + digits.slice(3) : digits;
  return local.length === 11 ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}

export function riderCardText(o: RiderCardOrder): string {
  const lines = [
    `Order ${o.orderId}`,
    `Customer: ${o.customerName}`,
    o.customerPhone ? `Phone: ${localPhone(o.customerPhone).replace(/\s/g, '')}` : null,
    o.pickupCode ? `Pickup code: ${o.pickupCode}` : null,
    `${o.cafeteriaName} → ${o.deliveryAddress}`,
  ];
  return lines.filter(Boolean).join('\n');
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawRiderCard(o: RiderCardOrder): Promise<Blob> {
  if (typeof document !== 'undefined' && (document as any).fonts?.ready) {
    await (document as any).fonts.ready;
  }

  const W = 640; // CSS pixels; drawn at 2x for sharpness
  const S = 2;
  const PAD = 32;
  const inner = W - PAD * 2;

  const items = (o.items || []).filter((i) => i && i.name);
  const shown = items.slice(0, MAX_ITEM_LINES);
  const hidden = items.length - shown.length;
  const itemsBlock = items.length ? 40 + shown.length * 30 + (hidden > 0 ? 28 : 0) : 0;
  const H = 88 + 132 + 118 + 96 + itemsBlock + 56;

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);
  ctx.textBaseline = 'alphabetic';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header strip
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('Go Choww', PAD, 41);
  ctx.font = `500 16px ${MONO}`;
  const idText = o.orderId;
  ctx.fillText(idText, W - PAD - ctx.measureText(idText).width, 40);

  let y = 88;

  // Customer
  ctx.fillStyle = '#64748b';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Customer', PAD, y + 16);
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(fitText(ctx, o.customerName, inner), PAD, y + 54);
  ctx.font = `600 32px ${MONO}`;
  ctx.fillStyle = o.customerPhone ? '#0f172a' : '#94a3b8';
  ctx.fillText(o.customerPhone ? localPhone(o.customerPhone) : 'No phone number', PAD, y + 100);
  y += 132;

  // Pickup code box
  roundRect(ctx, PAD, y, inner, 96, 14);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Pickup code', PAD + 24, y + 38);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 52px ${MONO}`;
  const code = (o.pickupCode || '—').split('').join(' ');
  ctx.fillText(code, W - PAD - 24 - ctx.measureText(code).width, y + 68);
  y += 118;

  // Route
  ctx.fillStyle = '#64748b';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('From', PAD, y + 16);
  ctx.fillText('To', PAD + inner / 2 + 8, y + 16);
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(fitText(ctx, o.cafeteriaName, inner / 2 - 16), PAD, y + 48);
  ctx.fillText(fitText(ctx, o.deliveryAddress, inner / 2 - 8), PAD + inner / 2 + 8, y + 48);
  y += 72;

  // Items
  if (items.length) {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(PAD, y, inner, 1);
    y += 24;
    ctx.fillStyle = '#64748b';
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText('Order', PAD, y + 12);
    y += 20;
    const multiPack = new Set(items.map((i) => i.pack)).size > 1;
    ctx.font = `400 19px ${FONT}`;
    for (const it of shown) {
      ctx.fillStyle = '#0f172a';
      const label = `${it.quantity}× ${it.name}`;
      ctx.fillText(fitText(ctx, label, inner - 90), PAD, y + 22);
      if (multiPack && it.pack !== null) {
        ctx.fillStyle = '#94a3b8';
        const p = `pack ${it.pack}`;
        ctx.fillText(p, W - PAD - ctx.measureText(p).width, y + 22);
      }
      y += 30;
    }
    if (hidden > 0) {
      ctx.fillStyle = '#64748b';
      ctx.fillText(`+ ${hidden} more item${hidden === 1 ? '' : 's'}`, PAD, y + 20);
      y += 28;
    }
  }

  // Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 14px ${FONT}`;
  const when = new Date(o.createdAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
  ctx.fillText(`Ordered ${when}`, PAD, H - 22);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png')
  );
}
