import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import fs from 'node:fs';
import path from 'node:path';

describe('IND-02: Integer-Paise Tax Engine, FY Receipt Numbers & Void Reasons', () => {
  let app: FastifyInstance;
  let jwtConfig: any;
  let vendorId: string;
  let vendorToken: string;
  let dishId: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
    const config = (app as any).froseConfig || loadConfig();
    jwtConfig = getJwtKeyRotationConfig(config);

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone: '9222200001',
        password: 'StrongPassword!123',
        businessName: 'Tax Engine Stall',
        ownerName: 'Tax Owner',
      },
    });
    expect(reg.statusCode).toBe(201);
    vendorId = reg.json().vendor.id;

    vendorToken = await signJoseAccessToken(
      { sub: vendorId, phone: '9222200001', businessName: 'Tax Engine Stall', role: 'owner', edition: 'cloud' },
      jwtConfig,
      900,
    );

    const itemRes = await app.inject({
      method: 'POST',
      url: '/api/v1/menu',
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        name: 'Special Chai',
        pricePaise: 101, // Odd paise to test zero 1-paise drift!
        category: 'Tea',
        isAvailable: true,
      },
    });
    expect(itemRes.statusCode).toBe(201);
    dishId = itemRes.json().item.id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('migration 017_add_order_tax_and_receipt_fields exists with required columns and unique index', () => {
    const migPath = path.resolve(process.cwd(), 'server/src/db/migrations/017_add_order_tax_and_receipt_fields.ts');
    expect(fs.existsSync(migPath)).toBe(true);
    const src = fs.readFileSync(migPath, 'utf8');
    expect(src).toContain('receipt_number');
    expect(src).toContain('subtotal_paise');
    expect(src).toContain('cgst_paise');
    expect(src).toContain('sgst_paise');
    expect(src).toContain('tax_mode_snapshot');
    expect(src).toContain('cancel_reason');
    expect(src).toContain('uq_orders_vendor_receipt_number');
  });

  it('tax-calculator computes all 3 modes with pure integer math and zero 1-paise drift', async () => {
    const { calculateOrderTax } = await import('../../server/src/utils/tax-calculator.js');

    // Unregistered -> 0 tax
    const unreg = calculateOrderTax({ subtotalPaise: 101, taxMode: 'unregistered', gstRateBps: 500 });
    expect(unreg).toMatchObject({ subtotalPaise: 101, cgstPaise: 0, sgstPaise: 0, totalPaise: 101 });

    // Composition -> 0 tax
    const comp = calculateOrderTax({ subtotalPaise: 10000, taxMode: 'composition', gstRateBps: 500 });
    expect(comp).toMatchObject({ subtotalPaise: 10000, cgstPaise: 0, sgstPaise: 0, totalPaise: 10000 });

    // Regular 5% on odd paise: 101 * 500 / 10000 = 5.05 -> 5 paise -> cgst=2, sgst=3, total=106
    const regOdd = calculateOrderTax({ subtotalPaise: 101, taxMode: 'regular', gstRateBps: 500 });
    expect(regOdd.cgstPaise + regOdd.sgstPaise).toBe(5);
    expect(regOdd.cgstPaise).toBe(2);
    expect(regOdd.sgstPaise).toBe(3);
    expect(regOdd.subtotalPaise + regOdd.cgstPaise + regOdd.sgstPaise).toBe(regOdd.totalPaise);
    expect(regOdd.totalPaise).toBe(106);

    // Regular 5% on 110 paise: 110 * 500 / 10000 = 5.5 -> 6 paise (half-up) -> cgst=3, sgst=3, total=116
    const regHalfUp = calculateOrderTax({ subtotalPaise: 110, taxMode: 'regular', gstRateBps: 500 });
    expect(regHalfUp).toMatchObject({ subtotalPaise: 110, cgstPaise: 3, sgstPaise: 3, totalPaise: 116 });
    expect(Number.isSafeInteger(regHalfUp.totalPaise)).toBe(true);

    // Rejects floats
    expect(() => calculateOrderTax({ subtotalPaise: 10.5, taxMode: 'regular', gstRateBps: 500 })).toThrow();
  });

  it('computes Indian Financial Year boundary strictly in IST (31 Mar IST vs 01 Apr IST)', async () => {
    const { getIndianFinancialYearCode } = await import('../../server/src/utils/ist-date.js');

    // 2026-03-31 23:59:59 IST = 2026-03-31T18:29:59Z -> FY 2526
    expect(getIndianFinancialYearCode('2026-03-31T18:29:59.000Z')).toBe('2526');

    // 2026-04-01 00:00:01 IST = 2026-03-31T18:30:01Z -> FY 2627
    expect(getIndianFinancialYearCode('2026-03-31T18:30:01.000Z')).toBe('2627');
  });

  it('orders receive sequential FY receipt numbers, exact tax snapshot, and require void reason on cancel', async () => {
    // 1. Set vendor to regular 5% GST
    const profRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        taxMode: 'regular',
        gstin: '36AABCU9603R1ZM',
        gstRateBps: 500,
      },
    });
    expect(profRes.statusCode).toBe(200);

    // 2. Punch order 1 (qty 1 @ 101 paise -> cgst=2, sgst=3, total=106)
    const ord1 = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: dishId, quantity: 1 }],
        paymentMethod: 'cash',
      },
    });
    expect(ord1.statusCode).toBe(201);
    const o1 = ord1.json().order;
    expect(o1.subtotalPaise).toBe(101);
    expect(o1.cgstPaise).toBe(2);
    expect(o1.sgstPaise).toBe(3);
    expect(o1.totalPaise).toBe(106);
    expect(o1.taxModeSnapshot).toBe('regular');
    expect(o1.receiptNumber).toMatch(/^FS-\d{4}-0001$/);

    // 3. Punch order 2 -> sequential receipt number -0002
    const ord2 = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: {
        items: [{ menuItemId: dishId, quantity: 2 }],
        paymentMethod: 'upi',
      },
    });
    expect(ord2.statusCode).toBe(201);
    const o2 = ord2.json().order;
    expect(o2.receiptNumber).toMatch(/^FS-\d{4}-0002$/);

    // 4. Reject cancelling order without reason (or < 3 chars)
    const badCancel1 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${o1.id}/status`,
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: { status: 'cancelled' },
    });
    expect(badCancel1.statusCode).toBe(400);

    const badCancel2 = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${o1.id}/status`,
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: { status: 'cancelled', reason: 'no' },
    });
    expect(badCancel2.statusCode).toBe(400);

    // 5. Cancel with valid reason persists cancelReason
    const goodCancel = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${o1.id}/status`,
      headers: {
        authorization: `Bearer ${vendorToken}`,
        'X-FROSE-CSRF': '1',
        origin: 'http://localhost:3100',
      },
      payload: { status: 'cancelled', reason: 'Customer changed order' },
    });
    expect(goodCancel.statusCode).toBe(200);
    expect(goodCancel.json().cancelReason).toBe('Customer changed order');

    const getOrd = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${o1.id}`,
      headers: { authorization: `Bearer ${vendorToken}` },
    });
    expect(getOrd.statusCode).toBe(200);
    expect(getOrd.json().order.cancelReason).toBe('Customer changed order');
  });
});
