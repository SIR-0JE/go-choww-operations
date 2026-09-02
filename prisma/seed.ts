import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

/**
 * Robust date parser supporting Excel serial numbers, DD/MM/YYYY, and standard dates
 */
function parseExcelDate(val: any): { date: Date; timeStr: string } {
  if (val === null || val === undefined || val === '') {
    return { date: new Date(), timeStr: '12:00 PM' };
  }

  // 1. If it's a numeric Excel date serial number (e.g. 46049)
  if (typeof val === 'number') {
    const utcDays = val - 25569;
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = val - Math.floor(val) + 0.0000001;
    const totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    const parsedDate = new Date(Date.UTC(
      dateInfo.getUTCFullYear(),
      dateInfo.getUTCMonth(),
      dateInfo.getUTCDate(),
      hours,
      minutes,
      seconds
    ));

    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: parsedDate, timeStr: timeFormatted };
  }

  // 2. If it's a Date instance
  if (val instanceof Date) {
    let hours = val.getHours();
    const minutes = val.getMinutes();
    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: val, timeStr: timeFormatted };
  }

  // 3. If it's a string (e.g. DD/MM/YYYY or YYYY-MM-DD)
  const strVal = String(val).trim();
  const ddmmyyyyMatch = strVal.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?/i);
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

  const fallback = new Date(strVal);
  if (!isNaN(fallback.getTime())) {
    let hours = fallback.getHours();
    const minutes = fallback.getMinutes();
    const timeFormatted = `${(hours % 12 || 12).toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
    return { date: fallback, timeStr: timeFormatted };
  }

  return { date: new Date(), timeStr: '12:00 PM' };
}

function cleanNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function findExcelFilePath(): string | null {
  const candidatePaths = [
    process.argv[2], // CLI arg if provided
    path.resolve(process.cwd(), 'Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx'),
    path.resolve(process.cwd(), '../GO CHOW/New folder/Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx'),
    path.resolve(process.cwd(), '../GO CHOW/Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx'),
    'C:/Users/HP LAPTOP/Documents/Niyi.Ltd/GO CHOW/New folder/Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx',
    'C:/Users/HP LAPTOP/Documents/Niyi.Ltd/locapay/Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx',
  ].filter(Boolean) as string[];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

async function main() {
  console.log('====================================================');
  console.log('🚀 Starting Go Choww Historical Excel Seed Pipeline');
  console.log('====================================================');

  const filePath = findExcelFilePath();

  if (!filePath) {
    console.error('❌ Could not locate "Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx".');
    console.error('Please place the Excel file in the project root or pass its path as an argument:');
    console.error('   npm run prisma:seed -- "C:/path/to/Go_Choww_SUPER_DASHBOARD_CLEANED.xlsx"');
    process.exit(1);
  }

  console.log(`📁 Reading Excel workbook: ${filePath}`);
  const workbook = XLSX.readFile(filePath, { cellDates: false });

  // Look for "Raw Data" sheet
  const sheetName = workbook.SheetNames.find((s) => s.toLowerCase() === 'raw data') || workbook.SheetNames[0];
  console.log(`📑 Parsing sheet: "${sheetName}"`);

  const worksheet = workbook.Sheets[sheetName];
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  console.log(`📊 Found ${rawRows.length} total rows in "${sheetName}".`);

  if (rawRows.length === 0) {
    console.warn('⚠️ No data rows found to seed.');
    return;
  }

  const mappedData: any[] = [];
  const seenOrderIds = new Set<string>();

  for (const row of rawRows) {
    // Normalize keys
    const normalized: Record<string, any> = {};
    for (const key of Object.keys(row)) {
      const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      normalized[cleanKey] = row[key];
    }

    const rawOrderNum =
      normalized['ordernumber'] ||
      normalized['orderid'] ||
      row['Order Number'] ||
      row['orderNumber'] ||
      row['Order ID'];

    if (!rawOrderNum) continue;

    const orderId = String(rawOrderNum).trim();
    if (seenOrderIds.has(orderId)) continue;
    seenOrderIds.add(orderId);

    const rawDate =
      normalized['date'] ||
      row['Date'] ||
      row['date'];

    const { date: createdAt, timeStr: time } = parseExcelDate(rawDate);

    const customerName = String(
      normalized['customername'] ||
      normalized['customer'] ||
      row['Customer Name'] ||
      'Customer'
    ).trim();

    const cafeteriaName = String(
      normalized['cafeteria'] ||
      normalized['cafeterianame'] ||
      row['Cafeteria'] ||
      'Campus Cafeteria'
    ).trim();

    const deliveryAddress = String(
      normalized['deliveryaddress'] ||
      normalized['address'] ||
      row['Delivery Address'] ||
      'Campus Hostel'
    ).trim();

    const foodTotal = cleanNumber(normalized['foodtotal'] || row['Food Total']);
    const deliveryFee = cleanNumber(normalized['deliveryfee'] || row['Delivery Fee']);
    const totalAmountPaid = cleanNumber(
      normalized['totalamountpaid'] ||
      normalized['totalpaid'] ||
      row['Total Amount Paid'] ||
      foodTotal + deliveryFee
    );

    let deliveryType = String(
      normalized['deliverytype'] ||
      normalized['type'] ||
      row['Delivery Type'] ||
      'Same side'
    ).trim();

    const lowerType = deliveryType.toLowerCase();
    if (lowerType.includes('same')) deliveryType = 'Same side';
    else if (lowerType.includes('diff')) deliveryType = 'Different side';
    else if (lowerType.includes('pick')) deliveryType = 'Pick up';
    else deliveryType = 'Other';

    let orderStatus = String(
      normalized['orderstatus'] ||
      normalized['status'] ||
      row['Order Status'] ||
      'Completed'
    ).trim();

    const lowerStatus = orderStatus.toLowerCase();
    if (lowerStatus.includes('comp') || lowerStatus.includes('success')) orderStatus = 'Completed';
    else if (lowerStatus.includes('canc')) orderStatus = 'Cancelled';
    else orderStatus = 'Pending';

    const paymentStatus =
      orderStatus === 'Completed' ? 'success' : orderStatus === 'Cancelled' ? 'failed' : 'pending';

    mappedData.push({
      orderId,
      createdAt,
      time,
      customerName,
      cafeteriaName,
      deliveryAddress,
      foodTotal,
      deliveryFee,
      totalAmountPaid,
      deliveryType,
      orderStatus,
      paymentStatus,
    });
  }

  console.log(`✨ Successfully mapped ${mappedData.length} unique orders. Preparing batch insertion...`);

  // Batch insertion in chunks of 500
  const BATCH_SIZE = 500;
  const totalBatches = Math.ceil(mappedData.length / BATCH_SIZE);
  let totalInserted = 0;

  for (let i = 0; i < totalBatches; i++) {
    const startIndex = i * BATCH_SIZE;
    const batch = mappedData.slice(startIndex, startIndex + BATCH_SIZE);

    try {
      const result = await prisma.deliveryOrder.createMany({
        data: batch,
        skipDuplicates: true,
      });
      totalInserted += result.count;
      console.log(`  [Batch ${i + 1}/${totalBatches}] Ingested ${batch.length} records (${result.count} new inserted, duplicates skipped).`);
    } catch (err: any) {
      console.error(`  ❌ Error inserting batch ${i + 1}/${totalBatches}:`, err?.message || err);
    }
  }

  // Optional: Also seed Expenses sheet if present
  const expensesSheetName = workbook.SheetNames.find((s) => s.toLowerCase() === 'expenses');
  if (expensesSheetName) {
    try {
      const expWorksheet = workbook.Sheets[expensesSheetName];
      const expRows: any[] = XLSX.utils.sheet_to_json(expWorksheet, { defval: '' });
      const validExpenses: any[] = [];

      for (const er of expRows) {
        const rawDate = er['Date'] || er['date'];
        const category = String(er['Category'] || er['category'] || '').trim();
        const description = String(er['Description'] || er['description'] || '').trim();
        const amount = cleanNumber(er['Amount'] || er['amount']);

        if (category && description && amount > 0) {
          const { date } = parseExcelDate(rawDate);
          validExpenses.push({
            date,
            category,
            description,
            amount,
          });
        }
      }

      if (validExpenses.length > 0) {
        console.log(`💳 Ingesting ${validExpenses.length} expense records from "${expensesSheetName}" sheet...`);
        for (const exp of validExpenses) {
          await prisma.expense.create({
            data: exp,
          });
        }
        console.log(`  ✅ Ingested ${validExpenses.length} expense records.`);
      }
    } catch (err: any) {
      console.warn(`  ⚠️ Could not parse expenses sheet: ${err?.message || err}`);
    }
  }

  console.log('====================================================');
  console.log(`🎉 Direct Supabase Historical Seeding Complete!`);
  console.log(`📦 Processed: ${mappedData.length} records`);
  console.log(`💾 Newly Inserted: ${totalInserted} orders`);
  console.log('====================================================');
}

main()
  .catch((e) => {
    console.error('❌ Fatal error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
