/**
 * UHP Client SDK — Universal JavaScript Client
 *
 * Works in any JS runtime: Browser, Node.js, Electron, React Native, Deno.
 * Any environment with fetch() support can use this SDK.
 *
 * Usage:
 *   const uhp = new UHPClient();
 *   await uhp.connect();
 *   await uhp.permissions.request('twitter.com');
 *   await uhp.store.add('twitter.com', 'bookmarks', { text: 'Hello' });
 *   const items = await uhp.store.query('twitter.com', 'bookmarks');
 */

class UHPClient {
    constructor(options = {}) {
        this.port = options.port || 21000;
        this.host = options.host || 'localhost';
        this.baseUrl = `http://${this.host}:${this.port}/uhp/v1`;
        this.connected = false;
        this.capabilities = [];
        this.agent = null;
        this._listeners = {};
        this._retryInterval = options.retryInterval || 5000;
        this._retryTimer = null;

        // Sub-APIs
        this.store = {
            add: this._storeAdd.bind(this),
            query: this._storeQuery.bind(this),
            delete: this._storeDelete.bind(this),
            update: this._storeUpdate.bind(this),
            search: this._storeSearch.bind(this),
        };

        this.permissions = {
            request: this._permRequest.bind(this),
            list: this._permList.bind(this),
            revoke: this._permRevoke.bind(this),
        };
    }

    // --- Connection Lifecycle ---

    async connect() {
        try {
            const data = await this._get('/handshake');
            if (data.protocol === 'uhp') {
                this.connected = true;
                this.capabilities = data.capabilities;
                this.agent = data.agent;
                this._emit('connected', data);
                return data;
            }
            throw new Error('Invalid handshake response');
        } catch (err) {
            this.connected = false;
            this._emit('disconnected', err);
            throw err;
        }
    }

    async health() {
        return this._get('/health');
    }

    startAutoConnect() {
        if (this._retryTimer) return;
        const attempt = async () => {
            if (!this.connected) {
                try { await this.connect(); } catch (_) { /* retry */ }
            }
        };
        attempt();
        this._retryTimer = setInterval(attempt, this._retryInterval);
    }

    stopAutoConnect() {
        if (this._retryTimer) {
            clearInterval(this._retryTimer);
            this._retryTimer = null;
        }
    }

    // --- Storage API ---

    async _storeAdd(namespace, collection, data, id) {
        return this._post('/storage/write', { namespace, collection, data, id });
    }

    async _storeQuery(namespace, collection, options = {}) {
        const { query, sort, limit, offset } = options;
        const result = await this._post('/storage/query', { namespace, collection, query, sort, limit, offset });
        return result.items || [];
    }

    async _storeDelete(namespace, collection, id) {
        return this._post('/storage/delete', { namespace, collection, id });
    }

    async _storeUpdate(namespace, collection, id, data) {
        return this._post('/storage/update', { namespace, collection, id, data });
    }

    async _storeSearch(namespace, collection, term, limit) {
        const result = await this._post('/storage/search', { namespace, collection, term, limit });
        return result.items || [];
    }

    // --- Permissions API ---

    async _permRequest(namespace, capabilities) {
        return this._post('/permissions/request', { namespace, capabilities });
    }

    async _permList(origin) {
        const qs = origin ? `?origin=${encodeURIComponent(origin)}` : '';
        return this._get(`/permissions/list${qs}`);
    }

    async _permRevoke(namespace) {
        return this._post('/permissions/revoke', { namespace });
    }

    // --- Event Emitter ---

    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return this;
    }

    off(event, callback) {
        if (!this._listeners[event]) return this;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
        return this;
    }

    _emit(event, data) {
        (this._listeners[event] || []).forEach(cb => {
            try { cb(data); } catch (_) { /* swallow listener errors */ }
        });
    }

    // --- HTTP Helpers ---

    async _get(path) {
        const res = await fetch(`${this.baseUrl}${path}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.message || err.error || 'Request failed');
        }
        return res.json();
    }

    async _post(path, body) {
        const res = await fetch(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.message || err.error || 'Request failed');
        }
        return res.json();
    }
}

// Universal export: works in Browser (global), Node.js (CommonJS), and ES Modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UHPClient;
} else if (typeof window !== 'undefined') {
    window.UHPClient = UHPClient;
}
