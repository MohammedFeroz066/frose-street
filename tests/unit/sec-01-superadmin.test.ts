import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { memoryVendors } from '../../server/src/db/memory-db.js';
import { hashPassword } from '../../server/src/utils/crypto.js';
import { createAdminFromEnv } from '../../scripts/create-admin.js';

describe('SEC-01: Superadmin Authorization & Seed Removal', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('fails if v-admin-master is automatically seeded in memoryVendors', () => {
    // SEC-01 requirement: Remove seeded Feroz@123 / v-admin-master account
    expect(memoryVendors.has('v-admin-master')).toBe(false);
  });

  it('rejects superadmin role when logging in with phone 9999999999 if is_superadmin is false', async () => {
    const passwordHash = await hashPassword('ValidSecurePassword123!');
    const nonAdminVendor = {
      id: 'v-test-phone-9999999999',
      phone: '9999999999',
      business_name: 'Regular Stall',
      owner_name: 'Regular Vendor',
      business_type: 'Street Food Stall',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      subscription_expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      password_hash: passwordHash,
      is_superadmin: false,
      role: 'owner',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryVendors.set(nonAdminVendor.id, nonAdminVendor);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9999999999',
        password: 'ValidSecurePassword123!',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    // Must NOT be superadmin!
    expect(body.role).not.toBe('superadmin');
    expect(body.vendor.isSuperadmin).toBe(false);

    // Verify session cookie does not grant admin access
    const accessCookie = loginRes.cookies.find((c) => c.name === 'frose_access_token')!.value;
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      cookies: {
        frose_access_token: accessCookie,
      },
    });
    expect(adminRes.statusCode).toBe(403);
  });

  it('grants superadmin role ONLY when is_superadmin is true in the database', async () => {
    const passwordHash = await hashPassword('AdminSecurePass2026!');
    const adminVendor = {
      id: 'v-explicit-admin-01',
      phone: '9888888888',
      business_name: 'Explicit Admin HQ',
      owner_name: 'Real Admin',
      business_type: 'Platform Management',
      city: 'Hyderabad',
      edition: 'cloud',
      subscription_status: 'active',
      subscription_expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      password_hash: passwordHash,
      is_superadmin: true,
      role: 'superadmin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    memoryVendors.set(adminVendor.id, adminVendor);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9888888888',
        password: 'AdminSecurePass2026!',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.role).toBe('superadmin');
    expect(body.vendor.isSuperadmin).toBe(true);

    const accessCookie = loginRes.cookies.find((c) => c.name === 'frose_access_token')!.value;
    const adminRes = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/overview',
      cookies: {
        frose_access_token: accessCookie,
      },
    });
    expect(adminRes.statusCode).toBe(200);
  });

  it('creates superadmin vendor via createAdminFromEnv() reading env variables', async () => {
    process.env.ADMIN_PHONE = '9876543210';
    process.env.ADMIN_PASSWORD = 'SuperSecurePassword2026!';
    process.env.ADMIN_NAME = 'Platform Admin';

    const result = await createAdminFromEnv();
    expect(result.phone).toBe('9876543210');

    // Test logging in with newly created admin credentials
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9876543210',
        password: 'SuperSecurePassword2026!',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const body = loginRes.json();
    expect(body.role).toBe('superadmin');
    expect(body.vendor.isSuperadmin).toBe(true);
  });
});
