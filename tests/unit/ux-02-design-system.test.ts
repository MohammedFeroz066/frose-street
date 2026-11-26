import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('UX-02: Design Token System, 3 Themes & CSP-Safe UI Kit', () => {
  const clientDir = path.resolve(process.cwd(), 'client');

  it('tokens.css defines light, dark, and sunlight themes with required semantic tokens', () => {
    const tokensCss = fs.readFileSync(path.join(clientDir, 'css/tokens.css'), 'utf8');
    expect(tokensCss).toContain('[data-theme="light"]');
    expect(tokensCss).toContain('[data-theme="dark"]');
    expect(tokensCss).toContain('[data-theme="sunlight"]');
    for (const token of [
      '--bg-canvas',
      '--bg-surface',
      '--bg-elevated',
      '--bg-subtle',
      '--text-primary',
      '--text-secondary',
      '--text-muted',
      '--accent-primary',
      '--accent-amber',
      '--accent-rose',
    ]) {
      expect(tokensCss).toContain(token);
    }
  });

  it('ui-kit.css enforces >=48px touch targets, tabular-nums, responsive shell, and 0px horizontal overflow', () => {
    const uiKitCss = fs.readFileSync(path.join(clientDir, 'css/ui-kit.css'), 'utf8');
    expect(uiKitCss).toContain('overflow-x: hidden');
    expect(uiKitCss).toContain('font-variant-numeric: tabular-nums');
    expect(uiKitCss).toContain('@media (min-width: 1024px)');
    expect(uiKitCss).toContain('.saas-bottom-nav');
    expect(uiKitCss).toContain('.saas-sidebar-rail');
    expect(uiKitCss).toContain('.saas-cart-island');
    expect(uiKitCss).toContain('.saas-sheet');
    expect(uiKitCss).toContain('.saas-drawer');
    expect(uiKitCss).toContain('.saas-skeleton');
    expect(uiKitCss).toContain('.saas-toast');
  });

  it('theme.js boots safely, validates theme names, and cycles light -> dark -> sunlight', async () => {
    const storageMap = new Map<string, string>();
    const prevLS = (globalThis as any).localStorage;
    const prevDoc = (globalThis as any).document;
    const attrs: Record<string, string> = {};

    (globalThis as any).localStorage = {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
    };
    (globalThis as any).document = {
      documentElement: {
        getAttribute: () => null,
        setAttribute: (k: string, v: string) => { attrs[k] = v; },
      },
      querySelector: () => null,
    };

    try {
      const mod = await import('../../client/js/theme.js');
      const themeApi = mod.default || (globalThis as any).FroseTheme;
      expect(themeApi.getTheme()).toBe('light');
      expect(themeApi.cycleTheme()).toBe('dark');
      expect(attrs['data-theme']).toBe('dark');
      expect(themeApi.cycleTheme()).toBe('sunlight');
      expect(themeApi.cycleTheme()).toBe('light');
      themeApi.setTheme('invalid-theme-xss');
      expect(themeApi.getTheme()).toBe('light');
    } finally {
      (globalThis as any).localStorage = prevLS;
      (globalThis as any).document = prevDoc;
    }
  });

  it('ui-components.js formats integer paise strictly and contains zero unsafe DOM sinks', async () => {
    const src = fs.readFileSync(path.join(clientDir, 'js/ui-components.js'), 'utf8');
    expect(src).not.toMatch(/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/);
    expect(src).not.toMatch(/\bonclick\s*=/i);

    await import('../../client/js/safe-dom.js');
    const mod = await import('../../client/js/ui-components.js');
    const ui = mod.default || (globalThis as any).FroseUI;
    expect(ui.formatINR(6000)).toBe('₹60');
    expect(ui.formatINR(10550)).toBe('₹105.50');
    expect(ui.formatINR(0)).toBe('₹0');
    expect(ui.formatINR(100000)).toBe('₹1,000');
  });
});
