/**
 * FROSE Street — Deterministic Navigation & Overlay Stack Controller (NAV-03)
 * Single source of truth for:
 *  - Bounded session navigation stack (sessionStorage + history.state)
 *  - Top-bar back arrow ([data-nav-back]) & single-tap [data-nav-href] routing
 *  - LIFO overlay dismissal before tab/page back-stepping
 *  - Deterministic empty-stack fallback
 */
(function (global) {
  'use strict';

  var STACK_KEY = 'frose_nav_stack_v1';
  var MAX_STACK_DEPTH = 30;
  var activeTabOverride = null;
  var TAB_ALIASES = {
    bill: 'bill',
    orders: 'orders',
    menu: 'menu',
    payments: 'payments',
    reports: 'payments',
    analytics: 'payments',
    settings: 'settings',
  };

  function normalizeTab(rawTab) {
    if (!rawTab) return null;
    var key = String(rawTab).trim().replace(/^#/, '').toLowerCase();
    return TAB_ALIASES[key] || null;
  }

  function normalizePath(rawPath) {
    var p = String(rawPath || '/').split('?')[0].split('#')[0].trim();
    if (!p || p === '/' || p === '/index' || p === '/index.html') return '/index.html';
    if (!p.startsWith('/')) p = '/' + p;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    if (!p.endsWith('.html')) p = p + '.html';
    return p;
  }

  function getCurrentTab() {
    var path = normalizePath(global.location && global.location.pathname);
    if (path !== '/billing.html') return null;

    if (activeTabOverride) return activeTabOverride;

    var search = (global.location && global.location.search) || '';
    if (search) {
      try {
        var params = new URLSearchParams(search);
        var qTab = normalizeTab(params.get('tab'));
        if (qTab) return qTab;
      } catch (_) {}
    }

    var hash = (global.location && global.location.hash) || '';
    var hTab = normalizeTab(hash);
    if (hTab) return hTab;

    if (global.document && typeof global.document.querySelector === 'function') {
      var activePanel = global.document.querySelector('.saas-view-panel.active');
      if (activePanel && typeof activePanel.getAttribute === 'function') {
        var domTab = normalizeTab(activePanel.getAttribute('data-tab-panel'));
        if (domTab) return domTab;
      }
    }
    return 'bill';
  }

  function getCurrentEntry() {
    return {
      path: normalizePath(global.location && global.location.pathname),
      tab: getCurrentTab(),
    };
  }

  function entriesEqual(a, b) {
    if (!a || !b) return false;
    return a.path === b.path && (a.tab || null) === (b.tab || null);
  }

  function readStack() {
    try {
      var raw = global.sessionStorage && global.sessionStorage.getItem(STACK_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(function (item) { return item && typeof item.path === 'string'; })
        .map(function (item) {
          return {
            path: normalizePath(item.path),
            tab: item.tab ? normalizeTab(item.tab) : null,
          };
        })
        .slice(-MAX_STACK_DEPTH);
    } catch (_) {
      return [];
    }
  }

  function writeStack(stack) {
    try {
      if (!global.sessionStorage) return;
      var bounded = Array.isArray(stack) ? stack.slice(-MAX_STACK_DEPTH) : [];
      global.sessionStorage.setItem(STACK_KEY, JSON.stringify(bounded));
    } catch (_) {}
  }

  function syncHistoryState(entry, stackLen, usePush) {
    if (!global.history) return;
    var nextState = Object.assign({}, global.history.state || {}, {
      froseNavPath: entry.path,
      froseNavTab: entry.tab || null,
      froseNavIndex: Math.max(0, stackLen - 1),
      froseTab: entry.tab || undefined,
    });
    try {
      if (usePush && typeof global.history.pushState === 'function') {
        global.history.pushState(nextState, '', '');
      } else if (typeof global.history.replaceState === 'function') {
        global.history.replaceState(nextState, '', '');
      }
    } catch (_) {}
  }

  function isAuthenticated() {
    try {
      return Boolean(
        global.localStorage &&
        (global.localStorage.getItem('frose_session_active') || global.localStorage.getItem('frose_license_token'))
      );
    } catch (_) {
      return false;
    }
  }

  function navigate(url) {
    if (!url) return;
    if (typeof global.fastNavigate === 'function') {
      global.fastNavigate(url);
      return;
    }
    if (global.location) {
      global.location.href = url;
    }
  }

  function buildEntryUrl(entry) {
    if (!entry || !entry.path) return '/billing.html';
    if (entry.path === '/billing.html' && entry.tab && entry.tab !== 'bill') {
      return '/billing.html?tab=' + encodeURIComponent(entry.tab);
    }
    return entry.path;
  }

  function closeActiveOverlay(fromPopstate) {
    if (global.FroseUI && typeof global.FroseUI.getOverlayStack === 'function') {
      if (global.FroseUI.getOverlayStack().length > 0) {
        global.FroseUI.closeTopOverlay({ fromPopstate: Boolean(fromPopstate) });
        return true;
      }
    }
    if (global.document && typeof global.document.querySelectorAll === 'function') {
      var activeNodes = global.document.querySelectorAll('.saas-drawer-backdrop.active, .saas-sheet-backdrop.active, .modal-overlay.active');
      if (activeNodes && activeNodes.length > 0) {
        var top = activeNodes[activeNodes.length - 1];
        if (top && top.classList) top.classList.remove('active');
        var remaining = global.document.querySelectorAll('.saas-drawer-backdrop.active, .saas-sheet-backdrop.active, .modal-overlay.active');
        if (!remaining || remaining.length === 0) {
          if (global.document.body && global.document.body.classList) {
            global.document.body.classList.remove('saas-modal-open');
            global.document.body.classList.remove('modal-open');
          }
          if (global.document.documentElement && global.document.documentElement.classList) {
            global.document.documentElement.classList.remove('saas-modal-open');
            global.document.documentElement.classList.remove('modal-open');
          }
        }
        return true;
      }
    }
    return false;
  }

  function getEmptyFallbackUrl(current) {
    var authed = isAuthenticated();
    if (current.path === '/register.html') {
      return authed ? '/billing.html' : '/login.html';
    }
    if (current.path === '/login.html') {
      return authed ? '/billing.html' : '/index.html';
    }
    if (!authed) {
      return '/login.html';
    }
    if (current.path === '/billing.html') {
      return '/index.html';
    }
    return '/billing.html';
  }

  function recordCurrentEntry() {
    var current = getCurrentEntry();
    var stack = readStack();
    var top = stack[stack.length - 1];
    if (!entriesEqual(top, current)) {
      stack.push(current);
      if (stack.length > MAX_STACK_DEPTH) stack = stack.slice(-MAX_STACK_DEPTH);
      writeStack(stack);
    }
    syncHistoryState(current, stack.length, false);
  }

  function recordTab(rawTab) {
    var tab = normalizeTab(rawTab) || 'bill';
    var currentPath = normalizePath(global.location && global.location.pathname);
    if (currentPath !== '/billing.html') return;

    activeTabOverride = tab;
    var entry = { path: '/billing.html', tab: tab };
    var stack = readStack();
    var top = stack[stack.length - 1];
    if (entriesEqual(top, entry)) return;

    stack.push(entry);
    if (stack.length > MAX_STACK_DEPTH) stack = stack.slice(-MAX_STACK_DEPTH);
    writeStack(stack);
    syncHistoryState(entry, stack.length, true);
  }

  function back(opts) {
    var options = opts || {};
    var fromPopstate = Boolean(options.fromPopstate);

    // 1. Close topmost open modal/sheet/drawer first
    if (closeActiveOverlay(fromPopstate)) {
      return;
    }

    var current = getCurrentEntry();
    var stack = readStack();

    // Pop current screen/tab if it sits on top
    if (stack.length > 0 && entriesEqual(stack[stack.length - 1], current)) {
      stack.pop();
    }

    if (stack.length > 0) {
      var prev = stack[stack.length - 1];
      writeStack(stack);

      if (prev.path === current.path && current.path === '/billing.html' && prev.tab && typeof global.switchWorkspaceTab === 'function') {
        activeTabOverride = prev.tab;
        global.switchWorkspaceTab(prev.tab, { fromPopstate: true, fromNavStack: true });
        syncHistoryState(prev, stack.length, false);
        return;
      }

      navigate(buildEntryUrl(prev));
      return;
    }

    // Empty stack deterministic fallback
    writeStack([]);
    if (current.path === '/billing.html' && current.tab && current.tab !== 'bill' && typeof global.switchWorkspaceTab === 'function') {
      global.switchWorkspaceTab('bill', { fromPopstate: true, fromNavStack: true });
      syncHistoryState({ path: '/billing.html', tab: 'bill' }, 1, false);
      return;
    }

    navigate(getEmptyFallbackUrl(current));
  }

  global.__FROSE_CUSTOM_POPSTATE__ = true;
  recordCurrentEntry();

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('popstate', function () {
      if (global.FroseUI && typeof global.FroseUI.consumeSuppressedPopstate === 'function') {
        if (global.FroseUI.consumeSuppressedPopstate()) return;
      }
      back({ fromPopstate: true });
    });
  }

  if (global.document && typeof global.document.addEventListener === 'function' && !global.__FROSE_NAV_DELEGATED__) {
    global.__FROSE_NAV_DELEGATED__ = true;
    global.document.addEventListener('click', function (e) {
      var target = e && e.target && e.target.closest ? e.target.closest('[data-nav-back], [data-nav-href]') : null;
      if (!target || target.disabled) return;

      if (target.hasAttribute('data-nav-back')) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        back();
        return;
      }

      var navHref = target.getAttribute('data-nav-href');
      if (navHref) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        navigate(navHref);
      }
    });
  }

  global.FroseNav = {
    back: back,
    navigate: navigate,
    recordTab: recordTab,
    normalizeTab: normalizeTab,
    getStack: readStack,
  };
})(typeof window !== 'undefined' ? window : globalThis);
