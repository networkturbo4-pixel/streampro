/**
 * Cliente API - StreamManager Pro
 * Maneja peticiones HTTP, cabeceras de autorización, errores y notificaciones toast.
 */

const API = {
    baseUrl: 'api/',

    getToken() {
        return localStorage.getItem('stream_token') || '';
    },

    setToken(token) {
        if (token) {
            localStorage.setItem('stream_token', token);
        } else {
            localStorage.removeItem('stream_token');
        }
    },

    getUser() {
        const u = localStorage.getItem('stream_user');
        return u ? JSON.parse(u) : null;
    },

    setUser(user) {
        if (user) {
            localStorage.setItem('stream_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('stream_user');
        }
    },

    async request(endpoint, options = {}) {
        const url = this.baseUrl + endpoint;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json().catch(() => ({}));

            if (response.status === 401) {
                // Sesión expirada o no autorizada
                this.setToken(null);
                this.setUser(null);
                if (typeof window.showLoginView === 'function') {
                    window.showLoginView();
                }
                throw new Error(data.error || 'Sesión expirada o no autorizada.');
            }

            if (!response.ok || data.success === false) {
                throw new Error(data.error || `Error en la petición (${response.status})`);
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    get(endpoint, params = {}) {
        const qs = new URLSearchParams(params).toString();
        const fullUrl = qs ? `${endpoint}?${qs}` : endpoint;
        return this.request(fullUrl, { method: 'GET' });
    },

    post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    delete(endpoint) {
        return this.request(endpoint, {
            method: 'DELETE'
        });
    },

    showToast(message, type = 'success', duration = 3500) {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type} animate-fade-in`;

        const iconSvg = type === 'success' 
            ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>`
            : type === 'error'
            ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`
            : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

        toast.innerHTML = `
            <div class="toast-icon">${iconSvg}</div>
            <div class="toast-msg">${message}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
};

window.API = API;
