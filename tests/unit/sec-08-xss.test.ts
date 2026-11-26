import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('SEC-08-XSS: Safe DOM Helper, Image URL Validation & Zero Unsafe HTML Sinks', () => {
  const clientDir = path.resolve(__dirname, '../../client');

  it('a) static scan confirms zero innerHTML, outerHTML, insertAdjacentHTML, or document.write in client/', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(html|js)$/i.test(entry.name)) files.push(full);
      }
    };
    walk(clientDir);

    const hits: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const m = content.match(/\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/);
      if (m) {
        hits.push(`${path.relative(clientDir, file)}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('b) safeImageUrl allows only /, https:, and data:image/(png|jpeg|webp);base64 and rejects dangerous schemes', async () => {
    const safeDomPath = path.join(clientDir, 'js/safe-dom.js');
    expect(fs.existsSync(safeDomPath)).toBe(true);
    await import('../../client/js/safe-dom.js');
    const { safeImageUrl } = (globalThis as any).FroseSafeDom;

    expect(safeImageUrl('/images/dishes/chicken-biryani-full.webp')).toBe('/images/dishes/chicken-biryani-full.webp');
    expect(safeImageUrl('https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi')).toBe(
      'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi',
    );
    expect(safeImageUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(safeImageUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe('data:image/jpeg;base64,/9j/4AAQ');
    expect(safeImageUrl('data:image/webp;base64,UklGRh4=')).toBe('data:image/webp;base64,UklGRh4=');

    expect(safeImageUrl('javascript:alert(1)')).toBe('');
    expect(safeImageUrl('JAVASCRIPT:alert(1)')).toBe('');
    expect(safeImageUrl('data:text/html,<script>window.__xss=1</script>')).toBe('');
    expect(safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>')).toBe('');
    expect(safeImageUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeImageUrl('//evil.com/x.png')).toBe('');
    expect(safeImageUrl('http://insecure.example.com/x.png')).toBe('');
    expect(safeImageUrl('not a valid url :// ???')).toBe('');
  });

  it('c) el() renders XSS payloads strictly as plain text with zero executable child nodes', async () => {
    await import('../../client/js/safe-dom.js');
    const { el } = (globalThis as any).FroseSafeDom;

    const fakeDoc = {
      createElement: (tag: string) => {
        const node: any = {
          tagName: tag.toUpperCase(),
          attributes: {} as Record<string, string>,
          children: [] as any[],
          _text: '',
          set textContent(v: string) {
            this._text = String(v);
          },
          get textContent() {
            return this._text;
          },
          setAttribute(k: string, v: string) {
            this.attributes[k] = String(v);
          },
          appendChild(c: any) {
            this.children.push(c);
          },
          addEventListener() {},
        };
        return node;
      },
      createTextNode: (t: string) => ({ nodeType: 3, textContent: String(t) }),
    };
    const prevDoc = (globalThis as any).document;
    (globalThis as any).document = fakeDoc;
    try {
      const payload = '<img src=x onerror=window.__xss=1><script>window.__xss=1</script>';
      const node = el('div', { class: 'dish-title' }, payload);
      expect(node.children.length).toBe(1);
      expect(node.children[0].nodeType).toBe(3);
      expect(node.children[0].textContent).toBe(payload);
    } finally {
      (globalThis as any).document = prevDoc;
    }
  });
});
