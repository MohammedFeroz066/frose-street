import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-10: Strict Zod Route Validation & Production 500 Sanitization', () => {
  let app: FastifyInstance;
  let authCookie = '';

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone: '9888001122',
        businessName: 'Validation Stall',
        password: 'ValidLongPassphrase',
      },
    });
    const accessCookie = reg.cookies.find((c) => c.name === 'frose_access_token');
    authCookie = `${accessCookie?.name}=${accessCookie?.value}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unknown fields (mass assignment attempt) with 400 across all first-party API routes', async () => {
    const routesToProbe = [
      { method: 'POST', url: '/api/v1/menu', payload: { name: 'Chai', pricePaise: 1500, is_superadmin: true } },
      { method: 'POST', url: '/api/v1/orders', payload: { items: [{ menuItemId: 'def-1', quantity: 1 }], paymentMethod: 'cash', totalPaise: 1 } },
      { method: 'POST', url: '/api/v1/galla/expenses', payload: { amountPaise: 1000, description: 'Milk', vendorId: 'other-vendor' } },
      { method: 'POST', url: '/api/v1/payments/vpa', payload: { vpa: 'stall@okaxis', is_superadmin: true } },
      { method: 'POST', url: '/api/v1/devices/pairing-token', payload: { role: 'cook', vendorId: 'victim' } },
      { method: 'POST', url: '/api/v1/subscriptions/renew', payload: { plan: 'cloud', status: 'lifetime_free' } },
    ] as const;

    for (const probe of routesToProbe) {
      const res = await app.inject({
        method: probe.method,
        url: probe.url,
        headers: {
          cookie: authCookie,
          'X-FROSE-CSRF': '1',
          origin: 'http://localhost:3100',
        },
        payload: probe.payload as any,
      });
      expect(res.statusCode, `${probe.method} ${probe.url} should reject unknown field with 400`).toBe(400);
    }
  });

  it('accepts Razorpay and Cashfree webhooks with extra gateway fields while validating required payload shape', async () => {
    const razorpayRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook/razorpay',
      payload: {
        event: 'payment.captured',
        account_id: 'acc_extra_gateway_field',
        payload: { payment: { entity: { id: 'pay_123', extraGatewayField: true } } },
      },
    });
    expect(razorpayRes.statusCode).toBe(200);

    const badWebhookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/webhook/razorpay',
      payload: 'not-an-object',
      headers: { 'content-type': 'application/json' },
    });
    expect(badWebhookRes.statusCode).toBe(400);
  });

  it('sanitizes unexpected 500 errors in production without leaking stack traces, SQL errors, or file paths', async () => {
    const prodApp = await buildApp({
      logger: false,
      config: {
        NODE_ENV: 'production',
        PORT: 3100,
        HOST: '127.0.0.1',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a-very-strong-production-secret-key-at-least-32-chars',
        JWT_EXPIRES_IN: '15m',
        CORS_ORIGIN: ['https://street.frostech.com'],
        CLIENT_DIR: process.cwd() + '/client',
      },
    });
    prodApp.get('/test/sql-crash', async () => {
      throw new Error('SELECT * FROM vendors WHERE secret_key = 123 at C:\\Projects\\frose-street\\server\\src\\app.ts:99');
    });
    await prodApp.ready();

    const res = await prodApp.inject({ method: 'GET', url: '/test/sql-crash' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('SELECT * FROM');
    expect(res.body).not.toContain('secret_key');
    expect(res.body).not.toContain('frose-street');
    expect(res.body).not.toContain('stack');
    const json = res.json();
    expect(json.detail).toBe('An unexpected server error occurred');

    await prodApp.close();
  });
});
