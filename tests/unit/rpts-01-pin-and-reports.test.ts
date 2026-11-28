import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase, closeDatabase } from '../../server/src/db/database.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { LoginSecurityService } from '../../server/src/modules/auth/login-security.service.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';
import { getIstDateString } from '../../server/src/utils/ist-date.js';
import { hashOwnerPin, verifyOwnerPin } from '../../server/src/utils/crypto.js';

describe('RPTS-01: Multi-Period Reports API & 4-Digit Owner PIN Security', () => {
  let app: FastifyInstance;
  let ownerCookie = '';
  let vendorId = '';
  let otherCookie = '';
  let otherVendorId = '';
  let menuItemId = '';
  const todayIst = getIstDateString();
  const yesterdayDate = new Date(Date.now() - 86_400_000);
  const yesterdayIst = getIstDateString(yesterdayDate);

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    process.env.JWT_SECRET = 'test-secret-key-for-rpts-01-unit-tests-only';
    LoginSecurityService.resetForTesting();
    app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    const regA = await AuthService.registerVendor(db, {
      businessName: 'Analytics Spice & Tea',
      ownerName: 'Feroz Owner',
      phone: '9844001122',
      password: 'StrongPassword@2026',
      city: 'Hyderabad',
    });
    vendorId = regA.vendor.id;
    const tokenA = await signJoseAccessToken(
      {
        sub: vendorId,
        phone: regA.vendor.phone,
        businessName: regA.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    ownerCookie = `frose_access_token=${tokenA}`;

    const regB = await AuthService.registerVendor(db, {
      businessName: 'Other Tenant Stall',
      ownerName: 'Other Owner',
      phone: '9844001133',
      password: 'StrongPassword@2026',
      city: 'Chennai',
    });
    otherVendorId = regB.vendor.id;
    const tokenB = await signJoseAccessToken(
      {
        sub: otherVendorId,
        phone: regB.vendor.phone,
        businessName: regB.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    otherCookie = `frose_access_token=${tokenB}`;

    const item = await db
      .insertInto('menu_items')
      .values({
        vendor_id: vendorId,
        name: 'Special Irani Chai',
        category: 'Tea',
        price_paise: 2000,
        is_veg: true,
        display_order: 1,
        is_available: true,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    menuItemId = item.id;

    // Seed today's orders (cash + split)
    await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId, quantity: 3 }], // 6000 paise
      paymentMethod: 'cash',
      paymentStatus: 'paid',
    });
    await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId, quantity: 5 }], // 10000 paise
      paymentMethod: 'split',
      cashPaise: 4000,
      upiPaise: 6000,
      paymentStatus: 'paid',
    });

    // Seed yesterday's order directly in DB
    await db
      .insertInto('orders')
      .values({
        vendor_id: vendorId,
        token_no: 99,
        total_paise: 5000n,
        payment_method: 'upi',
        cash_paise: 0,
        upi_paise: 5000,
        payment_status: 'paid',
        order_status: 'served',
        source: 'pos',
        created_at: `${yesterdayIst}T10:00:00.000+05:30`,
        updated_at: `${yesterdayIst}T10:00:00.000+05:30`,
      })
      .execute();

    // Seed an expense for yesterday
    await GallaService.logExpense(db, vendorId, {
      amountPaise: 1500,
      description: 'Yesterday Milk',
      category: 'ingredients',
      paymentMethod: 'cash',
      expenseDate: yesterdayIst,
    });
  });

  beforeEach(() => {
    LoginSecurityService.resetForTesting();
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDatabase();
  });

  it('hashes 4-digit Owner PIN with scryptSync + per-vendor salt and verifies via timingSafeEqual', () => {
    const h1 = hashOwnerPin('4829');
    const h2 = hashOwnerPin('4829');
    expect(h1).not.toBe(h2);
    expect(verifyOwnerPin('4829', h1)).toBe(true);
    expect(verifyOwnerPin('0000', h1)).toBe(false);
  });

  it('exposes hasOwnerPin in GET /api/v1/auth/me without ever leaking owner_pin_hash', async () => {
    const meBefore = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: ownerCookie },
    });
    expect(meBefore.statusCode).toBe(200);
    expect(meBefore.json().hasOwnerPin).toBe(false);
    expect(meBefore.json().owner_pin_hash).toBeUndefined();
    expect(meBefore.json().ownerPinHash).toBeUndefined();

    // Set Owner PIN for the first time
    const setRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/owner-pin',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '4321' },
    });
    expect(setRes.statusCode).toBe(200);
    expect(setRes.json().hasOwnerPin).toBe(true);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: ownerCookie },
    });
    expect(meAfter.statusCode).toBe(200);
    expect(meAfter.json().hasOwnerPin).toBe(true);
    expect(meAfter.json().owner_pin_hash).toBeUndefined();
    expect(meAfter.json().ownerPinHash).toBeUndefined();
  });

  it('requires currentPin or accountPassword to change an existing Owner PIN, and keeps PIN login disabled', async () => {
    // Attempt overwrite without currentPin or accountPassword
    const noAuthChange = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/owner-pin',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '9876' },
    });
    expect(noAuthChange.statusCode).toBeGreaterThanOrEqual(400);

    // Update using currentPin
    const changeWithCurrent = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/owner-pin',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '9876', currentPin: '4321' },
    });
    expect(changeWithCurrent.statusCode).toBe(200);

    // Verify new PIN
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/owner-pin/verify',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '9876' },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().valid).toBe(true);

    // Account login via PIN remains strictly blocked
    const pinLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/pin-login',
      payload: { pin: '9876' },
    });
    expect(pinLoginRes.statusCode).toBe(403);
    expect(pinLoginRes.json().code).toBe('PIN_LOGIN_DISABLED');
  });

  it('locks Owner PIN verification with 429 PIN_LOCKED after 5 failed attempts', async () => {
    for (let i = 0; i < 4; i++) {
      const fail = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/owner-pin/verify',
        headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { pin: '0000' },
      });
      expect(fail.statusCode).toBe(401);
      expect(fail.json().code).toBe('INVALID_OWNER_PIN');
    }

    const fifth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/owner-pin/verify',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '0000' },
    });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json().code).toBe('PIN_LOCKED');

    // Even valid PIN is blocked while locked
    const blockedValid = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/owner-pin/verify',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '9876' },
    });
    expect(blockedValid.statusCode).toBe(429);
    expect(blockedValid.json().code).toBe('PIN_LOCKED');
  });

  it('protects expense PATCH/DELETE and profit adjustments with 4-digit Owner PIN and computes multi-period report', async () => {
    // 1. Log today expense
    const expRes = await app.inject({
      method: 'POST',
      url: '/api/v1/galla/expenses',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { amountPaise: 2500, description: 'Sugar Pack', category: 'ingredients', paymentMethod: 'cash' },
    });
    expect(expRes.statusCode).toBe(201);
    const expenseId = expRes.json().expense.id;

    // 2. PATCH without ownerPin -> 403 OWNER_PIN_REQUIRED
    const patchNoPin = await app.inject({
      method: 'PATCH',
      url: `/api/v1/galla/expenses/${expenseId}`,
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { amountPaise: 3000, title: 'Sugar Bulk' },
    });
    expect(patchNoPin.statusCode).toBe(403);
    expect(patchNoPin.json().code).toBe('OWNER_PIN_REQUIRED');

    // 3. PATCH with wrong ownerPin -> 401 INVALID_OWNER_PIN
    const patchBadPin = await app.inject({
      method: 'PATCH',
      url: `/api/v1/galla/expenses/${expenseId}`,
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { amountPaise: 3000, title: 'Sugar Bulk', ownerPin: '1111' },
    });
    expect(patchBadPin.statusCode).toBe(401);
    expect(patchBadPin.json().code).toBe('INVALID_OWNER_PIN');

    // 4. PATCH with valid ownerPin -> 200
    const patchOk = await app.inject({
      method: 'PATCH',
      url: `/api/v1/galla/expenses/${expenseId}`,
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { amountPaise: 3000, title: 'Sugar Bulk', ownerPin: '9876' },
    });
    expect(patchOk.statusCode).toBe(200);
    expect(patchOk.json().expense.amountPaise).toBe(3000);
    expect(patchOk.json().expense.title).toBe('Sugar Bulk');

    // 5. POST profit adjustment requires PIN & supports negative/positive integer paise
    const adjNoPin = await app.inject({
      method: 'POST',
      url: '/api/v1/galla/profit-adjustments',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { businessDate: todayIst, amountPaise: -500, note: 'Wastage correction' },
    });
    expect(adjNoPin.statusCode).toBe(403);
    expect(adjNoPin.json().code).toBe('OWNER_PIN_REQUIRED');

    const adjOk = await app.inject({
      method: 'POST',
      url: '/api/v1/galla/profit-adjustments',
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { businessDate: todayIst, amountPaise: -500, note: 'Wastage correction', ownerPin: '9876' },
    });
    expect(adjOk.statusCode).toBe(201);
    expect(adjOk.json().adjustment.amountPaise).toBe(-500);

    // 6. Multi-period report across yesterday..today
    const reportRes = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report?from=${yesterdayIst}&to=${todayIst}`,
      headers: { cookie: ownerCookie },
    });
    expect(reportRes.statusCode).toBe(200);
    const rep = reportRes.json().report;
    // Today: 6000 + 10000 = 16000 (cash 6000+4000=10000, upi 6000, split 10000); Yesterday: 5000 (upi 5000)
    expect(rep.grossSalesPaise).toBe(21000);
    expect(rep.cashSalesPaise).toBe(10000);
    expect(rep.upiSalesPaise).toBe(11000);
    expect(rep.splitSalesPaise).toBe(10000);
    expect(rep.totalOrders).toBe(3);
    expect(rep.averageOrderPaise).toBe(7000);
    // Expenses: 1500 (yesterday) + 3000 (today edited) = 4500
    expect(rep.totalExpensesPaise).toBe(4500);
    // Profit adjustment: -500
    expect(rep.profitAdjustmentsPaise).toBe(-500);
    // Net profit = 21000 - 4500 + (-500) = 16000
    expect(rep.netProfitPaise).toBe(16000);
    expect(rep.dailyBreakdown.length).toBe(2);
    expect(rep.topItems[0].itemName).toBe('Special Irani Chai');
    expect(rep.topItems[0].quantity).toBe(8);
    expect(rep.expenses.length).toBe(2);
    expect(rep.adjustments.length).toBe(1);

    // Cross-tenant isolation check
    const otherReport = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report?from=${yesterdayIst}&to=${todayIst}`,
      headers: { cookie: otherCookie },
    });
    expect(otherReport.statusCode).toBe(200);
    expect(otherReport.json().report.grossSalesPaise).toBe(0);

    // 7. DELETE expense requires valid PIN
    const delNoPin = await app.inject({
      method: 'DELETE',
      url: `/api/v1/galla/expenses/${expenseId}`,
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
    });
    expect(delNoPin.statusCode).toBe(403);

    const delOk = await app.inject({
      method: 'DELETE',
      url: `/api/v1/galla/expenses/${expenseId}`,
      headers: { cookie: ownerCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { ownerPin: '9876' },
    });
    expect(delOk.statusCode).toBe(200);
  });

  it('rejects report range exceeding 366 days with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/galla/report?from=2025-01-01&to=2026-06-01',
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(400);
  });
});
