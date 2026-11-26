import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { withTenantContext } from '../../server/src/db/rls-context.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { MenuService } from '../../server/src/modules/menu/menu.service.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';
import { getIstDateString } from '../../server/src/utils/ist-date.js';

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

const TEST_DB_NAME = 'frose_street_test_phase5_exp';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('EXP-01 PG16: CA-Ready CSV Exports & Strict RLS Isolation as app_user', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let ownerKysely: Kysely<Database>;
  let appKysely: Kysely<Database>;

  let tenantAId: string;
  let tenantBId: string;
  const todayIst = getIstDateString();

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

    ownerPool = new Pool({ connectionString: TEST_OWNER_URL, connectionTimeoutMillis: 5000 });
    ownerKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: ownerPool }) });
    await migrateToLatest(ownerKysely);

    appPool = new Pool({ connectionString: TEST_APP_USER_URL, connectionTimeoutMillis: 5000 });
    appKysely = new Kysely<Database>({ dialect: new PostgresDialect({ pool: appPool }) });

    tenantAId = crypto.randomUUID();
    tenantBId = crypto.randomUUID();

    await ownerKysely
      .insertInto('vendors')
      .values([
        {
          id: tenantAId,
          phone: '9800000011',
          business_name: 'PG Export Stall A',
          owner_name: 'Owner A',
          business_type: 'Street Food Stall',
          city: 'Hyderabad',
          edition: 'cloud',
          subscription_status: 'active',
          subscription_expires_at: new Date(Date.now() + 86_400_000 * 30).toISOString(),
          daily_token_counter: 0,
          token_reset_date: todayIst,
          tax_mode: 'regular',
          gstin: '36AAAAA0000A1Z5',
        },
        {
          id: tenantBId,
          phone: '9800000012',
          business_name: 'PG Export Stall B',
          owner_name: 'Owner B',
          business_type: 'Street Food Stall',
          city: 'Chennai',
          edition: 'cloud',
          subscription_status: 'active',
          subscription_expires_at: new Date(Date.now() + 86_400_000 * 30).toISOString(),
          daily_token_counter: 0,
          token_reset_date: todayIst,
          tax_mode: 'unregistered',
        },
      ])
      .execute();

    await withTenantContext(
      tenantAId,
      async (tx) => {
        const dishA = await MenuService.createMenuItem(tx, tenantAId, {
          name: 'Dosa',
          category: 'Tiffin',
          pricePaise: 6000,
        });
        await OrderService.createOrder(tx, tenantAId, {
          items: [{ menuItemId: dishA.id, quantity: 1 }],
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          customerName: '=EVIL()',
          orderType: 'parcel',
        });
        await GallaService.logExpense(tx, tenantAId, {
          amountPaise: 6300,
          description: '+SUM(A1:A2) Oil',
          category: 'ingredients',
          paymentMethod: 'cash',
          expenseDate: todayIst,
        });
      },
      appKysely,
    );

    await withTenantContext(
      tenantBId,
      async (tx) => {
        const dishB = await MenuService.createMenuItem(tx, tenantBId, {
          name: 'Secret Stall B Dish',
          category: 'Snacks',
          pricePaise: 12000,
        });
        await OrderService.createOrder(tx, tenantBId, {
          items: [{ menuItemId: dishB.id, quantity: 1 }],
          paymentMethod: 'upi',
          paymentStatus: 'paid',
          customerName: 'TenantB_Exclusive_Customer',
        });
      },
      appKysely,
    );
  });

  afterAll(async () => {
    await closeDatabase();
    if (appKysely) await appKysely.destroy();
    if (ownerKysely) await ownerKysely.destroy();

    process.env.USE_MEMORY_DB = prevUseMemoryDb;
    process.env.DATABASE_URL = prevDbUrl;
    process.env.APP_USER_PASSWORD = prevAppUserPwd;
  });

  it('exports sales.csv and expenses.csv as app_user with exact INR formatting, formula neutralization, and zero cross-tenant leakage', async () => {
    const salesCsvA = await withTenantContext(
      tenantAId,
      (tx) => GallaService.exportSalesCsv(tx, tenantAId, todayIst, todayIst),
      appKysely,
    );
    expect(salesCsvA).toContain('60.00'); // 6000 paise subtotal
    expect(salesCsvA).toContain('63.00'); // 6000 + 5% GST = 6300 paise -> 63.00 INR
    expect(salesCsvA).toContain("'=EVIL()");
    expect(salesCsvA).not.toContain('TenantB_Exclusive_Customer');

    const expensesCsvA = await withTenantContext(
      tenantAId,
      (tx) => GallaService.exportExpensesCsv(tx, tenantAId, todayIst, todayIst),
      appKysely,
    );
    expect(expensesCsvA).toContain('63.00');
    expect(expensesCsvA).toContain("'+SUM(A1:A2) Oil");

    const salesCsvB = await withTenantContext(
      tenantBId,
      (tx) => GallaService.exportSalesCsv(tx, tenantBId, todayIst, todayIst),
      appKysely,
    );
    expect(salesCsvB).toContain('TenantB_Exclusive_Customer');
    expect(salesCsvB).not.toContain("'=EVIL()");
  });
});
