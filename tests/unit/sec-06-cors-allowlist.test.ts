import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';

describe('SEC-06: Strict CORS Exact-Origin Allowlist', () => {
  let prodApp: FastifyInstance;
  let devApp: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    prodApp = await buildApp({
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

    devApp = await buildApp({
      logger: false,
      config: {
        NODE_ENV: 'development',
        PORT: 3100,
        HOST: '127.0.0.1',
        DATABASE_URL: 'postgresql://localhost:5432/test',
        JWT_SECRET: 'a-very-strong-dev-secret-key-at-least-32-chars-ok',
        JWT_EXPIRES_IN: '15m',
        CORS_ORIGIN: ['https://street.frostech.com'],
        CLIENT_DIR: process.cwd() + '/client',
      },
    });
    await devApp.ready();
  });

  afterAll(async () => {
    await prodApp.close();
    await devApp.close();
  });

  it('rejects domain-suffix, localhost-prefix, and startsWith bypass origins in production (no Access-Control-Allow-Origin)', async () => {
    const evilOrigins = [
      'https://street.frostech.com.attacker.com',
      'https://attackerlocalhost.com',
      'https://localhost.attacker.com',
      'http://localhost:3100',
      'http://127.0.0.1:3100',
      'http://192.168.1.50.attacker.com',
      'http://localhost:80.evil.com',
    ];

    for (const origin of evilOrigins) {
      const res = await prodApp.inject({
        method: 'GET',
        url: '/health',
        headers: { origin },
      });
      expect(res.headers['access-control-allow-origin'], `Origin ${origin} must be rejected in production`).toBeUndefined();
    }

    const validRes = await prodApp.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://street.frostech.com' },
    });
    expect(validRes.headers['access-control-allow-origin']).toBe('https://street.frostech.com');
    expect(validRes.headers['access-control-allow-credentials']).toBe('true');
  });

  it('allows exact localhost/127.0.0.1 in non-production while rejecting spoofed localhost tricks', async () => {
    for (const origin of ['http://localhost:3100', 'http://127.0.0.1:5173', 'http://localhost']) {
      const res = await devApp.inject({
        method: 'GET',
        url: '/health',
        headers: { origin },
      });
      expect(res.headers['access-control-allow-origin'], `Dev origin ${origin} should be allowed`).toBe(origin);
    }

    for (const badOrigin of [
      'http://localhost:3100.attacker.com',
      'https://localhost.attacker.com',
      'https://attackerlocalhost.com',
    ]) {
      const res = await devApp.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: badOrigin },
      });
      expect(res.headers['access-control-allow-origin'], `Bypass origin ${badOrigin} must be rejected`).toBeUndefined();
    }
  });
});
