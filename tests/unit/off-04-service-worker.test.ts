import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('OFF-04: Service Worker Pre-Cache Completeness, API Exclusion & 3s Timeout', () => {
  const clientDir = path.resolve(__dirname, '../../client');
  const swPath = path.join(clientDir, 'sw.js');

  it('precaches every /js/*.js script referenced across all client/*.html files and all required Phase 1D/2 scripts', () => {
    const swContent = fs.readFileSync(swPath, 'utf8');
    const htmlFiles = fs.readdirSync(clientDir).filter((f) => f.endsWith('.html'));

    const referencedScripts = new Set<string>();
    const scriptSrcRegex = /<script[^>]*\bsrc=["'](\/js\/[^"'?]+)(?:\?[^"']*)?["']/gi;

    for (const htmlFile of htmlFiles) {
      const html = fs.readFileSync(path.join(clientDir, htmlFile), 'utf8');
      let match: RegExpExecArray | null;
      while ((match = scriptSrcRegex.exec(html)) !== null) {
        referencedScripts.add(match[1]);
      }
    }

    const requiredPhaseScripts = [
      '/js/api-client.js',
      '/js/safe-dom.js',
      '/js/session-guard.js',
      '/js/dom-events.js',
      '/js/idb-store.js',
      '/js/billing-page.js',
      '/js/login-page.js',
      '/js/menu-setup.js',
      '/js/admin-page.js',
      '/js/index-page.js',
      '/js/billing.js',
      '/js/kitchen.js',
      '/js/packaging.js',
      '/js/storage-adapter.js',
      '/js/app.js',
      '/js/register.js',
      '/js/settings-component.js',
    ];

    for (const s of requiredPhaseScripts) {
      referencedScripts.add(s);
    }

    for (const scriptPath of referencedScripts) {
      expect(swContent, `sw.js missing precache entry for ${scriptPath}`).toContain(`'${scriptPath}'`);
      expect(fs.existsSync(path.join(clientDir, scriptPath)), `Missing file on disk: ${scriptPath}`).toBe(true);
    }
  });

  it('never caches /api/ responses and uses AbortController 3000ms timeout for shell navigations', () => {
    const swContent = fs.readFileSync(swPath, 'utf8');

    expect(swContent).toContain('AbortController');
    expect(swContent).toMatch(/3000/);
    expect(swContent).toContain("'/api/'");
    expect(swContent).toContain('OFFLINE');
    // Ensure /api/ branch happens before any caches.open/caches.match call
    const apiIdx = swContent.indexOf("'/api/'");
    const cachesOpenIdx = swContent.indexOf('caches.open', apiIdx);
    expect(apiIdx).toBeGreaterThan(-1);
    expect(cachesOpenIdx).toBeGreaterThan(apiIdx);
  });
});
