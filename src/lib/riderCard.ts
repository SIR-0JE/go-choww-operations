/**
 * Draws a small card to send a rider on WhatsApp when there's a problem with an
 * order: the pickup code (biggest), cafeteria and where to deliver (bold) with the
 * food items under it, and the customer's name with a smaller phone number. Drawn on a canvas in the browser.
 */

import { localPhone as callable, prettyPhone } from '@/lib/phone';

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

const MAX_ITEMS = 10;
const FONT = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';


export function riderCardText(o: RiderCardOrder): string {
  const lines = [
    o.pickupCode ? `Pickup code: ${o.pickupCode}` : null,
    `${o.cafeteriaName} → ${o.deliveryAddress}`,
    `${o.customerName}${o.customerPhone ? ` · ${callable(o.customerPhone)}` : ''}`,
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

  // Food items go under the delivery location; the card grows to fit them
  const items = (o.items || []).filter((i) => i && i.name);
  const shown = items.slice(0, MAX_ITEMS);
  const hidden = items.length - shown.length;
  const multiPack = new Set(items.map((i) => i.pack).filter((p) => p !== null)).size > 1;
  const ITEM_LINE = 28;
  const itemsHeight = items.length ? 22 + shown.length * ITEM_LINE + (hidden > 0 ? ITEM_LINE : 0) : 0;

  const W = 600; // CSS pixels; drawn at 2x for sharpness
  const H = 600 + itemsHeight;
  const S = 2;
  const PAD = 36;
  const inner = W - PAD * 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(S, S);
  ctx.textBaseline = 'alphabetic';

  // Background + thin brand bar
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f97316';
  ctx.fillRect(0, 0, W, 8);

  // Brand
  ctx.fillStyle = '#f97316';
  ctx.font = `700 18px ${FONT}`;
  ctx.fillText('Go Choww', PAD, 52);

  // Pickup code: the main thing
  const boxY = 76;
  const boxH = 220;
  roundRect(ctx, PAD, boxY, inner, boxH, 22);
  ctx.fillStyle = '#fff7ed';
  ctx.fill();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9a3412';
  ctx.font = `600 18px ${FONT}`;
  ctx.fillText('PICKUP CODE', W / 2, boxY + 48);
  ctx.fillStyle = '#0f172a';
  const code = (o.pickupCode || '—').split('').join('  ');
  let size = 120;
  ctx.font = `800 ${size}px ${FONT}`;
  while (ctx.measureText(code).width > inner - 48 && size > 48) {
    size -= 4;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  ctx.fillText(code, W / 2, boxY + 70 + size * 0.95);
  ctx.textAlign = 'left';

  // Route: cafeteria -> location, both bold
  let y = boxY + boxH + 44;
  const dotX = PAD + 8;
  const textX = PAD + 34;
  const textW = inner - 34;
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(dotX, y + 22, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(dotX - 1, y + 36, 2, 60);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(dotX, y + 110, 7, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Cafeteria', textX, y + 6);
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(fitText(ctx, o.cafeteriaName, textW), textX, y + 36);

  ctx.fillStyle = '#64748b';
  ctx.font = `500 15px ${FONT}`;
  ctx.fillText('Deliver to', textX, y + 94);
  ctx.fillStyle = '#0f172a';
  ctx.font = `800 30px ${FONT}`;
  ctx.fillText(fitText(ctx, o.deliveryAddress, textW), textX, y + 124);

  if (items.length) {
    let iy = y + 124 + 22;
    ctx.font = `400 19px ${FONT}`;
    for (const it of shown) {
      iy += ITEM_LINE;
      ctx.fillStyle = '#334155';
      ctx.fillText(fitText(ctx, `${it.quantity}× ${it.name}`, textW - (multiPack ? 70 : 0)), textX, iy);
      if (multiPack && it.pack !== null) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `400 16px ${FONT}`;
        const p = `pack ${it.pack}`;
        ctx.fillText(p, W - PAD - ctx.measureText(p).width, iy);
        ctx.font = `400 19px ${FONT}`;
      }
    }
    if (hidden > 0) {
      iy += ITEM_LINE;
      ctx.fillStyle = '#64748b';
      ctx.fillText(`+ ${hidden} more`, textX, iy);
    }
  }

  // Customer: name and a smaller phone number
  y = H - 66;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(PAD, y - 24, inner, 1);
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 20px ${FONT}`;
  const phone = o.customerPhone ? prettyPhone(o.customerPhone) : '';
  ctx.font = `500 18px ${FONT}`;
  const phoneW = phone ? ctx.measureText(phone).width : 0;
  ctx.font = `600 20px ${FONT}`;
  ctx.fillText(fitText(ctx, o.customerName, inner - phoneW - 24), PAD, y + 20);
  if (phone) {
    ctx.fillStyle = '#475569';
    ctx.font = `500 18px ${FONT}`;
    ctx.fillText(phone, W - PAD - phoneW, y + 20);
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create image'))), 'image/png')
  );
}
