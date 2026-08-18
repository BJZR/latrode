const API_BASE = '/api/v1';

class API {
    static getCookie(name) {
        const cookie = document.cookie
            .split('; ')
            .find((row) => row.startsWith(`${name}=`));
        return cookie ? cookie.split('=')[1] : null;
    }

    static async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        const sid = API.getCookie('session_id');
        if (sid && !headers['X-Session-Id']) {
            headers['X-Session-Id'] = sid;
        }

        if (options.method && options.method !== 'GET' && options.method !== 'HEAD') {
            const csrf = API.getCookie('csrf_token');
            if (csrf) {
                headers['X-CSRF-Token'] = csrf;
            }
        }

        const response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers,
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    static async getProducts(query = '', page = 1, limit = 20) {
        let url = `/products?page=${page}&limit=${limit}`;
        if (query) url += `&query=${encodeURIComponent(query)}`;
        return this.request(url);
    }

    static async getProduct(id) {
        return this.request(`/products/${id}`);
    }

    static async register(username, email, password) {
        return this.request('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password })
        });
    }

    static async login(email, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    }

    static async logout() {
        return this.request('/auth/logout', { method: 'POST' });
    }

    static async getProfile() {
        return this.request('/auth/profile');
    }

    static async updateProfile(profileData) {
        return this.request('/auth/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    }

    static async getCart() {
        return this.request('/cart');
    }

    static async addToCart(productId, colorId, size = '', quantity = 1) {
        return this.request('/cart', {
            method: 'POST',
            body: JSON.stringify({ productId, colorId, size, quantity })
        });
    }

    static async updateCartItem(itemId, quantity) {
        return this.request(`/cart/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify({ quantity })
        });
    }

    static async removeFromCart(itemId) {
        return this.request(`/cart/${itemId}`, { method: 'DELETE' });
    }

    static async clearCart() {
        return this.request('/cart', { method: 'DELETE' });
    }

    static async getFavorites() {
        return this.request('/favorites');
    }

    static async addToFavorites(productId) {
        return this.request('/favorites', {
            method: 'POST',
            body: JSON.stringify({ productId })
        });
    }

    static async removeFromFavorites(favId) {
        return this.request(`/favorites/${favId}`, { method: 'DELETE' });
    }

    static async createOrder(orderData) {
        return this.request('/orders', {
            method: 'POST',
            body: JSON.stringify(orderData)
        });
    }

    static async getMyOrders() {
        return this.request('/orders/my');
    }

    static async getOrder(id) {
        return this.request(`/orders/${id}`);
    }

    static async cancelOrder(orderId) {
        return this.request(`/orders/${orderId}/cancel`, { method: 'POST' });
    }

    static async forgotPassword(email) {
        return this.request('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    }

    static async verifyResetCode(email, code) {
        return this.request('/auth/verify-reset-code', {
            method: 'POST',
            body: JSON.stringify({ email, code })
        });
    }

    static async setPassword(newPassword) {
        return this.request('/auth/set-password', {
            method: 'POST',
            body: JSON.stringify({ newPassword })
        });
    }

    static async resetPassword(email, code, newPassword) {
        return this.request('/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ email, code, newPassword })
        });
    }

    static async createNequiPayment(orderId, phoneNumber) {
        return this.request('/payments/create-nequi', {
            method: 'POST',
            body: JSON.stringify({ orderId, phoneNumber })
        });
    }

    static async createDaviplataPayment(orderId, phoneNumber, documentType, documentNumber) {
        return this.request('/payments/create-daviplata', {
            method: 'POST',
            body: JSON.stringify({ orderId, phoneNumber, documentType, documentNumber })
        });
    }

    static async createBancolombiaTransferPayment(orderId) {
        return this.request('/payments/create-bancolombia-transfer', {
            method: 'POST',
            body: JSON.stringify({ orderId })
        });
    }

    static async checkPaymentStatus(orderId) {
        return this.request(`/payments/status?orderId=${orderId}`);
    }

    static async getSettings() {
        return this.request('/settings');
    }

    static async getEmailQuota() {
        return this.request('/email-quota');
    }
}

window.API = API;
