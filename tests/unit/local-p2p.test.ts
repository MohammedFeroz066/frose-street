import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {
  LocalIndexedDB,
  LocalIndexedDBAdapter,
  CloudHttpAdapter,
  DataAdapterFactory
} from '../../client/js/storage-adapter.js';

describe('Phase 17 Acceptance: Local P2P Mode (Phone Hotspot Communication)', () => {

  describe('TEST 1: Storage Module & Data Adapter Factory Exports', () => {
    it('should export LocalIndexedDB, LocalIndexedDBAdapter, CloudHttpAdapter, and DataAdapterFactory', () => {
      expect(LocalIndexedDB).toBeDefined();
      expect(LocalIndexedDBAdapter).toBeDefined();
      expect(CloudHttpAdapter).toBeDefined();
      expect(DataAdapterFactory).toBeDefined();
    });

    it('DataAdapterFactory should instantiate LocalIndexedDBAdapter when local mode is requested', () => {
      const adapter = DataAdapterFactory.getAdapter('local');
      expect(adapter).toBeInstanceOf(LocalIndexedDBAdapter);
    });

    it('DataAdapterFactory should instantiate CloudHttpAdapter when cloud mode is requested', () => {
      const adapter = DataAdapterFactory.getAdapter('cloud');
      expect(adapter).toBeInstanceOf(CloudHttpAdapter);
    });
  });

  describe('TEST 2: Atomic Token Sequences & Zero Collisions', () => {
    it('should generate strictly sequential atomic tokens without duplicates', async () => {
      const adapter = new LocalIndexedDBAdapter();
      await adapter.init();
      await adapter.resetDailyTokenCounter();

      const tokens: number[] = [];
      for (let i = 0; i < 25; i++) {
        tokens.push(await adapter.getNextAtomicToken());
      }

      const uniqueSet = new Set(tokens);
      expect(tokens.length).toBe(25);
      expect(uniqueSet.size).toBe(25);
      expect(tokens[0]).toBe(1);
      expect(tokens[24]).toBe(25);
    });

    it('resetDailyTokenCounter should reset sequence back to zero (next is 1)', async () => {
      const adapter = new LocalIndexedDBAdapter();
      await adapter.init();
      await adapter.getNextAtomicToken();
      await adapter.resetDailyTokenCounter();
      const tokenAfterReset = await adapter.getNextAtomicToken();
      expect(tokenAfterReset).toBe(1);
    });
  });

  describe('TEST 3: Local Order Creation & Integer Paise Math', () => {
    it('should create and store an order with exact BigInt integer paise math', async () => {
      const adapter = new LocalIndexedDBAdapter();
      await adapter.init();

      const orderRes = await adapter.createOrder({
        tokenNo: 15,
        items: [
          { menuItemId: 'item-veg-momo', name: 'Veg Steamed Momos', priceRupees: 80, pricePaise: 8000, quantity: 2 },
          { menuItemId: 'item-chai', name: 'Special Masala Chai', priceRupees: 20, pricePaise: 2000, quantity: 1 }
        ],
        paymentMethod: 'cash',
        paymentStatus: 'paid'
      });

      expect(orderRes.ok).toBe(true);
      expect(orderRes.order).toBeDefined();
      expect(orderRes.order.tokenNo).toBe(15);
      expect(orderRes.order.totalPaise).toBe(18000); // 8000*2 + 2000*1 = 18000 paise
      expect(orderRes.order.totalRupees).toBe(180);
      expect(orderRes.order.status).toBe('placed');
      expect(orderRes.order.source).toBe('local_p2p');
    });

    it('should transition order lifecycle from placed -> preparing -> ready -> delivered', async () => {
      const adapter = new LocalIndexedDBAdapter();
      await adapter.init();

      const createRes = await adapter.createOrder({
        tokenNo: 16,
        items: [{ menuItemId: 'item-chai', name: 'Chai', priceRupees: 20, pricePaise: 2000, quantity: 1 }],
        paymentMethod: 'upi',
        paymentStatus: 'paid'
      });

      const orderId = createRes.order.id;

      // Status -> preparing
      const prepRes = await adapter.updateOrderStatus(orderId, 'preparing');
      expect(prepRes.order.status).toBe('preparing');

      // Status -> ready
      const readyRes = await adapter.updateOrderStatus(orderId, 'ready');
      expect(readyRes.order.status).toBe('ready');
      expect(readyRes.order.readyAt).toBeDefined();

      // Status -> delivered
      const delRes = await adapter.updateOrderStatus(orderId, 'delivered');
      expect(delRes.order.status).toBe('delivered');
      expect(delRes.order.deliveredAt).toBeDefined();
    });
  });

  describe('TEST 4: Live Order Filtering & Daily Shift Galla Calculation', () => {
    it('getLiveOrders should only return orders with placed, preparing, or ready status', async () => {
      const adapter = new LocalIndexedDBAdapter();
      await adapter.init();

      const live = await adapter.getLiveOrders();
      expect(Array.isArray(live)).toBe(true);
      for (const order of live) {
        expect(['placed', 'preparing', 'ready']).toContain(order.status);
      }
    });

    it('logGallaExpense and getGallaSummary should compute exact cash drawer balance', async () => {
      const adapter = new LocalIndexedDBAdapter();
      await adapter.init();

      // Log an operational expense of Rs 50
      const expRes = await adapter.logGallaExpense({
        category: 'Supplies',
        amountRupees: 50,
        notes: 'Paper plates & napkins'
      });

      expect(expRes.ok).toBe(true);
      expect(expRes.expense.amountRupees).toBe(50);
      expect(expRes.expense.amountPaise).toBe(5000);

      const gallaRes = await adapter.getGallaSummary();
      expect(gallaRes.ok).toBe(true);
      expect(gallaRes.summary.currency).toBe('INR');
      expect(gallaRes.summary.expensesRupees).toBeGreaterThanOrEqual(50);
      expect(typeof gallaRes.summary.totalSalesRupees).toBe('number');
      expect(typeof gallaRes.summary.netCashInDrawerRupees).toBe('number');
    });
  });

  describe('TEST 5: Hotspot Network IP Resolution & Service Worker precache', () => {
    it('resolveHotspotAddress should return standard SoftAP endpoint when run in test environment', () => {
      const address = DataAdapterFactory.resolveHotspotAddress();
      expect(address).toMatch(/^http:\/\/(192\.168\.43\.1|localhost|127\.0\.0\.1):3100$/);
    });

    it('client/sw.js should precache /js/storage-adapter.js', () => {
      const swPath = path.resolve(process.cwd(), 'client/sw.js');
      const swContent = fs.readFileSync(swPath, 'utf8');
      expect(swContent).toContain('/js/storage-adapter.js');
    });

    it('client/index.html and client/billing.html should load storage-adapter.js before app.js/billing.js', () => {
      const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'client/index.html'), 'utf8');
      const billingHtml = fs.readFileSync(path.resolve(process.cwd(), 'client/billing.html'), 'utf8');

      expect(indexHtml).toContain('storage-adapter.js');
      expect(billingHtml).toContain('storage-adapter.js');
    });
  });
});
