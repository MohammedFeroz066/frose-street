import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config/env.js';

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

describe('Proxy Trust & Domain Configuration (frosetech.com)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false, rateLimitMax: 2 });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('enables trustProxy on Fastify so rate limiting uses X-Forwarded-For client IP behind tunnel/proxy', async () => {
    // Exhaust rate limit for client IP 203.0.113.10
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        remoteAddress: '127.0.0.1',
        headers: { 'x-forwarded-for': '203.0.113.10' },
      });
      expect(res.statusCode).toBe(401);
    }

    // 3rd request from same forwarded client IP must be rate-limited (429)
    const blockedRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.10' },
    });
    expect(blockedRes.statusCode).toBe(429);

    // Different forwarded client IP behind the same 127.0.0.1 proxy must NOT share the bucket
    const otherClientRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.20' },
    });
    expect(otherClientRes.statusCode).toBe(401);
  });

  it('uses https://street.frosetech.com as the default CORS_ORIGIN fallback without frostech.com typo', () => {
    const prevCors = process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGIN;
    try {
      const cfg = loadConfig();
      expect(cfg.CORS_ORIGIN).toContain('https://street.frosetech.com');
      expect(cfg.CORS_ORIGIN.join(',')).not.toContain('frostech.com');
    } finally {
      if (prevCors !== undefined) {
        process.env.CORS_ORIGIN = prevCors;
      }
    }
  });

  it('contains zero frostech.com typos in server/src, shared, and .env.example', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const files = [
      ...collectFiles(path.join(rootDir, 'server/src')),
      ...collectFiles(path.join(rootDir, 'shared')),
      path.join(rootDir, '.env.example'),
    ];

    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/frostech\.com/i.test(content)) {
        offenders.push(path.relative(rootDir, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
