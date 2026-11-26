import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';

const memoryVendors = new Map<string, any>();
const memoryMenuItems = new Map<string, any>();
const memoryOrders = new Map<string, any>();
const memoryOrderItems = new Map<string, any>();
const memoryExpenses = new Map<string, any>();
const memoryDailySummaries = new Map<string, any>();

function createInMemoryMockDb() {
  return {
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
                  : table === 'expenses'
                    ? memoryExpenses
                    : table === 'daily_summaries'
                      ? memoryDailySummaries
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
            const id = vals.id || `id-${Math.random().toString(36).slice(2, 9)}`;
            const record = { ...vals, id, created_at: new Date(), updated_at: new Date() };
            const map =
              table === 'vendors'
                ? memoryVendors
                : table === 'menu_items'
                  ? memoryMenuItems
                  : table === 'order_items'
                    ? memoryOrderItems
                    : table === 'expenses'
                      ? memoryExpenses
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
  } as any;
}

describe('OFF-03: IST (Asia/Kolkata) Authoritative Daily Token & Galla Date Boundaries', () => {
  const vendorId = '11111111-1111-4111-8111-111111111111';
  const dishId = 'aaaaaaaa-1111-4111-8111-111111111111';

  beforeEach(() => {
    vi.useFakeTimers();
    memoryVendors.clear();
    memoryMenuItems.clear();
    memoryOrders.clear();
    memoryOrderItems.clear();
    memoryExpenses.clear();
    memoryDailySummaries.clear();

    memoryVendors.set(vendorId, {
      id: vendorId,
      phone: '9876543210',
      business_name: 'IST Chai Counter',
      daily_token_counter: 0,
      token_reset_date: '2026-11-26',
    });
    memoryMenuItems.set(dishId, {
      id: dishId,
      vendor_id: vendorId,
      name: 'Irani Chai',
      price_paise: 1500n,
      is_available: true,
      is_active: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes IST business date across 23:50 IST, 00:05 IST, and 04:00 IST crossover window', async () => {
    const { getIstDateString } = await import('../../server/src/utils/ist-date.js');

    // 23:50 IST on 2026-11-26 = 18:20 UTC on 2026-11-26
    expect(getIstDateString(new Date('2026-11-26T18:20:00.000Z'))).toBe('2026-11-26');
    // 00:05 IST on 2026-11-27 = 18:35 UTC on 2026-11-26 (UTC is still Nov 26!)
    expect(getIstDateString(new Date('2026-11-26T18:35:00.000Z'))).toBe('2026-11-27');
    // 04:00 IST on 2026-11-27 = 22:30 UTC on 2026-11-26 (UTC is still Nov 26!)
    expect(getIstDateString(new Date('2026-11-26T22:30:00.000Z'))).toBe('2026-11-27');
  });

  it('OrderService resets daily token strictly at 00:00 IST (never at 05:30 AM IST)', async () => {
    const db = createInMemoryMockDb();

    // 1. 23:50 IST on Nov 26 -> Token #1 on 2026-11-26
    vi.setSystemTime(new Date('2026-11-26T18:20:00.000Z'));
    const ord1 = await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId: dishId, quantity: 1 }],
      paymentMethod: 'cash',
    });
    expect(ord1.tokenNo).toBe(1);
    expect(memoryVendors.get(vendorId).token_reset_date).toBe('2026-11-26');

    // 2. 00:05 IST on Nov 27 (UTC is still 2026-11-26T18:35Z) -> MUST reset to Token #1 on 2026-11-27
    vi.setSystemTime(new Date('2026-11-26T18:35:00.000Z'));
    const ord2 = await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId: dishId, quantity: 1 }],
      paymentMethod: 'cash',
    });
    expect(ord2.tokenNo).toBe(1);
    expect(memoryVendors.get(vendorId).token_reset_date).toBe('2026-11-27');

    // 3. 04:00 IST on Nov 27 (UTC is still 2026-11-26T22:30Z) -> Token #2 on 2026-11-27
    vi.setSystemTime(new Date('2026-11-26T22:30:00.000Z'));
    const ord3 = await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId: dishId, quantity: 2 }],
      paymentMethod: 'upi',
    });
    expect(ord3.tokenNo).toBe(2);

    // 4. 06:00 IST on Nov 27 (00:30 UTC on Nov 27) -> MUST continue as Token #3 (must NOT reset at 05:30 IST!)
    vi.setSystemTime(new Date('2026-11-27T00:30:00.000Z'));
    const ord4 = await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId: dishId, quantity: 1 }],
      paymentMethod: 'cash',
    });
    expect(ord4.tokenNo).toBe(3);

    // 5. Galla summary splits 23:50 IST (Nov 26) vs 00:05/04:00/06:00 IST (Nov 27)
    const nov26 = await GallaService.getGallaSummary(db, vendorId, '2026-11-26');
    const nov27 = await GallaService.getGallaSummary(db, vendorId, '2026-11-27');
    expect(nov26.totalOrders).toBe(1);
    expect(nov26.totalSalesPaise).toBe(1500);
    expect(nov27.totalOrders).toBe(3);
    expect(nov27.totalSalesPaise).toBe(6000);
  });

  it('reconciles offline temporary token OFF-01 to authoritative server IST token when synced', async () => {
    await import('../../client/js/idb-store.js');
    const storageMod = await import('../../client/js/storage-adapter.js');
    const store = (globalThis as any).FroseIdbStore;
    const { SyncEngine, LicenseManager } = storageMod as any;
    const { SubscriptionService } = await import('../../server/src/modules/subscriptions/subscription.service.js');

    await store.clearAllStores();
    await store.ensureVendorScope(vendorId);

    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const token = await SubscriptionService.generateSignedLicenseToken({
      vendorId,
      businessName: 'IST Chai Counter',
      plan: 'cloud',
      periodStart: '2026-11-20',
      periodEnd: '2026-12-10',
      status: 'active',
      issuedAt: new Date().toISOString(),
    });
    await LicenseManager.saveLicense(token, { vendorId, publicKeyPem });

    const engine = new SyncEngine({
      store,
      vendorId,
      fetchImpl: async (_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        return new Response(
          JSON.stringify({
            status: 'success',
            order: { id: 'srv-ist-1', tokenNo: 14, tokenDisplay: '#14', clientOrderId: body.clientOrderId },
          }),
          { status: 201 }
        );
      },
    });

    const offline = await engine.queueOfflineOrder({
      items: [{ menuItemId: dishId, name: 'Irani Chai', quantity: 1, pricePaise: 1500 }],
      totalPaise: 1500,
      paymentMethod: 'cash',
    });
    expect(offline.order.localTokenDisplay).toBe('OFF-01');
    expect(offline.order.syncStatus).toBe('pending');

    await engine.flushOutbox({ force: true });
    const reconciled = await store.getOrderByClientOrderId(offline.order.client_order_id);
    expect(reconciled.tokenNo).toBe(14);
    expect(reconciled.tokenDisplay).toBe('#14');
    expect(reconciled.syncStatus).toBe('synced');
  });
});
