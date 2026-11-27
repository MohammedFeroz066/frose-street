import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { resetBuildInfoCache } from '../../server/src/config/build-info.js';

describe('PWA-UPD-02: Safe Waiting-State Service Worker Lifecycle', () => {
  const swPath = path.resolve(process.cwd(), 'client/sw.js');
  let app: FastifyInstance | null = null;
  const origAppBuildId = process.env.APP_BUILD_ID;

  beforeEach(() => {
    delete process.env.APP_BUILD_ID;
    resetBuildInfoCache();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
    if (origAppBuildId === undefined) {
      delete process.env.APP_BUILD_ID;
    } else {
      process.env.APP_BUILD_ID = origAppBuildId;
    }
    resetBuildInfoCache();
  });

  it('uses __FROSE_BUILD_ID__ token, reload-bypassing precache, SKIP_WAITING handshake, and scoped frose-street-* cache cleanup', () => {
    const sw = fs.readFileSync(swPath, 'utf8');

    expect(sw).toContain("const BUILD_ID = '__FROSE_BUILD_ID__';");
    expect(sw).toContain("const CACHE_NAME = 'frose-street-' + BUILD_ID;");
    expect(sw).toContain("cache: 'reload'");
    expect(sw).toContain("key.startsWith('frose-street-') && key !== CACHE_NAME");
    expect(sw).toContain('self.clients.claim()');
    expect(sw).toContain("'/sw.js'");

    // Must never call self.skipWaiting() unconditionally during install
    const installBlock = sw.match(/addEventListener\(\s*['"]install['"][\s\S]*?\n\}\);/);
    expect(installBlock).not.toBeNull();
    expect(installBlock![0]).not.toContain('self.skipWaiting()');

    // Must only skipWaiting on explicit SKIP_WAITING message
    expect(sw).toMatch(/event\.data\.type\s*===\s*['"]SKIP_WAITING['"]/);

    // Must never touch IndexedDB
    expect(sw).not.toContain('indexedDB');
    expect(sw).not.toContain('frose_offline_db');
  });

  it('real GET /sw.js serves injected buildId matching /api/v1/version', async () => {
    process.env.APP_BUILD_ID = 'build_sw_test_99';
    process.env.USE_MEMORY_DB = 'true';
    resetBuildInfoCache();

    app = await buildApp({ logger: false });
    await app.ready();

    const versionRes = await app.inject({ method: 'GET', url: '/api/v1/version' });
    const swRes = await app.inject({ method: 'GET', url: '/sw.js' });

    expect(versionRes.statusCode).toBe(200);
    expect(swRes.statusCode).toBe(200);
    expect(versionRes.json().buildId).toBe('build_sw_test_99');
    expect(swRes.body).toContain("const BUILD_ID = 'build_sw_test_99';");
    expect(swRes.body).not.toContain('__FROSE_BUILD_ID__');
  });
});
