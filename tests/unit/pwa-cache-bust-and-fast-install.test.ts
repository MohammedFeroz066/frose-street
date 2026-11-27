import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { resetBuildInfoCache } from '../../server/src/config/build-info.js';

describe('PWA Cache-Busting & Fast Installability', () => {
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

  it('stamps ?v=<buildId> onto local JS, CSS, and manifest URLs in served HTML with no-store headers', async () => {
    process.env.APP_BUILD_ID = 'stamp_v99_abc';
    process.env.USE_MEMORY_DB = 'true';
    resetBuildInfoCache();

    app = await buildApp({ logger: false });
    await app.ready();

    const htmlRoutes = [
      { url: '/', headers: { accept: 'text/html' } },
      { url: '/index.html', headers: {} },
      { url: '/login.html', headers: {} },
      { url: '/billing.html', headers: {} },
      { url: '/admin.html', headers: {} },
      { url: '/billing', headers: { accept: 'text/html' } },
      { url: '/admin', headers: { accept: 'text/html' } },
    ];

    for (const route of htmlRoutes) {
      const res = await app.inject({ method: 'GET', url: route.url, headers: route.headers });
      expect(res.statusCode, `Status 200 for ${route.url}`).toBe(200);
      expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
      expect(res.headers['cdn-cache-control']).toBe('no-store');

      const body = res.body;
      const scriptMatches = [...body.matchAll(/<script[^>]+src=["'](\/js\/[^"']+)["']/gi)].map((m) => m[1]);
      expect(scriptMatches.length).toBeGreaterThan(0);
      for (const src of scriptMatches) {
        expect(src, `Script src in ${route.url}: ${src}`).toContain('?v=stamp_v99_abc');
        expect(src).not.toMatch(/\?.*\?/);
      }

      const cssMatches = [...body.matchAll(/<link[^>]+href=["'](\/css\/[^"']+)["']/gi)].map((m) => m[1]);
      expect(cssMatches.length).toBeGreaterThan(0);
      for (const href of cssMatches) {
        expect(href, `CSS href in ${route.url}: ${href}`).toContain('?v=stamp_v99_abc');
      }

      const manifestMatches = [...body.matchAll(/<link[^>]+href=["'](\/manifest\.json[^"']*)["']/gi)].map((m) => m[1]);
      for (const href of manifestMatches) {
        expect(href, `Manifest href in ${route.url}: ${href}`).toBe('/manifest.json?v=stamp_v99_abc');
      }
    }
  });

  it('uses separate "any" and "maskable" icon entries in client/manifest.json for 192x192 and 512x512', () => {
    const manifestPath = path.resolve(process.cwd(), 'client/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const icons: Array<{ src: string; sizes: string; purpose?: string }> = manifest.icons || [];

    expect(icons.some((i) => i.purpose === 'any maskable')).toBe(false);
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose === 'maskable')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  });

  it('keeps client/sw.js install precache lean (<= 12 core files) and supports ignoreSearch offline lookup', () => {
    const swPath = path.resolve(process.cwd(), 'client/sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');

    const coreMatch = sw.match(/const\s+(?:CORE_PRECACHE_ASSETS|PRECACHE_ASSETS)\s*=\s*\[([\s\S]*?)\];/);
    expect(coreMatch).not.toBeNull();
    const coreAssets = [...coreMatch![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);

    expect(coreAssets.length).toBeLessThanOrEqual(12);
    expect(coreAssets).toContain('/');
    expect(coreAssets).toContain('/login.html');
    expect(coreAssets).toContain('/billing.html');
    expect(coreAssets).toContain('/manifest.json');
    expect(coreAssets).toContain('/icons/icon-192.png');
    expect(coreAssets).toContain('/icons/icon-512.png');
    expect(coreAssets).toContain('/css/tokens.css');
    expect(coreAssets).toContain('/css/ui-kit.css');
    expect(coreAssets).toContain('/js/pwa-updater.js');
    expect(coreAssets).toContain('/js/safe-dom.js');
    expect(coreAssets).toContain('/js/dom-events.js');

    expect(sw).toContain('ignoreSearch: true');
    expect(sw).toContain('SECONDARY_PRECACHE_ASSETS');
  });
});
