import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{23F0}-\u{23FF}\u2705\u274C\u2728\u2795]/u;

describe('VENDOR-04: Cross-Subportal Theme Harmony, Zero Emojis & Ratio/Touch Fixes', () => {
  const clientDir = path.resolve(__dirname, '../../client');

  it('contains zero raw OS emojis across vendor portal HTML and JS files', () => {
    const targetFiles = [
      'billing.html',
      'register.html',
      'menu-setup.html',
      'login.html',
      'kitchen.html',
      'packaging.html',
      'js/menu-panel.js',
      'js/settings-component.js',
      'js/kitchen.js',
      'js/packaging.js',
      'js/idb-store.js',
      'js/billing.js',
      'js/orders-panel.js',
      'js/payments-panel.js',
      'js/menu-setup.js',
      'js/login-page.js',
    ];

    const hits: string[] = [];
    for (const rel of targetFiles) {
      const content = fs.readFileSync(path.join(clientDir, rel), 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (EMOJI_RE.test(line)) {
          hits.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(hits).toEqual([]);
  });

  it('unifies login.html, register.html, menu-setup.html, and portals-saas.css over tokens.css', () => {
    const loginHtml = fs.readFileSync(path.join(clientDir, 'login.html'), 'utf8');
    expect(loginHtml).not.toContain('style="background: #F6F7F9');
    expect(loginHtml).not.toContain('color: #0F172A');
    expect(loginHtml).toContain('/register.html');

    const menuSetupHtml = fs.readFileSync(path.join(clientDir, 'menu-setup.html'), 'utf8');
    expect(menuSetupHtml).not.toContain('#700A18');
    expect(menuSetupHtml).not.toContain('#FDFBF9');

    const menuSetupJs = fs.readFileSync(path.join(clientDir, 'js/menu-setup.js'), 'utf8');
    expect(menuSetupJs).not.toMatch(/\b(alert|confirm)\s*\(/);

    const portalsCss = fs.readFileSync(path.join(clientDir, 'css/portals-saas.css'), 'utf8');
    expect(portalsCss).toContain('.stall-pill');
    expect(portalsCss).toContain('.lane-badge');
    expect(portalsCss).toContain('.badge-ready');
    expect(portalsCss).toContain('.badge-waiting');
    expect(portalsCss).toContain('.btn-nav-pin');
    expect(portalsCss).toContain('min-height: 44px');
  });

  it('subscribes billing, kitchen, packaging, login-page, and menu-setup to FroseTheme.subscribe', () => {
    const scripts = [
      'js/billing.js',
      'js/kitchen.js',
      'js/packaging.js',
      'js/login-page.js',
      'js/menu-setup.js',
    ];
    for (const rel of scripts) {
      const content = fs.readFileSync(path.join(clientDir, rel), 'utf8');
      expect(content, `${rel} must call FroseTheme.subscribe`).toContain('FroseTheme.subscribe');
      expect(content, `${rel} must call renderThemeIcon`).toContain('renderThemeIcon');
    }
  });

  it('keeps .saas-switch 50x30px inside >=44px wrapper and removes empty src="" attributes', () => {
    const menuPanelJs = fs.readFileSync(path.join(clientDir, 'js/menu-panel.js'), 'utf8');
    expect(menuPanelJs).not.toMatch(/saas-switch[\s\S]{0,120}min-width:\s*48px;\s*min-height:\s*44px/);

    const billingHtml = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');
    const menuSetupHtml = fs.readFileSync(path.join(clientDir, 'menu-setup.html'), 'utf8');
    expect(billingHtml).not.toMatch(/id="lock-qr-code-img"[^>]*\bsrc=""/);
    expect(billingHtml).not.toMatch(/id="dish-photo-preview-img"[^>]*\bsrc=""/);
    expect(menuSetupHtml).not.toMatch(/id="image-preview-element"[^>]*\bsrc=""/);
  });

  it('fixes 1024x768 2-col dish grid, 360x800 clearance, and >=44x44px touch targets', () => {
    const workspaceCss = fs.readFileSync(path.join(clientDir, 'css/workspace.css'), 'utf8');
    const billingHtml = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');
    const tokensCss = fs.readFileSync(path.join(clientDir, 'css/tokens.css'), 'utf8');

    expect(workspaceCss).toContain('156px');
    expect(workspaceCss).toContain('repeat(2, minmax(0, 1fr))');
    expect(workspaceCss).not.toContain('min-width: 28px');
    expect(billingHtml).toContain('id="btn-desktop-clear-cart"');
    expect(billingHtml).not.toMatch(/id="btn-desktop-clear-cart"[^>]*min-height:\s*36px/);
    expect(tokensCss).toContain('#F1F5F9');
    expect(tokensCss).toContain('#020617');
  });
});
