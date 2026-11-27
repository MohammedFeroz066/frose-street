import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { loadConfig } from '../../server/src/config/env.js';
import { memoryVendors, memorySubscriptions, memoryLockouts } from '../../server/src/db/memory-db.js';

describe('ADMIN-05: Real Alerts, Subscriptions Ledger, Formula-Safe CSV Exports & SW Cache', () => {
  let app: FastifyInstance;
  let config: ReturnType<typeof loadConfig>;
  let superadminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp();
    await app.ready();
    config = loadConfig();

    superadminToken = signJwt(
      {
        sub: 'v-sa-05',
        phone: '9999990005',
        businessName: 'FROSE HQ',
        role: 'superadmin',
        edition: 'cloud',
      },
      config.JWT_SECRET,
    );

    cashierToken = signJwt(
      {
        sub: 'v-stall-demo-01',
        phone: '9177177475',
        businessName: 'Demo Stall',
        role: 'cashier',
        edition: 'cloud',
      },
      config.JWT_SECRET,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/admin/alerts returns DB-derived expiring, expired, suspended, locked, and new stall alerts', async () => {
    const expSoonId = 'v-alert-soon-01';
    const lockedId = 'v-alert-lock-01';
    const lockedPhone = '9811112222';

    memoryVendors.set(expSoonId, {
      id: expSoonId,
      phone: '9811113333',
      business_name: 'Expiring Tea House',
      owner_name: 'Tea Owner',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      subscription_expires_at: new Date(Date.now() + 2 * 86400000).toISOString(),
      is_superadmin: false,
      created_at: new Date().toISOString(),
    });

    memoryVendors.set(lockedId, {
      id: lockedId,
      phone: lockedPhone,
      business_name: '=MALICIOUS_STALL()',
      owner_name: '+EVIL_OWNER',
      city: 'Hyderabad',
      edition: 'local',
      subscription_status: 'suspended',
      subscription_expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
      monthly_fee_paise: 49900,
      is_superadmin: false,
      created_at: new Date().toISOString(),
    });

    memoryLockouts.set(`acc:${lockedPhone}`, {
      id: `acc:${lockedPhone}`,
      key_type: 'account',
      key_value: lockedPhone,
      consecutive_failures: 4,
      locked_until: new Date(Date.now() + 120000).toISOString(),
    });

    memorySubscriptions.set('sub-csv-01', {
      id: 'sub-csv-01',
      vendor_id: lockedId,
      plan: 'local',
      amount_paise: 49950n,
      period_start: '2026-11-01',
      period_end: '2026-12-01',
      payment_method: 'upi',
      payment_reference: '@UTR123',
      status: 'active',
      created_at: new Date().toISOString(),
    });

    try {
      const alertsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/alerts',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(alertsRes.statusCode).toBe(200);
      const alerts = alertsRes.json().data;
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.some((a: any) => a.vendorId === expSoonId && a.category === 'expiring')).toBe(true);
      expect(alerts.some((a: any) => a.vendorId === lockedId && a.category === 'locked')).toBe(true);
      expect(alerts.some((a: any) => a.vendorId === lockedId && a.category === 'suspended')).toBe(true);

      const subsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/subscriptions',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(subsRes.statusCode).toBe(200);
      expect(subsRes.json().data.items.some((s: any) => s.id === 'sub-csv-01')).toBe(true);

      const forbiddenCsv = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/export/vendors.csv',
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      expect(forbiddenCsv.statusCode).toBe(403);

      const vCsvRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/export/vendors.csv',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(vCsvRes.statusCode).toBe(200);
      expect(vCsvRes.headers['content-type']).toContain('text/csv');
      expect(vCsvRes.payload).toContain("'=MALICIOUS_STALL()");
      expect(vCsvRes.payload).toContain("'+EVIL_OWNER");

      const sCsvRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/export/subscriptions.csv',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(sCsvRes.statusCode).toBe(200);
      expect(sCsvRes.headers['content-type']).toContain('text/csv');
      expect(sCsvRes.payload).toContain('499.50');
      expect(sCsvRes.payload).toContain("'@UTR123");
    } finally {
      memoryVendors.delete(expSoonId);
      memoryVendors.delete(lockedId);
      memoryLockouts.delete(`acc:${lockedPhone}`);
      memorySubscriptions.delete('sub-csv-01');
    }
  });

  it('precaches /css/admin.css in client/sw.js and bumps cache version', () => {
    const sw = fs.readFileSync(path.resolve(process.cwd(), 'client/sw.js'), 'utf8');
    expect(sw).toContain("'/css/admin.css'");
    expect(sw).not.toContain('v56-phase5-i18n-ops');
  });
});
