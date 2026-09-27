import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { fetchLiveGoChowOrdersWithStatus } from '@/services/gochowApi';
import { extractOrderDetails, detailsForDb } from '@/lib/orderDetails';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PAGE_SIZE = 50;
const MAX_PAGES_PER_CALL = 8;

/**
 * POST /api/orders/backfill-details { fromPage?: number, pages?: number }
 *
 * Walks GoChow's order list (newest first) and fills in items, service charge,
 * payment reference and cafeteria phone for orders we already have but that are
 * missing them. Also fills a missing customer phone/email/pickup code.
 * Never changes status, rider, amounts or anything already filled in.
 * Call repeatedly with the returned nextPage until done is true.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const fromPage = Math.max(1, Math.floor(Number(body.fromPage) || 1));
  const pages = Math.min(MAX_PAGES_PER_CALL, Math.max(1, Math.floor(Number(body.pages) || MAX_PAGES_PER_CALL)));

  let filled = 0;
  let seen = 0;
  let page = fromPage;
  let done = false;

  for (; page < fromPage + pages; page++) {
    const result = await fetchLiveGoChowOrdersWithStatus(PAGE_SIZE, page);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'GoChow did not respond', filled, seen, nextPage: page },
        { status: 502 }
      );
    }
    const orders = result.orders;
    if (orders.length === 0) {
      done = true;
      break;
    }
    seen += orders.length;

    const numbers = orders.map((o: any) => String(o.orderNumber || o._id || '').trim()).filter(Boolean);
    const existing = await prisma.deliveryOrder.findMany({
      where: { orderId: { in: numbers }, items: { equals: Prisma.DbNull } },
      select: { id: true, orderId: true, customerPhone: true, customerEmail: true, pickupCode: true },
    });
    const byNumber = new Map(existing.map((e) => [e.orderId, e]));

    for (const o of orders) {
      const row = byNumber.get(String(o.orderNumber || o._id || '').trim());
      if (!row) continue;
      const phone = String(o.user?.phoneNumber || o.user?.phone || '').trim();
      const email = String(o.user?.email || '').trim().toLowerCase();
      const code = o.confirmationCode ? String(o.confirmationCode).trim() : '';
      const data = {
        ...detailsForDb(extractOrderDetails(o)),
        ...(phone && !row.customerPhone && { customerPhone: phone }),
        ...(email && !row.customerEmail && { customerEmail: email }),
        ...(code && !row.pickupCode && { pickupCode: code }),
      };
      if (Object.keys(data).length === 0) continue;
      const r = await prisma.deliveryOrder.updateMany({ where: { id: row.id, items: { equals: Prisma.DbNull } }, data });
      filled += r.count;
    }

    if (orders.length < PAGE_SIZE) {
      done = true;
      page++;
      break;
    }
  }

  return NextResponse.json({ success: true, filled, seen, nextPage: page, done });
}
