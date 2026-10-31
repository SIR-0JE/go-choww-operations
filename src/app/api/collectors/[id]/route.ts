import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { attachCollectors, validateCollector } from '@/lib/collectors';

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

    const current = await prisma.collector.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ success: false, error: 'Rep not found.' }, { status: 404 });
    const error = await validateCollector(data, params.id);
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });

    const { pin: _pin, ...collector } = await prisma.collector.update({ where: { id: params.id }, data });
    // Switching a rep on or off, or changing hostels: waiting orders move to whoever is on duty now
    if (data.status !== undefined || data.hostels !== undefined) await attachCollectors().catch(() => {});
    return NextResponse.json({ success: true, collector });
  } catch (err) {
    console.error('[PATCH /api/collectors/:id]', err);
    return NextResponse.json({ success: false, error: 'Could not save.' }, { status: 503 });
  }
}

/**
 * DELETE /api/collectors/:id
 * Refused while they hold food (409, with the count). With ?force=1 that food goes back to the riders first.
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const force = request.nextUrl.searchParams.get('force') === '1';
    const heldWhere = { collectorId: params.id, collectorStage: { in: ['handed', 'received', 'not_reachable'] } };
    const holding = await prisma.deliveryOrder.count({ where: heldWhere });
    if (holding > 0 && !force) {
      return NextResponse.json(
        { success: false, holding, error: `They still hold ${holding} order${holding === 1 ? '' : 's'}.` },
        { status: 409 }
      );
    }
    if (holding > 0) {
      await prisma.deliveryOrder.updateMany({
        where: heldWhere,
        data: {
          collectorStage: 'returned',
          collectorDoneAt: new Date(),
          riderId: null,
          orderStatus: 'Ready',
          handoverRequestedById: null,
          handoverRequestedByName: null,
          handoverDistance: null,
        },
      });
    }
    await prisma.collector.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/collectors/:id]', err);
    return NextResponse.json({ success: false, error: 'Could not remove. Please try again.' }, { status: 503 });
  }
}
