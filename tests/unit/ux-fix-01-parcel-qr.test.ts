import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { getDatabase } from '../../server/src/db/database.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import { normalizeOrderType } from '../../server/src/modules/orders/order.service.js';

describe('UX-FIX-01: PARCEL orderType persistence & local QR', () => {
  let app: FastifyInstance;
  let vendorId: string;
  let accessCookie: string;
  let menuItemId: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    const reg = await AuthService.registerVendor(db, {
      phone: `97${Math.floor(10000000 + Math.random() * 89999999)}`,
      password: 'UxFix01Pass!2026',
      businessName: 'Parcel Test Stall',
      ownerName: 'Vendor Parcel',
      edition: 'cloud',
    });
    vendorId = reg.vendor.id;

    const token = await signJoseAccessToken(
      {
        sub: vendorId,
        phone: reg.vendor.phone,
        businessName: reg.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    accessCookie = `frose_access_token=${token}`;

    const itemRes = await app.inject({
      method: 'POST',
      url: '/api/v1/menu',
      headers: { cookie: accessCookie, 'x-frose-csrf': '1' },
      payload: {
        name: 'Parcel Test Momos',
        category: 'Momos',
        pricePaise: 6000,
      },
    });
    expect(itemRes.statusCode).toBe(201);
    menuItemId = itemRes.json().item.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('normalizes counter/parcel/takeaway to parcel and dinein to dinein', () => {
    expect(normalizeOrderType('parcel', null)).toBe('parcel');
    expect(normalizeOrderType('counter', null)).toBe('parcel');
    expect(normalizeOrderType('takeaway', null)).toBe('parcel');
    expect(normalizeOrderType('dinein', null)).toBe('dinein');
    expect(normalizeOrderType(undefined, 'Parcel: extra spicy')).toBe('parcel');
    expect(normalizeOrderType(undefined, 'No onion')).toBe('dinein');
  });

  it('persists orderType=parcel through POST, GET /live, and PUT /orders/:id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: accessCookie, 'x-frose-csrf': '1' },
      payload: {
        items: [{ menuItemId, quantity: 2 }],
        paymentMethod: 'cash',
        orderType: 'parcel',
        source: 'pos',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json().order;
    expect(created.orderType).toBe('parcel');

    const liveRes1 = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/live',
      headers: { cookie: accessCookie },
    });
    expect(liveRes1.statusCode).toBe(200);
    const liveOrder1 = liveRes1.json().kitchenQueue.find((o: any) => o.id === created.id);
    expect(liveOrder1).toBeTruthy();
    expect(liveOrder1.orderType).toBe('parcel');

    // Edit order notes without passing orderType — must preserve 'parcel'
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/orders/${created.id}`,
      headers: { cookie: accessCookie, 'x-frose-csrf': '1' },
      payload: {
        items: [{ menuItemId, quantity: 3 }],
        notes: 'Extra chutney',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().order.orderType).toBe('parcel');

    const liveRes2 = await app.inject({
      method: 'GET',
      url: '/api/v1/orders/live',
      headers: { cookie: accessCookie },
    });
    expect(liveRes2.statusCode).toBe(200);
    const liveOrder2 = liveRes2.json().kitchenQueue.find((o: any) => o.id === created.id);
    expect(liveOrder2.orderType).toBe('parcel');
  });

  it('eliminates external api.qrserver.com and precaches local qr-local.js', () => {
    const root = process.cwd();
    const settingsJs = fs.readFileSync(path.join(root, 'client/js/settings-component.js'), 'utf8');
    const adminJs = fs.readFileSync(path.join(root, 'client/js/admin-page.js'), 'utf8');
    const swJs = fs.readFileSync(path.join(root, 'client/sw.js'), 'utf8');
    const qrLocalJs = fs.readFileSync(path.join(root, 'client/js/qr-local.js'), 'utf8');

    expect(settingsJs).not.toContain('api.qrserver.com');
    expect(adminJs).not.toContain('api.qrserver.com');
    expect(swJs).toContain("'/js/qr-local.js'");
    expect(qrLocalJs).toContain('FroseQrLocal');
  });
});
