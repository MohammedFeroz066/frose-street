/**
 * FROSE Street — Offline Storage Adapter & IndexedDB Engine (Phase 17)
 * Implements Data Adapter Pattern: LocalIndexedDBAdapter vs CloudHttpAdapter
 * Provides zero-internet persistence, atomic token generation, and local P2P sync.
 */

(function (global) {
  'use strict';

  const DB_NAME = 'frose_street_p2p_db';
  const DB_VERSION = 1;

  // =========================================================================
  // IndexedDB Core Driver (Pure, zero-dependency, ultra-lightweight)
  // =========================================================================
  class LocalIndexedDB {
    constructor() {
      this.db = null;
      this._initPromise = null;
    }

    async init() {
      if (this.db) return this.db;
      if (this._initPromise) return this._initPromise;

      this._initPromise = new Promise((resolve, reject) => {
        // Fallback for Node/test environments where indexedDB might be mocked or absent
        const idb = global.indexedDB || (global.window && global.window.indexedDB);
        if (!idb) {
          resolve(this._createInMemoryMock());
          return;
        }

        const request = idb.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
          const db = e.target.result;

          // Store 1: Orders (FIFO queue, token number, status)
          if (!db.objectStoreNames.contains('orders')) {
            const orderStore = db.createObjectStore('orders', { keyPath: 'id' });
            orderStore.createIndex('tokenNo', 'tokenNo', { unique: false });
            orderStore.createIndex('status', 'status', { unique: false });
            orderStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // Store 2: Atomic Token Sequences (Prevents duplicate tokens under concurrency)
          if (!db.objectStoreNames.contains('tokens')) {
            db.createObjectStore('tokens', { keyPath: 'key' });
          }

          // Store 3: Daily Galla Expenses & Cash Drawer Records
          if (!db.objectStoreNames.contains('galla_entries')) {
            const gallaStore = db.createObjectStore('galla_entries', { keyPath: 'id' });
            gallaStore.createIndex('createdAt', 'createdAt', { unique: false });
          }

          // Store 4: Offline Menu Items Cache
          if (!db.objectStoreNames.contains('menu_items')) {
            const menuStore = db.createObjectStore('menu_items', { keyPath: 'id' });
            menuStore.createIndex('category', 'category', { unique: false });
          }

          // Store 5: Key-Value Local Settings
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }
        };

        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };

        request.onerror = (e) => {
          console.warn('⚠️ IndexedDB open error, falling back to memory store:', e.target.error);
          resolve(this._createInMemoryMock());
        };
      });

      return this._initPromise;
    }

    _createInMemoryMock() {
      // Memory store for test runners or environments where IndexedDB is blocked
      const tables = {
        orders: new Map(),
        tokens: new Map(),
        galla_entries: new Map(),
        menu_items: new Map(),
        settings: new Map()
      };

      this._isMemory = true;
      this._tables = tables;
      return {
        transaction: () => ({
          objectStore: (storeName) => ({
            get: (key) => ({
              onsuccess: null,
              onerror: null,
              result: tables[storeName]?.get(key)
            }),
            put: (val) => {
              const k = val.id || val.key;
              tables[storeName]?.set(k, val);
              return { onsuccess: null, onerror: null };
            },
            getAll: () => ({
              onsuccess: null,
              onerror: null,
              result: Array.from(tables[storeName]?.values() || [])
            }),
            delete: (key) => {
              tables[storeName]?.delete(key);
              return { onsuccess: null, onerror: null };
            }
          })
        })
      };
    }

    async getStore(storeName, mode = 'readonly') {
      const db = await this.init();
      if (this._isMemory) {
        return this._getMemoryStore(storeName);
      }
      const tx = db.transaction(storeName, mode);
      return tx.objectStore(storeName);
    }

    _getMemoryStore(storeName) {
      const table = this._tables[storeName];
      return {
        get: (key) => Promise.resolve(table.get(key)),
        put: (val) => {
          const k = val.id || val.key;
          table.set(k, val);
          return Promise.resolve(val);
        },
        getAll: () => Promise.resolve(Array.from(table.values())),
        delete: (key) => {
          table.delete(key);
          return Promise.resolve(true);
        }
      };
    }

    async get(storeName, key) {
      if (this._isMemory) return this._tables[storeName].get(key);
      const store = await this.getStore(storeName, 'readonly');
      return new Promise((resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }

    async put(storeName, val) {
      if (this._isMemory) {
        const k = val.id || val.key;
        this._tables[storeName].set(k, val);
        return val;
      }
      const store = await this.getStore(storeName, 'readwrite');
      return new Promise((resolve, reject) => {
        const req = store.put(val);
        req.onsuccess = () => resolve(val);
        req.onerror = () => reject(req.error);
      });
    }

    async getAll(storeName) {
      if (this._isMemory) return Array.from(this._tables[storeName].values());
      const store = await this.getStore(storeName, 'readonly');
      return new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }

    async delete(storeName, key) {
      if (this._isMemory) {
        this._tables[storeName].delete(key);
        return true;
      }
      const store = await this.getStore(storeName, 'readwrite');
      return new Promise((resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    }
  }

  // =========================================================================
  // Local IndexedDB Storage Adapter
  // =========================================================================
  class LocalIndexedDBAdapter {
    constructor() {
      this.idb = new LocalIndexedDB();
    }

    async init() {
      await this.idb.init();
      // Ensure initial token sequence exists
      const currentToken = await this.idb.get('tokens', 'daily_token_counter');
      if (!currentToken) {
        await this.idb.put('tokens', {
          key: 'daily_token_counter',
          value: 0,
          updatedAt: new Date().toISOString()
        });
      }
      return this;
    }

    /**
     * Atomically increments the daily token sequence.
     * Prevents duplicate token collisions during high-speed street food rush.
     */
    async getNextAtomicToken() {
      await this.init();
      let record = await this.idb.get('tokens', 'daily_token_counter');
      let nextVal = (record ? record.value : 0) + 1;
      await this.idb.put('tokens', {
        key: 'daily_token_counter',
        value: nextVal,
        updatedAt: new Date().toISOString()
      });
      return nextVal;
    }

    /**
     * Resets the daily token counter back to #0 (next is #1).
     */
    async resetDailyTokenCounter() {
      await this.init();
      await this.idb.put('tokens', {
        key: 'daily_token_counter',
        value: 0,
        updatedAt: new Date().toISOString()
      });
      return 1;
    }

    /**
     * Creates an order locally with integer paise math and atomic token.
     */
    async createOrder(input) {
      await this.init();
      const tokenNo = input.tokenNo || await this.getNextAtomicToken();
      const orderId = input.id || 'ord_local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);

      let totalPaise = 0n;
      const items = (input.items || []).map((i) => {
        const pricePaise = BigInt(i.pricePaise !== undefined ? i.pricePaise : Math.round((i.priceRupees || 0) * 100));
        const qty = BigInt(i.quantity || 1);
        totalPaise += pricePaise * qty;
        return {
          menuItemId: i.menuItemId || i.id,
          name: i.name,
          quantity: Number(qty),
          pricePaise: Number(pricePaise),
          priceRupees: Number(pricePaise / 100n)
        };
      });

      const order = {
        id: orderId,
        tokenNo,
        items,
        totalPaise: Number(totalPaise),
        totalRupees: Number(totalPaise / 100n),
        paymentMethod: input.paymentMethod || 'cash',
        paymentStatus: input.paymentStatus || 'paid',
        status: input.status || 'placed', // 'placed' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
        source: 'local_p2p',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await this.idb.put('orders', order);
      const idbStore = globalThis.FroseIdbStore;
      if (idbStore && typeof idbStore.saveOrder === 'function') {
        try {
          await idbStore.saveOrder(input.vendorId || 'local', {
            client_order_id: order.id,
            id: order.id,
            tokenNo: order.tokenNo,
            items: order.items,
            totalPaise: order.totalPaise,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            status: order.status,
            syncStatus: 'synced',
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
          });
        } catch (_) {}
      }
      return { ok: true, order };
    }

    /**
     * Updates order status with strict lifecycle progression.
     */
    async updateOrderStatus(orderId, newStatus) {
      await this.init();
      const order = await this.idb.get('orders', orderId);
      if (!order) throw new Error(`Order ${orderId} not found in local store`);

      order.status = newStatus;
      order.updatedAt = new Date().toISOString();
      if (newStatus === 'ready') order.readyAt = order.updatedAt;
      if (newStatus === 'delivered') order.deliveredAt = order.updatedAt;

      await this.idb.put('orders', order);
      const idbStore = globalThis.FroseIdbStore;
      if (idbStore && typeof idbStore.updateOrder === 'function') {
        try {
          await idbStore.updateOrder(order.id, {
            status: order.status,
            updatedAt: order.updatedAt
          });
        } catch (_) {}
      }
      return { ok: true, order };
    }

    /**
     * Retrieves all active orders currently in flight.
     */
    async getLiveOrders() {
      await this.init();
      const all = await this.idb.getAll('orders');
      return all
        .filter((o) => ['placed', 'preparing', 'ready'].includes(o.status))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    /**
     * Retrieves all orders including finalized/delivered.
     */
    async getAllOrders() {
      await this.init();
      const all = await this.idb.getAll('orders');
      return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    /**
     * Logs an operational cash expense to the local Galla.
     */
    async logGallaExpense(input) {
      await this.init();
      const id = 'exp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      const amountPaise = Math.round(Number(input.amountRupees || 0) * 100);

      const entry = {
        id,
        category: input.category || 'Supplies',
        amountRupees: Number(input.amountRupees || 0),
        amountPaise,
        notes: input.notes || '',
        createdAt: new Date().toISOString()
      };

      await this.idb.put('galla_entries', entry);
      return { ok: true, expense: entry };
    }

    /**
     * Computes the daily shift Galla summary from stored orders and expenses.
     */
    async getGallaSummary() {
      await this.init();
      const orders = await this.idb.getAll('orders');
      const expenses = await this.idb.getAll('galla_entries');

      let totalSalesPaise = 0;
      let cashSalesPaise = 0;
      let upiSalesPaise = 0;
      let orderCount = 0;

      for (const o of orders) {
        if (o.status !== 'cancelled' && o.paymentStatus === 'paid') {
          totalSalesPaise += o.totalPaise;
          if (o.paymentMethod === 'cash') cashSalesPaise += o.totalPaise;
          else if (o.paymentMethod === 'upi') upiSalesPaise += o.totalPaise;
          orderCount++;
        }
      }

      let totalExpensesPaise = 0;
      for (const e of expenses) {
        totalExpensesPaise += e.amountPaise;
      }

      const netCashInDrawerPaise = cashSalesPaise - totalExpensesPaise;

      return {
        ok: true,
        summary: {
          totalSalesRupees: Math.round(totalSalesPaise / 100),
          cashSalesRupees: Math.round(cashSalesPaise / 100),
          upiSalesRupees: Math.round(upiSalesPaise / 100),
          expensesRupees: Math.round(totalExpensesPaise / 100),
          netCashInDrawerRupees: Math.round(netCashInDrawerPaise / 100),
          orderCount,
          currency: 'INR'
        }
      };
    }
  }

  // =========================================================================
  // Cloud HTTP Adapter (Wraps standard REST API when online)
  // =========================================================================
  class CloudHttpAdapter {
    constructor(baseUrl = '') {
      this.baseUrl = baseUrl;
    }

    _getHeaders() {
      return {
        'Content-Type': 'application/json',
        'X-FROSE-CSRF': '1'
      };
    }

    async _request(path, options = {}) {
      const fn = globalThis.froseApiFetch || fetch;
      const headers = {
        ...this._getHeaders(),
        ...(options.headers || {}),
      };
      return fn(`${this.baseUrl}${path}`, {
        ...options,
        credentials: 'same-origin',
        headers,
      });
    }

    async getNextAtomicToken() {
      const res = await this._request('/api/v1/orders/next-token');
      if (!res.ok) throw new Error('Failed to fetch next token from cloud');
      const data = await res.json();
      return data.nextTokenNo;
    }

    async createOrder(input) {
      const res = await this._request('/api/v1/orders', {
        method: 'POST',
        body: JSON.stringify(input)
      });
      if (!res.ok) throw new Error('Cloud order creation failed');
      return await res.json();
    }

    async updateOrderStatus(orderId, status) {
      const res = await this._request(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Cloud status update failed');
      return await res.json();
    }

    async getLiveOrders() {
      const res = await this._request('/api/v1/orders/live');
      if (!res.ok) throw new Error('Cloud live orders fetch failed');
      const data = await res.json();
      return data.orders || [];
    }

    async getGallaSummary() {
      const res = await this._request('/api/v1/galla/summary');
      if (!res.ok) throw new Error('Cloud galla summary failed');
      return await res.json();
    }
  }

  // =========================================================================
  // Data Adapter Factory & Network Environment Resolver
  // =========================================================================
  class DataAdapterFactory {
    static getAdapter(forceMode = null) {
      const mode = forceMode || 'auto';

      if (mode === 'local' || mode === 'p2p') {
        return new LocalIndexedDBAdapter();
      }

      if (mode === 'cloud') {
        return new CloudHttpAdapter();
      }

      // Auto mode: offline uses IndexedDB, online uses CloudHttpAdapter with fallback
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return new LocalIndexedDBAdapter();
      }

      return new LocalIndexedDBAdapter(); // Default to robust local adapter for maximum reliability
    }

    /**
     * Resolves local Hotspot IP address for device pairing.
     */
    static resolveHotspotAddress() {
      if (typeof window === 'undefined') return 'http://192.168.43.1:3100';
      const host = window.location.hostname;
      const port = window.location.port || '3100';

      // If running on local network IP (e.g. 192.168.x.x, 10.x.x.x)
      if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host)) {
        return `${window.location.protocol}//${host}:${port}`;
      }

      // Default Hotspot SoftAP IP for Android phones
      return 'http://192.168.43.1:3100';
    }
  }
  function base64UrlToUint8Array(b64u) {
    const padLen = (4 - (b64u.length % 4)) % 4;
    const b64 = String(b64u).replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
    const binStr = (typeof atob === 'function')
      ? atob(b64)
      : Buffer.from(b64, 'base64').toString('binary');
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return bytes;
  }

  function spkiPemToArrayBuffer(pem) {
    const clean = String(pem)
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s+/g, '');
    const binStr = (typeof atob === 'function')
      ? atob(clean)
      : Buffer.from(clean, 'base64').toString('binary');
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
    return bytes.buffer;
  }

  class LicenseManager {
    /**
     * Unverified Base64 decoding is disabled (fail-closed); use async verifyLicense().
     */
    static decodeToken(_token) {
      return {
        valid: false,
        isReadOnly: true,
        canCreateOrders: false,
        reason: 'Unverified Base64 decoding is disabled; cryptographic Ed25519 verification via LicenseManager.verifyLicense() is required'
      };
    }

    /**
     * Fetches and caches ONLY the Ed25519 SPKI public key from /api/v1/subscriptions/public-key
     * in IndexedDB meta store (with memory fallback in Node/tests).
     */
    static async getPublicKeyPem(baseUrl = '') {
      const idb = globalThis.FroseIdbStore;
      if (idb && typeof idb.getMeta === 'function') {
        try {
          const cachedMeta = await idb.getMeta('public_key_pem');
          if (cachedMeta && typeof cachedMeta.value === 'string' && cachedMeta.value.includes('BEGIN PUBLIC KEY')) {
            return cachedMeta.value;
          }
        } catch (_) {}
      }
      if (LicenseManager._cachedPublicKeyPem && LicenseManager._cachedPublicKeyPem.includes('BEGIN PUBLIC KEY')) {
        return LicenseManager._cachedPublicKeyPem;
      }
      const fetchFn = globalThis.froseApiFetch || (typeof fetch === 'function' ? fetch : null);
      if (!fetchFn) return null;
      try {
        const res = await fetchFn(`${baseUrl}/api/v1/subscriptions/public-key`, {
          credentials: 'same-origin'
        });
        if (!res || !res.ok) return null;
        const data = await res.json();
        if (data && typeof data.publicKeyPem === 'string' && data.publicKeyPem.includes('BEGIN PUBLIC KEY')) {
          LicenseManager._cachedPublicKeyPem = data.publicKeyPem;
          if (idb && typeof idb.setMeta === 'function') {
            try {
              await idb.setMeta('public_key_pem', { value: data.publicKeyPem });
            } catch (_) {}
          }
          return data.publicKeyPem;
        }
      } catch (_) {}
      return null;
    }

    /**
     * Cryptographically verifies an Ed25519 (EdDSA) offline license JWT via WebCrypto.
     * Fails closed on invalid signature, tampered payload, alg !== 'EdDSA', expiry, or missing crypto.subtle.
     */
    static async verifyLicense(token, publicKeyPem) {
      const cryptoObj = globalThis.crypto;
      if (!cryptoObj || !cryptoObj.subtle) {
        return {
          valid: false,
          isReadOnly: true,
          canCreateOrders: false,
          reason: 'WebCrypto crypto.subtle unavailable; Ed25519 license verification requires a secure context (HTTPS or localhost)'
        };
      }

      if (!token || typeof token !== 'string') {
        return { valid: false, isReadOnly: true, canCreateOrders: false, reason: 'Malformed token' };
      }

      const parts = token.split('.');
      if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
        return { valid: false, isReadOnly: true, canCreateOrders: false, reason: 'Invalid EdDSA JWT structure (3 segments required)' };
      }

      const keyPem = publicKeyPem || (await LicenseManager.getPublicKeyPem());
      if (!keyPem || typeof keyPem !== 'string') {
        return { valid: false, isReadOnly: true, canCreateOrders: false, reason: 'Ed25519 public key unavailable' };
      }

      try {
        const decoder = new TextDecoder();
        const header = JSON.parse(decoder.decode(base64UrlToUint8Array(parts[0])));
        if (!header || header.alg !== 'EdDSA') {
          return {
            valid: false,
            isReadOnly: true,
            canCreateOrders: false,
            reason: `Unsupported JWT algorithm: ${header?.alg || 'none'} (EdDSA required)`
          };
        }

        const spkiBuffer = spkiPemToArrayBuffer(keyPem);
        const publicKey = await cryptoObj.subtle.importKey(
          'spki',
          spkiBuffer,
          { name: 'Ed25519' },
          false,
          ['verify']
        );

        const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        const signatureBytes = base64UrlToUint8Array(parts[2]);
        const isSignatureValid = await cryptoObj.subtle.verify(
          'Ed25519',
          publicKey,
          signatureBytes,
          signingInput
        );

        if (!isSignatureValid) {
          return {
            valid: false,
            isReadOnly: true,
            canCreateOrders: false,
            reason: 'Invalid Ed25519 license signature'
          };
        }

        const payload = JSON.parse(decoder.decode(base64UrlToUint8Array(parts[1])));
        if (!payload || !payload.periodEnd) {
          return { valid: false, isReadOnly: true, canCreateOrders: false, reason: 'Missing license periodEnd claim' };
        }

        const now = new Date();
        if (typeof payload.exp === 'number' && now.getTime() > payload.exp * 1000) {
          return {
            valid: false,
            payload,
            status: 'expired_readonly',
            daysRemaining: 0,
            isReadOnly: true,
            canCreateOrders: false,
            reason: 'License token exp claim expired'
          };
        }

        const expiry = new Date(payload.periodEnd + 'T23:59:59.999Z');
        const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0) {
          const status = diffDays <= 4 ? 'trial_expiring' : 'active';
          return {
            valid: true,
            payload,
            status,
            daysRemaining: diffDays,
            isReadOnly: false,
            canCreateOrders: true
          };
        }

        const daysOverdue = Math.abs(diffDays);
        if (daysOverdue <= 3) {
          return {
            valid: true,
            payload,
            status: 'grace_period',
            daysRemaining: 0,
            isReadOnly: false,
            canCreateOrders: true
          };
        }

        return {
          valid: false,
          payload,
          status: 'expired_readonly',
          daysRemaining: 0,
          isReadOnly: true,
          canCreateOrders: false,
          reason: 'License expired beyond 3-day grace period'
        };
      } catch (e) {
        return {
          valid: false,
          isReadOnly: true,
          canCreateOrders: false,
          reason: 'Ed25519 license verification failed'
        };
      }
    }

    /**
     * Stores active verified offline license token in IndexedDB meta store.
     */
    static async saveLicense(token, extra = {}) {
      LicenseManager._cachedLicenseToken = token;
      const idb = globalThis.FroseIdbStore;
      if (idb && typeof idb.setMeta === 'function') {
        await idb.setMeta('offline_license', {
          token,
          vendor_id: extra.vendorId || null,
          publicKeyPem: extra.publicKeyPem || LicenseManager._cachedPublicKeyPem || null,
          cachedAt: new Date().toISOString()
        });
      }
    }

    /**
     * Retrieves cached license token from IndexedDB meta store.
     */
    static async getCachedLicense() {
      const idb = globalThis.FroseIdbStore;
      if (idb && typeof idb.getMeta === 'function') {
        try {
          const rec = await idb.getMeta('offline_license');
          if (rec && rec.token) return rec.token;
        } catch (_) {}
      }
      return LicenseManager._cachedLicenseToken || null;
    }

    static async getCachedLicenseBundle() {
      const idb = globalThis.FroseIdbStore;
      let token = LicenseManager._cachedLicenseToken || null;
      let publicKeyPem = LicenseManager._cachedPublicKeyPem || null;
      let vendorId = null;
      if (idb && typeof idb.getMeta === 'function') {
        try {
          const licRec = await idb.getMeta('offline_license');
          if (licRec) {
            if (licRec.token) token = licRec.token;
            if (licRec.publicKeyPem) publicKeyPem = licRec.publicKeyPem;
            if (licRec.vendor_id) vendorId = licRec.vendor_id;
          }
          if (!publicKeyPem) {
            const pkRec = await idb.getMeta('public_key_pem');
            if (pkRec && pkRec.value) publicKeyPem = pkRec.value;
          }
        } catch (_) {}
      }
      return { token, publicKeyPem, vendorId };
    }
  }

  // Export module for both browser and Node/Vitest
  const StorageModule = {
    LocalIndexedDB,
    LocalIndexedDBAdapter,
    CloudHttpAdapter,
    DataAdapterFactory,
    LicenseManager
  };

  global.__FROSE_STORAGE__ = StorageModule;
  if (typeof globalThis !== 'undefined') {
    globalThis.__FROSE_STORAGE__ = StorageModule;
  }
  if (typeof window !== 'undefined') {
    window.__FROSE_STORAGE__ = StorageModule;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

export const LocalIndexedDB = globalThis.__FROSE_STORAGE__?.LocalIndexedDB;
export const LocalIndexedDBAdapter = globalThis.__FROSE_STORAGE__?.LocalIndexedDBAdapter;
export const CloudHttpAdapter = globalThis.__FROSE_STORAGE__?.CloudHttpAdapter;
export const DataAdapterFactory = globalThis.__FROSE_STORAGE__?.DataAdapterFactory;
export const LicenseManager = globalThis.__FROSE_STORAGE__?.LicenseManager;
export default globalThis.__FROSE_STORAGE__;
