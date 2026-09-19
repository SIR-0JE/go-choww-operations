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

// ─────────────────────────────────────────────────────────────
// 3. GPS GEOREFERENCING & GEOFENCING ENGINE
// ─────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Campus Cafeteria GPS Georeference Registry
 */
export const CAFETERIA_COORDINATES: Record<string, LatLng> = {
  // Permanent Site Cafeterias
  'jubilee': { lat: 7.618037, lng: 4.202415 },
  'jubilee cafeteria': { lat: 7.618037, lng: 4.202415 },
  'christoy': { lat: 7.618037, lng: 4.202415 },
  'bbsf': { lat: 7.619532, lng: 4.205877 },
  'bbsf cafeteria': { lat: 7.619532, lng: 4.205877 },
  'ebun': { lat: 7.618500, lng: 4.203000 },
  'ebunoluwa': { lat: 7.618500, lng: 4.203000 },
  'ebunoluwagrills': { lat: 7.618500, lng: 4.203000 },
  'a.j shawarma': { lat: 7.619000, lng: 4.204500 },
  'a.j shawarma (boys nh)': { lat: 7.619000, lng: 4.204500 },
  'shawarma': { lat: 7.619000, lng: 4.204500 },

  // Temporary Site Cafeterias
  'divine': { lat: 7.624629, lng: 4.193443 },
  'divine cafeteria': { lat: 7.624629, lng: 4.193443 },
  'kemi': { lat: 7.624730, lng: 4.193285 },
  'kemi bee': { lat: 7.624730, lng: 4.193285 },
};

/**
 * Lookup GPS coordinates for any cafeteria by name
 */
export function getCafeteriaCoordinates(cafeteriaName: string): LatLng | null {
  const clean = cleanString(cafeteriaName);
  if (!clean) return null;

  for (const [key, coords] of Object.entries(CAFETERIA_COORDINATES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return coords;
    }
  }

  // General site fallback if specific cafeteria not found
  const site = getCafeteriaSite(cafeteriaName);
  if (site === 'permanent') return { lat: 7.6188, lng: 4.2040 };
  if (site === 'temporary') return { lat: 7.6246, lng: 4.1934 };

  return null;
}

/**
 * Calculates the great-circle distance between two GPS coordinates in meters
 * using the Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's mean radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export interface GeofenceVerificationResult {
  isWithinGeofence: boolean;
  distanceMeters: number;
  cafeteriaName: string;
  maxRadiusMeters: number;
  message: string;
}

/**
 * Verifies if a rider's GPS location is within the cafeteria's geofence radius.
 * Default radius is 200m to account for building footprint and parking.
 */
export function verifyCafeteriaProximity(
  cafeteriaName: string,
  riderLat: number,
  riderLng: number,
  maxRadiusMeters: number = 200
): GeofenceVerificationResult {
  const coords = getCafeteriaCoordinates(cafeteriaName);
  if (!coords) {
    return {
      isWithinGeofence: true,
      distanceMeters: 0,
      cafeteriaName,
      maxRadiusMeters,
      message: 'Cafeteria proximity verified',
    };
  }

  const distance = calculateDistanceMeters(riderLat, riderLng, coords.lat, coords.lng);
  const isWithin = distance <= maxRadiusMeters;

  return {
    isWithinGeofence: isWithin,
    distanceMeters: distance,
    cafeteriaName,
    maxRadiusMeters,
    message: isWithin
      ? `Proximity verified (${distance}m away)`
      : `Location Check: You are currently ${distance}m away from ${cafeteriaName}. You must be physically at the cafeteria (within ${maxRadiusMeters}m) to request a handover.`,
  };
}

