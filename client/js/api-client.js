/**
 * FROSE STREET — Shared Cookie & CSRF API Client
 * Classic-script-safe IIFE providing single-flight 401 refresh and automatic CSRF headers.
 */
(function (global) {
  'use strict';

  var MUTATING_METHODS = { POST: true, PUT: true, PATCH: true, DELETE: true };
  var AUTH_BYPASS_PATHS = [
    '/api/v1/auth/login',
    '/api/v1/auth/register',
    '/api/v1/auth/register-stall',
    '/api/v1/auth/refresh',
    '/api/v1/auth/logout',
  ];

  function extractPathname(url) {
    try {
      return new URL(String(url), 'http://localhost').pathname;
    } catch (_) {
      return String(url || '').split('?')[0];
    }
  }

  function isAuthEndpoint(url) {
    var pathname = extractPathname(url);
    return AUTH_BYPASS_PATHS.some(function (p) {
      return pathname === p || pathname.endsWith(p);
    });
  }

  function defaultRedirect(target) {
    if (global.window && global.window.location && typeof global.window.location.replace === 'function') {
      global.window.location.replace(target);
    }
  }

  function defaultClearSession() {
    try {
      if (global.localStorage) {
        global.localStorage.removeItem('frose_session_active');
        global.localStorage.removeItem('frose_vendors_directory');
      }
    } catch (_) {}
  }

  function buildHeaders(rawHeaders, method, hasBody) {
    var headers = new Headers(rawHeaders || {});
    if (MUTATING_METHODS[method]) {
      if (!headers.has('X-FROSE-CSRF')) {
        headers.set('X-FROSE-CSRF', '1');
      }
      if (hasBody && !headers.has('Content-Type') && typeof FormData === 'undefined') {
        headers.set('Content-Type', 'application/json');
      } else if (hasBody && !headers.has('Content-Type') && !(global.FormData && arguments[3])) {
        headers.set('Content-Type', 'application/json');
      }
    }
    return headers;
  }

  function createApiClient(deps) {
    var config = deps || {};
    var fetchFn = config.fetchImpl || function (url, opts) {
      return global.fetch(url, opts);
    };
    var redirectFn = config.redirectImpl || defaultRedirect;
    var clearSessionFn = config.onSessionCleared || defaultClearSession;
    var refreshPromise = null;

    async function refreshSessionSingleFlight() {
      if (!refreshPromise) {
        refreshPromise = (async function () {
          try {
            var refreshRes = await fetchFn('/api/v1/auth/refresh', {
              method: 'POST',
              credentials: 'same-origin',
              headers: new Headers({ 'X-FROSE-CSRF': '1' }),
            });
            return Boolean(refreshRes && refreshRes.ok);
          } catch (_) {
            return false;
          }
        })().finally(function () {
          refreshPromise = null;
        });
      }
      return refreshPromise;
    }

    async function apiFetch(url, options) {
      var opts = options ? Object.assign({}, options) : {};
      var method = String(opts.method || 'GET').toUpperCase();
      var isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
      var headers = buildHeaders(opts.headers, method, opts.body !== undefined && opts.body !== null, isFormData);

      var requestInit = Object.assign({}, opts, {
        method: method,
        credentials: 'same-origin',
        headers: headers,
      });
      delete requestInit._retried;

      var response = await fetchFn(url, requestInit);

      if (response && response.status === 401 && !opts._retried && !isAuthEndpoint(url)) {
        var refreshed = await refreshSessionSingleFlight();
        if (refreshed) {
          return apiFetch(url, Object.assign({}, opts, { _retried: true }));
        }
        clearSessionFn();
        redirectFn('/login.html');
      }

      return response;
    }

    return { apiFetch: apiFetch };
  }

  var defaultClient = createApiClient();

  global.FroseApiClient = {
    createApiClient: createApiClient,
    apiFetch: defaultClient.apiFetch,
  };
  global.froseApiFetch = defaultClient.apiFetch;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      createApiClient: createApiClient,
      apiFetch: defaultClient.apiFetch,
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
