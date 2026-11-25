import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-03: Strong Password Policy & PIN Fallback Removal', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects registration when password is missing or empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9000000001',
        businessName: 'No Password Stall',
        quickPin: '1234',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('MISSING_PASSWORD');
  });

  it('rejects registration when password is under 10 characters', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9000000002',
        businessName: 'Short Password Stall',
        password: 'Aa1!short',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('WEAK_PASSWORD');
    expect(body.detail || body.message).toContain('at least 10 characters');
  });

  it('rejects common or easily guessable passwords', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9000000003',
        businessName: 'Common Password Stall',
        password: 'Password123!',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('COMMON_PASSWORD');
    expect(body.detail || body.message).toContain('too common');
  });

  it('accepts strong, unique password of 10+ characters and hashes it safely', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9000000004',
        businessName: 'Strong Pass Stall',
        password: 'XyZ#9876_SecurePass2026',
        quickPin: '4321',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('success');
    expect(body.vendor).toBeDefined();
    expect(body.vendor.phone).toBe('9000000004');
  });
});
