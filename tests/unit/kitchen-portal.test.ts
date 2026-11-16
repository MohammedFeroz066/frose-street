import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { DeviceService } from '../../server/src/modules/devices/device.service.js';

describe('Phase 14: Frontend — Kitchen Display Portal (KDS) Acceptance Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('TEST 1: Kitchen Portal Routes & Content Negotiation', () => {
    it('should serve kitchen.html when Accept header contains text/html', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/kitchen',
        headers: {
          accept: 'text/html,application/xhtml+xml',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Kitchen Display (KDS)');
      expect(res.body).toContain('id="kds-order-queue"');
      expect(res.body).toContain('id="pending-count-pill"');
      expect(res.body).toContain('id="done-count-pill"');
      expect(res.body).toContain('id="wakelock-pill"');
      expect(res.body).toContain('id="reconnect-banner"');
    });

    it('should return JSON status for non-browser / scaffolding requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/kitchen',
        headers: {
          accept: 'application/json',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.portal).toBe('kitchen');
      expect(json.status).toBe('ready');
    });
  });

  describe('TEST 2: Knuckle-Friendly Touch Ergonomics (>= 72px)', () => {
    it('should enforce min-height >= 72px on the MARK ORDER READY action button', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Check .btn-mark-ready has min-height >= 72px
      expect(css).toMatch(/\.btn-mark-ready\s*\{[^}]*min-height:\s*(7[2-9]|[89][0-9])px/i);
    });

    it('should have prominent tactile checkmark and slide-out animation styles', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.kds-card.slide-out');
      expect(css).toContain('translateX(115%)');
    });
  });

  describe('TEST 3: Dynamic Card Age Colors (<3m Red, 3-10m Orange, 10m+ Slate Black)', () => {
    it('should define RED border for fresh orders (< 3 min)', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.kds-card.age-fresh');
      expect(css).toContain('#EF4444');
    });

    it('should define ORANGE border for cooking orders (3-10 min)', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.kds-card.age-cooking');
      expect(css).toContain('#F59E0B');
    });

    it('should define BLACK / SLATE DARK border for overdue orders (10+ min)', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.kds-card.age-overdue');
      expect(css).toContain('#0F172A');
    });
  });

  describe('TEST 4: Strict Financial Blindness (No Prices / Currency on Kitchen Screen)', () => {
    it('should NOT render any rupee signs, sales tallies, or price tags in kitchen.html', () => {
      const htmlPath = path.resolve(process.cwd(), 'client/kitchen.html');
      const html = fs.readFileSync(htmlPath, 'utf8');

      // Must have zero rupee symbols
      expect(html).not.toContain('₹');
      expect(html).not.toContain('Galla');
      expect(html).not.toContain('totalSales');
      expect(html).not.toContain('rupees');
    });

    it('should NOT calculate or display prices in kitchen.js rendering logic', () => {
      const jsPath = path.resolve(process.cwd(), 'client/js/kitchen.js');
      const js = fs.readFileSync(jsPath, 'utf8');

      expect(js).not.toContain('totalRupees');
      expect(js).not.toContain('totalPaise');
      expect(js).not.toContain('₹');
    });
  });

  describe('TEST 5: QR Device Pairing Auto-Authentication', () => {
    it('should successfully generate and pair device for cook role redirecting to /kitchen', async () => {
      const vendorId = '00000000-0000-0000-0000-000000000001';
      const jwtSecret = 'test-secret-key-for-frose-street-kds-jwt-32ch';

      // Cashier generates pairing token for cook
      const genResult = await DeviceService.generatePairingToken(vendorId, 'cook', jwtSecret, 'Kitchen Tablet');
      expect(genResult.pairingToken).toBeDefined();
      expect(genResult.role).toBe('cook');

      // Mock database for pairing redemption
      const mockDevices: any[] = [];
      const mockDb: any = {
        selectFrom: () => ({
          selectAll: () => ({
            where: () => ({
              executeTakeFirst: async () => ({
                id: vendorId,
                business_name: 'Tibetan Momo Point',
              }),
            }),
          }),
        }),
        insertInto: () => ({
          values: (val: any) => ({
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => {
                const inserted = { id: 'device-123', ...val };
                mockDevices.push(inserted);
                return inserted;
              },
            }),
          }),
        }),
      };

      const pairResult = await DeviceService.pairDevice(mockDb, genResult.pairingToken, jwtSecret, 'Kitchen Display Unit');
      expect(pairResult.device.role).toBe('cook');
      expect(pairResult.portalUrl).toBe('/kitchen');
      expect(pairResult.token).toBeDefined();
    });
  });

  describe('TEST 6: Live Orders Queue & Status Transition', () => {
    it('should fetch active kitchen orders and update status to ready via OrderService', async () => {
      const vendorId = '00000000-0000-0000-0000-000000000001';

      // Mock DB state
      const mockOrders: any[] = [
        {
          id: 'order-101',
          vendor_id: vendorId,
          token_no: 1,
          total_paise: 12000n,
          order_status: 'pending',
          payment_method: 'cash',
          payment_status: 'completed',
          customer_name: 'Rahul',
          notes: 'Extra spicy',
          created_at: new Date().toISOString(),
        },
      ];

      const mockDb: any = {
        selectFrom: () => ({
          selectAll: () => ({
            where: (col: string, op: string, val: any) => ({
              where: (col2: string, op2: string, val2: any) => ({
                orderBy: () => ({
                  execute: async () => mockOrders.filter((o) => o.vendor_id === val && val2.includes(o.order_status)),
                }),
                executeTakeFirst: async () => mockOrders.find((o) => o.id === val && o.vendor_id === val2),
              }),
              execute: async () => [],
            }),
          }),
        }),
        updateTable: () => ({
          set: (updates: any) => ({
            where: (col: string, op: string, val: any) => ({
              where: (col2: string, op2: string, val2: any) => ({
                execute: async () => {
                  const order = mockOrders.find((o) => o.id === val && o.vendor_id === val2);
                  if (order) Object.assign(order, updates);
                  return [order];
                },
              }),
            }),
          }),
        }),
      };

      // 1. Fetch live orders
      const live = await OrderService.getLiveOrders(mockDb, vendorId);
      expect(live.kitchenQueue.length).toBe(1);
      expect(live.kitchenQueue[0].tokenNo).toBe(1);
      expect(live.kitchenQueue[0].notes).toBe('Extra spicy');

      // 2. Mark ready
      const updated = await OrderService.updateOrderStatus(mockDb, vendorId, 'order-101', 'ready', 'cook');
      expect(updated.newStatus).toBe('ready');
      expect(updated.tokenNo).toBe(1);
    });
  });

  describe('TEST 7: PWA Service Worker Pre-Caching for KDS', () => {
    it('should include kitchen.html and js/kitchen.js in precache assets with bumped cache version', () => {
      const swPath = path.resolve(process.cwd(), 'client/sw.js');
      const sw = fs.readFileSync(swPath, 'utf8');

      expect(sw).toContain("'/kitchen.html'");
      expect(sw).toContain("'/js/kitchen.js'");
      expect(sw).toMatch(/frose-street-v[6-9]-/);
    });
  });
});
