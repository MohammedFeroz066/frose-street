import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { DeviceService } from '../../server/src/modules/devices/device.service.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';

describe('Phase 15: Frontend — Packaging & Serving Portal Acceptance Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('TEST 1: Packaging Portal Routing & Content Negotiation', () => {
    it('should serve packaging.html with two-lane structure when Accept header includes text/html', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/packaging',
        headers: {
          accept: 'text/html,application/xhtml+xml',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Packaging & Serving');
      expect(res.body).toContain('id="packaging-ready-section"');
      expect(res.body).toContain('id="packaging-waiting-section"');
      expect(res.body).toContain('id="ready-count-pill"');
      expect(res.body).toContain('id="waiting-count-pill"');
      expect(res.body).toContain('id="delivered-count-pill"');
      expect(res.body).toContain('id="reconnect-banner"');
    });

    it('should return JSON status for non-browser / scaffolding requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/packaging',
        headers: {
          accept: 'application/json',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.portal).toBe('packaging');
      expect(json.status).toBe('ready');
    });
  });

  describe('TEST 2: Knuckle-Friendly Action Buttons (>= 68px)', () => {
    it('should enforce min-height >= 68px on the MARK DELIVERED action button', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      // Check .btn-mark-delivered has min-height >= 68px
      expect(css).toMatch(/\.btn-mark-delivered\s*\{[^}]*min-height:\s*(6[89]|7[0-9])px/i);
    });

    it('should define tactile slide-out animation styles for completed deliveries', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.packaging-card.slide-out');
      expect(css).toContain('translateX(115%)');
    });
  });

  describe('TEST 3: Two-Lane Visual Styling (Emerald Ready vs Saffron Waiting)', () => {
    it('should style Ready cards with thick emerald green border (#059669)', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.card-ready');
      expect(css).toContain('#059669');
    });

    it('should style Waiting cards with saffron border (#F59E0B)', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.card-waiting');
      expect(css).toContain('#F59E0B');
    });

    it('should include payment verification styles (PAID vs COLLECT CASH)', () => {
      const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      expect(css).toContain('.pay-paid');
      expect(css).toContain('.pay-collect');
    });
  });

  describe('TEST 4: Strict Financial Blindness & Role Isolation', () => {
    it('should NOT render rupee symbols, revenue totals, or item prices in packaging.html', () => {
      const htmlPath = path.resolve(process.cwd(), 'client/packaging.html');
      const html = fs.readFileSync(htmlPath, 'utf8');

      expect(html).not.toContain('₹');
      expect(html).not.toContain('Galla');
      expect(html).not.toContain('totalSales');
      expect(html).not.toContain('rupees');
    });

    it('should forbid packer role from accessing financial expense endpoints (403 Forbidden)', async () => {
      const vendorId = '00000000-0000-0000-0000-000000000001';
      const jwtSecret = 'frose-street-default-dev-secret-key-32chars';

      const packerToken = signJwt(
        {
          sub: vendorId,
          phone: '9876543213',
          role: 'packer',
          businessName: 'Tibetan Momo Point',
          edition: 'cloud',
        },
        jwtSecret,
      );

      // Attempt to access expenses API
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/galla/expenses',
        headers: {
          authorization: `Bearer ${packerToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('TEST 5: QR Device Pairing Auto-Authentication for Packer', () => {
    it('should generate pairing token for packer and redirect to /packaging', async () => {
      const vendorId = '00000000-0000-0000-0000-000000000001';
      const jwtSecret = 'frose-street-default-dev-secret-key-32chars';

      const genResult = await DeviceService.generatePairingToken(vendorId, 'packer', jwtSecret, 'Packer Phone');
      expect(genResult.pairingToken).toBeDefined();
      expect(genResult.role).toBe('packer');

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
              executeTakeFirstOrThrow: async () => ({ id: 'device-pack-1', ...val }),
            }),
          }),
        }),
      };

      const pairResult = await DeviceService.pairDevice(mockDb, genResult.pairingToken, jwtSecret, 'Packer Phone');
      expect(pairResult.device.role).toBe('packer');
      expect(pairResult.portalUrl).toBe('/packaging');
      expect(pairResult.token).toBeDefined();
    });
  });

  describe('TEST 6: State Transition from Ready to Served (Mark Delivered)', () => {
    it('should allow packer to transition ready order to served via OrderService', async () => {
      const vendorId = '00000000-0000-0000-0000-000000000001';

      const mockOrders: any[] = [
        {
          id: 'order-pack-201',
          vendor_id: vendorId,
          token_no: 24,
          total_paise: 18000n,
          order_status: 'ready', // Already marked ready by kitchen
          payment_method: 'upi',
          payment_status: 'completed',
          customer_name: 'Amit',
          notes: 'Dine-in plate',
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

      // 1. Fetch live orders -> should appear in packagingQueue
      const live = await OrderService.getLiveOrders(mockDb, vendorId);
      expect(live.packagingQueue.length).toBe(1);
      expect(live.packagingQueue[0].tokenNo).toBe(24);
      expect(live.packagingQueue[0].orderStatus).toBe('ready');

      // 2. Mark delivered (served)
      const updated = await OrderService.updateOrderStatus(mockDb, vendorId, 'order-pack-201', 'served', 'packer');
      expect(updated.newStatus).toBe('served');
      expect(updated.tokenNo).toBe(24);
    });
  });

  describe('TEST 7: PWA Service Worker Pre-Caching for Packaging', () => {
    it('should precache packaging.html and js/packaging.js with bumped cache version', () => {
      const swPath = path.resolve(process.cwd(), 'client/sw.js');
      const sw = fs.readFileSync(swPath, 'utf8');

      expect(sw).toContain("'/packaging.html'");
      expect(sw).toContain("'/js/packaging.js'");
      expect(sw).toContain("const CACHE_NAME = 'frose-street-' + BUILD_ID;");
    });
  });
});
