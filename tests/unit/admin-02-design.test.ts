import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ADMIN-02: Stripe/Linear Design System, External CSS, Zero Emojis, Zero Inline Style Hacks', () => {
  const clientDir = path.resolve(process.cwd(), 'client');

  it('extracts all styles to client/css/admin.css with zero <style> block or hardcoded theme colors in admin.html', () => {
    const adminCssPath = path.join(clientDir, 'css/admin.css');
    expect(fs.existsSync(adminCssPath)).toBe(true);

    const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');
    expect(adminHtml).toContain('/css/admin.css');
    expect(adminHtml).not.toMatch(/<style[\s>]/i);
    expect(adminHtml).not.toMatch(/#FDFBF7|#700A18|#F8FAFC|#FFFFFF/i);

    const adminCss = fs.readFileSync(adminCssPath, 'utf8');
    expect(adminCss).toContain('--bg-canvas');
    expect(adminCss).toContain('--bg-surface');
    expect(adminCss).toContain('--text-primary');
    expect(adminCss).toContain('--border-subtle');
    expect(adminCss).toContain('--accent-primary');
    expect(adminCss).not.toMatch(/!important/);
    expect(adminCss).not.toMatch(/html\s*,\s*body\s*\{[^}]*(?<!-)\bheight\s*:\s*100%/i);
  });

  it('contains zero emoji icons in admin.html and admin-page.js and uses FroseAdminIcons SVG helper', () => {
    const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');
    const adminPageJs = fs.readFileSync(path.join(clientDir, 'js/admin-page.js'), 'utf8');

    const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    expect(emojiRe.test(adminHtml)).toBe(false);
    expect(emojiRe.test(adminPageJs)).toBe(false);
    expect(adminPageJs).toContain('FroseAdminIcons');
    expect(adminPageJs).toContain('createElementNS');
  });

  it('includes all 7 SaaS navigation views, notification bell, theme toggle, overflow menu, and mobile card layout', () => {
    const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');
    const adminCss = fs.readFileSync(path.join(clientDir, 'css/admin.css'), 'utf8');

    for (const viewId of [
      'view-dashboard',
      'view-vendors',
      'view-subscriptions',
      'view-analytics',
      'view-users',
      'view-audit',
      'view-settings',
      'view-add-restaurant',
    ]) {
      expect(adminHtml).toContain(`id="${viewId}"`);
    }
    expect(adminHtml).toContain('id="btn-header-notifications"');
    expect(adminHtml).toContain('id="btn-admin-theme"');
    expect(adminCss).toContain('.admin-mobile-cards');
    expect(adminCss).toContain('.admin-overflow-menu');
  });
});
