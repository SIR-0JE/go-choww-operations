/**
 * Pulls the order details the GoChow dashboard shows (items, service charge,
 * payment reference, cafeteria phone) out of a raw GoChow order.
 *
 * GoChow groups food into "containers" (packs), each with items of
 * { menu: { name, price, category }, quantity }. Extras sit alongside.
 */

export interface OrderItem {
  pack: number | null; // container number; null for extras
  name: string;
  quantity: number;
  price: number; // unit price
  category: string | null;
}

export interface OrderDetails {
  items: OrderItem[] | null;
  serviceCharge: number | null;
  paymentReference: string | null;
  vendorPhone: string | null;
  pickedUpAt: Date | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function toItem(raw: any, pack: number | null): OrderItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const menu = raw.menu && typeof raw.menu === 'object' ? raw.menu : raw;
  const name = String(menu.name ?? raw.name ?? '').trim();
  if (!name) return null;
  return {
    pack,
    name,
    quantity: Math.max(1, Math.round(num(raw.quantity ?? raw.qty ?? 1))),
    price: num(menu.price ?? raw.price),
    category: menu.category ? String(menu.category) : raw.category ? String(raw.category) : null,
  };
}

export function extractOrderDetails(order: any): OrderDetails {
  let items: OrderItem[] | null = null;

  if (Array.isArray(order?.containers) || Array.isArray(order?.extras)) {
    items = [];
    (order.containers || []).forEach((c: any, i: number) => {
      const pack = Number.isFinite(Number(c?.containerNumber)) ? Number(c.containerNumber) : i + 1;
      for (const raw of Array.isArray(c?.items) ? c.items : []) {
        const it = toItem(raw, pack);
        if (it) items!.push(it);
      }
    });
    for (const raw of Array.isArray(order.extras) ? order.extras : []) {
      const it = toItem(raw, null);
      if (it) items.push(it);
    }
  }

  const pickedUp = order?.pickedUpAt ? new Date(order.pickedUpAt) : null;
  const phone = String(order?.vendor?.businessPhoneNumber ?? order?.vendor?.phoneNumber ?? '').trim();

  return {
    items,
    serviceCharge: order?.serviceCharge !== undefined && order?.serviceCharge !== null ? num(order.serviceCharge) : null,
    paymentReference: order?.paymentReference ? String(order.paymentReference).trim() : null,
    vendorPhone: phone || null,
    pickedUpAt: pickedUp && !isNaN(pickedUp.getTime()) ? pickedUp : null,
  };
}

/** Only the fields that have a value, ready to spread into a Prisma create/update */
export function detailsForDb(d: OrderDetails) {
  return {
    ...(d.items && { items: d.items as any }),
    ...(d.serviceCharge !== null && { serviceCharge: d.serviceCharge }),
    ...(d.paymentReference && { paymentReference: d.paymentReference }),
    ...(d.vendorPhone && { vendorPhone: d.vendorPhone }),
    ...(d.pickedUpAt && { pickedUpAt: d.pickedUpAt }),
  };
}
