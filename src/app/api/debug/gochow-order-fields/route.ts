import { NextRequest, NextResponse } from 'next/server';
import { fetchGoChowPath } from '@/services/gochowApi';

export const dynamic = 'force-dynamic';

// TEMPORARY: checks whether GoChow's single-order endpoints expose a customer note or
// alternate phone. Returns field names only, plus values of note/phone-like fields.
// Remove once the investigation is done.
const NOTE_LIKE = /note|instruction|comment|message|remark|recipient|receiver|alternat|contact|phone/i;

function describe(value: any, path = '', out: { paths: string[]; noteLike: Record<string, any> } = { paths: [], noteLike: {} }, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > 4) return out;
  const entries = Array.isArray(value) ? value.slice(0, 1).map((v, i) => [String(i), v]) : Object.entries(value);
  for (const [k, v] of entries) {
    const p = path ? `${path}.${k}` : k;
    if (!Array.isArray(value)) out.paths.push(p);
    if (!Array.isArray(value) && NOTE_LIKE.test(k) && (typeof v !== 'object' || v === null)) {
      out.noteLike[p] = typeof v === 'string' ? v.slice(0, 200) : v;
    }
    describe(v, p, out, depth + 1);
  }
  return out;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').replace(/[^a-zA-Z0-9-]/g, '');
  const number = (searchParams.get('number') || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!id && !number) return NextResponse.json({ error: 'id or number required' }, { status: 400 });

  const candidates = [
    id && `/admin/orders/${id}`,
    number && `/admin/orders/${number}`,
    id && `/orders/${id}`,
    number && `/admin/orders?search=${number}`,
  ].filter(Boolean) as string[];

  const results = [];
  for (const path of candidates) {
    const { status, body } = await fetchGoChowPath(path);
    const target = body?.order ?? body?.data ?? (Array.isArray(body?.orders) ? body.orders[0] : body);
    const { paths, noteLike } = describe(target);
    results.push({ path, status, topLevelKeys: body && typeof body === 'object' ? Object.keys(body) : [], fieldPaths: paths, noteLikeFields: noteLike });
  }
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } });
}
