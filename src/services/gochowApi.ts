import axios from 'axios';

const BASE_URL = 'https://api.gochoww.com/api/v1';

export async function fetchLiveGoChowOrders() {
    try {
        // 1. Log in automatically using your admin credentials from .env
        const loginResponse = await axios.post(`${BASE_URL}/admin/login`, {
            email: process.env.GOCHOW_ADMIN_EMAIL,
            password: process.env.GOCHOW_ADMIN_PASSWORD
        });

        const accessToken = loginResponse.data.token || loginResponse.data.accessToken;

        if (!accessToken) {
            throw new Error("Login successful, but no access token was returned.");
        }

        // 2. Fetch live orders using the token
        const ordersResponse = await axios.get(`${BASE_URL}/admin/orders?page=1&limit=10`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        console.log("Successfully fetched orders:", ordersResponse.data.orders);
        return ordersResponse.data.orders;

    } catch (error: any) {
        console.error("API Fetch Error:", error.response?.data || error.message);
        return [];
    }
}