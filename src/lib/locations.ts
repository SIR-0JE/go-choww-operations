/**
 * Location Dictionaries & Origin-to-Destination Cross-Site Delivery Classification Engine
 * 
 * Classifies delivery orders as "Same side" (₦50 rider pay) or "Different side" (₦90 rider pay)
 * by comparing the cafeteria origin site against the delivery destination site.
 */

export type CampusSite = 'permanent' | 'temporary';
export type DeliveryTypeResult = 'Same side' | 'Different side' | 'Pick up' | 'Other';

// ─────────────────────────────────────────────────────────────
// 1. LOCATION DICTIONARIES
// ─────────────────────────────────────────────────────────────

export const PERMANENT_SITE_CAFETERIAS = [
  'Ebunoluwagrills',
  'A.J SHAWARMA (Boys NH)',
  'Jubilee Cafeteria',
  'Bbsf Cafeteria',
];

export const TEMPORARY_SITE_CAFETERIAS = [
  'Divine cafeteria',
  'Kemi bee',
];

export const TEMPORARY_SIDE_HOSTELS = [
  'Block hostel',
  'Sadler hostel',
  'Story building hostel',
  'UPE 1 hostel',
  'UPE 2 hostel',
  'UPE 3 hostel',
  'Clinic',
  'NLT',
  'New horizon',
  'Basketball Court',
  'LAS',
  'AGA',
  'CBT center',
  'Alma rohm',
];

export const PERMANENT_SIDE_HOSTELS = [
  'NH girls hostel',
  '288 girls hostel',
  'NH boys hostel',
  'Mathew hostel',
  'Mark hostel',
  'Luke hostel',
  'John hostel',
  'COHES',
  'COSMS',
  'COLAW',
  'COAES',
  'Senate building',
  'Library',
  'Chapel',
  '1500 seater hall (ULT)',
  'COCCS',
  'Boys Extension',
];

// ─────────────────────────────────────────────────────────────
// 2. HELPER MATCHER FUNCTIONS
// ─────────────────────────────────────────────────────────────

function cleanString(str: string): string {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
}

/**
 * Identify if a cafeteria belongs to the Permanent or Temporary site
 */
export function getCafeteriaSite(cafeteriaName: string): CampusSite | null {
  const clean = cleanString(cafeteriaName);
  if (!clean) return null;

  // Check Permanent Cafeterias
  if (
    clean.includes('ebun') ||
    clean.includes('ebunoluwa') ||
    clean.includes('shawarma') ||
    clean.includes('a j') ||
    clean.includes('aj') ||
    clean.includes('jubilee') ||
    clean.includes('bbsf')
  ) {
    return 'permanent';
  }

  // Check Temporary Cafeterias
  if (
    clean.includes('divine') ||
    clean.includes('kemi') ||
    clean.includes('kemi bee')
  ) {
    return 'temporary';
  }

  return null;
}

/**
 * Identify if a delivery address/hostel belongs to the Permanent or Temporary site
 */
export function getDestinationSite(address: string): CampusSite | null {
  const clean = cleanString(address);
  if (!clean) return null;

  // 1. Permanent Side Destinations check
  // NH (girls/boys), 288, Mathew, Mark, Luke, John, COHES, COSMS, COLAW, COAES, Senate, Library, Chapel, 1500, ULT, COCCS, Boys Ext
  if (
    clean.includes('nh girls') ||
    clean.includes('nh boys') ||
    clean.includes('288') ||
    clean.includes('mathew') ||
    clean.includes('matthew') ||
    clean.includes('mark') ||
    clean.includes('luke') ||
    clean.includes('john') ||
    clean.includes('cohes') ||
    clean.includes('cosms') ||
    clean.includes('colaw') ||
    clean.includes('coaes') ||
    clean.includes('senate') ||
    clean.includes('library') ||
    clean.includes('chapel') ||
    clean.includes('1500') ||
    clean.includes('ult') ||
    clean.includes('coccs') ||
    clean.includes('boys ext') ||
    clean.includes('boys extension')
  ) {
    return 'permanent';
  }

  // 2. Temporary Side Destinations check
  // Block, Sadler, Story building, UPE, Clinic, NLT, New horizon, Basketball, LAS, AGA, CBT, Alma rohm
  if (
    clean.includes('block') ||
    clean.includes('sadler') ||
    clean.includes('story') ||
    clean.includes('upe') ||
    clean.includes('clinic') ||
    clean.includes('nlt') ||
    clean.includes('new horizon') ||
    clean.includes('basketball') ||
    clean.includes('las') ||
    clean.includes('aga') ||
    clean.includes('cbt') ||
    clean.includes('alma') ||
    clean.includes('alma rohm')
  ) {
    return 'temporary';
  }

  // Additional Permanent fallback for standalone "nh"
  if (clean.includes('nh')) {
    return 'permanent';
  }

  return null;
}

/**
 * Origin-to-Destination Cross-Site Delivery Classification Algorithm:
 * - If order is a pickup -> "Pick up" (₦0)
 * - If originSite == destinationSite -> "Same side" (₦50)
 * - If originSite != destinationSite -> "Different side" (₦90)
 * - Fallback: Use raw order type or default to "Same side"
 */
export function classifyDeliveryType(
  cafeteriaName: string,
  deliveryAddress: string,
  rawOrderType?: string
): DeliveryTypeResult {
  const cleanRawType = cleanString(rawOrderType || '');

  // 1. Pickup Check
  if (
    cleanRawType.includes('pick') ||
    cleanString(deliveryAddress).includes('pick up') ||
    cleanString(deliveryAddress).includes('pickup')
  ) {
    return 'Pick up';
  }

  // 2. Determine Origin & Destination Sites
  const originSite = getCafeteriaSite(cafeteriaName);
  const destinationSite = getDestinationSite(deliveryAddress);

  if (originSite && destinationSite) {
    if (originSite === destinationSite) {
      return 'Same side';
    } else {
      return 'Different side';
    }
  }

  // 3. Fallback matching if one site couldn't be resolved
  if (cleanRawType.includes('diff') || cleanRawType.includes('different')) {
    return 'Different side';
  }
  if (cleanRawType.includes('same')) {
    return 'Same side';
  }

  return 'Same side';
}
