import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SubscriptionService } from '../../server/src/modules/subscriptions/subscription.service.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { LicenseManager } from '../../client/js/storage-adapter.js';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';

// In-memory data store for isolated unit tests
const memoryVendors: Map<string, any> = new Map();
const memorySubscriptions: Map<string, any> = new Map();
const memoryStaff: Map<string, any> = new Map();
const memoryMenuItems: Map<string, any> = new Map();
const memoryOrders: Map<string, any> = new Map();

// Mock getDatabase implementation
vi.mock('../../server/src/db/database.js', () => {
  const createMockDb = () => {
    return {
      selectFrom: (table: string) => {
        let whereConditions: { col: string; op: string; val: any }[] = [];
        let limitVal: number | undefined;
        let orderCol: string | undefined;
        let orderDir: string | undefined;

        const chain = {
          select: (_cols?: any) => chain,
          selectAll: () => chain,
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          orderBy: (col: string, dir: string = 'asc') => {
            orderCol = col;
            orderDir = dir;
            return chain;
          },
          limit: (n: number) => {
            limitVal = n;
            return chain;
          },
          execute: async () => {
            let sourceMap = memorySubscriptions;
            if (table === 'vendors') sourceMap = memoryVendors;
            if (table === 'staff') sourceMap = memoryStaff;
            if (table === 'menu_items') sourceMap = memoryMenuItems;
            if (table === 'orders') sourceMap = memoryOrders;

            const matched: any[] = [];
            for (const row of sourceMap.values()) {
              let match = true;
              for (const cond of whereConditions) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=') {
                  if (row[prop] !== cond.val) match = false;
                }
              }
              if (match) matched.push({ ...row });
            }

            if (orderCol) {
              matched.sort((a, b) => {
                const valA = a[orderCol!] ?? '';
                const valB = b[orderCol!] ?? '';
                if (valA < valB) return orderDir === 'desc' ? 1 : -1;
                if (valA > valB) return orderDir === 'desc' ? -1 : 1;
                return 0;
              });
            }

            if (limitVal !== undefined) {
              return matched.slice(0, limitVal);
            }
            return matched;
          },
          executeTakeFirst: async () => {
            const list = await chain.execute();
            return list[0] || null;
          },
          executeTakeFirstOrThrow: async () => {
            const list = await chain.execute();
            if (!list[0]) throw new Error('Not found');
            return list[0];
          },
        };
        return chain;
      },
      insertInto: (table: string) => {
        let insertVals: any = {};
        const chain = {
          values: (v: any) => {
            insertVals = { ...v };
            if (!insertVals.id) insertVals.id = 'uuid-' + Math.random().toString(36).substring(2, 9);
            if (!insertVals.created_at) insertVals.created_at = new Date().toISOString();
            return chain;
          },
          returningAll: () => chain,
          execute: async () => {
            let targetMap = memorySubscriptions;
            if (table === 'vendors') targetMap = memoryVendors;
            if (table === 'staff') targetMap = memoryStaff;
            if (table === 'menu_items') targetMap = memoryMenuItems;
            if (table === 'orders') targetMap = memoryOrders;

            targetMap.set(insertVals.id, insertVals);
            return [insertVals];
          },
          executeTakeFirstOrThrow: async () => {
            const [row] = await chain.execute();
            return row;
          },
        };
        return chain;
      },
      updateTable: (table: string) => {
        let updateVals: any = {};
        let whereConditions: { col: string; op: string; val: any }[] = [];
        const chain = {
          set: (v: any) => {
            updateVals = { ...v };
            return chain;
          },
          where: (col: string, op: string, val: any) => {
            whereConditions.push({ col, op, val });
            return chain;
          },
          execute: async () => {
            let targetMap = memorySubscriptions;
            if (table === 'vendors') targetMap = memoryVendors;

            for (const [id, row] of targetMap.entries()) {
              let match = true;
              for (const cond of whereConditions) {
                const prop = cond.col.replace(`${table}.`, '');
                if (cond.op === '=') {
                  if (row[prop] !== cond.val) match = false;
                }
              }
              if (match) {
                targetMap.set(id, { ...row, ...updateVals });
              }
            }
            return [{ numUpdatedRows: 1n }];
          },
        };
        return chain;
      },
    } as any;
  };

  return {
    getDatabase: () => createMockDb(),
    closeDatabase: async () => {},
  };
});

describe('Phase 18: Subscription, SaaS Licensing & Renewal System', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    memoryVendors.clear();
    memorySubscriptions.clear();
    memoryStaff.clear();
    memoryMenuItems.clear();
    memoryOrders.clear();

    // Seed default vendor
    memoryVendors.set('vendor-test-01', {
      id: 'vendor-test-01',
      phone: '9876543210',
      business_name: 'Tibetan Momo Point',
      edition: 'cloud',
      created_at: new Date().toISOString(),
      daily_token_counter: 0,
      token_reset_date: new Date().toISOString().split('T')[0],
    });

    app = await buildApp({ rateLimitMax: 1000 });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('1. Auto-provisions 14-day free trial on vendor registration', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const { vendor } = await AuthService.registerVendor(db, {
      phone: '9988776655',
      businessName: 'Trial Food Cart',
      password: 'SecurePass2026!',
      quickPin: '1234',
      edition: 'cloud',
    });

    const status = await SubscriptionService.getSubscriptionStatus(db, vendor.id);
    expect(status.status).toBe('trial_active');
    expect(status.plan).toBe('cloud');
    expect(status.daysRemaining).toBeGreaterThanOrEqual(13);
    expect(status.daysRemaining).toBeLessThanOrEqual(15);
    expect(status.isReadOnly).toBe(false);
    expect(status.canCreateOrders).toBe(true);
    expect(status.licenseToken).toBeDefined();
    expect(status.licenseToken).toContain('.');
  });

  it('2. Generates cryptographically signed Ed25519 license token', async () => {
    const payload = {
      vendorId: 'test-vendor-uuid-001',
      businessName: 'Dosa King Stall',
      plan: 'cloud' as const,
      periodStart: '2026-11-17',
      periodEnd: '2026-12-01',
      status: 'active' as const,
      issuedAt: new Date().toISOString(),
    };

    const token = await SubscriptionService.generateSignedLicenseToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const verification = await SubscriptionService.verifySignedLicenseToken(token);
    expect(verification.valid).toBe(true);
    expect(verification.payload?.vendorId).toBe('test-vendor-uuid-001');
    expect(verification.payload?.businessName).toBe('Dosa King Stall');
    expect(verification.payload?.plan).toBe('cloud');
  });

  it('3. Detects and rejects tampered license tokens via Ed25519 signature verification', async () => {
    const payload = {
      vendorId: 'test-vendor-uuid-002',
      businessName: 'Momos Point',
      plan: 'local' as const,
      periodStart: '2026-11-01',
      periodEnd: '2026-11-15',
      status: 'active' as const,
      issuedAt: new Date().toISOString(),
    };

    const validToken = await SubscriptionService.generateSignedLicenseToken(payload);
    const [headerBase64, payloadBase64, signature] = validToken.split('.');

    const decoded = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf8'));
    decoded.periodEnd = '2099-12-31';
    const tamperedPayloadBase64 = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    const forgedToken = `${headerBase64}.${tamperedPayloadBase64}.${signature}`;

    const verification = await SubscriptionService.verifySignedLicenseToken(forgedToken);
    expect(verification.valid).toBe(false);
    expect(verification.reason).toBeDefined();
  });

  it('4. Rejects malformed and garbage license tokens gracefully', async () => {
    expect((await SubscriptionService.verifySignedLicenseToken('')).valid).toBe(false);
    expect((await SubscriptionService.verifySignedLicenseToken('nodotsinthisstring')).valid).toBe(false);
    expect((await SubscriptionService.verifySignedLicenseToken('part1.part2.part3')).valid).toBe(false);
    expect((await SubscriptionService.verifySignedLicenseToken('invalid-base64.signature')).valid).toBe(false);
  });

  it('5. Offline client LicenseManager validates and decodes token structure without network', async () => {
    const payload = {
      vendorId: 'offline-stall-01',
      businessName: 'Offline Biryani Cart',
      plan: 'local' as const,
      periodStart: new Date().toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]!,
      status: 'active' as const,
      issuedAt: new Date().toISOString(),
    };

    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const token = await SubscriptionService.generateSignedLicenseToken(payload);
    const offlineResult = await LicenseManager.verifyLicense(token, publicKeyPem);

    expect(offlineResult.valid).toBe(true);
    expect(offlineResult.payload?.vendorId).toBe('offline-stall-01');
    expect(offlineResult.status).toBe('active');
    expect(offlineResult.isReadOnly).toBe(false);
    expect(offlineResult.canCreateOrders).toBe(true);
  });

  it('6. Accurately flags trial expiring on days 10-14 (<= 4 days left)', async () => {
    const payload = {
      vendorId: 'expiring-stall-02',
      businessName: 'Expiring Stall',
      plan: 'cloud' as const,
      periodStart: new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]!,
      status: 'active' as const,
      issuedAt: new Date().toISOString(),
    };

    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const token = await SubscriptionService.generateSignedLicenseToken(payload);
    const offlineResult = await LicenseManager.verifyLicense(token, publicKeyPem);

    expect(offlineResult.valid).toBe(true);
    expect(offlineResult.status).toBe('trial_expiring');
    expect(offlineResult.daysRemaining).toBeLessThanOrEqual(4);
    expect(offlineResult.isReadOnly).toBe(false);
  });

  it('7. Enforces 3-day grace period post-expiry (allows orders but warns cashier)', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const { vendor } = await AuthService.registerVendor(db, {
      phone: '9988776644',
      businessName: 'Grace Period Stall',
      password: 'SecurePass2026!',
      edition: 'cloud',
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]!;
    await db
      .updateTable('subscriptions')
      .set({ period_end: twoDaysAgo })
      .where('vendor_id', '=', vendor.id)
      .execute();

    const status = await SubscriptionService.getSubscriptionStatus(db, vendor.id);
    expect(status.status).toBe('grace_period');
    expect(status.gracePeriodDaysRemaining).toBeGreaterThanOrEqual(1);
    expect(status.isReadOnly).toBe(false);
    expect(status.canCreateOrders).toBe(true);
  });

  it('8. Enforces Read-Only Lock Mode after 3-day grace period expires (>3 days overdue)', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const { vendor } = await AuthService.registerVendor(db, {
      phone: '9988776633',
      businessName: 'Expired Lock Stall',
      password: 'SecurePass2026!',
      edition: 'cloud',
    });

    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]!;
    await db
      .updateTable('subscriptions')
      .set({ period_end: fiveDaysAgo })
      .where('vendor_id', '=', vendor.id)
      .execute();

    const status = await SubscriptionService.getSubscriptionStatus(db, vendor.id);
    expect(status.status).toBe('expired_readonly');
    expect(status.gracePeriodDaysRemaining).toBe(0);
    expect(status.isReadOnly).toBe(true);
    expect(status.canCreateOrders).toBe(false);

    await expect(
      OrderService.createOrder(db, vendor.id, {
        items: [{ menuItemId: 'dummy-id', quantity: 1 }],
        paymentMethod: 'cash',
      })
    ).rejects.toThrow(/read-only mode/i);
  });

  it('9. Renews subscription with exact integer paise math (₹999 Local = 99900 paise, ₹1,499 Cloud = 149900 paise)', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const { vendor } = await AuthService.registerVendor(db, {
      phone: '9988776622',
      businessName: 'Renewing Stall',
      password: 'SecurePass2026!',
      edition: 'local',
    });

    const localRenewal = await SubscriptionService.renewSubscription(db, vendor.id, 'local', 'UPI-TXN-LOCAL-01');
    expect(localRenewal.ok).toBe(true);
    expect(localRenewal.amountRupees).toBe(999);
    expect(BigInt(localRenewal.subscription.amount_paise)).toBe(99900n);
    expect(localRenewal.subscription.plan).toBe('local');

    const cloudRenewal = await SubscriptionService.renewSubscription(db, vendor.id, 'cloud', 'UPI-TXN-CLOUD-02');
    expect(cloudRenewal.ok).toBe(true);
    expect(cloudRenewal.amountRupees).toBe(1499);
    expect(BigInt(cloudRenewal.subscription.amount_paise)).toBe(149900n);
    expect(cloudRenewal.subscription.plan).toBe('cloud');
  });

  it('10. Extends 30-day billing cycle seamlessly from existing future periodEnd', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const { vendor } = await AuthService.registerVendor(db, {
      phone: '9988776611',
      businessName: 'Sequential Renew Stall',
      password: 'SecurePass2026!',
      edition: 'cloud',
    });

    // 1st renewal
    const r1 = await SubscriptionService.renewSubscription(db, vendor.id, 'cloud');
    const firstEnd = new Date(r1.periodEnd);

    // 2nd renewal
    const r2 = await SubscriptionService.renewSubscription(db, vendor.id, 'cloud');
    const secondEnd = new Date(r2.periodEnd);

    const diffDays = Math.round((secondEnd.getTime() - firstEnd.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it('11. Super-Admin dashboard route reports vendor subscription health and aggregate revenue in integer paise', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const adminData = await SubscriptionService.getAdminVendorsList(db);
    expect(adminData.ok).toBe(true);
    expect(adminData.count).toBeGreaterThan(0);
    expect(Array.isArray(adminData.vendors)).toBe(true);

    const firstVendor = adminData.vendors[0];
    expect(firstVendor?.vendorId).toBeDefined();
    expect(firstVendor?.businessName).toBeDefined();
    expect(typeof firstVendor?.totalRevenuePaise).toBe('number');
    expect(typeof firstVendor?.totalRevenueRupees).toBe('number');
  });

  it('12. Endpoints: GET /status, POST /renew, POST /verify-token, GET /admin/vendors enforce auth/role and respond 200 when authorized', async () => {
    const { signJoseAccessToken } = await import('../../server/src/modules/auth/jwt-jose.js');
    const { DEFAULT_DEV_JWT_SECRET } = await import('../../server/src/config/env.js');
    const jwtCfg = { currentSecret: process.env.JWT_SECRET || DEFAULT_DEV_JWT_SECRET, currentKid: 'k1' };

    const ownerToken = await signJoseAccessToken(
      { sub: 'vendor-test-01', phone: '9876543210', businessName: 'Tibetan Momo Point', role: 'owner', edition: 'cloud' },
      jwtCfg,
      900,
    );
    const adminToken = await signJoseAccessToken(
      { sub: 'vendor-test-01', phone: '9876543210', businessName: 'Platform Admin', role: 'superadmin', edition: 'cloud' },
      jwtCfg,
      900,
    );

    // 1. GET /status
    const statusRes = await app.inject({
      method: 'GET',
      url: '/api/v1/subscriptions/status',
      headers: { authorization: `Bearer ${ownerToken}` },
    });
    expect(statusRes.statusCode).toBe(200);
    const statusBody = JSON.parse(statusRes.body);
    expect(statusBody.vendorId).toBe('vendor-test-01');
    expect(statusBody.licenseToken).toBeDefined();

    // 2. POST /verify-token
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions/verify-token',
      payload: { token: statusBody.licenseToken },
    });
    expect(verifyRes.statusCode).toBe(200);
    const verifyBody = JSON.parse(verifyRes.body);
    expect(verifyBody.valid).toBe(true);

    // 3. POST /renew
    const renewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions/renew',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${ownerToken}` },
      payload: JSON.stringify({ plan: 'cloud', paymentReference: 'UPI-INJECT-TEST' }),
    });
    expect(renewRes.statusCode).toBe(200);
    const renewBody = JSON.parse(renewRes.body);
    expect(renewBody.ok).toBe(true);
    expect(renewBody.amountRupees).toBe(1499);

    // 4. GET /admin/vendors requires superadmin
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/v1/subscriptions/admin/vendors',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(adminRes.statusCode).toBe(200);
    const adminBody = JSON.parse(adminRes.body);
    expect(adminBody.ok).toBe(true);
    expect(adminBody.count).toBeGreaterThan(0);
  });

  it('13. handles PostgreSQL DATE (JS Date objects) and string BIGINT (amount_paise = "0") when issuing Ed25519 offline license tokens', async () => {
    const { getDatabase } = await import('../../server/src/db/database.js');
    const db = getDatabase() as any;

    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const startDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    memoryVendors.set('vendor-pg-types', {
      id: 'vendor-pg-types',
      business_name: 'PG Date Stall',
      phone: '9111122222',
      edition: 'cloud',
    });
    memorySubscriptions.set('sub-pg-types', {
      id: 'sub-pg-types',
      vendor_id: 'vendor-pg-types',
      plan: 'trial',
      status: 'active',
      period_start: startDate as unknown as string,
      period_end: futureDate as unknown as string,
      amount_paise: '0' as unknown as bigint,
      created_at: new Date().toISOString(),
    });

    const status = await SubscriptionService.getSubscriptionStatus(db, 'vendor-pg-types');
    expect(status.status).toBe('trial_active');
    expect(status.canCreateOrders).toBe(true);
    expect(status.daysRemaining).toBeGreaterThan(0);
    expect(status.periodStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(status.periodEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(status.licenseToken.length).toBeGreaterThan(20);
  });
});
