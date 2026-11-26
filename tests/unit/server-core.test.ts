import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../server/src/app.js';
import { AppError } from '../../server/src/errors/app-error.js';
import type { FastifyInstance } from 'fastify';

describe('Phase 4 Acceptance: Fastify Server Core, Health & Middleware', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('TEST 1: Server Health & Metadata', () => {
    it('GET /health returns 200 with ok status, uptime, version, and portals', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.status).toBe('ok');
      expect(json.service).toBe('frose-street');
      expect(json.version).toBe('1.0.0');
      expect(typeof json.uptime).toBe('number');
      expect(json.portals.billing).toBe('/billing');
      expect(json.portals.packaging).toBe('/packaging');
      expect(json.portals.kitchen).toBe('/kitchen');
    });
  });

  describe('TEST 2: RFC 7807 Structured Error Handling', () => {
    it('invalid route returns 404 with RFC 7807 problem details JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/non-existent-endpoint-404',
      });

      expect(res.statusCode).toBe(404);
      const json = JSON.parse(res.body);
      expect(json.type).toBe('about:blank');
      expect(json.title).toBe('Not Found');
      expect(json.status).toBe(404);
      expect(json.code).toBe('NOT_FOUND');
      expect(json.detail).toContain('Cannot GET /non-existent-endpoint-404');
      expect(json.timestamp).toBeDefined();
    });

    it('custom AppError returns corresponding status and RFC 7807 JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/custom-error',
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.title).toBe('Forbidden');
      expect(json.status).toBe(403);
      expect(json.code).toBe('AUTH_FORBIDDEN');
      expect(json.detail).toBe('Custom forbidden test error');
    });

    it('unhandled error returns 500 RFC 7807 problem details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/test/unhandled-error',
      });

      expect(res.statusCode).toBe(500);
      const json = JSON.parse(res.body);
      expect(json.title).toBe('Internal Server Error');
      expect(json.status).toBe(500);
      expect(json.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('TEST 3: CORS Headers & Security', () => {
    it('responds with CORS headers for allowed origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'https://street.frosetech.com',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://street.frosetech.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });

  describe('TEST 4: Timing & Middleware Headers', () => {
    it('sets X-Response-Time header on responses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['x-response-time']).toBeDefined();
      expect(res.headers['x-response-time']).toMatch(/\d+\.\d+ms/);
    });
  });

  describe('TEST 5: Rate Limiting (429 Too Many Requests)', () => {
    it('exceeding rate limit returns 429 Too Many Requests with RFC 7807 JSON', async () => {
      // Create separate app instance with low threshold (3 requests/min) to cleanly test limit
      const rateApp = await buildApp({ logger: false, rateLimitMax: 3 });
      await rateApp.ready();

      // Requests 1, 2, 3 should succeed
      for (let i = 0; i < 3; i++) {
        const res = await rateApp.inject({ method: 'GET', url: '/billing' });
        expect(res.statusCode).toBe(200);
      }

      // 4th request must be rate limited
      const limitedRes = await rateApp.inject({ method: 'GET', url: '/billing' });
      expect(limitedRes.statusCode).toBe(429);

      const json = JSON.parse(limitedRes.body);
      expect(json.status).toBe(429);
      expect(json.title).toBe('Too Many Requests');
      expect(json.code).toBe('RATE_LIMITED');
      expect(json.detail).toContain('Rate limit exceeded');

      await rateApp.close();
    });
  });

  describe('TEST 6: Graceful Shutdown', () => {
    it('app closes cleanly without dangling handles', async () => {
      const testApp = await buildApp({ logger: false });
      await testApp.ready();
      await expect(testApp.close()).resolves.not.toThrow();
    });
  });
});
