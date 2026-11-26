import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('OFF-01: Durable Vendor-Scoped IndexedDB Store & Integer Paise Preservation', () => {
  const clientDir = path.resolve(__dirname, '../../client');
  const idbStorePath = path.join(clientDir, 'js/idb-store.js');

  beforeEach(async () => {
    if (fs.existsSync(idbStorePath)) {
      const mod = await import('../../client/js/idb-store.js');
      const store = mod.default || (globalThis as any).FroseIdbStore;
      if (store && typeof store.clearAllStores === 'function') {
        await store.clearAllStores();
      }
    }
  });

  it('client/js/idb-store.js exists as classic-script-safe IIFE without top-level ESM export', () => {
    expect(fs.existsSync(idbStorePath)).toBe(true);
    const src = fs.readFileSync(idbStorePath, 'utf8');
    expect(src).not.toMatch(/^\s*export\s+/m);
    expect(src).toContain('menu_items');
    expect(src).toContain('orders');
    expect(src).toContain('sync_outbox');
    expect(src).toContain('meta');
  });

  it('supports vendor-scoped CRUD across menu_items, orders, sync_outbox, meta and preserves integer paise', async () => {
    const mod = await import('../../client/js/idb-store.js');
    const store = mod.default || (globalThis as any).FroseIdbStore;
    expect(store).toBeDefined();

    const vendorA = '11111111-1111-1111-1111-111111111111';
    const vendorB = '22222222-2222-2222-2222-222222222222';

    await store.ensureVendorScope(vendorA);
    await store.putMenuItems(vendorA, [
      { id: 'dish-1', name: 'Veg Momos', category: 'Momos', pricePaise: 6000, isAvailable: true },
      { id: 'dish-2', name: 'Masala Chai', category: 'Tea', pricePaise: 1550, isAvailable: true },
    ]);

    const menuA = await store.getMenuItems(vendorA);
    expect(menuA).toHaveLength(2);
    expect(menuA[0].pricePaise).toBe(6000);
    expect(Number.isSafeInteger(menuA[0].pricePaise)).toBe(true);
    expect(menuA[1].pricePaise).toBe(1550);
    expect(Number.isSafeInteger(menuA[1].pricePaise)).toBe(true);

    // Rejects non-integer float paise
    await expect(
      store.putMenuItems(vendorA, [{ id: 'dish-bad', name: 'Bad', pricePaise: 12.34 }])
    ).rejects.toThrow(/integer paise/i);

    // Atomic order + outbox write
    const clientOrderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await store.recordOfflineOrderAtomic(
      vendorA,
      {
        client_order_id: clientOrderId,
        vendor_id: vendorA,
        tokenNo: 1,
        localTokenDisplay: 'OFF-01',
        items: [{ menuItemId: 'dish-1', name: 'Veg Momos', quantity: 2, pricePaise: 6000 }],
        totalPaise: 12000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        status: 'pending',
        syncStatus: 'pending',
        createdAt: '2026-11-26T10:00:00.000Z',
      },
      {
        client_order_id: clientOrderId,
        vendor_id: vendorA,
        payload: { clientOrderId, items: [{ menuItemId: 'dish-1', quantity: 2 }], paymentMethod: 'cash' },
        status: 'pending',
        retryCount: 0,
        lastError: null,
        createdAt: '2026-11-26T10:00:00.000Z',
      }
    );

    const ordersA = await store.getOrders(vendorA);
    expect(ordersA).toHaveLength(1);
    expect(ordersA[0].totalPaise).toBe(12000);
    expect(Number.isSafeInteger(ordersA[0].totalPaise)).toBe(true);

    const outboxA = await store.getOutbox(vendorA);
    expect(outboxA).toHaveLength(1);
    expect(outboxA[0].status).toBe('pending');
    expect(outboxA[0].client_order_id).toBe(clientOrderId);

    // Update outbox status & retryCount
    await store.updateOutboxItem(clientOrderId, { status: 'synced', retryCount: 1, lastError: null });
    const updatedOutbox = await store.getOutbox(vendorA);
    expect(updatedOutbox[0].status).toBe('synced');
    expect(updatedOutbox[0].retryCount).toBe(1);

    // Vendor B query sees zero records from Vendor A
    expect(await store.getMenuItems(vendorB)).toEqual([]);
    expect(await store.getOrders(vendorB)).toEqual([]);
    expect(await store.getOutbox(vendorB)).toEqual([]);

    // clearAllStores wipes everything
    await store.clearAllStores();
    expect(await store.getMenuItems(vendorA)).toEqual([]);
    expect(await store.getOrders(vendorA)).toEqual([]);
    expect(await store.getOutbox(vendorA)).toEqual([]);
  });

  it('billing.js and storage-adapter.js use FroseIdbStore and do not persist menu/orders in localStorage', () => {
    const billingJs = fs.readFileSync(path.join(clientDir, 'js/billing.js'), 'utf8');
    const storageAdapterJs = fs.readFileSync(path.join(clientDir, 'js/storage-adapter.js'), 'utf8');

    expect(billingJs).toContain('FroseIdbStore');
    expect(billingJs).not.toMatch(/localStorage\.setItem\(\s*['"]frose_dishes_/);
    expect(billingJs).not.toMatch(/localStorage\.setItem\(\s*['"]frose_live_orders_queue['"]/);
    expect(billingJs).not.toMatch(/localStorage\.setItem\(\s*['"]frose_current_token['"]/);
    expect(storageAdapterJs).toContain('FroseIdbStore');
  });
});
