import axios from 'axios';

const BASE_URL = 'https://api.gochoww.com/api/v1';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Obtain a valid admin JWT token, caching it in memory for 10 minutes
 */
async function getAdminToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
    email: process.env.GOCHOW_ADMIN_EMAIL,
    password: process.env.GOCHOW_ADMIN_PASSWORD,
  });

  const token = loginResponse.data.token || loginResponse.data.accessToken;
  if (!token) {
    throw new Error('Login succeeded but no access token was returned.');
  }

  cachedToken = token;
  tokenExpiresAt = now + 10 * 60 * 1000; // cache for 10 minutes
  return token;
}

/**
 * Fetch the latest live orders from GoChow (defaults to top 30)
 */
export async function fetchLiveGoChowOrders(limit: number = 30): Promise<any[]> {
  try {
    const token = await getAdminToken();
    const ordersResponse = await axios.get(`${BASE_URL}/admin/orders?page=1&limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return ordersResponse.data.orders ?? [];
  } catch (error: any) {
    // If 401, invalidate cached token for next retry
    if (error.response?.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
    }
    console.error('[gochowApi] fetchLiveGoChowOrders error:', error.response?.data || error.message);
    return [];
  }
}

/**
 * Targeted search on GoChow API for a specific order by orderNumber.
 * Essential for older active orders that have moved past page 1.
 */
export async function fetchGoChowOrderByNumber(orderNumber: string): Promise<any | null> {
  if (!orderNumber) return null;
  try {
    const token = await getAdminToken();
    const response = await axios.get(
      `${BASE_URL}/admin/orders?search=${encodeURIComponent(orderNumber.trim())}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const orders = response.data.orders;
    if (Array.isArray(orders) && orders.length > 0) {
      const match = orders.find(
        (o: any) =>
          String(o.orderNumber || '').trim().toLowerCase() === orderNumber.trim().toLowerCase()
      );
      return match || orders[0];
    }
    return null;
  } catch (error: any) {
    if (error.response?.status === 401) {
      cachedToken = null;
      tokenExpiresAt = 0;
    }
    console.error(`[gochowApi] fetchGoChowOrderByNumber(${orderNumber}) error:`, error.response?.data || error.message);
    return null;
  }
}