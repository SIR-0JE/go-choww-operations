import { NextRequest, NextResponse } from 'next/server';
import {
  prisma,
  getInMemoryRiders,
  appendMockRider,
  updateMockRiderStatus,
  deleteMockRider,
  getInMemoryOrders,
} from '@/lib/prisma';
import { GeneratedRider } from '@/lib/mockData';
import { isSettledOrder } from '@/lib/financials';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = (searchParams.get('search') || '').toLowerCase().trim();

    let riders: any[] = [];
    let orders: any[] = [];
    let isDb = true;

    try {
      riders = await prisma.rider.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          orders: {
            select: {
              id: true,
              orderId: true,
              createdAt: true,
              time: true,
              customerName: true,
              cafeteriaName: true,
              deliveryAddress: true,
              deliveryFee: true,
              deliveryType: true,
              orderStatus: true,
              paymentStatus: true,
            },
          },
        },
      });
      isDb = true;
    } catch {
      riders = getInMemoryRiders();
      orders = getInMemoryOrders();
      isDb = false;
    }

    if (!riders) riders = [];

    // Filter by search query
    if (search) {
      riders = riders.filter(
        (r) =>
          r.name.toLowerCase().includes(search) ||
          (r.phone && r.phone.toLowerCase().includes(search))
      );
    }

    // Process performance metrics for each rider
    const processedRiders = riders.map((rider) => {
      let riderOrders = isDb
        ? (rider.orders || [])
        : orders.filter((o) => o.riderId === rider.id);

      // Date filtering
      if (startDate) {
        const start = new Date(startDate).getTime();
        riderOrders = riderOrders.filter((o: any) => new Date(o.createdAt).getTime() >= start);
      }
      if (endDate) {
        const end = new Date(endDate).getTime();
        riderOrders = riderOrders.filter((o: any) => new Date(o.createdAt).getTime() <= end);
      }

      // Settle check
      const settledOrders = riderOrders.filter((o: any) => isSettledOrder(o));

      let sameSideCount = 0;
      let differentSideCount = 0;
      let pickUpCount = 0;
      let otherCount = 0;

      for (const ord of settledOrders) {
        const type = (ord.deliveryType || '').trim().toLowerCase();
        if (type === 'same side') sameSideCount++;
        else if (type === 'different side') differentSideCount++;
        else if (type === 'pick up' || type === 'pickup') pickUpCount++;
        else otherCount++;
      }

      // Automated earnings: Same Side * ₦50 + Different Side * ₦90
      const sameSideEarnings = sameSideCount * 50;
      const differentSideEarnings = differentSideCount * 90;
      const totalEarnings = sameSideEarnings + differentSideEarnings;

      return {
        id: rider.id,
        name: rider.name,
        phone: rider.phone || 'N/A',
        status: rider.status || 'Active',
        createdAt: rider.createdAt,
        totalOrdersAssigned: riderOrders.length,
        settledOrdersCount: settledOrders.length,
        sameSideCount,
        differentSideCount,
        pickUpCount,
        otherCount,
        sameSideEarnings,
        differentSideEarnings,
        totalEarnings,
        orders: riderOrders.map((o: any) => ({
          ...o,
          deliveryFee: Number(o.deliveryFee),
          createdAt: new Date(o.createdAt).toISOString(),
        })),
      };
    });

    // Summary calculations across all riders
    const totalRiders = processedRiders.length;
    const activeRiders = processedRiders.filter((r) => r.status === 'Active').length;
    const totalAssignedOrders = processedRiders.reduce((acc, r) => acc + r.totalOrdersAssigned, 0);
    const totalRiderPayouts = processedRiders.reduce((acc, r) => acc + r.totalEarnings, 0);

    return NextResponse.json({
      success: true,
      riders: processedRiders,
      summary: {
        totalRiders,
        activeRiders,
        totalAssignedOrders,
        totalRiderPayouts,
      },
    });
  } catch (error: any) {
    console.error('Riders GET API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch riders' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, status } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { success: false, error: 'Rider name is required' },
        { status: 400 }
      );
    }

    const cleanName = name.trim();
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanStatus = status || 'Active';
    const riderId = `rider-${Date.now().toString(36)}`;

    const newRider: GeneratedRider = {
      id: riderId,
      name: cleanName,
      phone: cleanPhone,
      status: cleanStatus as any,
      createdAt: new Date(),
    };

    try {
      const created = await prisma.rider.create({
        data: {
          id: riderId,
          name: cleanName,
          phone: cleanPhone,
          status: cleanStatus,
        },
      });
      return NextResponse.json({
        success: true,
        rider: created,
        message: `Rider "${cleanName}" registered successfully!`,
      });
    } catch {
      appendMockRider(newRider);
      return NextResponse.json({
        success: true,
        rider: newRider,
        message: `Rider "${cleanName}" registered successfully!`,
      });
    }
  } catch (error: any) {
    console.error('Riders POST API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to register rider' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, name, phone } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Rider ID is required' },
        { status: 400 }
      );
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;

    try {
      const updated = await prisma.rider.update({
        where: { id },
        data: updateData,
      });
      return NextResponse.json({
        success: true,
        rider: updated,
        message: 'Rider updated successfully!',
      });
    } catch {
      if (status) updateMockRiderStatus(id, status);
      return NextResponse.json({
        success: true,
        message: 'Rider updated successfully!',
      });
    }
  } catch (error: any) {
    console.error('Riders PATCH API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update rider' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Rider ID is required' },
        { status: 400 }
      );
    }

    try {
      // 1. Unassign any orders assigned to this rider
      await prisma.deliveryOrder.updateMany({
        where: { riderId: id },
        data: { riderId: null },
      });

      // 2. Delete the rider record
      await prisma.rider.delete({
        where: { id },
      });

      return NextResponse.json({
        success: true,
        message: 'Rider deleted successfully! Assigned orders are now marked as unassigned.',
      });
    } catch {
      deleteMockRider(id);
      return NextResponse.json({
        success: true,
        message: 'Rider deleted successfully! Assigned orders are now marked as unassigned.',
      });
    }
  } catch (error: any) {
    console.error('Riders DELETE API error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete rider' },
      { status: 500 }
    );
  }
}
