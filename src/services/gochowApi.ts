import axios from 'axios';

const BASE_URL = 'https://api.gochoww.com/api/v1';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function isTransientError(error: any): boolean {
  const code = error?.code;
  if (
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNABORTED' ||
    code === 'ERR_NETWORK'
  ) {
    return true;
  }
  const status = error?.response?.status;
  if (status && (status >= 500 || status === 429)) {
    return true;
  }
  return false;
}

async function withRetry<T>(operationName: string, fn: () => Promise<T>, maxRetries = 2, delayMs = 1200): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (err?.response?.status === 401) {
        cachedToken = null;
        tokenExpiresAt = 0;
      }
      if (isTransientError(err) && attempt < maxRetries) {
        console.warn(
          `[gochowApi] ${operationName}: Transient network notice (${err.code || err.message}). Retrying in ${delayMs}ms (Attempt ${attempt + 1}/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Obtain a valid admin JWT token, caching it in memory for 10 minutes.
 * Uses automatic retry on transient DNS/network reconnection drops.
 */
async function getAdminToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  return withRetry('getAdminToken', async () => {
    const email = (process.env.GOCHOW_ADMIN_EMAIL || '').trim();
    const password = (process.env.GOCHOW_ADMIN_PASSWORD || '').trim();

    const loginResponse = await axios.post(
      `${BASE_URL}/admin/login`,
      {
        email,
        password,
      },
      { timeout: 10000 }
    );

    const token = loginResponse.data.token || loginResponse.data.accessToken;
    if (!token) {
      throw new Error('Login succeeded but no access token was returned.');
    }

    cachedToken = token;
    tokenExpiresAt = Date.now() + 10 * 60 * 1000; // cache for 10 minutes
    return token;
  }, 2, 1000);
}

export interface FetchLiveOrdersResult {
  success: boolean;
  orders: any[];
  error?: string;
  isNetworkError?: boolean;
}

/**
 * Fetch the latest live orders with full status and transient retry protection.
 */
export async function fetchLiveGoChowOrdersWithStatus(limit: number = 50): Promise<FetchLiveOrdersResult> {
  try {
    const orders = await withRetry('fetchLiveOrders', async () => {
      const token = await getAdminToken();
      const ordersResponse = await axios.get(`${BASE_URL}/admin/orders?page=1&limit=${limit}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });

      return ordersResponse.data.orders ?? [];
    }, 2, 1200);

    return { success: true, orders };
  } catch (error: any) {
    const isNet = isTransientError(error);
    const errorMsg = error.response?.data?.message || error.message || 'Failed to connect to GoChow API';
    console.error('[gochowApi] fetchLiveGoChowOrdersWithStatus error:', errorMsg);
    return {
      success: false,
      orders: [],
      error: errorMsg,
      isNetworkError: isNet,
    };
  }
}

/**
 * Fetch the latest live orders from GoChow (defaults to top 50)
 */
export async function fetchLiveGoChowOrders(limit: number = 50): Promise<any[]> {
  const result = await fetchLiveGoChowOrdersWithStatus(limit);
  return result.orders;
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
        timeout: 5000,
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