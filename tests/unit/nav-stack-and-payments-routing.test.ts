import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const clientDir = path.resolve(__dirname, '../../client');

function readClient(relPath: string): string {
  return fs.readFileSync(path.join(clientDir, relPath), 'utf8');
}

describe('NAV-01: Analytics / Reports -> Payments Tab Routing', () => {
  it('index.html routes Reports and Analytics triggers directly to /billing.html?tab=payments without duplicate reports-modal', () => {
    const indexHtml = readClient('index.html');
    expect(indexHtml).not.toContain('id="reports-modal"');
    expect(indexHtml).not.toContain('data-arg="reports-modal"');
    expect(indexHtml).toMatch(/id="btn-open-reports"[^>]*(href|data-nav-href|data-arg)="\/billing\.html\?tab=payments"/);
    expect(indexHtml).toMatch(/(href|data-nav-href|data-arg)="\/billing\.html\?tab=payments"[^>]*>[\s\S]*?Analytics/);
  });

  it('billing.js normalizes reports and analytics tab aliases (query & hash) to payments', () => {
    const billingJs = readClient('js/billing.js');
    expect(billingJs).toContain("reports: 'payments'");
    expect(billingJs).toContain("analytics: 'payments'");
    expect(billingJs).toContain('window.location.hash');
    expect(billingJs).toContain('normalizeWorkspaceTab');
  });
});

describe('NAV-02: Top-Bar Back Arrow Presence & >=44x44px Sizing', () => {
  const portalPages = [
    'billing.html',
    'kitchen.html',
    'packaging.html',
    'menu-setup.html',
    'login.html',
    'register.html',
    'index.html',
  ];

  it.each(portalPages)('%s includes top-bar back button with aria-label="Back" and 1.75px stroke SVG', (page) => {
    const html = readClient(page);
    expect(html).toContain('data-nav-back');
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('stroke-width="1.75"');
  });

  it('ui-kit.css defines .frose-nav-back with >= 44x44px touch target', () => {
    const uiKitCss = readClient('css/ui-kit.css');
    expect(uiKitCss).toContain('.frose-nav-back');
    expect(uiKitCss).toMatch(/\.frose-nav-back[\s\S]*?min-width:\s*44px/);
    expect(uiKitCss).toMatch(/\.frose-nav-back[\s\S]*?min-height:\s*44px/);
  });

  it('all portal pages load /js/nav-controller.js and sw.js precaches it', () => {
    for (const page of portalPages) {
      const html = readClient(page);
      expect(html).toContain('/js/nav-controller.js');
    }
    const swJs = readClient('sw.js');
    expect(swJs).toContain("'/js/nav-controller.js'");
  });
});

describe('NAV-03: Deterministic Navigation Stack & Single-Tap Behavior', () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).sessionStorage;
    delete (globalThis as Record<string, unknown>).localStorage;
    delete (globalThis as Record<string, unknown>).history;
  });

  function loadNavController(opts: {
    pathname?: string;
    search?: string;
    hash?: string;
    authenticated?: boolean;
    initialStack?: Array<{ path: string; tab?: string | null }>;
    overlayStack?: string[];
  } = {}) {
    const listeners: Record<string, Array<(e?: unknown) => void>> = {};
    const sessionMap = new Map<string, string>();
    const localMap = new Map<string, string>();
    if (opts.initialStack) {
      sessionMap.set('frose_nav_stack_v1', JSON.stringify(opts.initialStack));
    }
    if (opts.authenticated) {
      localMap.set('frose_session_active', '1');
    }

    const navigatedTo: string[] = [];
    const switchedTabs: Array<{ tab: string; opts?: unknown }> = [];
    let closedTopOverlayCount = 0;
    const overlayStack = [...(opts.overlayStack || [])];

    const historyObj = {
      state: null as unknown,
      pushState: (state: unknown) => {
        historyObj.state = state;
      },
      replaceState: (state: unknown) => {
        historyObj.state = state;
      },
      back: () => {},
    };

    const locationObj = {
      pathname: opts.pathname || '/billing.html',
      search: opts.search || '',
      hash: opts.hash || '',
      origin: 'http://localhost:3000',
      get href() {
        return `${locationObj.origin}${locationObj.pathname}${locationObj.search}${locationObj.hash}`;
      },
      set href(val: string) {
        navigatedTo.push(val);
      },
      assign: (val: string) => navigatedTo.push(val),
      replace: (val: string) => navigatedTo.push(val),
    };

    const windowObj: Record<string, unknown> = {
      location: locationObj,
      history: historyObj,
      sessionStorage: {
        getItem: (k: string) => sessionMap.get(k) ?? null,
        setItem: (k: string, v: string) => sessionMap.set(k, String(v)),
        removeItem: (k: string) => sessionMap.delete(k),
      },
      localStorage: {
        getItem: (k: string) => localMap.get(k) ?? null,
        setItem: (k: string, v: string) => localMap.set(k, String(v)),
        removeItem: (k: string) => localMap.delete(k),
      },
      addEventListener: (ev: string, fn: (e?: unknown) => void) => {
        listeners[ev] = listeners[ev] || [];
        listeners[ev].push(fn);
      },
      FroseUI: {
        getOverlayStack: () => [...overlayStack],
        closeTopOverlay: () => {
          if (overlayStack.length > 0) {
            overlayStack.pop();
            closedTopOverlayCount += 1;
            return true;
          }
          return false;
        },
        consumeSuppressedPopstate: () => false,
      },
      switchWorkspaceTab: (tab: string, tabOpts?: unknown) => {
        switchedTabs.push({ tab, opts: tabOpts });
      },
    };

    const documentObj: Record<string, unknown> = {
      addEventListener: (ev: string, fn: (e?: unknown) => void) => {
        listeners[`doc:${ev}`] = listeners[`doc:${ev}`] || [];
        listeners[`doc:${ev}`].push(fn);
      },
      querySelectorAll: () => [],
      querySelector: () => null,
      body: { classList: { remove: () => {} } },
      documentElement: { classList: { remove: () => {} } },
    };

    (globalThis as Record<string, unknown>).window = windowObj;
    (globalThis as Record<string, unknown>).document = documentObj;
    (globalThis as Record<string, unknown>).sessionStorage = windowObj.sessionStorage;
    (globalThis as Record<string, unknown>).localStorage = windowObj.localStorage;
    (globalThis as Record<string, unknown>).history = historyObj;

    const code = readClient('js/nav-controller.js');
    const fn = new Function('window', 'document', 'sessionStorage', 'localStorage', 'history', code);
    fn(windowObj, documentObj, windowObj.sessionStorage, windowObj.localStorage, historyObj);

    return {
      FroseNav: (windowObj as Record<string, unknown>).FroseNav as {
        back: () => void;
        navigate: (url: string) => void;
        recordTab: (tab: string) => void;
        getStack: () => Array<{ path: string; tab?: string | null }>;
      },
      navigatedTo,
      switchedTabs,
      getClosedTopOverlayCount: () => closedTopOverlayCount,
      triggerPopstate: () => {
        for (const cb of listeners['popstate'] || []) cb({});
      },
    };
  }

  it('closes topmost open overlay first before popping page/tab history', () => {
    const ctx = loadNavController({
      pathname: '/billing.html',
      authenticated: true,
      initialStack: [
        { path: '/index.html', tab: null },
        { path: '/billing.html', tab: 'bill' },
        { path: '/billing.html', tab: 'payments' },
      ],
      overlayStack: ['close-day-drawer'],
    });

    ctx.FroseNav.back();
    expect(ctx.getClosedTopOverlayCount()).toBe(1);
    expect(ctx.navigatedTo).toEqual([]);
    expect(ctx.switchedTabs).toEqual([]);
  });

  it('steps back through exact previous tabs and pages in the stack rather than jumping to arbitrary routes', () => {
    const ctx = loadNavController({
      pathname: '/billing.html',
      search: '?tab=payments',
      authenticated: true,
      initialStack: [
        { path: '/index.html', tab: null },
        { path: '/billing.html', tab: 'orders' },
      ],
    });

    // Current entry (/billing.html, payments) is on top; back() should return to orders tab first
    ctx.FroseNav.back();
    expect(ctx.switchedTabs).toEqual([{ tab: 'orders', opts: { fromPopstate: true, fromNavStack: true } }]);
    expect(ctx.navigatedTo).toEqual([]);

    // Next back() should navigate to /index.html (the actual previous page)
    ctx.FroseNav.back();
    expect(ctx.navigatedTo).toEqual(['/index.html']);
  });

  it('falls back deterministically when stack is empty (authenticated -> /billing.html, unauthenticated -> /login.html)', () => {
    const authCtx = loadNavController({
      pathname: '/kitchen.html',
      authenticated: true,
      initialStack: [],
    });
    authCtx.FroseNav.back();
    expect(authCtx.navigatedTo).toEqual(['/billing.html']);

    const guestCtx = loadNavController({
      pathname: '/register.html',
      authenticated: false,
      initialStack: [],
    });
    guestCtx.FroseNav.back();
    expect(guestCtx.navigatedTo).toEqual(['/login.html']);
  });

  it('routes menu-setup.html back to actual previous page (e.g. /index.html) instead of hardcoding /billing', () => {
    const ctx = loadNavController({
      pathname: '/menu-setup.html',
      authenticated: true,
      initialStack: [{ path: '/index.html', tab: null }],
    });

    ctx.FroseNav.back();
    expect(ctx.navigatedTo).toEqual(['/index.html']);
  });
});
