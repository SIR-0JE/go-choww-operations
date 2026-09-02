import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, appendMockOrder } from '@/lib/prisma';
import { GeneratedOrder } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

/**
 * Robust date parser for DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, and ISO strings
 */
function parseDateString(dateStr: string): { date: Date; timeStr: string } {
  if (!dateStr || typeof dateStr !== 'string') {
    const now = new Date();
    return { date: now, timeStr: '12:00 PM' };
  }

  const cleanStr = dateStr.trim();

  // Check DD/MM/YYYY or DD-MM-YYYY with optional time
  const ddmmyyyyMatch = cleanStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const year = parseInt(ddmmyyyyMatch[3], 10);
    let hours = ddmmyyyyMatch[4] ? parseInt(ddmmyyyyMatch[4], 10) : 12;
    const minutes = ddmmyyyyMatch[5] ? parseInt(ddmmyyyyMatch[5], 10) : 0;
    const ampm = ddmmyyyyMatch[7] ? ddmmyyyyMatch[7].toUpperCase() : null;

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;

    const parsedDate = new Date(Date.UTC(year, month, day, hours, minutes));
    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: parsedDate, timeStr: timeFormatted };
  }

  // Fallback standard parse
  const fallbackDate = new Date(cleanStr);
  if (!isNaN(fallbackDate.getTime())) {
    let hours = fallbackDate.getHours();
    const minutes = fallbackDate.getMinutes();
    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: fallbackDate, timeStr: timeFormatted };
  }

  const now = new Date();
  return { date: now, timeStr: '12:00 PM' };
}

function cleanCurrency(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawRows: any[] = Array.isArray(body) ? body : body.orders || body.data || [];

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No order data provided in payload' },
        { status: 400 }
      );
    }

    const processedOrders: any[] = [];
    const seenOrderIds = new Set<string>();

    for (const row of rawRows) {
      // Normalize header keys (case-insensitive, strip whitespace)
      const normalizedRow: Record<string, any> = {};
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[cleanKey] = row[key];
      }

      const rawOrderId =
        normalizedRow['ordernumber'] ||
        normalizedRow['orderid'] ||
        normalizedRow['orderno'] ||
        row['Order Number'] ||
        row['orderNumber'] ||
        row['orderId'] ||
        `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

      const orderId = String(rawOrderId).trim();
      if (!orderId || seenOrderIds.has(orderId)) continue;
      seenOrderIds.add(orderId);

      const rawDate =
        normalizedRow['date'] ||
        normalizedRow['createdat'] ||
        row['Date'] ||
        new Date().toISOString();

      const { date: parsedDate, timeStr } = parseDateString(String(rawDate));

      const customerName = String(
        normalizedRow['customername'] ||
        normalizedRow['customer'] ||
        row['Customer Name'] ||
        'Student Customer'
      ).trim();

      const cafeteriaName = String(
        normalizedRow['cafeterianame'] ||
        normalizedRow['cafeteria'] ||
        row['Cafeteria'] ||
        'Campus Cafeteria'
      ).trim();

      const deliveryAddress = String(
        normalizedRow['deliveryaddress'] ||
        normalizedRow['address'] ||
        row['Delivery Address'] ||
        'Campus Hostel Block'
      ).trim();

      const foodTotal = cleanCurrency(
        normalizedRow['foodtotal'] ||
        normalizedRow['foodamount'] ||
        row['Food Total']
      );

      const deliveryFee = cleanCurrency(
        normalizedRow['deliveryfee'] ||
        normalizedRow['fee'] ||
        row['Delivery Fee']
      );

      const totalAmountPaid = cleanCurrency(
        normalizedRow['totalamountpaid'] ||
        normalizedRow['totalpaid'] ||
        normalizedRow['total'] ||
        row['Total Amount Paid'] ||
        foodTotal + deliveryFee
      );

      let deliveryType = String(
        normalizedRow['deliverytype'] ||
        normalizedRow['type'] ||
        row['Delivery Type'] ||
        'Same side'
      ).trim();

      // Normalize delivery type
      const lowerType = deliveryType.toLowerCase();
      if (lowerType.includes('same')) deliveryType = 'Same side';
      else if (lowerType.includes('diff')) deliveryType = 'Different side';
      else if (lowerType.includes('pick')) deliveryType = 'Pick up';
      else deliveryType = 'Other';

      let orderStatus = String(
        normalizedRow['orderstatus'] ||
        normalizedRow['status'] ||
        row['Order Status'] ||
        'Completed'
      ).trim();

      const lowerStatus = orderStatus.toLowerCase();
      if (lowerStatus.includes('comp') || lowerStatus.includes('success')) orderStatus = 'Completed';
      else if (lowerStatus.includes('canc')) orderStatus = 'Cancelled';
      else orderStatus = 'Pending';

      const paymentStatus =
        orderStatus === 'Completed' ? 'success' : orderStatus === 'Cancelled' ? 'failed' : 'pending';

      processedOrders.push({
        orderId,
        createdAt: parsedDate,
        time: timeStr,
        customerName,
        cafeteriaName,
        deliveryAddress,
        deliveryFee,
        foodTotal,
        totalAmountPaid,
        deliveryType,
        orderStatus,
        paymentStatus,
      });
    }

    if (processedOrders.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Could not parse any valid order records from CSV' },
        { status: 400 }
      );
    }

    // Attempt DB insertion with skipDuplicates: true
    let insertedCount = 0;
    try {
      const result = await prisma.deliveryOrder.createMany({
        data: processedOrders,
        skipDuplicates: true,
      });
      insertedCount = result.count;
    } catch {
      // In-memory fallback
      const inMemory = getInMemoryOrders();
      const existingIds = new Set(inMemory.map((o) => o.orderId));
      for (const ord of processedOrders) {
        if (!existingIds.has(ord.orderId)) {
          appendMockOrder(ord as GeneratedOrder);
          insertedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${processedOrders.length} CSV rows (${insertedCount} new orders saved, duplicates skipped).`,
      totalProcessed: processedOrders.length,
      insertedCount,
    });
  } catch (error: any) {
    console.error('CSV upload error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process CSV file' },
      { status: 500 }
    );
  }
}
