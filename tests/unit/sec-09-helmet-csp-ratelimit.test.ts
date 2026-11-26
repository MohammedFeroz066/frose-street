import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-09: @fastify/helmet, CSP Report-Only, & Rate-Limit Hygiene', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false, rateLimitMax: 5 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets Helmet security headers (nosniff, X-Frame-Options, Referrer-Policy) and Report-Only strict CSP without unsafe-inline script-src', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/login.html',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toMatch(/^(DENY|SAMEORIGIN)$/i);
    expect(res.headers['referrer-policy']).toBeDefined();

    // Must use Report-Only CSP, NOT enforcing Content-Security-Policy yet
    expect(res.headers['content-security-policy']).toBeUndefined();
    const cspReportOnly = String(res.headers['content-security-policy-report-only'] || '');
    expect(cspReportOnly).toContain("script-src 'self'");
    expect(cspReportOnly).not.toMatch(/script-src[^;]*'unsafe-inline'/i);
    expect(cspReportOnly).toContain("object-src 'none'");
    expect(cspReportOnly).toContain("frame-ancestors 'none'");
  });

  it('enables Strict-Transport-Security (HSTS) in production mode', async () => {
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
    await prodApp.ready();

    const res = await prodApp.inject({ method: 'GET', url: '/health' });
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/i);
    await prodApp.close();
  });

  it('excludes static assets from the API rate limit while strictly enforcing rate limits on /api/* routes', async () => {
    // 1. Fire > rateLimitMax (5) requests to static assets (.js, .css, .html, images) -> never 429
    for (let i = 0; i < 8; i++) {
      const staticRes = await app.inject({
        method: 'GET',
        url: '/js/api-client.js',
      });
      expect(staticRes.statusCode).toBe(200);
    }

    // 2. Fire > rateLimitMax (5) requests to an /api/* endpoint -> must hit 429
    let hit429 = false;
    for (let i = 0; i < 8; i++) {
      const apiRes = await app.inject({
        method: 'GET',
        url: '/api/v1/subscriptions/public-key',
      });
      if (apiRes.statusCode === 429) {
        hit429 = true;
        break;
      }
    }
    expect(hit429).toBe(true);
  });
});
