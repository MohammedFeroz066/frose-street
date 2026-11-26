/**
 * FROSE Street — Theme Controller (Zero-Flash Boot, Phase 4 UX-02)
 * Stores non-sensitive UI theme preference ('light' | 'dark' | 'sunlight') in localStorage.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'frose_ui_theme';
  var VALID_THEMES = ['light', 'dark', 'sunlight'];
  var listeners = [];

  function normalizeTheme(name) {
    if (typeof name === 'string') {
      var clean = name.trim().toLowerCase();
      if (VALID_THEMES.indexOf(clean) !== -1) return clean;
    }
    return null;
  }

  function getDefaultTheme() {
    try {
      var attr = global.document && global.document.documentElement
        ? global.document.documentElement.getAttribute('data-default-theme')
        : null;
      return normalizeTheme(attr) || 'light';
    } catch (_) {
      return 'light';
    }
  }

  function getTheme() {
    try {
      if (global.localStorage) {
        var saved = normalizeTheme(global.localStorage.getItem(STORAGE_KEY));
        if (saved) return saved;
      }
    } catch (_) {}
    return getDefaultTheme();
  }

  function applyTheme(theme) {
    var safe = normalizeTheme(theme) || 'light';
    try {
      if (global.document && global.document.documentElement) {
        global.document.documentElement.setAttribute('data-theme', safe);
        var meta = global.document.querySelector('meta[name="theme-color"]');
        if (meta) {
          meta.setAttribute('content', safe === 'dark' ? '#0B0E14' : (safe === 'sunlight' ? '#FFFFFF' : '#F6F7F9'));
        }
      }
    } catch (_) {}
    return safe;
  }

  function setTheme(name) {
    var safe = normalizeTheme(name);
    if (!safe) safe = getDefaultTheme();
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, safe);
      }
    } catch (_) {}
    applyTheme(safe);
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](safe);
      } catch (_) {}
    }
    return safe;
  }

  function cycleTheme() {
    var current = getTheme();
    var idx = VALID_THEMES.indexOf(current);
    var next = VALID_THEMES[(idx + 1) % VALID_THEMES.length];
    return setTheme(next);
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (l) { return l !== fn; });
    };
  }

  // Synchronous zero-flash boot
  applyTheme(getTheme());

  var api = {
    THEMES: VALID_THEMES.slice(),
    STORAGE_KEY: STORAGE_KEY,
    getTheme: getTheme,
    setTheme: setTheme,
    cycleTheme: cycleTheme,
    subscribe: subscribe,
  };

  global.FroseTheme = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
