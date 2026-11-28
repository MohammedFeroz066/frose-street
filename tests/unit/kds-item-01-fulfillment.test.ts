import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase, closeDatabase } from '../../server/src/db/database.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import { WebSocketHub } from '../../server/src/modules/websocket/websocket.hub.js';

describe('KDS-ITEM-01: Per-Item Fulfillment Backend, Auto-Transitions & WebSocket Sync', () => {
  let app: FastifyInstance;
  let ownerCookie = '';
  let cookCookie = '';
  let packerCookie = '';
  let otherCookie = '';
  let vendorId = '';
  let orderId = '';
  let itemIds: string[] = [];

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    process.env.JWT_SECRET = 'test-secret-key-for-kds-item-01-only';
    app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    const reg = await AuthService.registerVendor(db, {
      businessName: 'Item Sync Kitchen',
      ownerName: 'Chef Owner',
      phone: '9866003344',
      password: 'StrongPassword@2026',
      city: 'Hyderabad',
    });
    vendorId = reg.vendor.id;

    const signRole = async (sub: string, role: 'owner' | 'cook' | 'packer') => {
      const tok = await signJoseAccessToken(
        { sub, phone: reg.vendor.phone, businessName: reg.vendor.business_name, role, edition: 'cloud' },
        jwtConfig,
        900,
      );
      return `frose_access_token=${tok}`;
    };

    ownerCookie = await signRole(vendorId, 'owner');
    cookCookie = await signRole(vendorId, 'cook');
    packerCookie = await signRole(vendorId, 'packer');

    const regOther = await AuthService.registerVendor(db, {
      businessName: 'Other Stall',
      ownerName: 'Other',
      phone: '9866003355',
      password: 'StrongPassword@2026',
      city: 'Pune',
    });
    otherCookie = await signRole(regOther.vendor.id, 'owner');

    const m1 = await db
      .insertInto('menu_items')
      .values({ vendor_id: vendorId, name: 'Veg Momos', price_paise: 6000, category: 'Momos', is_available: true, is_active: true, display_order: 1 })
      .returningAll()
      .executeTakeFirstOrThrow();
    const m2 = await db
      .insertInto('menu_items')
      .values({ vendor_id: vendorId, name: 'Masala Chai', price_paise: 2000, category: 'Tea', is_available: true, is_active: true, display_order: 2 })
      .returningAll()
      .executeTakeFirstOrThrow();
    const m3 = await db
      .insertInto('menu_items')
      .values({ vendor_id: vendorId, name: 'Paneer Roll', price_paise: 9000, category: 'Rolls', is_available: true, is_active: true, display_order: 3 })
      .returningAll()
      .executeTakeFirstOrThrow();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        items: [
          { menuItemId: m1.id, quantity: 1 },
          { menuItemId: m2.id, quantity: 2 },
          { menuItemId: m3.id, quantity: 1 },
        ],
        paymentMethod: 'cash',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().order;
    orderId = created.id;
    itemIds = created.items.map((i: any) => i.id);
    expect(created.totalItems).toBe(3);
    expect(created.kitchenReadyCount).toBe(0);
    expect(created.packagingReadyCount).toBe(0);
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDatabase();
  });

  it('tracks individual kitchen_ready, exposes partial-ready in /active, auto-transitions ready <-> preparing, and broadcasts WebSocket events', async () => {
    const spy = vi.spyOn(WebSocketHub, 'broadcast');

    // Mark 1st item kitchen_ready
    const r1 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[0]}/fulfillment`,
      headers: { cookie: cookCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'kitchen', ready: true },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().order.kitchenReadyCount).toBe(1);
    expect(r1.json().order.totalItems).toBe(3);
    expect(r1.json().order.orderStatus).toBe('preparing');
    expect(r1.json().order.items[0].kitchenReady).toBe(true);
    expect(r1.json().order.items[0].kitchenReadyAt).toBeTruthy();

    // GET /api/v1/orders/active includes partialReadyQueue for Packaging visibility
    const activeRes = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/active',
      headers: { cookie: packerCookie },
    });
    expect(activeRes.statusCode).toBe(200);
    expect(activeRes.json().partialReadyQueue.some((o: any) => o.id === orderId)).toBe(true);

    // Mark remaining 2 items kitchen_ready -> auto-transitions order to 'ready'
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[1]}/fulfillment`,
      headers: { cookie: cookCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'kitchen', ready: true },
    });
    const r3 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[2]}/fulfillment`,
      headers: { cookie: cookCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'kitchen', ready: true },
    });
    expect(r3.statusCode).toBe(200);
    expect(r3.json().order.orderStatus).toBe('ready');
    expect(r3.json().order.kitchenReadyCount).toBe(3);
    expect(spy).toHaveBeenCalledWith(vendorId, 'order:item_updated', expect.objectContaining({ id: orderId }));
    expect(spy).toHaveBeenCalledWith(vendorId, 'order:status_changed', expect.objectContaining({ id: orderId, newStatus: 'ready' }));

    // Toggle 1 item back to false while order is ready -> reverts smoothly to 'preparing'
    const revertRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[2]}/fulfillment`,
      headers: { cookie: cookCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'kitchen', ready: false },
    });
    expect(revertRes.statusCode).toBe(200);
    expect(revertRes.json().order.orderStatus).toBe('preparing');
    expect(revertRes.json().order.kitchenReadyCount).toBe(2);

    // Cross-tenant isolation check
    const idorRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[0]}/fulfillment`,
      headers: { cookie: otherCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'kitchen', ready: true },
    });
    expect(idorRes.statusCode).toBe(404);
  });

  it('tracks individual packaging_ready and auto-transitions parent order to served when all items packed', async () => {
    // Re-mark 3rd item kitchen_ready
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[2]}/fulfillment`,
      headers: { cookie: cookCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'kitchen', ready: true },
    });

    // Pack 2 items individually
    for (const id of [itemIds[0], itemIds[1]]) {
      const p = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${orderId}/items/${id}/fulfillment`,
        headers: { cookie: packerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { stage: 'packaging', ready: true },
      });
      expect(p.statusCode).toBe(200);
      expect(p.json().order.orderStatus).toBe('ready');
    }

    // Pack 3rd item -> auto-transitions to 'served'
    const p3 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/items/${itemIds[2]}/fulfillment`,
      headers: { cookie: packerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { stage: 'packaging', ready: true },
    });
    expect(p3.statusCode).toBe(200);
    expect(p3.json().order.packagingReadyCount).toBe(3);
    expect(p3.json().order.orderStatus).toBe('served');

    // GET /api/v1/orders/:id returns full item flags & counts
    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${orderId}`,
      headers: { cookie: ownerCookie },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().order.packagingReadyCount).toBe(3);
    expect(getRes.json().order.items.every((i: any) => i.packagingReady === true && i.kitchenReady === true)).toBe(true);
  });

  it('bulk PATCH /orders/:id/status syncs all order_items fulfillment flags', async () => {
    const db = getDatabase();
    const items = await db.selectFrom('menu_items').selectAll().where('vendor_id', '=', vendorId).execute();
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { items: [{ menuItemId: items[0].id, quantity: 1 }, { menuItemId: items[1].id, quantity: 1 }], paymentMethod: 'cash' },
    });
    const ord2Id = createRes.json().order.id;

    // Bulk mark ready
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${ord2Id}/status`,
      headers: { cookie: cookCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { status: 'ready' },
    });
    const afterReady = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${ord2Id}`,
      headers: { cookie: ownerCookie },
    });
    expect(afterReady.json().order.kitchenReadyCount).toBe(2);

    // Bulk mark served
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${ord2Id}/status`,
      headers: { cookie: packerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { status: 'served' },
    });
    const afterServed = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${ord2Id}`,
      headers: { cookie: ownerCookie },
    });
    expect(afterServed.json().order.packagingReadyCount).toBe(2);
  });
});
