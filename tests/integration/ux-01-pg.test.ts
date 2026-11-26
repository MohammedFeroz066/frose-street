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

const TEST_DB_NAME = 'frose_street_test_phase4';
const TEST_OWNER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME);
const TEST_APP_USER_URL = buildTestDbUrl(OWNER_ADMIN_URL, TEST_DB_NAME, 'app_user', APP_USER_PASSWORD);

describe('UX-01 PG16: Order Editing, Split Payments, Filtered History, Variants & RLS as app_user', () => {
  let ownerPool: pg.Pool;
  let appPool: pg.Pool;
  let ownerKysely: Kysely<Database>;
  let appKysely: Kysely<Database>;

  let tenantAId: string;
  let tenantBId: string;
  let dishVariantId: string;
  let dishChaiId: string;

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
            phone: '9000004001',
            business_name: 'PG Phase4 Stall A',
            owner_name: 'Owner A',
            business_type: 'street_food',
            edition: 'cloud',
            subscription_status: 'active',
            daily_token_counter: 0,
            token_reset_date: getIstDateString(),
            tax_mode: 'regular',
            gst_rate_bps: 500,
            gstin: '36AABCU9603R1ZM',
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
            phone: '9000004002',
            business_name: 'PG Phase4 Stall B',
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

  it('persists variants, edits orders atomically, calculates split Galla accuracy, filters history, and enforces RLS as app_user', async () => {
    const createdMenu = await withTenantContext(
      tenantAId,
      async (trx) => {
        const d1 = await MenuService.createMenuItem(trx, tenantAId, {
          name: 'Special Biryani',
          pricePaise: 11000,
          category: 'Biryani',
          isVeg: false,
          variants: [
            { name: 'Half', pricePaise: 6000 },
            { name: 'Full', pricePaise: 11000 },
          ],
        });
        const d2 = await MenuService.createMenuItem(trx, tenantAId, {
          name: 'Masala Chai',
          pricePaise: 2000,
          category: 'Tea',
          isVeg: true,
        });
        return { d1, d2 };
      },
      appKysely,
    );

    dishVariantId = createdMenu.d1.id;
    dishChaiId = createdMenu.d2.id;
    expect(createdMenu.d1.isVeg).toBe(false);
    expect(createdMenu.d1.variants).toHaveLength(2);

    // 1. Punch split order: Half Biryani (6000) + 5% GST (150+150=300) = 6300 -> Cash 2300 + UPI 4000
    const splitOrder = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.createOrder(trx, tenantAId, {
          items: [{ menuItemId: dishVariantId, quantity: 1, variantName: 'Half' }],
          paymentMethod: 'split',
          cashPaise: 2300,
          upiPaise: 4000,
        }),
      appKysely,
    );
    expect(splitOrder.totalPaise).toBe(6300);
    expect(splitOrder.cashPaise).toBe(2300);
    expect(splitOrder.upiPaise).toBe(4000);

    // 2. Edit order: 2x Full Biryani (22000) + 1x Chai (2000) = 24000 + 5% GST (600+600=1200) = 25200 -> Cash 10000 + UPI 15200
    const edited = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.updateOrder(trx, tenantAId, splitOrder.id, {
          items: [
            { menuItemId: dishVariantId, quantity: 2, variantName: 'Full' },
            { menuItemId: dishChaiId, quantity: 1 },
          ],
          paymentMethod: 'split',
          cashPaise: 10000,
          upiPaise: 15200,
          editNote: 'Changed to 2x Full + Chai',
        }),
      appKysely,
    );
    expect(edited.subtotalPaise).toBe(24000);
    expect(edited.cgstPaise).toBe(600);
    expect(edited.sgstPaise).toBe(600);
    expect(edited.totalPaise).toBe(25200);
    expect(edited.cashPaise).toBe(10000);
    expect(edited.upiPaise).toBe(15200);
    expect(edited.editNote).toBe('Changed to 2x Full + Chai');
    expect(edited.editedAt).toBeTruthy();

    // 3. Cross-tenant RLS isolation: Tenant B cannot edit Tenant A order
    await expect(
      withTenantContext(
        tenantBId,
        (trx) =>
          OrderService.updateOrder(trx, tenantBId, splitOrder.id, {
            items: [{ menuItemId: dishChaiId, quantity: 1 }],
            paymentMethod: 'cash',
          }),
        appKysely,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    // 4. Galla summary accurately separates split Cash vs UPI
    const galla = await withTenantContext(
      tenantAId,
      (trx) => GallaService.getGallaSummary(trx, tenantAId),
      appKysely,
    );
    expect(galla.totalSalesPaise).toBe(25200);
    expect(galla.cashSalesPaise).toBe(10000);
    expect(galla.upiSalesPaise).toBe(15200);

    // 5. Filtered history by search & paymentMode
    const todayIst = getIstDateString();
    const history = await withTenantContext(
      tenantAId,
      (trx) =>
        OrderService.getOrderHistory(trx, tenantAId, {
          dateFrom: todayIst,
          dateTo: todayIst,
          paymentMode: 'split',
          search: 'Chai',
        }),
      appKysely,
    );
    expect(history.count).toBe(1);
    expect(history.summary.netSalesPaise).toBe(25200);
    expect(history.summary.cashPaise).toBe(10000);
    expect(history.summary.upiPaise).toBe(15200);
  });
});
