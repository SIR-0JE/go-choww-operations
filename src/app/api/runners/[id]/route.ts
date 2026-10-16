import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateRunner } from '@/lib/runners';

export const dynamic = 'force-dynamic';

/** PATCH /api/runners/:id: edit name, phone, PIN, cafeteria, or switch on/off */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const current = await prisma.runner.findUnique({ where: { id: params.id } });
    if (!current) return NextResponse.json({ success: false, error: 'Runner not found.' }, { status: 404 });

    const data: Record<string, string> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.phone !== undefined) data.phone = String(body.phone).trim();
    if (body.pin !== undefined && String(body.pin).trim() !== '') data.pin = String(body.pin).trim();
    if (body.cafeteria !== undefined) data.cafeteria = String(body.cafeteria).trim();
    if (body.status !== undefined) data.status = body.status === 'Active' ? 'Active' : 'Inactive';

    // Switching someone on, or moving them, must not clash with whoever is on duty at that cafeteria
    const finalStatus = data.status ?? current.status;
    const error = await validateRunner(
      { ...data, cafeteria: finalStatus === 'Active' ? data.cafeteria ?? current.cafeteria : undefined, status: finalStatus },
      params.id
    );
    if (error) return NextResponse.json({ success: false, error }, { status: 400 });

    const { pin: _pin, ...runner } = await prisma.runner.update({ where: { id: params.id }, data });
    return NextResponse.json({ success: true, runner });
  } catch (err) {
    console.error('[PATCH /api/runners/:id]', err);
    return NextResponse.json({ success: false, error: 'Could not save.' }, { status: 503 });
  }
}

/** DELETE /api/runners/:id */
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.runner.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/runners/:id]', err);
    return NextResponse.json({ success: false, error: 'Could not remove.' }, { status: 503 });
  }
}
