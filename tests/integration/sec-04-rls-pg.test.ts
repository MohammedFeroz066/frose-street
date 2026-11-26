import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { verifyRuntimeDatabaseRole, closeDatabase } from '../../server/src/db/database.js';
import { withTenantContext, withSuperadminContext } from '../../server/src/db/rls-context.js';
import { buildApp } from '../../server/src/app.js';

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

const TENANT_TABLES = [
  'vendors',
  'staff',
  'menu_items',
  'orders',
  'order_items',
  'daily_summaries',
  'expenses',
  'subscriptions',
  'devices',
  'biometric_credentials',
  'refresh_tokens',
] as const;

describe('SEC-04-RLS-TESTS: Real PostgreSQL 16 Cross-Tenant RLS & Pool Isolation', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let appKysely: Kysely<Database>;
  let ownerKysely: Kysely<Database>;

  let tenantAId: string;
  let tenantBId: string;
  let menuItemAId: string;
  let menuItemBId: string;
  let orderAId: string;
  let orderBId: string;
  let expenseBId: string;

  const prevUseMemoryDb = process.env.USE_MEMORY_DB;
  const prevDbUrl = process.env.DATABASE_URL;
  const prevAppUserPwd = process.env.APP_USER_PASSWORD;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'false';
    process.env.APP_USER_PASSWORD = APP_USER_PASSWORD;
    process.env.DATABASE_URL = TEST_APP_USER_URL;

    // 1. Recreate isolated frose_street_test DB cleanly as owner role
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

    // 2. Run all migrations 001..014 from scratch on frose_street_test as owner
    ownerPool = new Pool({ connectionString: TEST_OWNER_URL, max: 5, connectionTimeoutMillis: 5000 });
    ownerKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: ownerPool }) });
    await migrateToLatest(ownerKysely);

    // 3. Open runtime pool strictly as non-superuser `app_user`
    appPool = new Pool({ connectionString: TEST_APP_USER_URL, max: 5, connectionTimeoutMillis: 5000 });
    appKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: appPool }) });

    // 4. Seed Tenant A and Tenant B rows via their own tenant contexts as `app_user`
    tenantAId = crypto.randomUUID();
    tenantBId = crypto.randomUUID();

    await withTenantContext(
      tenantAId,
      async (trx) => {
        await trx
          .insertInto('vendors')
          .values({
            id: tenantAId,
            phone: '9000000001',
            business_name: 'Tenant A Momos',
            owner_name: 'Owner A',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: new Date().toISOString().slice(0, 10),
          })
          .execute();

        const itemA = await trx
          .insertInto('menu_items')
          .values({
            vendor_id: tenantAId,
            name: 'Tenant A Dish',
            price_paise: 5000n,
            category: 'Momos',
            display_order: 1,
            is_available: true,
            is_active: true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        menuItemAId = itemA.id;

        const ordA = await trx
          .insertInto('orders')
          .values({
            vendor_id: tenantAId,
            token_no: 1,
            total_paise: 5000n,
            payment_method: 'cash',
            payment_status: 'paid',
            order_status: 'preparing',
            source: 'pos',
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        orderAId = ordA.id;

        await trx
          .insertInto('order_items')
          .values({
            order_id: orderAId,
            menu_item_id: menuItemAId,
            item_name: 'Tenant A Dish',
            quantity: 1,
            unit_price_paise: 5000n,
            line_total_paise: 5000n,
          })
          .execute();
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
            phone: '9000000002',
            business_name: 'Tenant B Chai',
            owner_name: 'Owner B',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: new Date().toISOString().slice(0, 10),
          })
          .execute();

        const itemB = await trx
          .insertInto('menu_items')
          .values({
            vendor_id: tenantBId,
            name: 'Tenant B Secret Chai',
            price_paise: 2500n,
            category: 'Tea',
            display_order: 1,
            is_available: true,
            is_active: true,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        menuItemBId = itemB.id;

        const ordB = await trx
          .insertInto('orders')
          .values({
            vendor_id: tenantBId,
            token_no: 1,
            total_paise: 2500n,
            payment_method: 'upi',
            payment_status: 'paid',
            order_status: 'preparing',
            source: 'pos',
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        orderBId = ordB.id;

        await trx
          .insertInto('order_items')
          .values({
            order_id: orderBId,
            menu_item_id: menuItemBId,
            item_name: 'Tenant B Secret Chai',
            quantity: 1,
            unit_price_paise: 2500n,
            line_total_paise: 2500n,
          })
          .execute();

        const expB = await trx
          .insertInto('expenses')
          .values({
            vendor_id: tenantBId,
            description: 'Tenant B Sugar',
            amount_paise: 1200n,
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        expenseBId = expB.id;
      },
      appKysely,
    );
  }, 30000);

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

  it('a) app_user has rolsuper=false, rolbypassrls=false, and owns 0 tenant tables', async () => {
    const roleRes = await appPool.query(
      `SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(roleRes.rows[0]).toEqual({
      current_user: 'app_user',
      rolsuper: false,
      rolbypassrls: false,
    });

    const ownerRes = await appPool.query(
      `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [TENANT_TABLES],
    );
    expect(ownerRes.rows.length).toBe(TENANT_TABLES.length);
    for (const row of ownerRes.rows) {
      expect(row.tableowner).not.toBe('app_user');
    }
  });

  it('b) every tenant table has BOTH relrowsecurity=true AND relforcerowsecurity=true in pg_class', async () => {
    const rlsRes = await appPool.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)
       ORDER BY relname`,
      [TENANT_TABLES],
    );
    expect(rlsRes.rows.length).toBe(TENANT_TABLES.length);
    for (const row of rlsRes.rows) {
      expect(row.relrowsecurity, `${row.relname} relrowsecurity`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} relforcerowsecurity`).toBe(true);
    }
  });

  it('c) fails closed: SELECT as app_user with NO tenant context returns 0 rows across all tenant tables', async () => {
    for (const tbl of TENANT_TABLES) {
      const res = await appPool.query(`SELECT COUNT(*)::int AS cnt FROM ${tbl}`);
      expect(res.rows[0].cnt, `Table ${tbl} leaked rows without tenant context`).toBe(0);
    }
  });

  it('d) cross-tenant leak checks: Tenant A SELECT/UPDATE/DELETE/INSERT cannot read or mutate Tenant B rows', async () => {
    await withTenantContext(
      tenantAId,
      async (trx) => {
        const vendors = await trx.selectFrom('vendors').selectAll().execute();
        expect(vendors.map((v) => v.id)).toEqual([tenantAId]);

        const items = await trx.selectFrom('menu_items').selectAll().execute();
        expect(items.every((i) => i.vendor_id === tenantAId)).toBe(true);
        expect(items.some((i) => i.id === menuItemBId)).toBe(false);

        const orders = await trx.selectFrom('orders').selectAll().execute();
        expect(orders.every((o) => o.vendor_id === tenantAId)).toBe(true);
        expect(orders.some((o) => o.id === orderBId)).toBe(false);

        const orderItems = await trx.selectFrom('order_items').selectAll().execute();
        expect(orderItems.every((oi) => oi.order_id === orderAId)).toBe(true);

        const expenses = await trx.selectFrom('expenses').selectAll().execute();
        expect(expenses.length).toBe(0);

        // UPDATE targeting Tenant B row must affect 0 rows
        const updRes = await sql`
          UPDATE menu_items SET name = 'HACKED' WHERE id = ${menuItemBId}::uuid
        `.execute(trx);
        expect(Number(updRes.numAffectedRows ?? 0)).toBe(0);

        // DELETE targeting Tenant B row must affect 0 rows
        const delRes = await sql`
          DELETE FROM expenses WHERE id = ${expenseBId}::uuid
        `.execute(trx);
        expect(Number(delRes.numAffectedRows ?? 0)).toBe(0);
      },
      appKysely,
    );

    // INSERT with vendor_id = Tenant B while SET LOCAL app.current_tenant_id = Tenant A MUST be rejected by RLS WITH CHECK
    await expect(
      withTenantContext(
        tenantAId,
        async (trx) => {
          await trx
            .insertInto('expenses')
            .values({
              vendor_id: tenantBId,
              description: 'Cross-tenant injection',
              amount_paise: 999n,
            })
            .execute();
        },
        appKysely,
      ),
    ).rejects.toThrow(/row-level security policy/i);

    // Confirm Tenant B rows remain untouched via Tenant B context
    await withTenantContext(
      tenantBId,
      async (trx) => {
        const itemB = await trx
          .selectFrom('menu_items')
          .select(['name'])
          .where('id', '=', menuItemBId)
          .executeTakeFirstOrThrow();
        expect(itemB.name).toBe('Tenant B Secret Chai');

        const expB = await trx
          .selectFrom('expenses')
          .select(['id'])
          .where('id', '=', expenseBId)
          .executeTakeFirst();
        expect(expB?.id).toBe(expenseBId);
      },
      appKysely,
    );
  });

  it('e) connection pool isolation: concurrent/sequential pooled transactions never leak tenant context', async () => {
    const singleConnPool = new Pool({ connectionString: TEST_APP_USER_URL, max: 1 });
    const singleKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: singleConnPool }) });

    try {
      const [resA, resB] = await Promise.all([
        withTenantContext(
          tenantAId,
          async (trx) => {
            const rows = await trx.selectFrom('vendors').select(['id']).execute();
            return rows.map((r) => r.id);
          },
          singleKysely,
        ),
        withTenantContext(
          tenantBId,
          async (trx) => {
            const rows = await trx.selectFrom('vendors').select(['id']).execute();
            return rows.map((r) => r.id);
          },
          singleKysely,
        ),
      ]);

      expect(resA).toEqual([tenantAId]);
      expect(resB).toEqual([tenantBId]);

      // After both transactions finish, the same pooled connection has ZERO leftover tenant context
      const afterRes = await singleConnPool.query(`SELECT COUNT(*)::int AS cnt FROM vendors`);
      expect(afterRes.rows[0].cnt).toBe(0);
    } finally {
      await singleKysely.destroy();
    }
  });

  it('f) startup guard rejects connecting as owner/superuser in production and accepts app_user', async () => {
    await expect(verifyRuntimeDatabaseRole(ownerKysely, 'production')).rejects.toThrow(/privileged role/i);
    await expect(verifyRuntimeDatabaseRole(appKysely, 'production')).resolves.toEqual({
      currentUser: 'app_user',
      rolsuper: false,
      rolbypassrls: false,
    });
  });

  it('g) end-to-end HTTP API flow as app_user enforces tenant isolation and superadmin access', async () => {
    await closeDatabase();
    const app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    try {
      const regA = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { phone: '9833000001', businessName: 'PG API Stall A', password: 'PgStrongPasswordA1!' },
      });
      expect(regA.statusCode).toBe(201);
      const cookieA = regA.cookies.find((c) => c.name === 'frose_access_token')!;
      const refreshA = regA.cookies.find((c) => c.name === 'frose_refresh_token')!;

      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { phone: '9833000002', businessName: 'PG API Stall B', password: 'PgStrongPasswordB1!' },
      });
      expect(regB.statusCode).toBe(201);
      const cookieB = regB.cookies.find((c) => c.name === 'frose_access_token')!;

      // Vendor A creates menu item and order
      const itemA = await app.inject({
        method: 'POST',
        url: '/api/v1/menu',
        headers: { cookie: `${cookieA.name}=${cookieA.value}`, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { name: 'PG Samosa', pricePaise: 3000, category: 'Snacks' },
      });
      expect(itemA.statusCode).toBe(201);
      const itemAId = itemA.json().item.id;

      const orderA = await app.inject({
        method: 'POST',
        url: '/api/v1/orders',
        headers: { cookie: `${cookieA.name}=${cookieA.value}`, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { items: [{ menuItemId: itemAId, quantity: 2 }], paymentMethod: 'cash' },
      });
      expect(orderA.statusCode).toBe(201);

      // Vendor B sees 0 items and 0 orders from Vendor A
      const menuB = await app.inject({
        method: 'GET',
        url: '/api/v1/menu',
        headers: { cookie: `${cookieB.name}=${cookieB.value}` },
      });
      expect(menuB.statusCode).toBe(200);
      expect(menuB.json().items).toEqual([]);

      const liveB = await app.inject({
        method: 'GET',
        url: '/api/v1/orders/live',
        headers: { cookie: `${cookieB.name}=${cookieB.value}` },
      });
      expect(liveB.statusCode).toBe(200);
      expect(liveB.json().totalActive).toBe(0);

      // Refresh rotation works as app_user via SECURITY DEFINER lookup + SET LOCAL
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { cookie: `${refreshA.name}=${refreshA.value}`, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      });
      expect(refreshRes.statusCode).toBe(200);

      // Superadmin context can list all vendors
      const adminList = await withSuperadminContext((trx) => trx.selectFrom('vendors').select(['id']).execute(), appKysely);
      expect(adminList.length).toBeGreaterThanOrEqual(4);
    } finally {
      await app.close();
      await closeDatabase();
    }
  });
});
