import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { withTenantContext } from '../../server/src/db/rls-context.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { buildApp } from '../../server/src/app.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';

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

const TEST_DB_NAME = 'frose_street_test';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('OFF-02 PG16: Idempotent Order Creation & Cross-Tenant client_order_id Isolation as app_user', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let ownerKysely: Kysely<Database>;
  let appKysely: Kysely<Database>;

  let tenantAId: string;
  let tenantBId: string;
  let dishAId: string;
  let dishBId: string;

  const prevUseMemoryDb = process.env.USE_MEMORY_DB;
  const prevDbUrl = process.env.DATABASE_URL;
  const prevAppUserPwd = process.env.APP_USER_PASSWORD;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'false';
    process.env.APP_USER_PASSWORD = APP_USER_PASSWORD;
    process.env.DATABASE_URL = TEST_APP_USER_URL;

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

    tenantAId = crypto.randomUUID();
    tenantBId = crypto.randomUUID();

    await withTenantContext(
      tenantAId,
      async (trx) => {
        await trx
          .insertInto('vendors')
          .values({
            id: tenantAId,
            phone: '9000001001',
            business_name: 'PG Idem Stall A',
            owner_name: 'Owner A',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: new Date().toISOString().slice(0, 10),
          })
          .execute();
        const item = await trx
          .insertInto('menu_items')
          .values({
            vendor_id: tenantAId,
            name: 'Idem Momos',
            price_paise: 7500n,
            category: 'Momos',
            display_order: 1,
            is_available: true,
            is_active: true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        dishAId = item.id;
      },
      appKysely,
    );

    await withTenantContext(
      tenantBId,
      async (trx) => {
        await trx
          .insertInto('vendors')
          .values({
            id: tenantBId,
            phone: '9000001002',
            business_name: 'PG Idem Stall B',
            owner_name: 'Owner B',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: new Date().toISOString().slice(0, 10),
          })
          .execute();
        const item = await trx
          .insertInto('menu_items')
          .values({
            vendor_id: tenantBId,
            name: 'Idem Chai',
            price_paise: 2000n,
            category: 'Tea',
            display_order: 1,
            is_available: true,
            is_active: true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        dishBId = item.id;
      },
      appKysely,
    );
  });

  afterAll(async () => {
    await closeDatabase();
    if (appKysely) await appKysely.destroy();
    if (ownerKysely) await ownerKysely.destroy();
    if (prevUseMemoryDb === undefined) delete process.env.USE_MEMORY_DB;
    else process.env.USE_MEMORY_DB = prevUseMemoryDb;
    if (prevDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDbUrl;
    if (prevAppUserPwd === undefined) delete process.env.APP_USER_PASSWORD;
    else process.env.APP_USER_PASSWORD = prevAppUserPwd;
  });

  it('a) duplicate POST /api/v1/orders with same clientOrderId returns original order, creates 1 PG16 row, and does not double-count Galla', async () => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const jwtConfig = getJwtKeyRotationConfig((app as any).froseConfig);
      const tokenA = await signJoseAccessToken(
        { sub: tenantAId, phone: '9000001001', businessName: 'PG Idem Stall A', role: 'owner', edition: 'cloud' },
        jwtConfig,
        900,
      );

      const clientOrderId = crypto.randomUUID();
      const payload = {
        clientOrderId,
        createdAtClient: new Date().toISOString(),
        items: [{ menuItemId: dishAId, quantity: 2 }], // 15000 paise
        paymentMethod: 'cash',
        paymentStatus: 'paid',
      };

      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { 'x-frose-csrf': '1', origin: 'http://localhost:3100' },
        cookies: { frose_access_token: tokenA },
        payload,
      });
      expect(res1.statusCode).toBe(201);
      const order1 = res1.json().order;

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { 'x-frose-csrf': '1', origin: 'http://localhost:3100' },
        cookies: { frose_access_token: tokenA },
        payload,
      });
      expect([200, 201]).toContain(res2.statusCode);
      const order2 = res2.json().order;

      expect(order2.id).toBe(order1.id);
      expect(order2.tokenNo).toBe(order1.tokenNo);

      // Verify exact PG16 row count & Galla summary
      const rows = await withTenantContext(
        tenantAId,
        (trx) => trx.selectFrom('orders').selectAll().where('client_order_id', '=', clientOrderId).execute(),
        appKysely,
      );
      expect(rows).toHaveLength(1);

      const galla = await withTenantContext(tenantAId, (trx) => GallaService.getGallaSummary(trx, tenantAId), appKysely);
      expect(galla.totalOrders).toBe(1);
      expect(galla.totalSalesPaise).toBe(15000);
    } finally {
      await app.close();
    }
  });

  it('b) two different vendors using the same clientOrderId do not collide under RLS', async () => {
    const app = await buildApp({ logger: false });
    await app.ready();
    try {
      const jwtConfig = getJwtKeyRotationConfig((app as any).froseConfig);
      const tokenA = await signJoseAccessToken(
        { sub: tenantAId, phone: '9000001001', businessName: 'PG Idem Stall A', role: 'owner', edition: 'cloud' },
        jwtConfig,
        900,
      );
      const tokenB = await signJoseAccessToken(
        { sub: tenantBId, phone: '9000001002', businessName: 'PG Idem Stall B', role: 'owner', edition: 'cloud' },
        jwtConfig,
        900,
      );

      const sharedClientOrderId = crypto.randomUUID();
      const resA = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { 'x-frose-csrf': '1', origin: 'http://localhost:3100' },
        cookies: { frose_access_token: tokenA },
        payload: { clientOrderId: sharedClientOrderId, items: [{ menuItemId: dishAId, quantity: 1 }], paymentMethod: 'cash' },
      });
      const resB = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { 'x-frose-csrf': '1', origin: 'http://localhost:3100' },
        cookies: { frose_access_token: tokenB },
        payload: { clientOrderId: sharedClientOrderId, items: [{ menuItemId: dishBId, quantity: 1 }], paymentMethod: 'upi' },
      });

      expect(resA.statusCode).toBe(201);
      expect(resB.statusCode).toBe(201);
      expect(resA.json().order.id).not.toBe(resB.json().order.id);
    } finally {
      await app.close();
    }
  });
});
