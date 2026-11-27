import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { loadConfig } from '../../server/src/config/env.js';
import { allMigrations } from '../../server/src/db/migrator.js';
import { memoryVendors, memoryRefreshTokens, memoryDevices, memoryLockouts } from '../../server/src/db/memory-db.js';

describe('ADMIN-04: Founder Operations, Migration 020 & Audit Trail', () => {
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
        sub: 'v-sa-ops-01',
        phone: '9999990002',
        businessName: 'FROSE HQ',
        role: 'superadmin',
        edition: 'cloud',
      },
      config.JWT_SECRET,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers 020_admin_audit_and_suspended migration with up() and down()', () => {
    expect(allMigrations['020_admin_audit_and_suspended']).toBeDefined();
    expect(typeof allMigrations['020_admin_audit_and_suspended'].up).toBe('function');
    expect(typeof allMigrations['020_admin_audit_and_suspended'].down).toBe('function');
  });

  it('supports GET /vendors/:id/detail, POST /vendors/:id/renew, DELETE /devices/:deviceId, POST /unlock, suspend token revocation, and GET /audit-logs', async () => {
    const vendorId = 'v-ops-stall-01';
    const deviceId = 'dev-ops-01';
    const rtId = 'rt-ops-01';
    const phone = '9876543210';

    memoryVendors.set(vendorId, {
      id: vendorId,
      phone,
      business_name: 'Ops Chai Stall',
      owner_name: 'Ops Owner',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      subscription_expires_at: new Date(Date.now() + 86400000).toISOString(),
      monthly_fee_paise: 49900,
      tax_mode: 'regular',
      gstin: '36AAAAA0000A1Z5',
      fssai_number: '12345678901234',
      is_superadmin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    memoryDevices.set(deviceId, {
      id: deviceId,
      vendor_id: vendorId,
      device_name: 'Kitchen Display 1',
      role: 'cook',
      token_hash: 'hash-dev-1',
      is_active: true,
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    memoryRefreshTokens.set(rtId, {
      id: rtId,
      vendor_id: vendorId,
      token_hash: 'hash-rt-1',
      family_id: 'fam-1',
      is_revoked: false,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
    });

    memoryLockouts.set(`acc:${phone}`, {
      id: `acc:${phone}`,
      key_type: 'account',
      key_value: phone,
      consecutive_failures: 3,
      locked_until: new Date(Date.now() + 60000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    try {
      // 1. Detail endpoint
      const detailRes = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/vendors/${vendorId}/detail`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = detailRes.json().data;
      expect(detail.vendor.id).toBe(vendorId);
      expect(detail.devices.length).toBe(1);
      expect(detail.isLocked).toBe(true);
      expect(detail.turnover).toBeDefined();

      // 2. Flexible Renew
      const renewRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/vendors/${vendorId}/renew`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: {
          days: 90,
          amountPaise: 149700,
          paymentMethod: 'upi',
          paymentReference: 'UTR-90D-TEST',
        },
      });
      expect(renewRes.statusCode).toBe(200);
      expect(renewRes.json().data.subscription.amount_paise).toBe(149700);

      // 3. Revoke Device
      const devRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/admin/vendors/${vendorId}/devices/${deviceId}`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(devRes.statusCode).toBe(200);
      expect(memoryDevices.get(deviceId)?.is_active).toBe(false);

      // 4. Unlock Lockout
      const unlockRes = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/vendors/${vendorId}/unlock`,
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(unlockRes.statusCode).toBe(200);

      // 5. Suspend with reason & revoke refresh tokens
      const suspRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/vendors/${vendorId}`,
        headers: { authorization: `Bearer ${superadminToken}` },
        payload: { subscriptionStatus: 'suspended', suspendedReason: 'Non-payment overdue' },
      });
      expect(suspRes.statusCode).toBe(200);
      expect(suspRes.json().data.subscription_status).toBe('suspended');
      expect(memoryRefreshTokens.get(rtId)?.is_revoked).toBe(true);

      // 6. Audit logs & System health
      const logsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(logsRes.statusCode).toBe(200);
      const logs = logsRes.json().data;
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.some((l: any) => l.action === 'VENDOR_RENEWED')).toBe(true);
      expect(logs.some((l: any) => l.action === 'VENDOR_SUSPENDED')).toBe(true);

      const healthRes = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/system-health',
        headers: { authorization: `Bearer ${superadminToken}` },
      });
      expect(healthRes.statusCode).toBe(200);
      const h = healthRes.json().data;
      expect(h.redis).toBeUndefined();
      expect(typeof h.database.latencyMs).toBe('number');
    } finally {
      memoryVendors.delete(vendorId);
      memoryDevices.delete(deviceId);
      memoryRefreshTokens.delete(rtId);
      memoryLockouts.delete(`acc:${phone}`);
    }
  });
});
