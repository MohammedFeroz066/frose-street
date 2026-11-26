import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { withTenantContext } from '../../server/src/db/rls-context.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
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

const TEST_DB_NAME = 'frose_street_test_phase3';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('IND-01 & IND-02 PG16: Tax Modes, Atomic FY Receipts, Void Reasons & RLS as app_user', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let ownerKysely: Kysely<Database>;
  let appKysely: Kysely<Database>;

  let tenantAId: string;
  let tenantBId: string;
  let dishAId: string;

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
            phone: '9000002001',
            business_name: 'PG Tax Stall A',
            owner_name: 'Owner A',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: getIstDateString(),
            tax_mode: 'unregistered',
            gst_rate_bps: 0,
          })
          .execute();
        const item = await trx
          .insertInto('menu_items')
          .values({
            vendor_id: tenantAId,
            name: 'Odd Paise Chai',
            price_paise: 101n,
            category: 'Tea',
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
            phone: '9000002002',
            business_name: 'PG Tax Stall B',
            owner_name: 'Owner B',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: getIstDateString(),
            tax_mode: 'unregistered',
            gst_rate_bps: 0,
          })
          .execute();
      },
      appKysely,
    );
  });

  afterAll(async () => {
    await closeDatabase().catch(() => {});
    await appKysely?.destroy().catch(() => {});
    await ownerKysely?.destroy().catch(() => {});
    process.env.USE_MEMORY_DB = prevUseMemoryDb;
    if (prevDbUrl !== undefined) process.env.DATABASE_URL = prevDbUrl;
    if (prevAppUserPwd !== undefined) process.env.APP_USER_PASSWORD = prevAppUserPwd;
  });

  it('persists compliance fields, enforces RLS isolation on profile update, computes all 3 tax modes, generates sequential FY receipts, and persists void reason in PG16', async () => {
    // 1. Unregistered order (#1, 0 tax)
    const ordUnreg = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.createOrder(trx, tenantAId, {
          items: [{ menuItemId: dishAId, quantity: 1 }],
          paymentMethod: 'cash',
        }),
      appKysely,
    );
    expect(ordUnreg.subtotalPaise).toBe(101);
    expect(ordUnreg.cgstPaise).toBe(0);
    expect(ordUnreg.sgstPaise).toBe(0);
    expect(ordUnreg.totalPaise).toBe(101);
    expect(ordUnreg.taxModeSnapshot).toBe('unregistered');
    expect(ordUnreg.receiptNumber).toMatch(/^FS-\d{4}-0001$/);

    // 2. Update Tenant A to regular 5% GST as app_user
    const updatedRegular = await withTenantContext(
      tenantAId,
      (trx) =>
        AuthService.updateVendorProfile(trx, tenantAId, {
          taxMode: 'regular',
          gstin: '36aabcu9603r1zm',
          fssaiNumber: '23626001000123',
          gstRateBps: 500,
          stallAddress: 'Lane 2, Charminar, Hyderabad',
        }),
      appKysely,
    );
    expect(updatedRegular.gstin).toBe('36AABCU9603R1ZM');
    expect(updatedRegular.fssai_number).toBe('23626001000123');
    expect(updatedRegular.gst_rate_bps).toBe(500);

    // RLS check: Tenant B context cannot update Tenant A
    await expect(
      withTenantContext(
        tenantBId,
        (trx) =>
          AuthService.updateVendorProfile(trx, tenantAId, {
            businessName: 'Hijacked',
          }),
        appKysely,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    // 3. Regular order (odd paise 101 @ 5% -> 2 + 3 = 5 tax, total 106; sequential receipt -0002)
    const ordReg = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.createOrder(trx, tenantAId, {
          items: [{ menuItemId: dishAId, quantity: 1 }],
          paymentMethod: 'upi',
        }),
      appKysely,
    );
    expect(ordReg.subtotalPaise).toBe(101);
    expect(ordReg.cgstPaise).toBe(2);
    expect(ordReg.sgstPaise).toBe(3);
    expect(ordReg.totalPaise).toBe(106);
    expect(ordReg.taxModeSnapshot).toBe('regular');
    expect(ordReg.receiptNumber).toMatch(/^FS-\d{4}-0002$/);

    // 4. Composition order (0 tax; sequential receipt -0003)
    await withTenantContext(
      tenantAId,
      (trx) =>
        AuthService.updateVendorProfile(trx, tenantAId, {
          taxMode: 'composition',
          gstin: '36AABCU9603R1ZM',
        }),
      appKysely,
    );
    const ordComp = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.createOrder(trx, tenantAId, {
          items: [{ menuItemId: dishAId, quantity: 1 }],
          paymentMethod: 'cash',
        }),
      appKysely,
    );
    expect(ordComp.subtotalPaise).toBe(101);
    expect(ordComp.cgstPaise).toBe(0);
    expect(ordComp.sgstPaise).toBe(0);
    expect(ordComp.totalPaise).toBe(101);
    expect(ordComp.taxModeSnapshot).toBe('composition');
    expect(ordComp.receiptNumber).toMatch(/^FS-\d{4}-0003$/);

    // 5. Void order with reason and verify persistence in PG16
    const voidRes = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.updateOrderStatus(
          trx,
          tenantAId,
          ordComp.id,
          'cancelled',
          'owner',
          'Wrong item punched',
        ),
      appKysely,
    );
    expect(voidRes.newStatus).toBe('cancelled');
    expect(voidRes.cancelReason).toBe('Wrong item punched');

    const fetched = await withTenantContext(
      tenantAId,
      (trx) => OrderService.getOrderById(trx, tenantAId, ordComp.id),
      appKysely,
    );
    expect(fetched.orderStatus).toBe('cancelled');
    expect(fetched.cancelReason).toBe('Wrong item punched');
  });
});
