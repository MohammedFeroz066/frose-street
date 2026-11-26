import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-06-VERIFY-PIN: Require Auth & Progressive Lockout on /api/v1/auth/verify-pin', () => {
  let app: FastifyInstance;
  let vendorId = '';
  let authCookie = '';

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone: '9833445566',
        businessName: 'PIN Lockout Stall',
        password: 'ValidPassphrasePinTest',
        quickPin: '5678',
      },
    });
    vendorId = reg.json().vendor.id;
    const accessCookie = reg.cookies.find((c) => c.name === 'frose_access_token');
    authCookie = `${accessCookie?.name}=${accessCookie?.value}`;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated POST /api/v1/auth/verify-pin with 401 even when body.vendorId is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-pin',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        vendorId,
        pin: '5678',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('enforces progressive lockout after 3 wrong PIN attempts on authenticated /verify-pin', async () => {
    for (let i = 0; i < 2; i++) {
      const failRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-pin',
        headers: { cookie: authCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
        payload: { pin: '0000' },
      });
      expect(failRes.statusCode).toBe(401);
    }

    const thirdFail = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-pin',
      headers: { cookie: authCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '0000' },
    });
    expect(thirdFail.statusCode).toBe(429);
    expect(thirdFail.json().code).toBe('ACCOUNT_LOCKED');

    // Even the correct PIN is blocked while locked out
    const lockedGoodPin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-pin',
      headers: { cookie: authCookie, 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { pin: '5678' },
    });
    expect(lockedGoodPin.statusCode).toBe(429);
  });
});
