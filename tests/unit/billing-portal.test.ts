import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../../server/src/app.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';

// In-memory data store for testing
const memoryVendors: Map<string, any> = new Map();
const memoryOrders: Map<string, any> = new Map();
const memoryOrderItems: Map<string, any> = new Map();
const memoryMenuItems: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; op: string; val: any }[] = [];

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          orderBy: () => chain,
          execute: async () => {
            let sourceMap = memoryOrders;
            if (table === 'vendors') sourceMap = memoryVendors;
            if (table === 'menu_items') sourceMap = memoryMenuItems;
            if (table === 'order_items') sourceMap = memoryOrderItems;

            const matched: any[] = [];
            for (const row of sourceMap.values()) {
              let match = true;
              for (const cond of whereConditions) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=') {
                  if (row[prop] !== cond.val) match = false;
                } else if (cond.op === 'in') {
                  if (!Array.isArray(cond.val) || !cond.val.includes(row[prop])) match = false;
                }
              }
              if (match) matched.push({ ...row });
            }
            return matched;
          },
          executeTakeFirst: async () => {
            const list = await chain.execute();
            return list.length > 0 ? list[0] : undefined;
          },
        };
        return chain;
      },
      insertInto: (table: string) => {
        return {
          values: (vals: any) => {
            return {
              returningAll: () => ({
                executeTakeFirstOrThrow: async () => {
                  const id = vals.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                  const record = { ...vals, id, created_at: new Date(), updated_at: new Date() };

                  if (table === 'orders') memoryOrders.set(id, record);
                  if (table === 'order_items') memoryOrderItems.set(id, record);
                  if (table === 'vendors') memoryVendors.set(id, record);
                  if (table === 'menu_items') memoryMenuItems.set(id, record);

                  return record;
                },
              }),
              execute: async () => {
                const id = vals.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                const record = { ...vals, id, created_at: new Date(), updated_at: new Date() };

                if (table === 'order_items') memoryOrderItems.set(id, record);
                if (table === 'menu_items') memoryMenuItems.set(id, record);

                return { insertId: id };
              },
            };
          },
        };
      },
      updateTable: (table: string) => {
        return {
          set: (updates: any) => {
            return {
              where: (col1: string, _op1: string, val1: any) => {
                return {
                  execute: async () => {
                    let sourceMap = memoryOrders;
                    if (table === 'vendors') sourceMap = memoryVendors;
                    if (table === 'menu_items') sourceMap = memoryMenuItems;

                    for (const [id, row] of sourceMap.entries()) {
                      if (row[col1] === val1 || id === val1) {
                        sourceMap.set(id, { ...row, ...updates });
                      }
                    }
                  },
                };
              },
            };
          },
        };
      },
    };
  };

  return {
    getDatabase: vi.fn(() => createMockDb()),
    closeDatabase: vi.fn(async () => {}),
  };
});

describe('Phase 13 Acceptance: Billing Portal (Core Ordering Screen & Dynamic UPI QR)', () => {
  const billingHtmlPath = path.resolve(process.cwd(), 'client/billing.html');
  const cssPath = path.resolve(process.cwd(), 'client/css/style.css');
  let app: FastifyInstance;
  let testVendorToken: string;
  const vendorId = 'v-billing-test-001';

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    // Seed test vendor in mock memory
    memoryVendors.set(vendorId, {
      id: vendorId,
      phone: '9876543210',
      business_name: 'Royal Momos Counter',
      daily_token_counter: 0,
      token_reset_date: new Date().toISOString().split('T')[0],
      subscription_status: 'active',
      edition: 'cloud',
    });

    // Seed 2 test menu items
    memoryMenuItems.set('item-1', {
      id: 'item-1',
      vendor_id: vendorId,
      name: 'Veg Steamed Momos',
      price_paise: BigInt(6000),
      category: 'Momos',
      emoji_icon: '🥟',
      color_hex: '#10b981',
      display_order: 1,
      is_available: true,
      is_active: true,
    });

    memoryMenuItems.set('item-2', {
      id: 'item-2',
      vendor_id: vendorId,
      name: 'Special Masala Chai',
      price_paise: BigInt(1500),
      category: 'Tea',
      emoji_icon: '☕',
      color_hex: '#d97706',
      display_order: 2,
      is_available: true,
      is_active: true,
    });

    testVendorToken = signJwt(
      {
        sub: vendorId,
        phone: '9876543210',
        businessName: 'Royal Momos Counter',
        role: 'owner',
        edition: 'cloud',
      },
      'frose-street-default-dev-secret-key-32chars',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TEST 1: Billing Page HTML & UI Structure', () => {
    it('billing.html must exist in client directory', () => {
      expect(fs.existsSync(billingHtmlPath)).toBe(true);
    });

    it('billing.html contains menu grid, cart summary, running total and token display', () => {
      const html = fs.readFileSync(billingHtmlPath, 'utf8');
      expect(html).toContain('id="billing-menu-grid"');
      expect(html).toContain('id="cart-summary-list"');
      expect(html).toContain('id="cart-total-rupees"');
      expect(html).toContain('id="next-token-pill"');
    });

    it('billing.html contains CASH, UPI, and CLEAR cart action buttons', () => {
      const html = fs.readFileSync(billingHtmlPath, 'utf8');
      expect(html).toContain('id="btn-pay-cash"');
      expect(html).toContain('id="btn-pay-upi"');
      expect(html).toContain('id="btn-clear-cart"');
    });

    it('billing.html contains full-screen Token Flash modal and Dynamic UPI QR modal', () => {
      const html = fs.readFileSync(billingHtmlPath, 'utf8');
      expect(html).toContain('id="token-flash-modal"');
      expect(html).toContain('id="upi-qr-modal"');
      expect(html).toContain('id="flash-token-number"');
      expect(html).toContain('id="upi-qr-amount"');
    });

    it('billing.html links formal design stylesheet', () => {
      const html = fs.readFileSync(billingHtmlPath, 'utf8');
      expect(html).toContain('stylesheet');
      expect(html).toContain('/css/style.css');
    });
  });

  describe('TEST 2: Touch Targets & 60px Tap Target Constraint', () => {
    it('CSS specifies minimum tap target height >= 60px for billing buttons', () => {
      const css = fs.readFileSync(cssPath, 'utf8');
      expect(css).toMatch(/min-height:\s*(6[0-9]|7[0-9]|8[0-9]|9[0-9])px/);
    });
  });

  describe('TEST 3: Fastify Routing & Service Integration', () => {
    it('GET /billing returns billing HTML page with 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/billing',
        headers: {
          accept: 'text/html',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('id="billing-menu-grid"');
    });
  });

  describe('TEST 4: Backend Order Dispatch with Atomic Token & Integer Paise Math', () => {
    it('POST /api/v1/orders punches order with CASH, assigns token #1, and calculates integer paise', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${testVendorToken}`,
        },
        payload: {
          items: [
            { menuItemId: 'item-1', quantity: 2 }, // 2 x 6000 = 12000 paise
            { menuItemId: 'item-2', quantity: 1 }, // 1 x 1500 = 1500 paise -> Total: 13500 paise = ₹135
          ],
          paymentMethod: 'cash',
          paymentStatus: 'paid',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.status).toBe('success');
      expect(data.order).toBeDefined();
      expect(data.order.tokenNo).toBe(1);
      expect(Number(data.order.totalPaise)).toBe(13500);
      expect(Number(data.order.totalRupees)).toBe(135);
      expect(data.order.paymentMethod).toBe('cash');
    });

    it('POST /api/v1/orders punches second order with UPI, increments token to #2', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${testVendorToken}`,
        },
        payload: {
          items: [
            { menuItemId: 'item-1', quantity: 1 }, // 1 x 6000 = 6000 paise = ₹60
          ],
          paymentMethod: 'upi',
          paymentStatus: 'pending',
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.order.tokenNo).toBe(2);
      expect(Number(data.order.totalPaise)).toBe(6000);
      expect(Number(data.order.totalRupees)).toBe(60);
      expect(data.order.paymentMethod).toBe('upi');
    });
  });
});
