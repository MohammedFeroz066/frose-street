import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';
import { loadConfig } from '../../server/src/config/env.js';

describe('Phase 21: Super Admin Portal & Auth Wall Test Suite', () => {
  let app: FastifyInstance;
  let config: ReturnType<typeof loadConfig>;
  let superadminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    config = loadConfig();

    // Generate Super Admin Token
    superadminToken = signJwt(
      {
        sub: 'v-superadmin-01',
        phone: '9999999999',
        businessName: 'FROSE Enterprise HQ',
        role: 'superadmin',
        edition: 'cloud',
      },
      config.JWT_SECRET,
    );

    // Generate Standard Cashier Token (Non-Admin)
    cashierToken = signJwt(
      {
        sub: 'v-stall-demo-01',
        phone: '9177177475',
        businessName: 'FROSE Street Food Stall',
        role: 'cashier',
        edition: 'cloud',
      },
      config.JWT_SECRET,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Security & Access Control (requireAuth & requireRole)', () => {
    it('rejects unauthenticated request to /api/v1/admin/overview with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/overview',
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects standard cashier / vendor request to /api/v1/admin/overview with 403 Forbidden', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/overview',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('accepts Super Admin token and returns platform KPIs with 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/overview',
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
      });
      if (res.statusCode !== 200) console.log('PATCH VENDOR ERROR:', res.payload);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(json.data).toBeDefined();
      expect(json.data.totalVendors).toBeGreaterThanOrEqual(1);
      expect(typeof json.data.grossSalesPaise).toBe('string');
      expect(json.data.activeVendors).toBeDefined();
      expect(json.data.trialVendors).toBeDefined();
    });
  });

  describe('Multi-Restaurant Management Endpoints', () => {
    let createdVendorId: string;

    it('GET /api/v1/admin/vendors: lists all stalls with subscription status and volume', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/vendors',
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
      });
      if (res.statusCode !== 200) console.log('PATCH VENDOR ERROR:', res.payload);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/v1/admin/vendors: onboards a new restaurant stall', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/vendors',
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
        payload: {
          businessName: 'Royal Dosa Hub',
          ownerName: 'Venkatesh Rao',
          phone: '9123456789',
          password: 'Password@123',
          quickPin: '4321',
          city: 'Hyderabad',
          edition: 'cloud',
          subscriptionDays: 30,
        },
      });
      expect(res.statusCode).toBe(201);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(json.data.vendor).toBeDefined();
      expect(json.data.vendor.business_name).toBe('Royal Dosa Hub');
      createdVendorId = json.data.vendor.id;
    });

    it('POST /api/v1/admin/vendors: rejects duplicate phone with 409 Conflict', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/vendors',
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
        payload: {
          businessName: 'Duplicate Dosa',
          ownerName: 'Duplicate Owner',
          phone: '9123456789',
        },
      });
      expect(res.statusCode).toBe(409);
    });

    it('PATCH /api/v1/admin/vendors/:id: updates stall info, extends expiry date, and resets password', async () => {
      const futureExpiry = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/vendors/${createdVendorId}`,
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
        payload: {
          businessName: 'Royal Dosa Palace (Updated)',
          subscriptionExpiresAt: futureExpiry,
          password: 'NewPassword@456',
        },
      });
      if (res.statusCode !== 200) console.log('PATCH VENDOR ERROR:', res.payload);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(json.data.business_name).toBe('Royal Dosa Palace (Updated)');
    });
  });

  describe('Stall Menu Management Endpoints', () => {
    let dishId: string;

    it('POST /api/v1/admin/vendors/:id/menu: creates a new dish for stall', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/vendors/v-stall-demo-01/menu',
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
        payload: {
          name: 'Paneer Butter Momos',
          pricePaise: 8500, // ₹85
          category: 'Momos',
          emojiIcon: '🥟',
        },
      });
      expect(res.statusCode).toBe(201);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(json.data.name).toBe('Paneer Butter Momos');
      expect(json.data.price_paise).toBe(8500);
      dishId = json.data.id;
    });

    it('GET /api/v1/admin/vendors/:id/menu: lists all dishes for stall', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/vendors/v-stall-demo-01/menu',
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
      });
      if (res.statusCode !== 200) console.log('PATCH VENDOR ERROR:', res.payload);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.some((d: any) => d.id === dishId)).toBe(true);
    });

    it('PATCH /api/v1/admin/vendors/:id/menu/:itemId: toggles dish availability', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/vendors/v-stall-demo-01/menu/${dishId}`,
        headers: {
          authorization: `Bearer ${superadminToken}`,
        },
        payload: {
          isAvailable: false,
        },
      });
      if (res.statusCode !== 200) console.log('PATCH VENDOR ERROR:', res.payload);
      expect(res.statusCode).toBe(200);
      const json = res.json();
      console.log('PATCH VENDOR JSON DATA:', json.data);
      expect(json.status).toBe('success');
      expect(json.data.is_available).toBe(false);
    });
  });
});
