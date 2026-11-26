import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { getDatabase } from '../../server/src/db/database.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import { getIstDateString } from '../../server/src/utils/ist-date.js';

describe('UX-01: Live Order Editing, Split Cash+UPI, Filtered History & Menu Variants', () => {
  let app: FastifyInstance;
  let vendorId: string;
  let accessCookie: string;
  let itemWithVariantsId: string;
  let sideItemId: string;
  let otherVendorCookie: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    const reg = await AuthService.registerVendor(db, {
      phone: `97${Math.floor(10000000 + Math.random() * 89999999)}`,
      password: 'Ux01StrongPass!2026',
      businessName: 'UX01 Biryani Corner',
      ownerName: 'Vendor UX01',
      edition: 'cloud',
    });
    vendorId = reg.vendor.id;

    await AuthService.updateVendorProfile(db, vendorId, {
      taxMode: 'regular',
      gstin: '36AABCU9603R1ZM',
      gstRateBps: 500,
    });

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

    const regB = await AuthService.registerVendor(db, {
      phone: `96${Math.floor(10000000 + Math.random() * 89999999)}`,
      password: 'Ux01StrongPass!2026',
      businessName: 'Other Stall B',
      ownerName: 'Owner B',
      edition: 'cloud',
    });
    const tokenB = await signJoseAccessToken(
      {
        sub: regB.vendor.id,
        phone: regB.vendor.phone,
        businessName: regB.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    otherVendorCookie = `frose_access_token=${tokenB}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates and updates menu items with isVeg and variants (rejecting unknown fields / float prices)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        name: 'Chicken Dum Biryani',
        pricePaise: 11000,
        category: 'Biryani',
        isVeg: false,
        variants: [
          { name: 'Half', pricePaise: 6000 },
          { name: 'Full', pricePaise: 11000 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.item.isVeg).toBe(false);
    expect(body.item.variants).toEqual([
      { name: 'Half', pricePaise: 6000 },
      { name: 'Full', pricePaise: 11000 },
    ]);
    itemWithVariantsId = body.item.id;

    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/menu',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        name: 'Irani Chai',
        pricePaise: 2000,
        category: 'Beverages',
        isVeg: true,
      },
    });
    expect(res2.statusCode).toBe(201);
    sideItemId = res2.json().item.id;

    // Update menu item variants
    const updRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/menu/${itemWithVariantsId}`,
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        variants: [
          { name: 'Half', pricePaise: 6500 },
          { name: 'Full', pricePaise: 12000 },
        ],
      },
    });
    expect(updRes.statusCode).toBe(200);
    expect(updRes.json().item.variants[0].pricePaise).toBe(6500);
  });

  it('validates split Cash+UPI totals on POST /orders and reflects exact split in Galla summary', async () => {
    // Variant Half (6500) + 5% GST (162 CGST + 163 SGST = 325) = 6825 paise
    const badSplit = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: itemWithVariantsId, quantity: 1, variantName: 'Half' }],
        paymentMethod: 'split',
        cashPaise: 4000,
        upiPaise: 2000, // sums to 6000 != 6825
      },
    });
    expect(badSplit.statusCode).toBe(400);

    const goodSplit = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: itemWithVariantsId, quantity: 1, variantName: 'Half' }],
        paymentMethod: 'split',
        cashPaise: 4000,
        upiPaise: 2825,
      },
    });
    expect(goodSplit.statusCode).toBe(201);
    const created = goodSplit.json().order;
    expect(created.subtotalPaise).toBe(6500);
    expect(created.cgstPaise).toBe(162);
    expect(created.sgstPaise).toBe(163);
    expect(created.totalPaise).toBe(6825);
    expect(created.cashPaise).toBe(4000);
    expect(created.upiPaise).toBe(2825);
    expect(created.items[0].itemName).toBe('Chicken Dum Biryani (Half)');

    const gallaRes = await app.inject({
      method: 'GET',
      url: '/api/v1/galla/summary',
      headers: { cookie: accessCookie },
    });
    expect(gallaRes.statusCode).toBe(200);
    const summary = gallaRes.json().summary;
    expect(summary.cashSalesPaise).toBe(4000);
    expect(summary.upiSalesPaise).toBe(2825);
    expect(summary.totalSalesPaise).toBe(6825);
  });

  it('edits live orders via PUT /api/v1/orders/:id, recalculates tax, rejects cancelled orders, and enforces tenant isolation', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: sideItemId, quantity: 1 }],
        paymentMethod: 'cash',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const orderId = createRes.json().order.id;

    // Cross-tenant edit blocked
    const crossEdit = await app.inject({
      method: 'PUT',
      url: `/api/v1/orders/${orderId}`,
      headers: {
        cookie: otherVendorCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: sideItemId, quantity: 2 }],
        paymentMode: 'cash',
      },
    });
    expect(crossEdit.statusCode).toBe(404);

    // Edit to Full Biryani (12000) + Irani Chai (2000) = 14000 subtotal + 5% GST (350+350=700) = 14700
    const editRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/orders/${orderId}`,
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [
          { menuItemId: itemWithVariantsId, quantity: 1, variantName: 'Full', notes: 'Less spicy' },
          { menuItemId: sideItemId, quantity: 1 },
        ],
        paymentMode: 'split',
        cashPaise: 5000,
        upiPaise: 9700,
        notes: 'Parcel',
        editNote: 'Upgraded to Full + added chai',
      },
    });
    expect(editRes.statusCode).toBe(200);
    const updated = editRes.json().order;
    expect(updated.subtotalPaise).toBe(14000);
    expect(updated.cgstPaise).toBe(350);
    expect(updated.sgstPaise).toBe(350);
    expect(updated.totalPaise).toBe(14700);
    expect(updated.paymentMethod).toBe('split');
    expect(updated.cashPaise).toBe(5000);
    expect(updated.upiPaise).toBe(9700);
    expect(updated.editNote).toBe('Upgraded to Full + added chai');
    expect(updated.editedAt).toBeTruthy();

    // Cancel and confirm editing cancelled order is rejected with 400
    const voidRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderId}/status`,
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: { status: 'cancelled', reason: 'Test cancel edit lock' },
    });
    expect(voidRes.statusCode).toBe(200);

    const editCancelled = await app.inject({
      method: 'PUT',
      url: `/api/v1/orders/${orderId}`,
      headers: {
        cookie: accessCookie,
        'x-frose-csrf': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: sideItemId, quantity: 1 }],
        paymentMode: 'cash',
      },
    });
    expect(editCancelled.statusCode).toBe(400);
  });

  it('filters GET /api/v1/orders/history by IST date, paymentMode, search, and returns filtered summary totals', async () => {
    const todayIst = getIstDateString();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/history?dateFrom=${todayIst}&dateTo=${todayIst}&paymentMode=split&search=Biryani`,
      headers: { cookie: accessCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.summary).toBeDefined();
    expect(body.summary.orderCount).toBe(1);
    expect(body.summary.voidCount).toBe(1);
    expect(body.summary.netSalesPaise).toBe(6825);
    expect(body.summary.cashPaise).toBe(4000);
    expect(body.summary.upiPaise).toBe(2825);
    expect(body.orders.length).toBe(2);
  });
});
