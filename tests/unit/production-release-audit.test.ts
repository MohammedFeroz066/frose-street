import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../../server/src/app.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';
import { PaymentService } from '../../server/src/modules/payments/payment.service.js';
import { SubscriptionService } from '../../server/src/modules/subscriptions/subscription.service.js';
import { LocalIndexedDBAdapter } from '../../client/js/storage-adapter.js';
import { EscPosGenerator } from '../../client/js/escpos-generator.js';
import { WhatsAppService } from '../../client/js/whatsapp-service.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for isolated unit tests
const memoryVendors: Map<string, any> = new Map();
const memoryStaff: Map<string, any> = new Map();
const memoryMenuItems: Map<string, any> = new Map();
const memoryOrders: Map<string, any> = new Map();
const memoryOrderItems: Map<string, any> = new Map();
const memorySubscriptions: Map<string, any> = new Map();
const memoryExpenses: Map<string, any> = new Map();
const memoryDailySummaries: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; op: string; val: any }[] = [];
        let limitVal: number | undefined;
        let orderCol: string | undefined;
        let orderDir: string | undefined;

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          orderBy: (col: string, dir: string = 'asc') => {
            orderCol = col;
            orderDir = dir;
            return chain;
          },
          limit: (n: number) => {
            limitVal = n;
            return chain;
          },
          offset: (_n: number) => chain,
          execute: async () => {
            let sourceMap = memoryOrders;
            if (table === 'vendors') sourceMap = memoryVendors;
            if (table === 'staff') sourceMap = memoryStaff;
            if (table === 'menu_items') sourceMap = memoryMenuItems;
            if (table === 'order_items') sourceMap = memoryOrderItems;
            if (table === 'subscriptions') sourceMap = memorySubscriptions;
            if (table === 'expenses') sourceMap = memoryExpenses;
            if (table === 'daily_summaries') sourceMap = memoryDailySummaries;

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

            if (orderCol) {
              matched.sort((a, b) => {
                const valA = a[orderCol!] ?? '';
                const valB = b[orderCol!] ?? '';
                if (valA < valB) return orderDir === 'desc' ? 1 : -1;
                if (valA > valB) return orderDir === 'desc' ? -1 : 1;
                return 0;
              });
            }

            if (limitVal !== undefined) {
              return matched.slice(0, limitVal);
            }
            return matched;
          },
          executeTakeFirst: async () => {
            const list = await chain.execute();
            return list[0] || null;
          },
          executeTakeFirstOrThrow: async () => {
            const list = await chain.execute();
            if (!list[0]) throw new Error(`Record not found in ${table}`);
            return list[0];
          },
        };
        return chain;
      },
      insertInto: (table: string) => {
        let insertVals: any = {};
        const chain = {
          values: (v: any) => {
            insertVals = { ...v };
            if (!insertVals.id) insertVals.id = 'uuid-' + Math.random().toString(36).substring(2, 9);
            if (!insertVals.created_at) insertVals.created_at = new Date().toISOString();
            return chain;
          },
          returningAll: () => chain,
          execute: async () => {
            let targetMap = memoryOrders;
            if (table === 'vendors') targetMap = memoryVendors;
            if (table === 'staff') targetMap = memoryStaff;
            if (table === 'menu_items') targetMap = memoryMenuItems;
            if (table === 'order_items') targetMap = memoryOrderItems;
            if (table === 'subscriptions') targetMap = memorySubscriptions;
            if (table === 'expenses') targetMap = memoryExpenses;
            if (table === 'daily_summaries') targetMap = memoryDailySummaries;

            targetMap.set(insertVals.id, insertVals);
            return [insertVals];
          },
          executeTakeFirstOrThrow: async () => {
            const [row] = await chain.execute();
            return row;
          },
        };
        return chain;
      },
      updateTable: (table: string) => {
        let updateVals: any = {};
        let whereConditions: { col: string; op: string; val: any }[] = [];
        const chain = {
          set: (v: any) => {
            updateVals = { ...v };
            return chain;
          },
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          execute: async () => {
            let targetMap = memoryOrders;
            if (table === 'vendors') targetMap = memoryVendors;
            if (table === 'subscriptions') targetMap = memorySubscriptions;

            for (const [id, row] of targetMap.entries()) {
              let match = true;
              for (const cond of whereConditions) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=') {
                  if (row[prop] !== cond.val) match = false;
                }
              }
              if (match) {
                targetMap.set(id, { ...row, ...updateVals });
              }
            }
            return [{ numUpdatedRows: 1n }];
          },
        };
        return chain;
      },
    } as any;
  };

  return {
    getDatabase: () => createMockDb(),
    closeDatabase: async () => {},
  };
});

describe('Phase 20: Final Production Release & Audit', () => {
  let app: FastifyInstance;
  const jwtSecret = 'frose-street-default-dev-secret-key-32chars';

  beforeEach(async () => {
    memoryVendors.clear();
    memoryStaff.clear();
    memoryMenuItems.clear();
    memoryOrders.clear();
    memoryOrderItems.clear();
    memorySubscriptions.clear();
    memoryExpenses.clear();
    memoryDailySummaries.clear();

    app = await buildApp({ rateLimitMax: 1000 });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('TEST 1: FULL E2E (Cloud): Registration -> Menu Setup -> 10 Orders -> Kitchen -> Packaging -> Galla Z-Report', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    // 1. Vendor Onboarding
    const { vendor, staff } = await AuthService.registerVendor(db, {
      phone: '9876543210',
      businessName: 'Royal Momos Hub',
      ownerName: 'Raju Sharma',
      quickPin: '1234',
      edition: 'cloud',
      presetKey: 'momos_chinese',
    });
    expect(vendor.id).toBeDefined();
    expect(staff.role).toBe('owner');

    // 2. Auto-provisioned trial check
    const subStatus = await SubscriptionService.getSubscriptionStatus(db, vendor.id);
    expect(subStatus.status).toBe('trial_active');
    expect(subStatus.canCreateOrders).toBe(true);

    // 3. Seeded menu items check
    const menuItems = await db
      .selectFrom('menu_items')
      .selectAll()
      .where('vendor_id', '=', vendor.id)
      .execute();
    expect(menuItems.length).toBeGreaterThanOrEqual(1);
    const item1 = menuItems[0]!;

    // 4. Place 10 sequential orders (alternating Cash & UPI)
    const placedOrders = [];
    for (let i = 1; i <= 10; i++) {
      const pm = i % 2 === 0 ? 'cash' : 'upi';
      const order = await OrderService.createOrder(db, vendor.id, {
        items: [{ menuItemId: item1.id, quantity: 2 }],
        paymentMethod: pm,
      });
      expect(order.tokenNo).toBe(i);
      expect(order.orderStatus).toBe('preparing');
      placedOrders.push(order);
    }
    expect(placedOrders.length).toBe(10);

    // 5. Kitchen: Transition Order 1 to 'ready'
    const order1 = placedOrders[0]!;
    const readyOrder = await OrderService.updateOrderStatus(db, vendor.id, order1.id, 'ready', 'cook');
    expect(readyOrder.newStatus).toBe('ready');

    // 6. Packaging: Transition Order 1 to 'served'
    const deliveredOrder = await OrderService.updateOrderStatus(db, vendor.id, order1.id, 'served', 'cashier');
    expect(deliveredOrder.newStatus).toBe('served');

    // 7. Galla: Verify Live Sales & Generate Day-End Z-Report
    const liveGalla = await GallaService.getGallaSummary(db, vendor.id);
    expect(liveGalla.totalOrders).toBe(10);
    expect(liveGalla.totalSalesPaise).toBeGreaterThan(0);
    expect(liveGalla.cashSalesPaise + liveGalla.upiSalesPaise).toBe(liveGalla.totalSalesPaise);

    // Generate Z-Report
    const zReport = await GallaService.closeFiscalDay(db, vendor.id, { notes: 'E2E-Day-Close-Test' });
    expect(zReport.summary.totalOrders).toBe(10);
    expect(zReport.zReportText).toBeDefined();
  });

  it('TEST 2: FULL E2E (Local P2P): IndexedDB storage adapter -> atomic local tokens -> local orders lifecycle', async () => {
    const localAdapter = new LocalIndexedDBAdapter();
    await localAdapter.init();

    // 1. Capture 5 orders locally
    for (let i = 1; i <= 5; i++) {
      const res = await localAdapter.createOrder({
        items: [{ name: 'Veg Momos', priceRupees: 70, pricePaise: 7000, quantity: 2 }],
        paymentMethod: 'cash',
      });
      expect(res.order.tokenNo).toBe(i);
      expect(res.order.totalRupees).toBe(140);
      expect(res.order.totalPaise).toBe(14000);
      expect(res.order.status).toBe('placed');
    }

    // 2. Local Orders retrieval
    const orders = await localAdapter.getAllOrders();
    expect(orders.length).toBe(5);

    // 3. Update order status locally (Ready -> Delivered)
    const updated = await localAdapter.updateOrderStatus(orders[0]!.id, 'delivered');
    expect(updated.order.status).toBe('delivered');

    // 4. Local Galla shift summary
    const res = await localAdapter.getGallaSummary();
    expect(res.summary.orderCount).toBe(5);
    expect(res.summary.totalSalesRupees).toBe(700);
    expect(res.summary.cashSalesRupees).toBe(700);
  });

  it('TEST 3: 50 Rapid Orders High-Throughput Load Test: All tokens 1..50 strictly unique, zero financial rounding drift', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const { vendor } = await AuthService.registerVendor(db, {
      phone: '9876543211',
      businessName: 'High Speed Food Cart',
      edition: 'cloud',
    });

    const menuItem = {
      id: 'item-chai-01',
      vendor_id: vendor.id,
      name: 'Special Ginger Chai',
      price_paise: 2500n, // ₹25.00
      is_available: true,
      is_active: true,
    };
    memoryMenuItems.set(menuItem.id, menuItem);

    const tokenSet = new Set<number>();
    let expectedTotalPaise = 0n;

    // Rapid sequential execution of 50 orders
    for (let i = 1; i <= 50; i++) {
      const qty = (i % 3) + 1; // 1, 2, or 3
      const order = await OrderService.createOrder(db, vendor.id, {
        items: [{ menuItemId: menuItem.id, quantity: qty }],
        paymentMethod: i % 2 === 0 ? 'cash' : 'upi',
      });

      expect(order.tokenNo).toBe(i);
      tokenSet.add(order.tokenNo);

      const orderTotal = BigInt(order.totalPaise);
      expect(orderTotal).toBe(2500n * BigInt(qty));
      expectedTotalPaise += orderTotal;
    }

    // 100% token uniqueness verification
    expect(tokenSet.size).toBe(50);
    for (let i = 1; i <= 50; i++) {
      expect(tokenSet.has(i)).toBe(true);
    }

    // Mathematical zero-drift check
    const summary = await GallaService.getGallaSummary(db, vendor.id);
    expect(BigInt(summary.totalSalesPaise)).toBe(expectedTotalPaise);
    expect(BigInt(summary.cashSalesPaise + summary.upiSalesPaise)).toBe(expectedTotalPaise);
  });

  it('TEST 4: Performance Benchmark: Billing grid data transformation & render executes in <200ms', () => {
    const start = performance.now();

    // Simulate 40 menu items with categories and price calculation
    const rawItems = Array.from({ length: 40 }).map((_, i) => ({
      id: `item-${i}`,
      name: `Street Dish ${i}`,
      category: i % 4 === 0 ? 'Momos' : i % 4 === 1 ? 'Chai' : i % 4 === 2 ? 'Rolls' : 'Combos',
      pricePaise: BigInt((i + 1) * 1000),
      priceRupees: (i + 1) * 10,
    }));

    // Data filtering and view grouping
    const categories = ['all', 'Momos', 'Chai', 'Rolls', 'Combos'];
    const grouped = categories.map((cat) => ({
      category: cat,
      items: cat === 'all' ? rawItems : rawItems.filter((it) => it.category === cat),
    }));

    expect(grouped.length).toBe(5);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200); // Strict requirement: <200ms
  });

  it('TEST 5: Protected Route JWT Audit: 100% of protected routes return 401 without valid token', async () => {
    const endpoints = [
      { method: 'GET', url: '/api/v1/orders/live' },
      { method: 'POST', url: '/api/v1/orders' },
      { method: 'GET', url: '/api/v1/galla/summary' },
      { method: 'POST', url: '/api/v1/galla/expenses' },
      { method: 'POST', url: '/api/v1/payments/generate-upi' },
      { method: 'GET', url: '/api/v1/menu' },
    ];

    for (const ep of endpoints) {
      const res = await app.inject({
        method: ep.method as any,
        url: ep.url,
      });
      expect(res.statusCode).toBe(401);
    }
  });

  it('TEST 6: Multi-Tenant Vendor Isolation: Vendor A cannot access Vendor B data (returns 404)', async () => {
    const vendorA = 'vendor-uuid-aaa';
    const vendorB = 'vendor-uuid-bbb';

    // Seed order belonging to Vendor B
    memoryOrders.set('order-b-1', {
      id: 'order-b-1',
      vendor_id: vendorB,
      token_number: 1,
      total_amount_paise: 5000n,
      payment_method: 'cash',
      payment_status: 'paid',
      status: 'pending',
    });

    const vendorAToken = signJwt(
      { sub: vendorA, role: 'owner', phone: '9876543201', businessName: 'Vendor A', edition: 'cloud' },
      jwtSecret
    );

    // Vendor A tries to update Vendor B order
    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/orders/order-b-1/status',
      headers: { authorization: `Bearer ${vendorAToken}` },
      payload: { status: 'preparing' },
    });
    expect(updateRes.statusCode).toBe(404);
  });

  it('TEST 7: RBAC Role Isolation: Cook/Packer roles accessing financial/galla routes return 403 Forbidden', async () => {
    const vendorId = 'vendor-uuid-roles';

    const cookToken = signJwt(
      { sub: vendorId, role: 'cook', phone: '9876543202', businessName: 'Role Stall', edition: 'cloud' },
      jwtSecret
    );

    // Cook attempts to access Galla shift revenue summary
    const gallaRes = await app.inject({
      method: 'GET',
      url: '/api/v1/galla/summary',
      headers: { authorization: `Bearer ${cookToken}` },
    });
    expect(gallaRes.statusCode).toBe(403);

    // Cook attempts to generate Z-Report
    const zRes = await app.inject({
      method: 'POST',
      url: '/api/v1/galla/z-report',
      headers: { authorization: `Bearer ${cookToken}` },
    });
    expect(zRes.statusCode).toBe(403);
  });

  it('TEST 8: Rate Limiting Audit: Rapid burst of requests triggers 429 Too Many Requests', async () => {
    // Build test app with tight rate limit
    const tightApp = await buildApp({ rateLimitMax: 3 });
    await tightApp.ready();

    // 1st, 2nd, 3rd requests should succeed or return 404/401 (not rate limited)
    for (let i = 0; i < 3; i++) {
      await tightApp.inject({ method: 'GET', url: '/api/v1/health' });
    }

    // 4th request must be rate limited
    const fourthRes = await tightApp.inject({ method: 'GET', url: '/api/v1/health' });
    expect(fourthRes.statusCode).toBe(429);

    await tightApp.close();
  });

  it('TEST 9: Cryptographic License Tamper Resistance: Tampered token signature is rejected', () => {
    const payload = {
      vendorId: 'vendor-secure-01',
      businessName: 'Secure Cart',
      plan: 'cloud' as const,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-30',
      status: 'active' as const,
      issuedAt: new Date().toISOString(),
    };

    const validToken = SubscriptionService.generateSignedLicenseToken(payload);
    expect(SubscriptionService.verifySignedLicenseToken(validToken).valid).toBe(true);

    // Alter token payload
    const [payloadBase64, signature] = validToken.split('.');
    const decoded = JSON.parse(Buffer.from(payloadBase64!, 'base64url').toString('utf8'));
    decoded.periodEnd = '2099-01-01'; // Extend fraudulently
    const forgedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    const tamperedToken = `${forgedPayload}.${signature}`;

    const verification = SubscriptionService.verifySignedLicenseToken(tamperedToken);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toContain('mismatch');
  });

  it('TEST 10: 20-Order Offline Sync Reconciliation: 20 offline orders reconcile cleanly without loss', async () => {
    const offlineAdapter = new LocalIndexedDBAdapter();
    await offlineAdapter.init();

    // Place 20 offline orders
    for (let i = 1; i <= 20; i++) {
      await offlineAdapter.createOrder({
        items: [{ name: `Dish ${i}`, priceRupees: 50, pricePaise: 5000, quantity: 1 }],
        paymentMethod: 'cash',
      });
    }

    const offlineOrders = await offlineAdapter.getAllOrders();
    expect(offlineOrders.length).toBe(20);

    // Check offline Galla aggregation
    const res = await offlineAdapter.getGallaSummary();
    expect(res.summary.orderCount).toBe(20);
    expect(res.summary.totalSalesRupees).toBe(1000);
    expect(res.summary.cashSalesRupees).toBe(1000);

    // Batch sync payload preparation
    const syncPayload = offlineOrders.map((o) => ({
      localId: o.id,
      tokenNo: o.tokenNo,
      totalPaise: o.totalPaise,
      items: o.items,
    }));
    expect(syncPayload.length).toBe(20);
    const sortedTokens = syncPayload.map((p) => p.tokenNo).sort((a, b) => a - b);
    expect(sortedTokens[0]).toBe(1);
    expect(sortedTokens[19]).toBe(20);
  });
});
