import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateCollector } from '@/lib/collectors';

export const dynamic = 'force-dynamic';

/** PATCH /api/collectors/:id: edit name, phone, PIN, location, hostels, or switch on/off */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data: Record<string, any> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.phone !== undefined) data.phone = String(body.phone).trim();
    if (body.pin !== undefined) data.pin = String(body.pin).trim();
    if (body.pointName !== undefined) data.pointName = String(body.pointName).trim();
    if (Array.isArray(body.hostels)) data.hostels = body.hostels.map(String);
    if (body.status !== undefined) data.status = body.status === 'Active' ? 'Active' : 'Inactive';

    // Switching someone back on re-checks that nobody else took their hostels meanwhile
    const current = await prisma.collector.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ success: false, error: 'Rep not found.' }, { status: 404 });
    const hostelsToCheck = data.hostels ?? ((data.status ?? current.status) === 'Active' ? current.hostels : undefined);
    const error = await validateCollector(
      { ...data, hostels: (data.status ?? current.status) === 'Active' ? hostelsToCheck : undefined },
      params.id
    );
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });

    const { pin: _pin, ...collector } = await prisma.collector.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, collector });
  } catch (err) {
    console.error('[PATCH /api/collectors/:id]', err);
    return NextResponse.json({ success: false, error: 'Could not save.' }, { status: 503 });
  }
}

/** DELETE /api/collectors/:id: only when they hold nothing right now */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const holding = await prisma.deliveryOrder.count({
      where: { collectorId: params.id, collectorStage: { in: ['handed', 'received', 'not_reachable'] } },
    });
    if (holding > 0) {
      return NextResponse.json(
        { success: false, error: `They still hold ${holding} order${holding === 1 ? '' : 's'}. Sort those out first, or switch them off instead.` },
        { status: 409 }
      );
    }
    await prisma.collector.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/collectors/:id]', err);
    return NextResponse.json({ success: false, error: 'Could not remove.' }, { status: 503 });
  }
}
