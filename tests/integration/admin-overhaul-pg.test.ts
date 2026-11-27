import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import crypto from 'node:crypto';
import { Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../../server/src/db/types.js';
import { migrateToLatest } from '../../server/src/db/migrator.js';
import { withSuperadminContext, withTenantContext } from '../../server/src/db/rls-context.js';
import { closeDatabase } from '../../server/src/db/database.js';
import { AdminService } from '../../server/src/modules/admin/admin.service.js';
import { MenuService } from '../../server/src/modules/menu/menu.service.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { RefreshTokenService } from '../../server/src/modules/auth/refresh-token.service.js';
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

const TEST_DB_NAME = 'frose_street_test_admin_overhaul';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('ADMIN-OVERHAUL PG16: Migration 020, Founder Ops, Audit RLS & CSV Safety as app_user', () => {
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
  });

  afterAll(async () => {
    await closeDatabase();
    if (appKysely) await appKysely.destroy();
    if (ownerKysely) await ownerKysely.destroy();

    process.env.USE_MEMORY_DB = prevUseMemoryDb;
    process.env.DATABASE_URL = prevDbUrl;
    process.env.APP_USER_PASSWORD = prevAppUserPwd;
  });

  it('executes full Super Admin lifecycle as app_user under RLS and isolates admin_audit_logs from tenants', async () => {
    const actor = { adminId: 'sa-pg-01', ipAddress: '127.0.0.1' };
    const created = await withSuperadminContext(
      (tx) =>
        AdminService.createVendor(
          tx,
          {
            businessName: '=PG_Formula_Stall',
            ownerName: 'PG Owner',
            phone: '9877770001',
            password: 'StrongPassword#2026',
            city: 'Hyderabad',
            edition: 'cloud',
            monthlyFeeRupees: 799,
            initialPaymentStatus: 'trial',
          },
          actor,
        ),
      appKysely,
    );

    const vendorId = created.vendor.id;
    expect(created.vendor.subscription_expires_at instanceof Date).toBe(true);

    // Seed an order, device, refresh token, and lockout for this vendor
    await withTenantContext(
      vendorId,
      async (tx) => {
        const dish = await MenuService.createMenuItem(tx, vendorId, {
          name: 'Irani Chai',
          category: 'Tea',
          pricePaise: 2500,
        });
        await OrderService.createOrder(tx, vendorId, {
          items: [{ menuItemId: dish.id, quantity: 2 }],
          paymentMethod: 'upi',
          paymentStatus: 'paid',
        });
        await RefreshTokenService.createRefreshToken(tx, vendorId);
      },
      appKysely,
    );

    const deviceId = crypto.randomUUID();
    await withSuperadminContext(async (tx) => {
      await tx
        .insertInto('devices')
        .values({
          id: deviceId,
          vendor_id: vendorId,
          device_name: 'KDS Screen 1',
          role: 'cook',
          token_hash: 'pg-dev-hash-' + deviceId,
          is_active: true,
        })
        .execute();

      await tx
        .insertInto('login_lockouts')
        .values({
          id: `acc:9877770001`,
          key_type: 'account',
          key_value: '9877770001',
          consecutive_failures: 4,
          locked_until: new Date(Date.now() + 300_000),
        })
        .execute();
    }, appKysely);

    // Inspect detail
    const detail = await withSuperadminContext((tx) => AdminService.getVendorDetail(tx, vendorId), appKysely);
    expect(detail.devices.length).toBe(1);
    expect(detail.isLocked).toBe(true);
    expect(detail.turnover.daily.totalPaise).toBe('5000');

    // Flexible Renew
    const renewed = await withSuperadminContext(
      (tx) =>
        AdminService.renewVendor(
          tx,
          vendorId,
          { days: 30, amountPaise: 79900, paymentMethod: 'upi', paymentReference: 'PG-UTR-001' },
          actor,
        ),
      appKysely,
    );
    expect(renewed.subscription.amount_paise).toBe('79900');

    // Revoke device & unlock account
    await withSuperadminContext((tx) => AdminService.revokeVendorDevice(tx, vendorId, deviceId, actor), appKysely);
    await withSuperadminContext((tx) => AdminService.unlockVendorAccount(tx, vendorId, actor), appKysely);

    // Suspend & verify refresh tokens revoked
    await withSuperadminContext(
      (tx) =>
        AdminService.updateVendor(
          tx,
          vendorId,
          { subscriptionStatus: 'suspended', suspendedReason: 'PG audit test suspension' },
          actor,
        ),
      appKysely,
    );

    const rtRows = await withSuperadminContext(
      (tx) => tx.selectFrom('refresh_tokens').selectAll().where('vendor_id', '=', vendorId).execute(),
      appKysely,
    );
    expect(rtRows.every((r) => r.is_revoked === true)).toBe(true);

    // Alerts, Subscriptions, Audit logs, CSV exports
    const alerts = await withSuperadminContext((tx) => AdminService.getAlerts(tx), appKysely);
    expect(alerts.some((a) => a.vendorId === vendorId && a.category === 'suspended')).toBe(true);

    const subs = await withSuperadminContext((tx) => AdminService.listSubscriptions(tx), appKysely);
    expect(subs.items.some((s) => s.paymentReference === 'PG-UTR-001')).toBe(true);

    const auditLogs = await withSuperadminContext((tx) => AdminService.getAuditLogs(tx, 20), appKysely);
    expect(auditLogs.some((l) => l.action === 'VENDOR_SUSPENDED')).toBe(true);
    expect(auditLogs.some((l) => l.action === 'VENDOR_RENEWED')).toBe(true);

    const vendorsCsv = await withSuperadminContext((tx) => AdminService.exportVendorsCsv(tx), appKysely);
    expect(vendorsCsv).toContain("'=PG_Formula_Stall");

    // Verify strict RLS blocks normal tenant context from reading admin_audit_logs
    const tenantAuditRead = await withTenantContext(
      vendorId,
      (tx) => tx.selectFrom('admin_audit_logs').selectAll().execute(),
      appKysely,
    );
    expect(tenantAuditRead).toEqual([]);
  });
});
