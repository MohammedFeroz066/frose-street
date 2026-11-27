import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('ADMIN-03: Interaction Ergonomics (Escape, Tap-Outside, URL Sync, Back Nav, Zero alert/confirm)', () => {
  const clientDir = path.resolve(process.cwd(), 'client');
  const adminPageJs = fs.readFileSync(path.join(clientDir, 'js/admin-page.js'), 'utf8');
  const adminHtml = fs.readFileSync(path.join(clientDir, 'admin.html'), 'utf8');

  it('contains zero native alert(), confirm(), or prompt() calls in admin-page.js', () => {
    expect(adminPageJs).not.toMatch(/\b(alert|confirm|prompt)\s*\(/);
  });

  it('wires Escape key topmost-layer dismissal and keyboard shortcuts / and Ctrl+K / Cmd+K', () => {
    expect(adminPageJs).toContain("e.key === 'Escape'");
    expect(adminPageJs).toContain('dismissTopmostLayer');
    expect(adminPageJs).toMatch(/e\.key === '\/'/);
    expect(adminPageJs).toMatch(/ctrlKey|metaKey/);
  });

  it('syncs tab and vendor inspector state to URL (?tab=...&vendor=...) and handles popstate Back navigation', () => {
    expect(adminPageJs).toContain('URLSearchParams');
    expect(adminPageJs).toContain('history.pushState');
    expect(adminPageJs).toContain('popstate');
    expect(adminPageJs).toContain("params.set('vendor'");
    expect(adminHtml).toContain('id="btn-inspector-back"');
  });
});
