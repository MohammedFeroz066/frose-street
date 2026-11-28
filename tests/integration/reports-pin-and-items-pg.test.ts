import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { withTenantContext } from '../../server/src/db/rls-context.js';
import { buildApp } from '../../server/src/app.js';
import { LoginSecurityService } from '../../server/src/modules/auth/login-security.service.js';

const { Pool } = pg;

const OWNER_ADMIN_URL =
  process.env.TEST_PG_ADMIN_URL ||
  process.env.DATABASE_MIGRATION_URL ||
  'postgresql://frose_street_user:frose_street_secure_pass@localhost:55433/frose_street';
const APP_USER_PASSWORD = process.env.APP_USER_PASSWORD || 'frose_app_local_pass_2026';

function buildTestDbUrl(baseUrl: string, dbName: string, user?: string, password?: string): string {
  const parsed = new URL(baseUrl);
  parsed.pathname = `/${dbName}`;
  if (user) parsed.username = user;
  if (password !== undefined) parsed.password = password;
  return parsed.toString();
}

const TEST_DB_NAME = 'frose_street_test_rpts_kds';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('RPTS & KDS-ITEM PG16 Integration: Migrations 001..022, RLS, Owner PIN, PDF/DOCX & Per-Item Fulfillment', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let ownerKysely: Kysely<Database>;
  let appKysely: Kysely<Database>;

  const prevUseMemoryDb = process.env.USE_MEMORY_DB;
  const prevDbUrl = process.env.DATABASE_URL;
  const prevAppUserPwd = process.env.APP_USER_PASSWORD;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'false';
    process.env.APP_USER_PASSWORD = APP_USER_PASSWORD;
    process.env.DATABASE_URL = TEST_APP_USER_URL;
    LoginSecurityService.resetForTesting();

    const maintenancePool = new Pool({ connectionString: OWNER_ADMIN_URL, connectionTimeoutMillis: 5000 });
    try {
      await maintenancePool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [TEST_DB_NAME],
      );
      await maintenancePool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
      await maintenancePool.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    } finally {
      await maintenancePool.end();
    }

    ownerPool = new Pool({ connectionString: TEST_OWNER_URL, max: 5, connectionTimeoutMillis: 5000 });
    ownerKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: ownerPool }) });
    await migrateToLatest(ownerKysely);

    appPool = new Pool({ connectionString: TEST_APP_USER_URL, max: 5, connectionTimeoutMillis: 5000 });
    appKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: appPool }) });
  }, 45000);

  afterAll(async () => {
    try {
      await closeDatabase();
    } catch (_) {}
    if (appPool) await appPool.end().catch(() => {});
    if (ownerPool) await ownerPool.end().catch(() => {});

    const maintenancePool = new Pool({ connectionString: OWNER_ADMIN_URL, connectionTimeoutMillis: 5000 });
    try {
      await maintenancePool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [TEST_DB_NAME],
      );
      await maintenancePool.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    } finally {
      await maintenancePool.end();
    }

    if (prevUseMemoryDb === undefined) delete process.env.USE_MEMORY_DB;
    else process.env.USE_MEMORY_DB = prevUseMemoryDb;
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
    if (prevAppUserPwd === undefined) delete process.env.APP_USER_PASSWORD;
    else process.env.APP_USER_PASSWORD = prevAppUserPwd;
  }, 25000);

  it('enforces profit_adjustments RLS under app_user (NOBYPASSRLS) and verifies E2E PIN, Reports, Exports & Per-Item Fulfillment', async () => {
    const rlsRes = await appPool.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'profit_adjustments'`,
    );
    expect(rlsRes.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });

    const noCtxCount = await appPool.query(`SELECT COUNT(*)::int AS cnt FROM profit_adjustments`);
    expect(noCtxCount.rows[0].cnt).toBe(0);

    const app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    try {
      const regA = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { phone: '9877001100', businessName: 'PG Reports & KDS Stall', password: 'PgStrongPassword#1' },
      });
      expect(regA.statusCode).toBe(201);
      const vendorAId = regA.json().vendor.id;
      const cookieA = regA.cookies.find((c) => c.name === 'frose_access_token')!;
      const hdrA = { cookie: `${cookieA.name}=${cookieA.value}`, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' };

      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { phone: '9877001101', businessName: 'PG Other Stall', password: 'PgStrongPassword#2' },
      });
      expect(regB.statusCode).toBe(201);
      const vendorBId = regB.json().vendor.id;
      const cookieB = regB.cookies.find((c) => c.name === 'frose_access_token')!;
      const hdrB = { cookie: `${cookieB.name}=${cookieB.value}`, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' };

      // 1. Set & verify 4-digit Owner PIN
      const pinRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/owner-pin',
        headers: hdrA,
        payload: { pin: '2580' },
      });
      expect(pinRes.statusCode).toBe(200);

      const meA = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: hdrA.cookie } });
      expect(meA.json().hasOwnerPin).toBe(true);
      expect(meA.json().owner_pin_hash).toBeUndefined();

      // 2. Seed menu items + multi-item order + expense + profit adjustment
      const item1 = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: hdrA,
        payload: { name: 'PG Masala Dosa', pricePaise: 8000, category: 'Tiffin' },
      });
      const item2 = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: hdrA,
        payload: { name: 'PG Filter Coffee', pricePaise: 3000, category: 'Beverages' },
      });
      const orderRes = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: hdrA,
        payload: {
          items: [
            { menuItemId: item1.json().item.id, quantity: 2 },
            { menuItemId: item2.json().item.id, quantity: 1 },
          ],
          paymentMethod: 'upi',
        },
      });
      expect(orderRes.statusCode).toBe(201);
      const order = orderRes.json().order;
      expect(order.totalItems).toBe(2);

      const expRes = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/expenses',
        headers: hdrA,
        payload: { amountPaise: 4000, description: 'PG Milk', category: 'ingredients', paymentMethod: 'cash' },
      });
      const expenseId = expRes.json().expense.id;

      const patchExp = await app.inject({
        method: 'PATCH',
        url: `/api/v1/galla/expenses/${expenseId}`,
        headers: hdrA,
        payload: { amountPaise: 5000, title: 'PG Fresh Milk', ownerPin: '2580' },
      });
      expect(patchExp.statusCode).toBe(200);

      const adjRes = await app.inject({
        method: 'POST',
        url: '/api/v1/galla/profit-adjustments',
        headers: hdrA,
        payload: { amountPaise: -1000, note: 'PG Wastage', ownerPin: '2580' },
      });
      expect(adjRes.statusCode).toBe(201);

      // Cross-tenant RLS isolation on profit_adjustments & report
      const crossAdj = await withTenantContext(
        vendorBId,
        (trx) => trx.selectFrom('profit_adjustments').selectAll().execute(),
        appKysely,
      );
      expect(crossAdj.length).toBe(0);

      const repA = await app.inject({ method: 'GET', url: '/api/v1/galla/report', headers: { cookie: hdrA.cookie } });
      expect(repA.statusCode).toBe(200);
      expect(repA.json().report.grossSalesPaise).toBe(19000);
      expect(repA.json().report.totalExpensesPaise).toBe(5000);
      expect(repA.json().report.profitAdjustmentsPaise).toBe(-1000);
      expect(repA.json().report.netProfitPaise).toBe(13000);

      // 3. Export PDF and DOCX from PG16
      const pdfRes = await app.inject({
        method: 'GET',
        url: `/api/v1/galla/report/export?from=${repA.json().report.from}&to=${repA.json().report.to}&format=pdf`,
        headers: { cookie: hdrA.cookie },
      });
      expect(pdfRes.statusCode).toBe(200);
      expect(pdfRes.rawPayload.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');

      const docxRes = await app.inject({
        method: 'GET',
        url: `/api/v1/galla/report/export?from=${repA.json().report.from}&to=${repA.json().report.to}&format=docx`,
        headers: { cookie: hdrA.cookie },
      });
      expect(docxRes.statusCode).toBe(200);
      expect(docxRes.rawPayload.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
      // Verify deflate entry parses cleanly
      const nameLen = docxRes.rawPayload.readUInt16LE(26);
      const compSize = docxRes.rawPayload.readUInt32LE(18);
      const inflated = zlib.inflateRawSync(docxRes.rawPayload.subarray(30 + nameLen, 30 + nameLen + compSize)).toString('utf8');
      expect(inflated.length).toBeGreaterThan(20);

      // 4. Per-item fulfillment on PG16
      const i0 = order.items[0].id;
      const i1 = order.items[1].id;
      const k1 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${order.id}/items/${i0}/fulfillment`,
        headers: hdrA,
        payload: { stage: 'kitchen', ready: true },
      });
      expect(k1.statusCode).toBe(200);
      expect(k1.json().order.kitchenReadyCount).toBe(1);
      expect(k1.json().order.orderStatus).toBe('preparing');

      const activeA = await app.inject({ method: 'GET', url: '/api/v1/orders/active', headers: { cookie: hdrA.cookie } });
      expect(activeA.json().partialReadyQueue.length).toBe(1);

      const k2 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${order.id}/items/${i1}/fulfillment`,
        headers: hdrA,
        payload: { stage: 'kitchen', ready: true },
      });
      expect(k2.json().order.orderStatus).toBe('ready');

      await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${order.id}/items/${i0}/fulfillment`,
        headers: hdrA,
        payload: { stage: 'packaging', ready: true },
      });
      const p2 = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${order.id}/items/${i1}/fulfillment`,
        headers: hdrA,
        payload: { stage: 'packaging', ready: true },
      });
      expect(p2.json().order.orderStatus).toBe('served');

      // Cross-tenant item toggle blocked by RLS -> 404
      const crossToggle = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orders/${order.id}/items/${i0}/fulfillment`,
        headers: hdrB,
        payload: { stage: 'kitchen', ready: false },
      });
      expect(crossToggle.statusCode).toBe(404);
    } finally {
      await app.close();
      await closeDatabase();
    }
  }, 30000);
});
