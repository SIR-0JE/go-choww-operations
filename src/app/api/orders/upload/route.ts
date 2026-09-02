import { NextRequest, NextResponse } from 'next/server';
import { prisma, getInMemoryOrders, appendMockOrder } from '@/lib/prisma';
import { GeneratedOrder } from '@/lib/mockData';

export const dynamic = 'force-dynamic';

/**
 * Robust date parser for DD/MM/YYYY, YYYY-MM-DD, ISO strings, and Excel serial timestamps
 */
function parseDateString(dateVal: any): { date: Date; timeStr: string } {
  if (!dateVal) {
    const now = new Date();
    return { date: now, timeStr: '12:00 PM' };
  }

  // 1. If already a Date object
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) {
    const hours = dateVal.getHours();
    const minutes = dateVal.getMinutes();
    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: dateVal, timeStr: timeFormatted };
  }

  // 2. If Excel numeric serial date (e.g., 46000)
  if (typeof dateVal === 'number' || (/^\d{5}(\.\d+)?$/.test(String(dateVal).trim()))) {
    const serial = typeof dateVal === 'number' ? dateVal : parseFloat(String(dateVal));
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = serial - Math.floor(serial) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / (60 * 60));
    const minutes = Math.floor(totalSeconds / 60) % 60;
    dateInfo.setUTCHours(hours);
    dateInfo.setUTCMinutes(minutes);
    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: dateInfo, timeStr: timeFormatted };
  }

  const cleanStr = String(dateVal).trim();

  // 3. Match DD/MM/YYYY or DD-MM-YYYY with optional time
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

  // 4. Fallback standard parse (covers YYYY-MM-DD, ISO 8601, etc.)
  const fallbackDate = new Date(cleanStr);
  if (!isNaN(fallbackDate.getTime())) {
    const hours = fallbackDate.getHours();
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

    // ─────────────────────────────────────────────────────────────
    // 1. SMART DATE CHECKING: QUERY LATEST ORDER DATE IN DATABASE
    // ─────────────────────────────────────────────────────────────
    let latestDbOrderDate: Date | null = null;
    try {
      const latestRecord = await prisma.deliveryOrder.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      if (latestRecord?.createdAt) {
        latestDbOrderDate = new Date(latestRecord.createdAt);
      }
    } catch {
      const inMemory = getInMemoryOrders();
      if (inMemory && inMemory.length > 0) {
        const sorted = [...inMemory].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        latestDbOrderDate = new Date(sorted[0].createdAt);
      }
    }

    const candidateOrders: any[] = [];
    const seenOrderIds = new Set<string>();
    let inBatchDuplicates = 0;
    let skippedStatusCount = 0;
    let skippedOldDateCount = 0;

    for (const row of rawRows) {
      // Normalize header keys (case-insensitive, strip whitespace and punctuation)
      const normalizedRow: Record<string, any> = {};
      for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        normalizedRow[cleanKey] = row[key];
      }

      // ─────────────────────────────────────────────────────────────
      // CRITICAL STATUS FILTER:
      // Only ingest orders where status explicitly equals "Completed" or "delivered" (case-insensitive)
      // Completely skip cancelled, pending, failed, processing, etc.
      // ─────────────────────────────────────────────────────────────
      const rawStatus = String(
        normalizedRow['orderstatus'] ||
        normalizedRow['status'] ||
        row['Order Status'] ||
        row['orderStatus'] ||
        ''
      ).trim().toLowerCase();

      const isCompletedOrDelivered = rawStatus === 'completed' || rawStatus === 'delivered';
      if (!isCompletedOrDelivered) {
        skippedStatusCount++;
        continue;
      }

      // Live export header mapping: Order ID -> orderId
      const rawOrderId =
        normalizedRow['orderid'] ||
        normalizedRow['ordernumber'] ||
        normalizedRow['orderno'] ||
        row['Order ID'] ||
        row['Order Number'] ||
        row['orderId'] ||
        `ORD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

      const orderId = String(rawOrderId).trim();
      if (!orderId || seenOrderIds.has(orderId)) {
        inBatchDuplicates++;
        continue;
      }
      seenOrderIds.add(orderId);

      // Live export header mapping: Date -> ISO DateTime
      const rawDate =
        normalizedRow['date'] ||
        normalizedRow['createdat'] ||
        row['Date'] ||
        new Date().toISOString();

      const { date: parsedDate, timeStr } = parseDateString(rawDate);

      // Smart Date Filtering: If DB has a latest order date, filter out records strictly older than latest date
      if (latestDbOrderDate && parsedDate.getTime() < latestDbOrderDate.getTime()) {
        skippedOldDateCount++;
        continue;
      }

      // Live export header mapping: Customer -> customerName
      const customerName = String(
        normalizedRow['customer'] ||
        normalizedRow['customername'] ||
        row['Customer'] ||
        row['Customer Name'] ||
        'Student Customer'
      ).trim();

      // Live export header mapping: Vendor -> cafeteriaName
      const cafeteriaName = String(
        normalizedRow['vendor'] ||
        normalizedRow['cafeterianame'] ||
        normalizedRow['cafeteria'] ||
        row['Vendor'] ||
        row['Cafeteria'] ||
        'Campus Cafeteria'
      ).trim();

      // Live export header mapping: Delivery Address -> deliveryAddress
      const deliveryAddress = String(
        normalizedRow['deliveryaddress'] ||
        normalizedRow['address'] ||
        row['Delivery Address'] ||
        'Campus Hostel Block'
      ).trim();

      // Live export header mapping: Subtotal (NGN) -> foodTotal
      const foodTotal = cleanCurrency(
        normalizedRow['subtotalngn'] ||
        normalizedRow['subtotal'] ||
        normalizedRow['foodtotal'] ||
        normalizedRow['foodamount'] ||
        row['Subtotal (NGN)'] ||
        row['Food Total']
      );

      // Live export header mapping: Delivery Fee (NGN) -> deliveryFee
      const deliveryFee = cleanCurrency(
        normalizedRow['deliveryfeengn'] ||
        normalizedRow['deliveryfee'] ||
        normalizedRow['fee'] ||
        row['Delivery Fee (NGN)'] ||
        row['Delivery Fee']
      );

      // Live export header mapping: Total (NGN) -> totalAmountPaid
      const totalAmountPaid = cleanCurrency(
        normalizedRow['totalngn'] ||
        normalizedRow['total'] ||
        normalizedRow['totalamountpaid'] ||
        normalizedRow['totalpaid'] ||
        row['Total (NGN)'] ||
        row['Total Amount Paid'] ||
        foodTotal + deliveryFee
      );

      // Live export header mapping: Order Type -> deliveryType
      let deliveryType = String(
        normalizedRow['ordertype'] ||
        normalizedRow['deliverytype'] ||
        normalizedRow['type'] ||
        row['Order Type'] ||
        row['Delivery Type'] ||
        'Same side'
      ).trim();

      const lowerType = deliveryType.toLowerCase();
      if (lowerType.includes('same')) deliveryType = 'Same side';
      else if (lowerType.includes('diff')) deliveryType = 'Different side';
      else if (lowerType.includes('pick')) deliveryType = 'Pick up';
      else deliveryType = 'Same side';

      // Verified settled status
      const orderStatus = 'Completed';
      const paymentStatus = 'success';

      candidateOrders.push({
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

    // ─────────────────────────────────────────────────────────────
    // 2. CHECK DATABASE FOR EXISTING ORDER IDS (PREVENT DOUBLE COUNTING)
    // ─────────────────────────────────────────────────────────────
    let existingDbIds = new Set<string>();
    if (candidateOrders.length > 0) {
      try {
        const candidateIds = candidateOrders.map((o) => o.orderId);
        const existingRecords = await prisma.deliveryOrder.findMany({
          where: { orderId: { in: candidateIds } },
          select: { orderId: true },
        });
        existingDbIds = new Set(existingRecords.map((r) => r.orderId));
      } catch {
        const inMemory = getInMemoryOrders();
        existingDbIds = new Set(inMemory.map((o) => o.orderId));
      }
    }

    const newOrdersToInsert = candidateOrders.filter((o) => !existingDbIds.has(o.orderId));
    const existingDuplicates = candidateOrders.length - newOrdersToInsert.length;
    const totalDuplicates = inBatchDuplicates + existingDuplicates;

    let insertedCount = 0;
    if (newOrdersToInsert.length > 0) {
      try {
        const result = await prisma.deliveryOrder.createMany({
          data: newOrdersToInsert,
          skipDuplicates: true,
        });
        insertedCount = result.count;
      } catch {
        for (const ord of newOrdersToInsert) {
          appendMockOrder(ord as GeneratedOrder);
          insertedCount++;
        }
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. DYNAMIC SUMMARY BANNER FORMULATION
    // E.g.: "Successfully synced 14 new orders from Sep 2, 2026. Zero duplicates."
    // ─────────────────────────────────────────────────────────────
    let message = '';
    if (insertedCount > 0) {
      // Find the latest date among newly inserted orders
      const latestInsertedDate = newOrdersToInsert.reduce(
        (latest, o) => (new Date(o.createdAt).getTime() > latest.getTime() ? new Date(o.createdAt) : latest),
        new Date(newOrdersToInsert[0].createdAt)
      );
      const formattedDate = latestInsertedDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      const dupText =
        totalDuplicates === 0
          ? 'Zero duplicates.'
          : `${totalDuplicates} duplicate${totalDuplicates === 1 ? '' : 's'} skipped.`;

      message = `Successfully synced ${insertedCount} new order${
        insertedCount === 1 ? '' : 's'
      } from ${formattedDate}. ${dupText}`;
    } else {
      message = `Sync complete: 0 new orders added (${totalDuplicates} duplicates, ${skippedOldDateCount} older records, and ${skippedStatusCount} non-completed records were skipped).`;
    }

    return NextResponse.json({
      success: true,
      message,
      insertedCount,
      totalProcessed: rawRows.length,
      summary: {
        totalRows: rawRows.length,
        insertedCount,
        skippedDuplicates: totalDuplicates,
        skippedOldDateCount,
        skippedStatusCount,
        latestDbDate: latestDbOrderDate ? latestDbOrderDate.toISOString() : null,
      },
    });
  } catch (error: any) {
    console.error('CSV upload error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to process CSV file' },
      { status: 500 }
    );
  }
}
