import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-01: Reject is_superadmin and Unknown Fields via Strict Zod Schemas', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects POST /api/v1/auth/register-stall when is_superadmin is injected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9111111111',
        businessName: 'Hacker Stall',
        password: 'ValidPassword123!',
        is_superadmin: true,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toMatch(/VALIDATION_ERROR|BAD_REQUEST/);
  });

  it('rejects POST /api/v1/auth/register-stall when unknown fields are provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9111111112',
        businessName: 'Hacker Stall 2',
        password: 'ValidPassword123!',
        maliciousExtraField: 'exploit',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toMatch(/VALIDATION_ERROR|BAD_REQUEST/);
  });

  it('rejects POST /api/v1/auth/register when is_superadmin or unknown fields are injected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        phone: '9111111113',
        businessName: 'Hacker Stall 3',
        password: 'ValidPassword123!',
        is_superadmin: true,
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toMatch(/VALIDATION_ERROR|BAD_REQUEST/);
  });
});
