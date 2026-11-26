import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { SubscriptionService } from '../../server/src/modules/subscriptions/subscription.service.js';

const memoryVendors = new Map<string, any>();
const memoryMenuItems = new Map<string, any>();
const memoryOrders = new Map<string, any>();
const memoryOrderItems = new Map<string, any>();

vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => ({
    selectFrom: (table: string) => {
      const whereConditions: { col: string; op: string; val: any }[] = [];
      let limitVal: number | undefined;
      const chain: any = {
        select: () => chain,
        selectAll: () => chain,
        where: (col: string, op: string, val: any) => {
          whereConditions.push({ col, op, val });
          return chain;
        },
        orderBy: () => chain,
        limit: (n: number) => {
          limitVal = n;
          return chain;
        },
        execute: async () => {
          const map =
            table === 'vendors'
              ? memoryVendors
              : table === 'menu_items'
                ? memoryMenuItems
                : table === 'order_items'
                  ? memoryOrderItems
                  : memoryOrders;
          const out: any[] = [];
          for (const row of map.values()) {
            let match = true;
            for (const c of whereConditions) {
              const prop = c.col.replace(`${table}.`, '');
              if (c.op === '=' && row[prop] !== c.val) match = false;
              if (c.op === 'in' && (!Array.isArray(c.val) || !c.val.includes(row[prop]))) match = false;
            }
            if (match) out.push({ ...row });
          }
          return limitVal !== undefined ? out.slice(0, limitVal) : out;
        },
        executeTakeFirst: async () => {
          const rows = await chain.execute();
          return rows[0];
        },
      };
      return chain;
    },
    insertInto: (table: string) => ({
      values: (vals: any) => ({
        returningAll: () => ({
          executeTakeFirstOrThrow: async () => {
            const id = vals.id || crypto.randomUUID();
            const record = { ...vals, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            const map =
              table === 'vendors'
                ? memoryVendors
                : table === 'menu_items'
                  ? memoryMenuItems
                  : table === 'order_items'
                    ? memoryOrderItems
                    : memoryOrders;
            map.set(id, record);
            return record;
          },
        }),
      }),
    }),
    updateTable: (table: string) => ({
      set: (updates: any) => ({
        where: (col: string, _op: string, val: any) => ({
          execute: async () => {
            const map = table === 'vendors' ? memoryVendors : memoryOrders;
            for (const [k, row] of map.entries()) {
              if (row[col] === val || k === val) {
                map.set(k, { ...row, ...updates });
              }
            }
          },
        }),
      }),
    }),
  });

  return {
    getDatabase: vi.fn(() => createMockDb()),
    closeDatabase: vi.fn(async () => {}),
  };
});

describe('OFF-02: Idempotent Order Creation & Client SyncEngine', () => {
  const JWT_SECRET = 'frose-street-default-dev-secret-key-32chars';
  const vendorA = '11111111-1111-4111-8111-111111111111';
  const vendorB = '22222222-2222-4222-8222-222222222222';
  const dishA = 'aaaaaaaa-1111-4111-8111-111111111111';
  const dishB = 'bbbbbbbb-2222-4222-8222-222222222222';
  let app: FastifyInstance;
  let tokenA = '';
  let tokenB = '';

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();

    tokenA = signJwt({ sub: vendorA, phone: '9876543210', businessName: 'Stall A', role: 'owner', edition: 'cloud' }, JWT_SECRET);
    tokenB = signJwt({ sub: vendorB, phone: '9876543211', businessName: 'Stall B', role: 'owner', edition: 'cloud' }, JWT_SECRET);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    memoryVendors.clear();
    memoryMenuItems.clear();
    memoryOrders.clear();
    memoryOrderItems.clear();

    const today = new Date().toISOString().slice(0, 10);
    memoryVendors.set(vendorA, { id: vendorA, phone: '9876543210', business_name: 'Stall A', daily_token_counter: 0, token_reset_date: today });
    memoryVendors.set(vendorB, { id: vendorB, phone: '9876543211', business_name: 'Stall B', daily_token_counter: 0, token_reset_date: today });

    memoryMenuItems.set(dishA, { id: dishA, vendor_id: vendorA, name: 'Momos A', price_paise: 6000n, is_available: true, is_active: true });
    memoryMenuItems.set(dishB, { id: dishB, vendor_id: vendorB, name: 'Chai B', price_paise: 2000n, is_available: true, is_active: true });
  });

  it('duplicate POST /api/v1/orders with same clientOrderId returns original order idempotently without double token increment', async () => {
    const clientOrderId = crypto.randomUUID();
    const createdAtClient = '2026-11-26T09:00:00.000Z';

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        clientOrderId,
        createdAtClient,
        items: [{ menuItemId: dishA, quantity: 2 }],
        paymentMethod: 'cash',
        paymentStatus: 'paid',
      },
    });
    expect(first.statusCode).toBe(201);
    const firstJson = first.json();
    expect(firstJson.order.tokenNo).toBe(1);
    expect(firstJson.order.clientOrderId).toBe(clientOrderId);

    const replay = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        clientOrderId,
        createdAtClient,
        items: [{ menuItemId: dishA, quantity: 2 }],
        paymentMethod: 'cash',
        paymentStatus: 'paid',
      },
    });
    expect([200, 201]).toContain(replay.statusCode);
    const replayJson = replay.json();
    expect(replayJson.order.id).toBe(firstJson.order.id);
    expect(replayJson.order.tokenNo).toBe(1);
    expect(memoryOrders.size).toBe(1);
    expect(memoryVendors.get(vendorA).daily_token_counter).toBe(1);
  });

  it('different vendors can use the same clientOrderId without collision', async () => {
    const sharedUuid = crypto.randomUUID();
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { clientOrderId: sharedUuid, items: [{ menuItemId: dishA, quantity: 1 }], paymentMethod: 'cash' },
    });
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { clientOrderId: sharedUuid, items: [{ menuItemId: dishB, quantity: 1 }], paymentMethod: 'upi' },
    });

    expect(resA.statusCode).toBe(201);
    expect(resB.statusCode).toBe(201);
    expect(resA.json().order.id).not.toBe(resB.json().order.id);
    expect(memoryOrders.size).toBe(2);
  });

  it('SyncEngine flushes FIFO, isolates permanent 4xx failures without blocking subsequent orders, and gates offline orders via Ed25519 license', async () => {
    await import('../../client/js/idb-store.js');
    const storageMod = await import('../../client/js/storage-adapter.js');
    const store = (globalThis as any).FroseIdbStore;
    const { SyncEngine, LicenseManager } = storageMod as any;

    expect(SyncEngine).toBeDefined();
    await store.clearAllStores();
    await store.ensureVendorScope(vendorA);

    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const validToken = await SubscriptionService.generateSignedLicenseToken({
      vendorId: vendorA,
      businessName: 'Stall A',
      plan: 'cloud',
      periodStart: new Date(Date.now() - 86400000).toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]!,
      status: 'active',
      issuedAt: new Date().toISOString(),
    });
    await LicenseManager.saveLicense(validToken, { vendorId: vendorA, publicKeyPem });

    const engine = new SyncEngine({
      store,
      vendorId: vendorA,
      fetchImpl: async (url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        if (body.clientOrderId === '11111111-1111-4111-8111-000000000001') {
          return new Response(JSON.stringify({ message: 'Item deleted' }), { status: 400 });
        }
        return new Response(
          JSON.stringify({
            status: 'success',
            order: { id: 'srv-' + body.clientOrderId, tokenNo: 42, clientOrderId: body.clientOrderId },
          }),
          { status: 201 }
        );
      },
    });

    await engine.queueOfflineOrder({
      clientOrderId: '11111111-1111-4111-8111-000000000001',
      items: [{ menuItemId: dishA, name: 'Momos A', quantity: 1, pricePaise: 6000 }],
      totalPaise: 6000,
      paymentMethod: 'cash',
    });
    await engine.queueOfflineOrder({
      clientOrderId: '11111111-1111-4111-8111-000000000002',
      items: [{ menuItemId: dishA, name: 'Momos A', quantity: 2, pricePaise: 6000 }],
      totalPaise: 12000,
      paymentMethod: 'cash',
    });

    await engine.flushOutbox({ force: true });

    const outbox = await store.getOutbox(vendorA);
    expect(outbox).toHaveLength(2);
    expect(outbox[0].status).toBe('failed');
    expect(outbox[1].status).toBe('synced');

    // Expired license (> 3-day grace) fails closed
    const expiredToken = await SubscriptionService.generateSignedLicenseToken({
      vendorId: vendorA,
      businessName: 'Stall A',
      plan: 'cloud',
      periodStart: '2024-01-01',
      periodEnd: '2024-01-15',
      status: 'expired',
      issuedAt: '2024-01-01T00:00:00.000Z',
    });
    await LicenseManager.saveLicense(expiredToken, { vendorId: vendorA, publicKeyPem });

    await expect(
      engine.queueOfflineOrder({
        clientOrderId: '11111111-1111-4111-8111-000000000003',
        items: [{ menuItemId: dishA, name: 'Momos A', quantity: 1, pricePaise: 6000 }],
        totalPaise: 6000,
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/license|expired|read-only/i);
  });
});
