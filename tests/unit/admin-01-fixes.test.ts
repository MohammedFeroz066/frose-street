import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { loadConfig } from '../../server/src/config/env.js';
import { memoryVendors, memoryOrders } from '../../server/src/db/memory-db.js';
import { AdminService } from '../../server/src/modules/admin/admin.service.js';
import { getDatabase } from '../../server/src/db/database.js';

describe('ADMIN-01: Date Serialization, Superadmin/Cancelled Analytics & Client Cleanup', () => {
  let app: FastifyInstance;
  let config: ReturnType<typeof loadConfig>;
  let superadminToken: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp();
    await app.ready();
    config = loadConfig();

    superadminToken = signJwt(
      {
        sub: 'v-superadmin-test-01',
        phone: '9999990001',
        businessName: 'FROSE Enterprise HQ',
        role: 'superadmin',
        edition: 'cloud',
      },
      config.JWT_SECRET,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('serializes Postgres Date instances in /api/v1/admin/vendors as valid ISO strings, never {}', async () => {
    const vendorId = 'v-date-test-01';
    const expDate = new Date('2026-12-31T12:00:00.000Z');
    const createdDate = new Date('2026-01-15T08:30:00.000Z');
    const updatedDate = new Date('2026-11-20T10:15:00.000Z');

    memoryVendors.set(vendorId, {
      id: vendorId,
      phone: '9876500011',
      business_name: 'Date Test Stall',
      owner_name: 'Date Owner',
      business_type: 'Street Food Stall',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      subscription_expires_at: expDate,
      is_superadmin: false,
      created_at: createdDate,
      updated_at: updatedDate,
    });

    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/vendors',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const json = res.json();
      const found = json.data.find((v: any) => v.id === vendorId);
      expect(found).toBeDefined();
      expect(typeof found.subscriptionExpiresAt).toBe('string');
      expect(found.subscriptionExpiresAt).toBe(expDate.toISOString());
      expect(typeof found.createdAt).toBe('string');
      expect(found.createdAt).toBe(createdDate.toISOString());
      expect(typeof found.lastActivePing).toBe('string');
      expect(found.lastActivePing).toBe(updatedDate.toISOString());
    } finally {
      memoryVendors.delete(vendorId);
    }
  });

  it('excludes is_superadmin=true vendors from getAnalytics leaderboard and excludes cancelled orders', async () => {
    const saId = 'v-sa-analytics-01';
    const stallId = 'v-stall-analytics-01';
    const validOrderId = 'ord-valid-analytics-01';
    const cancelledOrderId = 'ord-cancel-analytics-01';

    memoryVendors.set(saId, {
      id: saId,
      phone: '9999990099',
      business_name: 'Hidden Superadmin HQ',
      owner_name: 'Root Admin',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      is_superadmin: true,
      created_at: new Date().toISOString(),
    });

    memoryVendors.set(stallId, {
      id: stallId,
      phone: '9888800022',
      business_name: 'Real Chai Stall',
      owner_name: 'Chai Owner',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      is_superadmin: false,
      created_at: new Date().toISOString(),
    });

    memoryOrders.set(validOrderId, {
      id: validOrderId,
      vendor_id: stallId,
      token_no: 1,
      total_paise: 15000n,
      payment_method: 'upi',
      payment_status: 'paid',
      order_status: 'served',
      created_at: new Date().toISOString(),
    });

    memoryOrders.set(cancelledOrderId, {
      id: cancelledOrderId,
      vendor_id: stallId,
      token_no: 2,
      total_paise: 50000n,
      payment_method: 'cash',
      payment_status: 'paid',
      order_status: 'cancelled',
      created_at: new Date().toISOString(),
    });

    try {
      const db = getDatabase();
      const analytics = await AdminService.getAnalytics(db);
      expect(analytics.leaderboard.some((v) => v.id === saId)).toBe(false);
      const stallEntry = analytics.leaderboard.find((v) => v.id === stallId);
      expect(stallEntry).toBeDefined();
      expect(stallEntry!.totalOrders).toBe(1);
      expect(stallEntry!.salesPaise).toBe('15000');

      const overview = await AdminService.getOverview(db);
      expect(BigInt(overview.grossSalesPaise)).toBe(BigInt(analytics.grossSalesPaise));
    } finally {
      memoryVendors.delete(saId);
      memoryVendors.delete(stallId);
      memoryOrders.delete(validOrderId);
      memoryOrders.delete(cancelledOrderId);
    }
  });

  it('removes dead client/js/admin.js, &pwd= URL leak, hardcoded UPI VPA, and broken handlers', () => {
    const clientDir = path.resolve(process.cwd(), 'client');
    expect(fs.existsSync(path.join(clientDir, 'js/admin.js'))).toBe(false);

    const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');
    const adminPageJs = fs.readFileSync(path.join(clientDir, 'js/admin-page.js'), 'utf8');

    expect(adminHtml).not.toContain('frosestall@okaxis');
    expect(adminPageJs).not.toContain('frosestall@okaxis');
    expect(adminPageJs).not.toContain('&pwd=');
    expect(adminPageJs).not.toContain('openStallAnalyticsModal');
    expect(adminPageJs.match(/function\s+openMenuModal\s*\(/g)?.length ?? 0).toBe(1);
  });
});
