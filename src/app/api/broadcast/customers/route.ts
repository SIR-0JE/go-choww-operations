import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { staticOrdersCache } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

export interface CustomerAudienceMember {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  orderCount: number;
  allTimeOrderCount: number;
  totalSpent: number;
  favoriteCafeteria: string;
  lastOrderDate: string;
  firstOrderDate: string;
  lastAddress: string;
}

export interface BroadcastCustomersResponse {
  success: boolean;
  customers: CustomerAudienceMember[];
  metrics: {
    totalCustomers: number;
    totalPhones: number;
    totalEmails: number;
    totalOrdersInPeriod: number;
    totalSpentInPeriod: number;
    activeTimeframeLabel: string;
  };
  filter: {
    days?: number;
    startDate?: string;
    endDate?: string;
    cafeteria?: string;
    search?: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days');
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const cafeteriaParam = searchParams.get('cafeteria');
    const searchParam = searchParams.get('search')?.trim().toLowerCase();

    // Determine date boundaries
    let startDate: Date | undefined;
    let endDate: Date | undefined;
    let timeframeLabel = 'Last 30 Days';

    if (startDateParam || endDateParam) {
      if (startDateParam) startDate = new Date(startDateParam);
      if (endDateParam) {
        endDate = new Date(endDateParam);
        // Include full end of day
        endDate.setHours(23, 59, 59, 999);
      }
      timeframeLabel = 'Custom Date Range';
    } else if (daysParam !== null) {
      const days = parseInt(daysParam, 10);
      if (days > 0) {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);
        timeframeLabel = days === 7 ? 'Last 7 Days' : days === 30 ? 'Last 30 Days' : days === 60 ? 'Last 60 Days' : `Last ${days} Days`;
      } else {
        timeframeLabel = 'All Time';
      }
    } else {
      // Default: Last 30 Days
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      timeframeLabel = 'Last 30 Days';
    }

    let dbOrders: any[] = [];
    try {
      const whereClause: any = {};

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) whereClause.createdAt.gte = startDate;
        if (endDate) whereClause.createdAt.lte = endDate;
      }

      if (cafeteriaParam && cafeteriaParam !== 'all') {
        whereClause.cafeteriaName = {
          contains: cafeteriaParam,
          mode: 'insensitive',
        };
      }

      dbOrders = await prisma.deliveryOrder.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderId: true,
          customerName: true,
          customerPhone: true,
          customerEmail: true,
          cafeteriaName: true,
          deliveryAddress: true,
          totalAmountPaid: true,
          foodTotal: true,
          deliveryFee: true,
          createdAt: true,
          orderStatus: true,
        },
      });
    } catch (dbErr) {
      console.warn('[Broadcast Customers API] Prisma query fallback to memory:', dbErr);
      dbOrders = staticOrdersCache.filter((o) => {
        if (startDate && new Date(o.createdAt) < startDate) return false;
        if (endDate && new Date(o.createdAt) > endDate) return false;
        if (cafeteriaParam && cafeteriaParam !== 'all' && !o.cafeteriaName.toLowerCase().includes(cafeteriaParam.toLowerCase())) return false;
        return true;
      });
    }

    // Group orders by unique customer identifier
    // Primary key: Phone > Email > Sanitized Customer Name
    const customerMap = new Map<
      string,
      {
        names: string[];
        phones: string[];
        emails: string[];
        addresses: string[];
        cafeterias: Map<string, number>;
        orders: any[];
        totalSpent: number;
        lastDate: Date;
        firstDate: Date;
      }
    >();

    for (const ord of dbOrders) {
      const name = (ord.customerName || 'Student Customer').trim();
      const phone = (ord.customerPhone || '').trim();
      const email = (ord.customerEmail || '').trim().toLowerCase();

      // Create a stable grouping key
      let groupKey = '';
      if (phone) {
        groupKey = `phone:${phone.replace(/\D/g, '')}`;
      } else if (email) {
        groupKey = `email:${email}`;
      } else {
        groupKey = `name:${name.toLowerCase()}`;
      }

      let cust = customerMap.get(groupKey);
      if (!cust) {
        cust = {
          names: [],
          phones: [],
          emails: [],
          addresses: [],
          cafeterias: new Map(),
          orders: [],
          totalSpent: 0,
          lastDate: new Date(ord.createdAt),
          firstDate: new Date(ord.createdAt),
        };
        customerMap.set(groupKey, cust);
      }

      if (name && !cust.names.includes(name)) cust.names.push(name);
      if (phone && !cust.phones.includes(phone)) cust.phones.push(phone);
      if (email && !cust.emails.includes(email)) cust.emails.push(email);
      if (ord.deliveryAddress && !cust.addresses.includes(ord.deliveryAddress)) {
        cust.addresses.push(ord.deliveryAddress);
      }

      const caf = (ord.cafeteriaName || 'Campus Cafeteria').trim();
      cust.cafeterias.set(caf, (cust.cafeterias.get(caf) || 0) + 1);
      cust.orders.push(ord);

      const amount = Number(ord.totalAmountPaid ?? (Number(ord.foodTotal ?? 0) + Number(ord.deliveryFee ?? 0)));
      cust.totalSpent += isNaN(amount) ? 0 : amount;

      const orderDate = new Date(ord.createdAt);
      if (orderDate > cust.lastDate) cust.lastDate = orderDate;
      if (orderDate < cust.firstDate) cust.firstDate = orderDate;
    }

    // Convert aggregated map to audience members
    let audience: CustomerAudienceMember[] = Array.from(customerMap.entries()).map(([key, data]) => {
      // Find favorite cafeteria (highest count)
      let favoriteCafeteria = 'Campus Cafeteria';
      let maxCount = 0;
      data.cafeterias.forEach((count, caf) => {
        if (count > maxCount) {
          maxCount = count;
          favoriteCafeteria = caf;
        }
      });

      const bestName = data.names[0] || 'Customer';
      const bestPhone = data.phones[0] || null;
      const bestEmail = data.emails[0] || null;

      return {
        id: key,
        name: bestName,
        phone: bestPhone,
        email: bestEmail,
        orderCount: data.orders.length,
        allTimeOrderCount: data.orders.length,
        totalSpent: Math.round(data.totalSpent),
        favoriteCafeteria,
        lastOrderDate: data.lastDate.toISOString(),
        firstOrderDate: data.firstDate.toISOString(),
        lastAddress: data.addresses[0] || 'Campus Hostel',
      };
    });

    // Apply text search filter if provided
    if (searchParam) {
      audience = audience.filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(searchParam);
        const phoneMatch = c.phone ? c.phone.replace(/\D/g, '').includes(searchParam.replace(/\D/g, '')) : false;
        const emailMatch = c.email ? c.email.toLowerCase().includes(searchParam) : false;
        const cafMatch = c.favoriteCafeteria.toLowerCase().includes(searchParam);
        const addrMatch = c.lastAddress.toLowerCase().includes(searchParam);
        return nameMatch || phoneMatch || emailMatch || cafMatch || addrMatch;
      });
    }

    // Sort by most recent order / highest order count
    audience.sort((a, b) => {
      const dateDiff = new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
      if (dateDiff !== 0) return dateDiff;
      return b.orderCount - a.orderCount;
    });

    // Compute audience metrics
    const totalCustomers = audience.length;
    const totalPhones = audience.filter((c) => Boolean(c.phone)).length;
    const totalEmails = audience.filter((c) => Boolean(c.email)).length;
    const totalOrdersInPeriod = audience.reduce((sum, c) => sum + c.orderCount, 0);
    const totalSpentInPeriod = audience.reduce((sum, c) => sum + c.totalSpent, 0);

    return NextResponse.json({
      success: true,
      customers: audience,
      metrics: {
        totalCustomers,
        totalPhones,
        totalEmails,
        totalOrdersInPeriod,
        totalSpentInPeriod,
        activeTimeframeLabel: timeframeLabel,
      },
      filter: {
        days: daysParam ? parseInt(daysParam, 10) : 30,
        startDate: startDateParam || undefined,
        endDate: endDateParam || undefined,
        cafeteria: cafeteriaParam || undefined,
        search: searchParam || undefined,
      },
    });
  } catch (error: any) {
    console.error('[Broadcast Customers API Error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to aggregate broadcast audience' },
      { status: 500 }
    );
  }
}
