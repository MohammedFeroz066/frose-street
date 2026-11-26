import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const clientDir = path.resolve(__dirname, '../../client');
const i18nPath = path.join(clientDir, 'js/i18n.js');

function loadI18nModule(initialLang?: string) {
  const storage = new Map<string, string>();
  if (initialLang) storage.set('frose_ui_lang', initialLang);

  const mockDoc = {
    documentElement: { lang: 'en' },
    querySelectorAll: () => [],
  };

  const sandbox: Record<string, unknown> = {
    window: {} as Record<string, unknown>,
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, String(v)),
      removeItem: (k: string) => storage.delete(k),
    },
    document: mockDoc,
    CustomEvent: class CustomEvent {
      type: string;
      detail: unknown;
      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    dispatchEvent: () => true,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const code = fs.readFileSync(i18nPath, 'utf8');
  vm.runInNewContext(code, sandbox);

  return {
    FroseI18n: (sandbox as any).FroseI18n,
    storage,
    mockDoc,
  };
}

describe('I18N-01: Multi-Language Staff UI (en, te, hi, ta)', () => {
  it('exists, exposes FroseI18n API, and has complete key parity across en, te, hi, ta', () => {
    expect(fs.existsSync(i18nPath)).toBe(true);
    const { FroseI18n } = loadI18nModule();
    expect(FroseI18n).toBeDefined();
    expect(typeof FroseI18n.t).toBe('function');
    expect(typeof FroseI18n.setLanguage).toBe('function');
    expect(typeof FroseI18n.getLanguage).toBe('function');
    expect(typeof FroseI18n.applyTranslations).toBe('function');

    const locales = FroseI18n.LOCALES;
    expect(Object.keys(locales).sort()).toEqual(['en', 'hi', 'ta', 'te']);

    const enKeys = Object.keys(locales.en).sort();
    expect(enKeys.length).toBeGreaterThanOrEqual(45);

    for (const lang of ['te', 'hi', 'ta']) {
      const langKeys = Object.keys(locales[lang]).sort();
      expect(langKeys, `Key parity mismatch for ${lang}`).toEqual(enKeys);
      for (const k of enKeys) {
        expect(typeof locales[lang][k]).toBe('string');
        expect(locales[lang][k].trim().length, `Empty translation for ${lang}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('persists selected language in localStorage (frose_ui_lang) and interpolates variables cleanly', () => {
    const { FroseI18n, storage, mockDoc } = loadI18nModule();
    expect(FroseI18n.getLanguage()).toBe('en');

    FroseI18n.setLanguage('te');
    expect(storage.get('frose_ui_lang')).toBe('te');
    expect(mockDoc.documentElement.lang).toBe('te');
    expect(FroseI18n.getLanguage()).toBe('te');

    FroseI18n.setLanguage('hi');
    expect(storage.get('frose_ui_lang')).toBe('hi');
    expect(mockDoc.documentElement.lang).toBe('hi');

    FroseI18n.setLanguage('ta');
    expect(storage.get('frose_ui_lang')).toBe('ta');
    expect(mockDoc.documentElement.lang).toBe('ta');

    // Invalid language falls back to 'en'
    FroseI18n.setLanguage('xx');
    expect(FroseI18n.getLanguage()).toBe('en');

    // Variable interpolation
    const msg = FroseI18n.t('kds.toast_ready', { token: '12' });
    expect(msg).toContain('12');
  });

  it('applies translations via textContent and placeholder only (zero unsafe DOM sinks)', () => {
    const code = fs.readFileSync(i18nPath, 'utf8');
    expect(code).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);

    const { FroseI18n } = loadI18nModule('hi');
    const textNode = {
      dataset: { i18n: 'nav.bill' },
      textContent: 'Bill',
      getAttribute: (n: string) => (n === 'data-i18n' ? 'nav.bill' : null),
    };
    const inputNode = {
      dataset: { i18nPlaceholder: 'bill.search_placeholder' },
      placeholder: 'Search dishes...',
      getAttribute: (n: string) => (n === 'data-i18n-placeholder' ? 'bill.search_placeholder' : null),
    };
    const root = {
      querySelectorAll: (sel: string) => {
        if (sel === '[data-i18n]') return [textNode];
        if (sel === '[data-i18n-placeholder]') return [inputNode];
        return [];
      },
    };

    FroseI18n.applyTranslations(root);
    expect(textNode.textContent).toBe(FroseI18n.LOCALES.hi['nav.bill']);
    expect(inputNode.placeholder).toBe(FroseI18n.LOCALES.hi['bill.search_placeholder']);
  });
});
