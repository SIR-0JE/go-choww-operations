import axios from 'axios';

const BASE_URL = 'https://api.gochoww.com/api/v1';

/**
 * GoChow Live API Response Shape (verified from live response):
 *
 * order.orderNumber           — unique ID, e.g. "ORD-MU5FPEPS-JBB33"
 * order._id                   — MongoDB internal ID
 * order.user.name             — customer full name
 * order.vendor.restaurantName — cafeteria/vendor name
 * order.vendor.address        — "Permanent Side" | "Temporary Side"
 * order.deliveryAddress       — e.g. "288 girls hostel"
 * order.subtotal              — food cost (NGN)
 * order.deliveryFee           — delivery fee (NGN)
 * order.serviceCharge         — platform fee (NGN, not tracked in our DB)
 * order.totalAmount           — total charged (NGN)
 * order.orderStatus           — "delivered" | "dispatched" | "preparing" | "cancelled" | "pending"
 * order.paymentStatus         — "success" | "pending" | "failed"
 * order.createdAt             — ISO 8601 timestamp
 */
export async function fetchLiveGoChowOrders(): Promise<any[]> {
    try {
        const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
            email: process.env.GOCHOW_ADMIN_EMAIL,
            password: process.env.GOCHOW_ADMIN_PASSWORD,
        });

        const accessToken = loginResponse.data.token || loginResponse.data.accessToken;

        if (!accessToken) {
            throw new Error('Login succeeded but no access token was returned.');
        }

        const ordersResponse = await axios.get(`${BASE_URL}/admin/orders?page=1&limit=10`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        return ordersResponse.data.orders ?? [];
    } catch (error: any) {
        console.error('[gochowApi] Fetch error:', error.response?.data || error.message);
        return [];
    }
}