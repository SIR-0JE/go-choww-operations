'use client';

import { telHref, whatsappNumber as waNumber, prettyPhone as localPhone } from '@/lib/phone';
import React, { useEffect, useState } from 'react';
import { X, Phone, MessageSquare, Copy, Check, Send, Pencil, Store } from 'lucide-react';
import { formatNaira } from '@/lib/financials';
import { drawRiderCard, riderCardText } from '@/lib/riderCard';

interface OrderItem {
  pack: number | null;
  name: string;
  quantity: number;
  price: number;
  category: string | null;
}

export interface OrderSummary {
  id: string;
  orderId: string;
  createdAt: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryType: string;
  orderStatus: string;
  paymentStatus: string;
  foodTotal: number;
  deliveryFee: number;
  totalAmountPaid: number;
  riderPayout?: number;
  pickupCode?: string | null;
  customerPhone?: string | null;
  rider?: { id: string; name: string; phone?: string | null } | null;
}

interface FullOrder extends OrderSummary {
  items?: OrderItem[] | null;
  serviceCharge?: number | null;
  paymentReference?: string | null;
  vendorPhone?: string | null;
}

const whatsappLink = (phone: string, text?: string) =>
  `https://wa.me/${waNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

function statusLabel(status: string) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'completed') return ['Delivered', 'bg-emerald-50 text-emerald-700'];
  if (s.includes('canc')) return ['Cancelled', 'bg-slate-100 text-slate-500'];
  if (s === 'in transit' || s === 'dispatched') return ['On the way', 'bg-blue-50 text-blue-700'];
  if (s === 'ready') return ['Ready', 'bg-amber-50 text-amber-700'];
  if (s === 'preparing') return ['Preparing', 'bg-amber-50 text-amber-700'];
  return [status || 'Confirmed', 'bg-slate-100 text-slate-600'];
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked; nothing to do */
        }
      }}
      className="h-10 w-10 shrink-0 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500"
      aria-label={label}
      title={label}
    >
      {done ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

export function OrderDetailSheet({
  summary,
  onClose,
  onEdit,
}: {
  summary: OrderSummary;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const [order, setOrder] = useState<FullOrder>(summary);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/orders/${encodeURIComponent(summary.id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.success) setOrder({ ...summary, ...d.order });
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [summary]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendToRider = async () => {
    setSending(true);
    setNote(null);
    try {
      const blob = await drawRiderCard(order);
      const file = new File([blob], `${order.orderId}.png`, { type: 'image/png' });
      const text = riderCardText(order);
      const nav = navigator as any;
      // On phones: share straight to WhatsApp with the image and the details as text
      // (the phone number in the text is tappable, unlike the one in the picture)
      if (nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({ files: [file], text });
          return;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }
      }
      // Laptop / no share sheet: save the image and copy the text
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${order.orderId}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      try {
        await navigator.clipboard.writeText(text);
        setNote('Image saved. The details (with the phone number) are copied, so paste them with the image.');
      } catch {
        setNote('Image saved.');
      }
    } catch {
      setNote('Could not create the image. Try again.');
    } finally {
      setSending(false);
    }
  };

  const [statusText, statusClass] = statusLabel(order.orderStatus);
  const paid = ['success', 'paid'].includes((order.paymentStatus || '').toLowerCase());
  const items = order.items || [];
  const packs = Array.from(new Set(items.map((i) => i.pack)));
  const multiPack = packs.filter((p) => p !== null).length > 1;
  const placed = new Date(order.createdAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
  const phone = order.customerPhone ? localPhone(order.customerPhone) : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Order ${order.orderId}`}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 truncate">{order.customerName}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="font-mono">{order.orderId}</span> · {placed}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className={`px-2 py-0.5 rounded-full font-medium ${statusClass}`}>{statusText}</span>
              <span className={`px-2 py-0.5 rounded-full font-medium ${paid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {paid ? 'Paid' : order.paymentStatus || 'Unpaid'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{order.deliveryType}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* What the rider needs */}
          <section className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <div className="min-w-0">
              <div className="text-xs text-slate-500">Customer phone</div>
              <div className="text-lg font-semibold font-mono text-slate-900">{phone || '—'}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Pickup code</div>
              <div className="text-2xl font-semibold font-mono tracking-[0.15em] text-slate-900">{order.pickupCode || '—'}</div>
            </div>
          </section>
          {order.customerPhone && (
            <div className="flex gap-2 -mt-2">
              <a
                href={telHref(order.customerPhone)}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 flex items-center justify-center gap-1.5"
              >
                <Phone className="w-4 h-4 text-slate-500" /> Call
              </a>
              <a
                href={whatsappLink(order.customerPhone)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 h-10 rounded-lg border border-slate-200 text-sm font-medium text-slate-800 flex items-center justify-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4 text-emerald-600" /> WhatsApp
              </a>
              <CopyButton value={phone.replace(/\s/g, '')} label="Copy phone number" />
            </div>
          )}

          {/* Route */}
          <section className="rounded-lg bg-slate-50 px-3 py-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs text-slate-500">From</div>
                <div className="font-medium text-slate-900 truncate">{order.cafeteriaName}</div>
              </div>
              {order.vendorPhone && (
                <a
                  href={telHref(order.vendorPhone)}
                  className="shrink-0 h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-700 flex items-center gap-1.5"
                >
                  <Store className="w-3.5 h-3.5 text-slate-400" /> Call cafeteria
                </a>
              )}
            </div>
            <div>
              <div className="text-xs text-slate-500">To</div>
              <div className="font-medium text-slate-900">{order.deliveryAddress}</div>
            </div>
            <div className="text-xs text-slate-500">
              Rider: <span className="text-slate-800 font-medium">{order.rider?.name || 'Not assigned'}</span>
            </div>
          </section>

          {/* Items */}
          <section>
            <h3 className="text-sm font-medium text-slate-900">
              Items{items.length > 0 && <span className="text-slate-400 font-normal"> · {items.reduce((n, i) => n + i.quantity, 0)}</span>}
            </h3>
            {!loaded ? (
              <div className="mt-2 h-16 rounded-lg bg-slate-50 animate-pulse" />
            ) : items.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Item list not available for this order yet.</p>
            ) : (
              <div className="mt-1 divide-y divide-slate-100">
                {packs.map((p) => (
                  <div key={String(p)} className="py-1.5">
                    {(multiPack || p === null) && (
                      <div className="text-xs text-slate-400 py-1">{p === null ? 'Extras' : `Pack ${p}`}</div>
                    )}
                    {items
                      .filter((i) => i.pack === p)
                      .map((i, idx) => (
                        <div key={idx} className="flex justify-between gap-3 text-sm py-0.5">
                          <span className="text-slate-800 min-w-0">
                            {i.quantity}× {i.name}
                          </span>
                          <span className="text-slate-500 tabular-nums shrink-0">{formatNaira(i.price * i.quantity)}</span>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Money */}
          <section className="text-sm space-y-1 border-t border-slate-100 pt-3">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatNaira(order.foodTotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Delivery fee</span>
              <span className="tabular-nums">{formatNaira(order.deliveryFee)}</span>
            </div>
            {order.serviceCharge != null && (
              <div className="flex justify-between text-slate-600">
                <span>Service charge</span>
                <span className="tabular-nums">{formatNaira(order.serviceCharge)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold text-slate-900 pt-1">
              <span>Total paid</span>
              <span className="tabular-nums">{formatNaira(order.totalAmountPaid)}</span>
            </div>
            {order.paymentReference && (
              <div className="flex justify-between gap-3 text-xs text-slate-500 pt-2">
                <span>Payment reference</span>
                <span className="font-mono text-slate-700 truncate">{order.paymentReference}</span>
              </div>
            )}
          </section>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-slate-100 space-y-2">
          {note && <p className="text-xs text-slate-600">{note}</p>}
          <div className="flex gap-2">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="h-11 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 flex items-center gap-1.5"
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
            )}
            <button
              type="button"
              onClick={sendToRider}
              disabled={sending || !loaded}
              className="flex-1 h-11 rounded-lg bg-slate-900 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Preparing…' : 'Send to rider'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
