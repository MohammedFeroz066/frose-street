import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase } from '../../server/src/db/database.js';

import { LoginSecurityService } from '../../server/src/modules/auth/login-security.service.js';

describe('SEC-06: Reject PIN-Only Remote Login & Enforce Persistent Lockout', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    LoginSecurityService.resetForTesting();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  beforeEach(() => {
    LoginSecurityService.resetForTesting();
  });

  afterAll(async () => {
    await app.close();
    LoginSecurityService.resetForTesting();
  });

  it('rejects POST /api/v1/auth/login when phone + PIN alone is provided without password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '9177177475',
        pin: '1234',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toMatch(/PIN_LOGIN_NOT_ALLOWED|MISSING_PASSWORD|VALIDATION_ERROR/);
    expect(body.detail || body.message).toContain('password');
  });

  it('rejects POST /api/v1/auth/pin-login from issuing remote auth session tokens', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/pin-login',
      payload: {
        pin: '1234',
      },
    });

    // Remote pin-login must either return 400/403 or be disabled
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    const body = res.json();
    expect(body.code).toMatch(/PIN_LOGIN_DISABLED|INVALID_AUTH_METHOD/);
  });

  it('records consecutive failed attempts and locks out account persistently', async () => {
    const phone = '9998887771';
    // Register the account
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        phone,
        businessName: 'Lockout Test Stall',
        password: 'ValidPassword123!',
      },
    });

    // 3 failed password attempts
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          phone,
          password: 'WrongPassword123!',
        },
      });
      if (i < 2) {
        expect(res.statusCode).toBe(401);
      } else {
        expect(res.statusCode).toBe(429);
        const body = res.json();
        expect(body.code).toBe('ACCOUNT_LOCKED');
      }
    }

    // 4th attempt is blocked with 429
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone,
        password: 'ValidPassword123!',
      },
    });
    expect(blockedRes.statusCode).toBe(429);
  });
});
