import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-IDOR: Cross-Tenant Isolation & Role Enforcement Across All Routes', () => {
  let app: FastifyInstance;
  let cookieA = '';
  let cookieB = '';
  let vendorAId = '';
  let vendorBId = '';

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { phone: '9822000001', businessName: 'IDOR Stall A', password: 'StrongPassphraseA' },
    });
    vendorAId = regA.json().vendor.id;
    const cA = regA.cookies.find((c) => c.name === 'frose_access_token');
    cookieA = `${cA?.name}=${cA?.value}`;

    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { phone: '9822000002', businessName: 'IDOR Stall B', password: 'StrongPassphraseB' },
    });
    vendorBId = regB.json().vendor.id;
    const cB = regB.cookies.find((c) => c.name === 'frose_access_token');
    cookieB = `${cB?.name}=${cB?.value}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication on /api/v1/subscriptions/status, /renew, and /admin/vendors', async () => {
    const statusRes = await app.inject({ method: 'GET', url: '/api/v1/subscriptions/status' });
    expect(statusRes.statusCode).toBe(401);

    const renewRes = await app.inject({
      method: 'POST',
      url: '/api/v1/subscriptions/renew',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { plan: 'cloud' },
    });
    expect(renewRes.statusCode).toBe(401);

    const adminSubRes = await app.inject({ method: 'GET', url: '/api/v1/subscriptions/admin/vendors' });
    expect(adminSubRes.statusCode).toBe(401);
  });

  it('rejects non-superadmin vendor with 403 on ALL /api/v1/admin/* routes and /api/v1/subscriptions/admin/vendors', async () => {
    const adminGets = [
      '/api/v1/admin/overview',
      '/api/v1/admin/vendors',
      `/api/v1/admin/vendors/${vendorBId}/menu`,
      '/api/v1/admin/users',
      '/api/v1/admin/analytics',
      '/api/v1/admin/system-health',
      '/api/v1/subscriptions/admin/vendors',
    ];
    for (const url of adminGets) {
      const res = await app.inject({ method: 'GET', url, headers: { cookie: cookieA } });
      expect(res.statusCode, `GET ${url} must return 403 for non-superadmin`).toBe(403);
    }

    const postRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/vendors',
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { businessName: 'Hack', ownerName: 'Hack', phone: '9990001111' },
    });
    expect(postRes.statusCode).toBe(403);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/vendors/${vendorBId}`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { businessName: 'Hacked B' },
    });
    expect(patchRes.statusCode).toBe(403);
  });

  it('prevents Vendor A from reading, modifying, or deleting Vendor B menu items, orders, expenses, devices, VPA, or subscription', async () => {
    // 1. Vendor B creates menu item, order, expense, device, and sets VPA
    const menuB = await app.inject({
      method: 'POST',
      url: '/api/v1/menu',
      headers: { cookie: cookieB, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { name: 'Secret B Item', pricePaise: 5000, category: 'Snacks' },
    });
    const itemIdB = menuB.json().item.id;

    const orderB = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: { cookie: cookieB, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { items: [{ menuItemId: itemIdB, quantity: 1 }], paymentMethod: 'cash' },
    });
    const orderIdB = orderB.json().order.id;

    const expB = await app.inject({
      method: 'POST',
      url: '/api/v1/galla/expenses',
      headers: { cookie: cookieB, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { amountPaise: 1500, description: 'B Milk' },
    });
    const expenseIdB = expB.json().expense.id;

    const pairTokenB = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/pairing-token',
      headers: { cookie: cookieB, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { role: 'cook' },
    });
    const pairB = await app.inject({
      method: 'POST',
      url: '/api/v1/devices/pair',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pairingToken: pairTokenB.json().pairingToken, deviceName: 'B Kitchen' },
    });
    const deviceIdB = pairB.json().device.id;

    await app.inject({
      method: 'POST',
      url: '/api/v1/payments/vpa',
      headers: { cookie: cookieB, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { vpa: 'vendorb@okaxis' },
    });

    // 2. Vendor A attempts cross-tenant IDOR across every endpoint -> all must fail cleanly (404) & never leak Vendor B data
    const putMenuA = await app.inject({
      method: 'PUT',
      url: `/api/v1/menu/${itemIdB}`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pricePaise: 100 },
    });
    expect(putMenuA.statusCode).toBe(404);

    const toggleMenuA = await app.inject({
      method: 'PATCH',
      url: `/api/v1/menu/${itemIdB}/toggle-available`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
    });
    expect(toggleMenuA.statusCode).toBe(404);

    const delMenuA = await app.inject({
      method: 'DELETE',
      url: `/api/v1/menu/${itemIdB}`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
    });
    expect(delMenuA.statusCode).toBe(404);

    const getOrderA = await app.inject({
      method: 'GET',
      url: `/api/v1/orders/${orderIdB}`,
      headers: { cookie: cookieA },
    });
    expect(getOrderA.statusCode).toBe(404);

    const patchOrderA = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orders/${orderIdB}/status`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { status: 'cancelled' },
    });
    expect(patchOrderA.statusCode).toBe(404);

    const delExpA = await app.inject({
      method: 'DELETE',
      url: `/api/v1/galla/expenses/${expenseIdB}`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
    });
    expect(delExpA.statusCode).toBe(404);

    const delDevA = await app.inject({
      method: 'DELETE',
      url: `/api/v1/devices/${deviceIdB}`,
      headers: { cookie: cookieA, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
    });
    expect(delDevA.statusCode).toBe(404);

    const vpaA = await app.inject({
      method: 'GET',
      url: '/api/v1/payments/vpa',
      headers: { cookie: cookieA },
    });
    expect(vpaA.statusCode).toBe(200);
    expect(vpaA.json().vpa).not.toBe('vendorb@okaxis');

    const statusA = await app.inject({
      method: 'GET',
      url: '/api/v1/subscriptions/status',
      headers: { cookie: cookieA },
    });
    expect(statusA.statusCode).toBe(200);
    expect(statusA.json().vendorId).toBe(vendorAId);
    expect(statusA.json().vendorId).not.toBe(vendorBId);
  });
});
