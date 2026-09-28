/**
 * Nigerian phone numbers arrive in many shapes (+2348052456433, 2348052456433,
 * 08052456433, 8052456433, +23408052456433, with spaces...). Phones dial the
 * local 11-digit form (0805 245 6433) reliably, so every Call link uses it.
 */

/** 08052456433, or the digits as given if it isn't a recognisable Nigerian number */
export function localPhone(phone?: string | null): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('2340') && digits.length === 14) return '0' + digits.slice(4); // +234 0805...
  if (digits.startsWith('234') && digits.length === 13) return '0' + digits.slice(3); // +234 805...
  if (digits.length === 10 && !digits.startsWith('0')) return '0' + digits; // 805... (0 missing)
  return digits;
}

/** tel: link that dials straight away */
export function telHref(phone?: string | null): string {
  const local = localPhone(phone);
  if (/^0\d{10}$/.test(local)) return `tel:${local}`;
  // Not a Nigerian number: keep the international form if it had one
  const raw = (phone || '').trim();
  return `tel:${raw.startsWith('+') ? '+' : ''}${local}`;
}

/** 2348052456433 for wa.me links */
export function whatsappNumber(phone?: string | null): string {
  const local = localPhone(phone);
  return /^0\d{10}$/.test(local) ? '234' + local.slice(1) : local;
}

/** 0805 245 6433 for display */
export function prettyPhone(phone?: string | null): string {
  const local = localPhone(phone);
  return /^0\d{10}$/.test(local) ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}` : local;
}
