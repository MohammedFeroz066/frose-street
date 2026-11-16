import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for testing
const memoryVendors: Map<string, any> = new Map();
const memoryMenuItems: Map<string, any> = new Map();
const memoryOrders: Map<string, any> = new Map();
const memoryOrderItems: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; op: string; val: any }[] = [];
        let limitVal: number | undefined;
        let offsetVal: number | undefined;

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          orderBy: (_col: string, _dir?: string) => chain,
          limit: (n: number) => {
            limitVal = n;
            return chain;
          },
          offset: (n: number) => {
            offsetVal = n;
            return chain;
          },
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
                  if (!cond.val.includes(row[prop])) match = false;
                }
              }
              if (match) matched.push({ ...row });
            }

            let result = matched;
            if (offsetVal) result = result.slice(offsetVal);
            if (limitVal) result = result.slice(0, limitVal);
            return result;
          },
          executeTakeFirst: async () => {
            const list = await chain.execute();
            return list.length > 0 ? list[0] : undefined;
          },
          executeTakeFirstOrThrow: async () => {
            const list = await chain.execute();
            if (list.length === 0) throw new Error('Not found');
            return list[0];
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
                  where: (col2: string, _op2: string, val2: any) => {
                    return {
                      execute: async () => {
                        let sourceMap = memoryOrders;
                        if (table === 'vendors') sourceMap = memoryVendors;
                        if (table === 'menu_items') sourceMap = memoryMenuItems;

                        for (const [id, row] of sourceMap.entries()) {
                          if ((row[col1] === val1 || id === val1) && (row[col2] === val2 || id === val2)) {
                            sourceMap.set(id, { ...row, ...updates });
                          }
                        }
                      },
                    };
                  },
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

describe('Phase 8 Acceptance: Order & Atomic Token Engine', () => {
  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
  let app: FastifyInstance;
  const mockVendorId = 'vendor-stall-phase-8';
  let cashierToken = '';
  let cookToken = '';
  let packerToken = '';

  const menuItemMomoId = 'item-momo-001';
  const menuItemChaiId = 'item-chai-002';
  const menuItemOutOfStockId = 'item-oos-003';

  beforeAll(async () => {
    cashierToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Feroz Famous Biryani & Momos',
        role: 'cashier',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    cookToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Feroz Famous Biryani & Momos',
        role: 'cook',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    packerToken = signJwt(
      {
        sub: mockVendorId,
        phone: '9876543210',
        businessName: 'Feroz Famous Biryani & Momos',
        role: 'packer',
        edition: 'cloud',
      },
      JWT_SECRET,
    );

    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    memoryOrders.clear();
    memoryOrderItems.clear();
    memoryVendors.clear();
    memoryMenuItems.clear();

    const todayDate = new Date().toISOString().split('T')[0];

    // Seed vendor with token counter
    memoryVendors.set(mockVendorId, {
      id: mockVendorId,
      phone: '9876543210',
      business_name: 'Feroz Famous Biryani & Momos',
      daily_token_counter: 0,
      token_reset_date: todayDate,
    });

    // Seed available and out-of-stock items
    memoryMenuItems.set(menuItemMomoId, {
      id: menuItemMomoId,
      vendor_id: mockVendorId,
      name: 'Chicken Steamed Momos',
      price_paise: BigInt(8000), // ₹80
      is_available: true,
      is_active: true,
    });

    memoryMenuItems.set(menuItemChaiId, {
      id: menuItemChaiId,
      vendor_id: mockVendorId,
      name: 'Special Irani Chai',
      price_paise: BigInt(1500), // ₹15
      is_available: true,
      is_active: true,
    });

    memoryMenuItems.set(menuItemOutOfStockId, {
      id: menuItemOutOfStockId,
      vendor_id: mockVendorId,
      name: 'Sold Out Kebab',
      price_paise: BigInt(12000),
      is_available: false, // Out of stock
      is_active: true,
    });
  });

  describe('TEST 1: Atomic Daily Token Numbering & Midnight Rollover', () => {
    it('1st order of day gets Token #1, followed sequentially by #2 and #3', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const order1 = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
        paymentMethod: 'cash',
      });
      expect(order1.tokenNo).toBe(1);
      expect(order1.tokenDisplay).toBe('#1');

      const order2 = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemChaiId, quantity: 2 }],
        paymentMethod: 'upi',
      });
      expect(order2.tokenNo).toBe(2);
      expect(order2.tokenDisplay).toBe('#2');

      const order3 = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
        paymentMethod: 'cash',
      });
      expect(order3.tokenNo).toBe(3);
    });

    it('midnight date rollover: resets counter to 1 when token_reset_date is from yesterday', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      // Simulate vendor with yesterday's date and 150 orders punched
      memoryVendors.set(mockVendorId, {
        ...memoryVendors.get(mockVendorId),
        daily_token_counter: 150,
        token_reset_date: '2026-11-15', // Yesterday
      });

      // New order today must rollover and reset token counter to 1
      const order = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemChaiId, quantity: 1 }],
        paymentMethod: 'cash',
      });

      expect(order.tokenNo).toBe(1);
      expect(order.tokenDisplay).toBe('#1');
      const updatedVendor = memoryVendors.get(mockVendorId);
      expect(updatedVendor.token_reset_date).toBe(new Date().toISOString().split('T')[0]);
    });
  });

  describe('TEST 2: Strict Integer Paise Cart Calculations', () => {
    it('calculates line item totals and total sum with exact integer paise', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      // 2 * Momos (₹80 / 8000 paise) = 16000 paise
      // 3 * Chai (₹15 / 1500 paise) = 4500 paise
      // Expected total: 20500 paise (₹205.00)
      const order = await OrderService.createOrder(db, mockVendorId, {
        items: [
          { menuItemId: menuItemMomoId, quantity: 2 },
          { menuItemId: menuItemChaiId, quantity: 3 },
        ],
        paymentMethod: 'cash',
      });

      expect(order.totalPaise).toBe(20500);
      expect(order.totalRupees).toBe(205);
      expect(order.items.length).toBe(2);

      const momoLine = order.items.find((i) => i.menuItemId === menuItemMomoId);
      expect(momoLine.quantity).toBe(2);
      expect(momoLine.unitPricePaise).toBe(8000);
      expect(momoLine.lineTotalPaise).toBe(16000);

      const chaiLine = order.items.find((i) => i.menuItemId === menuItemChaiId);
      expect(chaiLine.quantity).toBe(3);
      expect(chaiLine.unitPricePaise).toBe(1500);
      expect(chaiLine.lineTotalPaise).toBe(4500);
    });

    it('rejects empty order items array with 400', async () => {
      const mockDb: any = {};
      await expect(
        OrderService.createOrder(mockDb, mockVendorId, {
          items: [],
          paymentMethod: 'cash',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'EMPTY_ORDER',
      });
    });

    it('rejects non-positive quantity with 400 INVALID_QUANTITY', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      await expect(
        OrderService.createOrder(db, mockVendorId, {
          items: [{ menuItemId: menuItemMomoId, quantity: 0 }],
          paymentMethod: 'cash',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_QUANTITY',
      });
    });
  });

  describe('TEST 3: Availability & Out-of-Stock Validation', () => {
    it('rejects order with item marked out of stock with 400 ITEM_OUT_OF_STOCK', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      await expect(
        OrderService.createOrder(db, mockVendorId, {
          items: [{ menuItemId: menuItemOutOfStockId, quantity: 1 }],
          paymentMethod: 'cash',
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'ITEM_OUT_OF_STOCK',
      });
    });
  });

  describe('TEST 4: Order Lifecycle State Machine & Role Enforcing', () => {
    it('order transitions from preparing -> ready -> served', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const order = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
        paymentMethod: 'cash',
      });
      expect(order.orderStatus).toBe('preparing');

      // Cook marks ready
      const readyRes = await OrderService.updateOrderStatus(db, mockVendorId, order.id, 'ready', 'cook');
      expect(readyRes.newStatus).toBe('ready');

      // Packer marks served
      const servedRes = await OrderService.updateOrderStatus(db, mockVendorId, order.id, 'served', 'packer');
      expect(servedRes.newStatus).toBe('served');
    });

    it('rejects invalid jump from preparing to served directly', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const order = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
        paymentMethod: 'cash',
      });

      await expect(
        OrderService.updateOrderStatus(db, mockVendorId, order.id, 'served', 'packer'),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_STATUS_TRANSITION',
      });
    });

    it('cook or packer is forbidden from cancelling an order', async () => {
      const { getDatabase } = await import('../../server/src/db/database.js');
      const db = getDatabase();

      const order = await OrderService.createOrder(db, mockVendorId, {
        items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
        paymentMethod: 'cash',
      });

      await expect(
        OrderService.updateOrderStatus(db, mockVendorId, order.id, 'cancelled', 'cook'),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'CANCEL_FORBIDDEN',
      });
    });
  });

  describe('TEST 5: End-to-End Order API Routes via app.inject()', () => {
    it('POST /api/v1/orders: Cashier creates order and receives Token #1', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
        payload: {
          items: [
            { menuItemId: menuItemMomoId, quantity: 2, notes: 'Extra spicy chutney' },
            { menuItemId: menuItemChaiId, quantity: 1 },
          ],
          paymentMethod: 'cash',
          customerName: 'Rahul Verma',
          notes: 'Dine-in plate',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.order.tokenNo).toBe(1);
      expect(json.order.totalPaise).toBe(17500); // 16000 + 1500
      expect(json.order.totalRupees).toBe(175);
      expect(json.order.customerName).toBe('Rahul Verma');
      expect(json.order.orderStatus).toBe('preparing');
    });

    it('GET /api/v1/orders/live: Returns active queues for kitchen display', async () => {
      // Create order first
      await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/live',
        headers: {
          authorization: `Bearer ${cookToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.kitchenQueue.length).toBe(1);
      expect(json.packagingQueue.length).toBe(0);
      expect(json.kitchenQueue[0].tokenNo).toBe(1);
    });

    it('PATCH /api/v1/orders/:id/status: Cook advances order to ready', async () => {
      const punchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });
      const orderId = JSON.parse(punchRes.body).order.id;

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${orderId}/status`,
        headers: {
          authorization: `Bearer ${cookToken}`,
        },
        payload: {
          status: 'ready',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.newStatus).toBe('ready');
    });

    it('GET /api/v1/orders/live: Order now moved to packaging queue', async () => {
      const punchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });
      const orderId = JSON.parse(punchRes.body).order.id;

      // Mark ready
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${cookToken}` },
        payload: { status: 'ready' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/live',
        headers: {
          authorization: `Bearer ${packerToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.kitchenQueue.length).toBe(0);
      expect(json.packagingQueue.length).toBe(1);
      expect(json.packagingQueue[0].tokenNo).toBe(1);
    });

    it('PATCH /api/v1/orders/:id/status: Packer hands plate and marks served', async () => {
      const punchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });
      const orderId = JSON.parse(punchRes.body).order.id;

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${orderId}/status`,
        headers: { authorization: `Bearer ${cookToken}` },
        payload: { status: 'ready' },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${orderId}/status`,
        headers: {
          authorization: `Bearer ${packerToken}`,
        },
        payload: {
          status: 'served',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.newStatus).toBe('served');
    });

    it('GET /api/v1/orders/:id: Retrieves order details', async () => {
      const punchRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });
      const orderId = JSON.parse(punchRes.body).order.id;

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/orders/${orderId}`,
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.order.id).toBe(orderId);
      expect(json.order.tokenNo).toBe(1);
    });

    it('GET /api/v1/orders/history: Retrieves historical order list', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/history',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('success');
      expect(json.count).toBe(1);
      expect(json.orders[0].tokenNo).toBe(1);
    });

    it('POST /api/v1/orders: Rejects unauthenticated order call with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        payload: {
          items: [{ menuItemId: menuItemMomoId, quantity: 1 }],
          paymentMethod: 'cash',
        },
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.code).toBe('AUTH_REQUIRED');
    });
  });
});
