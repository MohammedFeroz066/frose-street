import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { withTenantContext } from '../../server/src/db/rls-context.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { MenuService } from '../../server/src/modules/menu/menu.service.js';
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

const TEST_DB_NAME = 'frose_street_test_vendor_overhaul';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('VENDOR-06 PG16: Persistent UPI Profile, Dietary Presets & Z-Report Counted Cash under app_user RLS', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let ownerKysely: Kysely<Database>;
  let appKysely: Kysely<Database>;
  let vendorAId: string;
  let vendorBId: string;

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

    vendorAId = crypto.randomUUID();
    vendorBId = crypto.randomUUID();

    for (const [id, phone, name] of [
      [vendorAId, '9100001001', 'PG Overhaul Stall A'],
      [vendorBId, '9100001002', 'PG Overhaul Stall B'],
    ] as const) {
      await withTenantContext(
        id,
        async (trx) => {
          await trx
            .insertInto('vendors')
            .values({
              id,
              phone,
              password_hash: 'hashed-pw',
              business_name: name,
              owner_name: 'PG Tester',
              business_type: 'biryani_counter',
              edition: 'cloud',
              subscription_status: 'active',
              daily_token_counter: 0,
              token_reset_date: '2026-11-28',
              tax_mode: 'unregistered',
              gst_rate_bps: 0,
              is_superadmin: false,
            })
            .execute();
        },
        appKysely,
      );
    }
  }, 40000);

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
  }, 20000);

  it('persists vendor upi_id & payee_name, seeds accurate non-veg presets, and persists counted_cash_paise with RLS isolation', async () => {
    const updatedProfile = await withTenantContext(
      vendorAId,
      (trx) =>
        AuthService.updateVendorProfile(trx, vendorAId, {
          upiId: 'stall-a@oksbi',
          payeeName: 'Stall A Counter',
        }),
      appKysely,
    );
    expect(updatedProfile.upi_id).toBe('stall-a@oksbi');
    expect(updatedProfile.payee_name).toBe('Stall A Counter');

    const vendorAProfile = await withTenantContext(
      vendorAId,
      (trx) =>
        trx
          .selectFrom('vendors')
          .select(['id', 'upi_id', 'payee_name'])
          .where('id', '=', vendorAId)
          .executeTakeFirst(),
      appKysely,
    );
    expect(vendorAProfile?.upi_id).toBe('stall-a@oksbi');
    expect(vendorAProfile?.payee_name).toBe('Stall A Counter');

    // Cross-tenant RLS prevents vendor B from seeing vendor A profile
    const crossRead = await withTenantContext(
      vendorBId,
      (trx) => trx.selectFrom('vendors').select(['id', 'upi_id']).where('id', '=', vendorAId).executeTakeFirst(),
      appKysely,
    );
    expect(crossRead).toBeUndefined();

    // Presets persist is_veg = false on non-veg dishes
    await withTenantContext(
      vendorAId,
      (trx) => MenuService.seedPresets(trx, vendorAId, 'momos_chinese'),
      appKysely,
    );
    const items = await withTenantContext(
      vendorAId,
      (trx) => MenuService.getMenuItems(trx, vendorAId),
      appKysely,
    );
    const chickenItem = items.find((i) => i.name.toLowerCase().includes('chicken'));
    const raitaOrVeg = items.find((i) => !/chicken|mutton|egg|fish|shawarma/i.test(i.name));
    expect(chickenItem?.isVeg).toBe(false);
    if (raitaOrVeg) {
      expect(raitaOrVeg.isVeg).toBe(true);
    }

    // Z-Report closeDay persists counted_cash_paise BIGINT & calculates variance
    const closeRes = await withTenantContext(
      vendorAId,
      (trx) =>
        GallaService.closeFiscalDay(trx, vendorAId, {
          countedCashPaise: 45000,
          notes: 'PG16 verification',
        }),
      appKysely,
    );
    expect(closeRes.summary.countedCashPaise).toBe(45000);
    expect(closeRes.summary.variancePaise).toBe(45000);
  });
});
