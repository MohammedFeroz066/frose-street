import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('PWA-UPD-03: Global In-App Updater, Settings Controls & Portal Coverage', () => {
  const clientDir = path.resolve(process.cwd(), 'client');

  it('provides CSP-safe client/js/pwa-updater.js with updateViaCache:none, visibility/focus/online/10m triggers, and safe reload guard', () => {
    const updaterPath = path.join(clientDir, 'js/pwa-updater.js');
    expect(fs.existsSync(updaterPath)).toBe(true);

    const src = fs.readFileSync(updaterPath, 'utf8');
    expect(src).toContain("updateViaCache: 'none'");
    expect(src).toContain("'/api/v1/version'");
    expect(src).toContain('visibilitychange');
    expect(src).toContain('focus');
    expect(src).toContain('online');
    expect(src).toContain('600000'); // 10-minute poll interval
    expect(src).toContain('30000'); // 30s focus throttle
    expect(src).toContain('controllerchange');
    expect(src).toContain('SKIP_WAITING');
    expect(src).toContain('isRefreshing');
    expect(src).toContain('3000'); // 3s fallback reload safety

    // Zero unsafe DOM sinks or inline handlers
    expect(src).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/);
  });

  it('loads /js/pwa-updater.js on all portal HTML pages and precaches it in client/sw.js without duplicate SW registrations', () => {
    const htmlPages = [
      'billing.html',
      'kitchen.html',
      'packaging.html',
      'admin.html',
      'login.html',
      'register.html',
      'menu-setup.html',
      'index.html',
    ];

    for (const page of htmlPages) {
      const html = fs.readFileSync(path.join(clientDir, page), 'utf8');
      expect(html, `${page} must load /js/pwa-updater.js`).toContain('/js/pwa-updater.js');
    }

    const swSrc = fs.readFileSync(path.join(clientDir, 'sw.js'), 'utf8');
    expect(swSrc).toContain("'/js/pwa-updater.js'");

    const billingJs = fs.readFileSync(path.join(clientDir, 'js/billing.js'), 'utf8');
    const appJs = fs.readFileSync(path.join(clientDir, 'js/app.js'), 'utf8');
    expect(billingJs).not.toContain('navigator.serviceWorker.register(');
    expect(appJs).not.toContain('navigator.serviceWorker.register(');
  });

  it('wires App Version and Check for Updates controls in both billing Settings and admin Settings', () => {
    const settingsJs = fs.readFileSync(path.join(clientDir, 'js/settings-component.js'), 'utf8');
    const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');
    const adminJs = fs.readFileSync(path.join(clientDir, 'js/admin-page.js'), 'utf8');
    const i18nJs = fs.readFileSync(path.join(clientDir, 'js/i18n.js'), 'utf8');
    const uiKitCss = fs.readFileSync(path.join(clientDir, 'css/ui-kit.css'), 'utf8');

    expect(settingsJs).toContain('FrosePwaUpdater');
    expect(settingsJs).toContain('btn-settings-check-updates');
    expect(adminHtml).toContain('btn-admin-check-updates');
    expect(adminHtml).toContain('admin-app-version');
    expect(adminJs).toContain('FrosePwaUpdater');

    expect(i18nJs).toContain('pwa.update_available');
    expect(i18nJs).toContain('pwa.update_now');
    expect(i18nJs).toContain('pwa.latest_version');
    expect(uiKitCss).toContain('.pwa-update-banner');
  });
});
