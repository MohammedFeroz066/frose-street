import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config/env.js';
import { getBuildInfo, resetBuildInfoCache } from '../../server/src/config/build-info.js';

describe('PWA-UPD-01: Dynamic Build Fingerprint, /api/v1/version & Zero-Stale Headers', () => {
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

  it('computes a deterministic 12-char SHA-256 buildId from client assets and updates when a client file changes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frose-buildinfo-'));
    try {
      const jsDir = path.join(tmpDir, 'js');
      fs.mkdirSync(jsDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html><body>v1</body></html>');
      fs.writeFileSync(path.join(jsDir, 'app.js'), 'console.log("v1");');

      const info1 = getBuildInfo({ clientDir: tmpDir, refresh: true });
      const info2 = getBuildInfo({ clientDir: tmpDir });
      expect(info1.buildId).toMatch(/^[a-f0-9]{12}$/);
      expect(info2.buildId).toBe(info1.buildId);
      expect(info1.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(typeof info1.startedAt).toBe('string');

      fs.writeFileSync(path.join(jsDir, 'app.js'), 'console.log("v2");');
      const info3 = getBuildInfo({ clientDir: tmpDir, refresh: true });
      expect(info3.buildId).toMatch(/^[a-f0-9]{12}$/);
      expect(info3.buildId).not.toBe(info1.buildId);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('respects APP_BUILD_ID override in /api/v1/version and dynamically injects it into GET /sw.js', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frose-sw-route-'));
    try {
      fs.writeFileSync(
        path.join(tmpDir, 'sw.js'),
        "const BUILD_ID = '__FROSE_BUILD_ID__';\nconst CACHE_NAME = 'frose-street-' + BUILD_ID;\n",
      );
      process.env.APP_BUILD_ID = 'build_test_v1';
      process.env.USE_MEMORY_DB = 'true';
      resetBuildInfoCache();

      app = await buildApp({
        logger: false,
        config: { ...loadConfig(), CLIENT_DIR: tmpDir },
      });
      await app.ready();

      const versionRes = await app.inject({ method: 'GET', url: '/api/v1/version' });
      expect(versionRes.statusCode).toBe(200);
      expect(versionRes.headers['cache-control']).toBe('no-store');
      expect(versionRes.headers['cdn-cache-control']).toBe('no-store');
      const versionJson = versionRes.json();
      expect(versionJson.buildId).toBe('build_test_v1');
      expect(typeof versionJson.version).toBe('string');
      expect(typeof versionJson.startedAt).toBe('string');

      const swRes = await app.inject({ method: 'GET', url: '/sw.js' });
      expect(swRes.statusCode).toBe(200);
      expect(swRes.headers['content-type']).toContain('application/javascript');
      expect(swRes.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(swRes.headers['cdn-cache-control']).toBe('no-store');
      expect(swRes.headers['cloudflare-cdn-cache-control']).toBe('no-store');
      expect(swRes.headers['service-worker-allowed']).toBe('/');
      expect(swRes.body).toContain("const BUILD_ID = 'build_test_v1';");
      expect(swRes.body).not.toContain('__FROSE_BUILD_ID__');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('serves HTML, manifest.json, JS, and CSS with no-cache edge revalidation headers and never immutable', async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();

    const targets = [
      '/billing.html',
      '/manifest.json',
      '/js/api-client.js',
      '/css/ui-kit.css',
    ];

    for (const url of targets) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode, `Expected 200 for ${url}`).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache, must-revalidate');
      expect(res.headers['cdn-cache-control']).toBe('no-cache');
      expect(String(res.headers['cache-control'])).not.toContain('immutable');
    }

    const cleanHtmlRes = await app.inject({
      method: 'GET',
      url: '/billing',
      headers: { accept: 'text/html' },
    });
    expect(cleanHtmlRes.statusCode).toBe(200);
    expect(cleanHtmlRes.headers['cache-control']).toBe('no-cache, must-revalidate');
    expect(cleanHtmlRes.headers['cdn-cache-control']).toBe('no-cache');
  });
});
