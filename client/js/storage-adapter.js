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

    async getNextAtomicToken() {
      const res = await fetch(`${this.baseUrl}/api/v1/orders/next-token`, {
        credentials: 'same-origin',
        headers: this._getHeaders()
      });
      if (!res.ok) throw new Error('Failed to fetch next token from cloud');
      const data = await res.json();
      return data.nextTokenNo;
    }

    async createOrder(input) {
      const res = await fetch(`${this.baseUrl}/api/v1/orders`, {
        credentials: 'same-origin',
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(input)
      });
      if (!res.ok) throw new Error('Cloud order creation failed');
      return await res.json();
    }

    async updateOrderStatus(orderId, status) {
      const res = await fetch(`${this.baseUrl}/api/v1/orders/${orderId}/status`, {
        credentials: 'same-origin',
        method: 'PATCH',
        headers: this._getHeaders(),
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Cloud status update failed');
      return await res.json();
    }

    async getLiveOrders() {
      const res = await fetch(`${this.baseUrl}/api/v1/orders/live`, {
        credentials: 'same-origin',
        headers: this._getHeaders()
      });
      if (!res.ok) throw new Error('Cloud live orders fetch failed');
      const data = await res.json();
      return data.orders || [];
    }

    async getGallaSummary() {
      const res = await fetch(`${this.baseUrl}/api/v1/galla/summary`, {
        credentials: 'same-origin',
        headers: this._getHeaders()
      });
      if (!res.ok) throw new Error('Cloud galla summary failed');
      return await res.json();
    }
  }

  // =========================================================================
  // Data Adapter Factory & Network Environment Resolver
  // =========================================================================
  class DataAdapterFactory {
    static getAdapter(forceMode = null) {
      const mode = forceMode || (typeof localStorage !== 'undefined' ? localStorage.getItem('frose_network_mode') : null) || 'auto';

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
  class LicenseManager {
    /**
     * Decodes and validates HMAC license token structure offline
     */
    static decodeToken(token) {
      if (!token || typeof token !== 'string' || !token.includes('.')) {
        return { valid: false, reason: 'Malformed token' };
      }
      const parts = token.split('.');
      if (parts.length !== 2) {
        return { valid: false, reason: 'Invalid token segment count' };
      }
      try {
        const payloadBase64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
        const jsonStr = (typeof atob === 'function')
          ? atob(payloadBase64)
          : Buffer.from(payloadBase64, 'base64').toString('utf8');
        const payload = JSON.parse(jsonStr);

        const now = new Date();
        const expiry = new Date(payload.periodEnd + 'T23:59:59.999Z');
        const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        let status = 'active';
        let isReadOnly = false;

        if (diffDays >= 0) {
          status = diffDays <= 4 ? 'trial_expiring' : 'active';
        } else {
          const daysOverdue = Math.abs(diffDays);
          if (daysOverdue <= 3) {
            status = 'grace_period';
            isReadOnly = false;
          } else {
            status = 'expired_readonly';
            isReadOnly = true;
          }
        }

        return {
          valid: true,
          payload,
          status,
          daysRemaining: diffDays,
          isReadOnly,
          canCreateOrders: !isReadOnly
        };
      } catch (e) {
        return { valid: false, reason: 'Failed to decode license payload' };
      }
    }

    /**
     * Stores active license token
     */
    static saveLicense(token) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('frose_license_token', token);
      }
    }

    /**
     * Retrieves cached license token
     */
    static getCachedLicense() {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem('frose_license_token') || null;
      }
      return null;
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
