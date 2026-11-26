import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('OFF-05: Safe Multi-Tenant Logout Wipe & Unsynced Outbox Warning', () => {
  const vendorA = '11111111-1111-4111-8111-111111111111';
  const vendorB = '22222222-2222-4222-8222-222222222222';

  beforeEach(async () => {
    const mod = await import('../../client/js/idb-store.js');
    const store = mod.default || (globalThis as any).FroseIdbStore;
    await store.clearAllStores();
  });

  it('prompts with exact unsynced pending order count before wiping and aborts wipe if user cancels', async () => {
    const mod = await import('../../client/js/idb-store.js');
    const store = mod.default || (globalThis as any).FroseIdbStore;
    expect(typeof store.safeLogout).toBe('function');

    await store.ensureVendorScope(vendorA);
    await store.putMenuItems(vendorA, [{ id: 'd1', name: 'Momos', pricePaise: 6000 }]);
    await store.recordOfflineOrderAtomic(
      vendorA,
      {
        client_order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        tokenNo: 1,
        localTokenDisplay: 'OFF-01',
        items: [{ menuItemId: 'd1', name: 'Momos', quantity: 1, pricePaise: 6000 }],
        totalPaise: 6000,
        paymentMethod: 'cash',
        syncStatus: 'pending',
      },
      {
        client_order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        vendor_id: vendorA,
        payload: {},
        status: 'pending',
      }
    );
    await store.recordOfflineOrderAtomic(
      vendorA,
      {
        client_order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        tokenNo: 2,
        localTokenDisplay: 'OFF-02',
        items: [{ menuItemId: 'd1', name: 'Momos', quantity: 1, pricePaise: 6000 }],
        totalPaise: 6000,
        paymentMethod: 'cash',
        syncStatus: 'pending',
      },
      {
        client_order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
        vendor_id: vendorA,
        payload: {},
        status: 'pending',
      }
    );

    const confirmCancel = vi.fn((_msg: string) => false);
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    const redirectMock = vi.fn();

    const cancelRes = await store.safeLogout({
      confirmImpl: confirmCancel,
      fetchImpl: fetchMock,
      redirectImpl: redirectMock,
    });

    expect(confirmCancel).toHaveBeenCalledTimes(1);
    expect(confirmCancel.mock.calls[0][0]).toMatch(/2\s+unsynced/i);
    expect(cancelRes.cancelled).toBe(true);
    expect(cancelRes.wiped).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    // Data preserved because user cancelled
    expect((await store.getOrders(vendorA)).length).toBe(2);
    expect((await store.getOutbox(vendorA)).length).toBe(2);

    // Now confirm logout -> must wipe all 4 IndexedDB stores completely
    const confirmAccept = vi.fn(() => true);
    const okRes = await store.safeLogout({
      confirmImpl: confirmAccept,
      fetchImpl: fetchMock,
      redirectImpl: redirectMock,
    });

    expect(okRes.cancelled).toBe(false);
    expect(okRes.wiped).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/login.html');

    const counts = await store.inspectStoreCounts();
    expect(counts).toEqual({
      menu_items: 0,
      orders: 0,
      sync_outbox: 0,
      meta: 0,
    });
  });

  it('wipes all IndexedDB stores from Vendor A when Vendor B signs in on the same device', async () => {
    const mod = await import('../../client/js/idb-store.js');
    const store = mod.default || (globalThis as any).FroseIdbStore;

    await store.ensureVendorScope(vendorA);
    await store.putMenuItems(vendorA, [{ id: 'a-dish', name: 'Vendor A Secret', pricePaise: 9000 }]);
    await store.setMeta('offline_license', { token: 'vendor-a-jwt', vendor_id: vendorA });
    await store.saveOrder(vendorA, {
      client_order_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9',
      tokenNo: 1,
      items: [{ menuItemId: 'a-dish', name: 'Vendor A Secret', quantity: 1, pricePaise: 9000 }],
      totalPaise: 9000,
      paymentMethod: 'cash',
      syncStatus: 'synced',
    });

    // Vendor B logs in on same device
    await store.ensureVendorScope(vendorB);

    expect(await store.getMenuItems(vendorA)).toEqual([]);
    expect(await store.getMenuItems(vendorB)).toEqual([]);
    expect(await store.getOrders(vendorA)).toEqual([]);
    expect(await store.getMeta('offline_license')).toBeNull();
    expect(await store.getActiveVendorId()).toBe(vendorB);
  });
});
