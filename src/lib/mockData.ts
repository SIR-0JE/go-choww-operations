/**
 * Mock & Seed Data Generator for Go Choww Operations & Expenses
 */

export interface GeneratedOrder {
  id?: string;
  orderId: string;
  createdAt: Date;
  time: string;
  customerName: string;
  cafeteriaName: string;
  deliveryAddress: string;
  deliveryFee: number;
  foodTotal: number;
  totalAmountPaid: number;
  deliveryType: 'Same side' | 'Different side' | 'Pick up' | 'Other';
  orderStatus: 'Completed' | 'Cancelled' | 'Pending';
  paymentStatus: 'success' | 'failed' | 'pending';
}

export interface GeneratedExpense {
  id: string;
  date: Date;
  category: 'Software' | 'Fuel' | 'Marketing' | 'Salaries' | 'Miscellaneous';
  description: string;
  amount: number;
  createdAt: Date;
}

const CUSTOMERS = [
  'Chinedu Okonkwo', 'Amina Bello', 'Tunde Bakare', 'Ngozi Eze', 'Emeka Nwosu',
  'Fatima Abubakar', 'Oluwaseun Adeleke', 'Zainab Ibrahim', 'Femi Adesina', 'Blessing Johnson',
  'David Alabi', 'Khadijah Sanusi', 'Uchechi Madu', 'Ayomide Balogun', 'Kehinde Ojo',
  'Halima Danjuma', 'Samuel Kalu', 'Maryam Garba', 'Efe Oghenekaro', 'Victoria Briggs',
  'Ibrahim Sani', 'Chidimma Obi', 'Babajide Fashola', 'Rukayat Lawal', 'Damilola Shittu',
  'Somtochukwu Nnamdi', 'Folashade Coker', 'Usman Mohammed', 'Grace Okoro', 'Victor Martins'
];

const CAFETERIAS = [
  'Mama Put Delight', 'Campus Central Buka', 'Foodies Hub', 'The Annex Cafe',
  'Royal Bites Kitchen', 'Sweet Sensation', 'Tasty Spot Grill', 'Grill & Chill Lounge',
  'Emerald Cafeteria', 'Prime Pasta & Shawarma'
];

const ADDRESSES = [
  'Hall 1 (Block A, Room 14)', 'Hall 1 (Block C, Room 08)',
  'Hall 2 (Block B, Room 22)', 'Hall 3 (Room 105)',
  'Hall 4 (Postgraduate Wing)', 'Faculty of Engineering (Room 304)',
  'Faculty of Law Quadrangle', 'Senate Building Ground Floor',
  'Science Complex Lab 2', 'Medical Hostel Block E',
  'New Female Hostel (Room 42)', 'Off-Campus North Gate Lodge',
  'Greenfield Apartments (Gate 2)', 'Campus Library Study Lounge',
  'Staff Quarters Block 7'
];

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatAMPM(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  const strHours = hours < 10 ? '0' + hours : hours;
  return `${strHours}:${strMinutes} ${ampm}`;
}

export function generateSeedOrders(count = 280): GeneratedOrder[] {
  const orders: GeneratedOrder[] = [];
  
  const startDate = new Date('2026-08-01T08:00:00Z').getTime();
  const endDate = new Date('2026-09-01T20:00:00Z').getTime();
  const timeSpan = endDate - startDate;

  for (let i = 0; i < count; i++) {
    const randomTimestamp = new Date(startDate + Math.random() * timeSpan);
    const hash1 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const hash2 = Math.random().toString(36).substring(2, 6).toUpperCase();
    const orderId = `ORD-${hash1}${randomInt(100, 999)}-${hash2}`;

    const typeRoll = Math.random();
    let deliveryType: 'Same side' | 'Different side' | 'Pick up' | 'Other';
    let deliveryFee = 0;

    if (typeRoll < 0.70) {
      deliveryType = 'Same side';
      deliveryFee = randomChoice([350, 400, 450, 500]);
    } else if (typeRoll < 0.95) {
      deliveryType = 'Different side';
      deliveryFee = randomChoice([600, 700, 800, 900]);
    } else if (typeRoll < 0.98) {
      deliveryType = 'Pick up';
      deliveryFee = 0;
    } else {
      deliveryType = 'Other';
      deliveryFee = 250;
    }

    const foodTotal = randomChoice([1500, 1800, 2200, 2500, 3000, 3500, 4200, 4800, 5500, 6500]);
    const totalAmountPaid = foodTotal + deliveryFee;

    const statusRoll = Math.random();
    let orderStatus: 'Completed' | 'Cancelled' | 'Pending';
    let paymentStatus: 'success' | 'failed' | 'pending';

    if (statusRoll < 0.88) {
      orderStatus = 'Completed';
      paymentStatus = 'success';
    } else if (statusRoll < 0.94) {
      orderStatus = 'Pending';
      paymentStatus = Math.random() > 0.5 ? 'pending' : 'success';
    } else {
      orderStatus = 'Cancelled';
      paymentStatus = 'failed';
    }

    orders.push({
      orderId,
      createdAt: randomTimestamp,
      time: formatAMPM(randomTimestamp),
      customerName: randomChoice(CUSTOMERS),
      cafeteriaName: randomChoice(CAFETERIAS),
      deliveryAddress: randomChoice(ADDRESSES),
      deliveryFee,
      foodTotal,
      totalAmountPaid,
      deliveryType,
      orderStatus,
      paymentStatus,
    });
  }

  return orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export const initialMockExpenses: GeneratedExpense[] = [
  {
    id: 'exp-001',
    date: new Date('2026-08-03T10:00:00Z'),
    category: 'Software',
    description: 'WhatsApp Business API Bot & Ingestion Server',
    amount: 14500,
    createdAt: new Date('2026-08-03T10:00:00Z'),
  },
  {
    id: 'exp-002',
    date: new Date('2026-08-05T08:30:00Z'),
    category: 'Fuel',
    description: 'Dispatch motorcycle fleet fuel allocation (Week 1)',
    amount: 18000,
    createdAt: new Date('2026-08-05T08:30:00Z'),
  },
  {
    id: 'exp-003',
    date: new Date('2026-08-09T14:15:00Z'),
    category: 'Marketing',
    description: 'Hostel flyer distributions & campus stickers promo',
    amount: 16500,
    createdAt: new Date('2026-08-09T14:15:00Z'),
  },
  {
    id: 'exp-004',
    date: new Date('2026-08-12T09:00:00Z'),
    category: 'Fuel',
    description: 'Dispatch motorcycle fleet fuel allocation (Week 2)',
    amount: 20000,
    createdAt: new Date('2026-08-12T09:00:00Z'),
  },
  {
    id: 'exp-005',
    date: new Date('2026-08-15T16:00:00Z'),
    category: 'Salaries',
    description: 'Dispatch supervisor mid-month stipend',
    amount: 35000,
    createdAt: new Date('2026-08-15T16:00:00Z'),
  },
  {
    id: 'exp-006',
    date: new Date('2026-08-18T11:45:00Z'),
    category: 'Miscellaneous',
    description: 'Thermal delivery bag zipper repair & raincoats',
    amount: 7800,
    createdAt: new Date('2026-08-18T11:45:00Z'),
  },
  {
    id: 'exp-007',
    date: new Date('2026-08-20T08:30:00Z'),
    category: 'Fuel',
    description: 'Dispatch motorcycle fleet fuel allocation (Week 3)',
    amount: 19500,
    createdAt: new Date('2026-08-20T08:30:00Z'),
  },
  {
    id: 'exp-008',
    date: new Date('2026-08-23T15:20:00Z'),
    category: 'Marketing',
    description: 'Campus cafeteria partnership banners',
    amount: 12000,
    createdAt: new Date('2026-08-23T15:20:00Z'),
  },
  {
    id: 'exp-009',
    date: new Date('2026-08-26T17:00:00Z'),
    category: 'Miscellaneous',
    description: 'Motorcycle tire puncture & oil change servicing',
    amount: 9200,
    createdAt: new Date('2026-08-26T17:00:00Z'),
  },
  {
    id: 'exp-010',
    date: new Date('2026-08-28T09:00:00Z'),
    category: 'Fuel',
    description: 'Dispatch motorcycle fleet fuel allocation (Week 4)',
    amount: 18500,
    createdAt: new Date('2026-08-28T09:00:00Z'),
  },
  {
    id: 'exp-011',
    date: new Date('2026-08-30T18:00:00Z'),
    category: 'Salaries',
    description: 'Lead rider reliability & speed performance bonus',
    amount: 25000,
    createdAt: new Date('2026-08-30T18:00:00Z'),
  },
  {
    id: 'exp-012',
    date: new Date('2026-09-01T11:00:00Z'),
    category: 'Software',
    description: 'Customer care GSM data & call credit recharge',
    amount: 6000,
    createdAt: new Date('2026-09-01T11:00:00Z'),
  },
];

export const staticOrdersCache: GeneratedOrder[] = generateSeedOrders(300);
