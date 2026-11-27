/**
 * FROSE Street — Global PWA Auto-Update Manager (PWA-UPD-03)
 * - Centralizes Service Worker registration with { updateViaCache: 'none' }
 * - Detects updates on launch, visibility return, focus (>=30s throttle), online reconnect, and 10m poll
 * - Compares /api/v1/version buildId against running page buildId
 * - Renders a non-disruptive, theme-aware, localized floating update prompt via Safe DOM only (zero unsafe sinks or inline styles)
 * - Safe single-reload guard on controllerchange with 3s fallback safety
 */
(function (global) {
  'use strict';

  var POLL_INTERVAL_MS = 600000; // 10 minutes
  var FOCUS_THROTTLE_MS = 30000; // 30 seconds
  var VISIBILITY_DEBOUNCE_MS = 2000;
  var FALLBACK_RELOAD_MS = 3000;

  var registration = null;
  var waitingWorker = null;
  var initialVersionInfo = null;
  var latestVersionInfo = null;
  var dismissed = false;
  var isRefreshing = false;
  var userTriggeredUpdate = false;
  var initialized = false;
  var lastCheckAt = 0;
  var lastVisibilityAt = 0;
  var pollTimerId = null;
  var listeners = [];
  var hadControllerAtStart =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller);

  function t(key, fallback) {
    try {
      if (global.FroseI18n && typeof global.FroseI18n.t === 'function') {
        var val = global.FroseI18n.t(key);
        if (val && val !== key) return val;
      }
    } catch (_) {}
    return fallback;
  }

  function showToast(msg, variant) {
    try {
      if (global.FroseUI && typeof global.FroseUI.showToast === 'function') {
        global.FroseUI.showToast(msg, variant || 'success');
      }
    } catch (_) {}
  }

  function createEl(tag, attrs, children) {
    if (global.FroseSafeDom && typeof global.FroseSafeDom.el === 'function') {
      return global.FroseSafeDom.el(tag, attrs, children);
    }
    var doc = global.document;
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'on' && typeof v === 'object') {
          Object.keys(v).forEach(function (ev) {
            if (typeof v[ev] === 'function') node.addEventListener(ev, v[ev]);
          });
        } else if (k === 'class') {
          node.className = String(v);
        } else if (v === true) {
          node.setAttribute(k, '');
        } else {
          node.setAttribute(k, String(v));
        }
      });
    }
    var list = Array.isArray(children) ? children : children !== undefined && children !== null ? [children] : [];
    list.forEach(function (c) {
      if (c === undefined || c === null) return;
      if (typeof c === 'string' || typeof c === 'number') {
        node.appendChild(doc.createTextNode(String(c)));
      } else {
        node.appendChild(c);
      }
    });
    return node;
  }

  function formatVersionLabel(info) {
    if (!info || !info.buildId) return 'v1.0.0';
    var ver = String(info.version || '1.0.0');
    var shortBuild = String(info.buildId).slice(0, 12);
    return 'v' + ver + ' · ' + shortBuild;
  }

  function getStateSnapshot() {
    var hasWaiting = Boolean(
      waitingWorker || (registration && registration.waiting && navigator.serviceWorker && navigator.serviceWorker.controller)
    );
    return {
      hasWaitingUpdate: hasWaiting,
      dismissed: dismissed,
      isUpdating: userTriggeredUpdate && isRefreshing,
      versionInfo: initialVersionInfo || latestVersionInfo,
      latestVersionInfo: latestVersionInfo,
    };
  }

  function emitStateChange() {
    var snap = getStateSnapshot();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snap);
      } catch (_) {}
    }
    try {
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent('frose:pwa-update-state', { detail: snap }));
      }
    } catch (_) {}
  }

  function removeBanner() {
    if (!global.document) return;
    var existing = global.document.getElementById('pwa-update-banner');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  }

  function refreshBannerText() {
    if (!global.document) return;
    var banner = global.document.getElementById('pwa-update-banner');
    if (!banner) return;
    var titleEl = banner.querySelector('.pwa-update-banner-title');
    var subEl = banner.querySelector('.pwa-update-banner-sub');
    var laterBtn = banner.querySelector('#pwa-update-later-btn');
    var nowBtn = banner.querySelector('#pwa-update-now-btn');
    if (titleEl) titleEl.textContent = t('pwa.update_available', 'New update available');
    if (subEl) subEl.textContent = t('pwa.update_safe_sub', 'Offline orders & data stay safe');
    if (laterBtn) laterBtn.textContent = t('pwa.later', 'Later');
    if (nowBtn && !nowBtn.disabled) nowBtn.textContent = t('pwa.update_now', 'Update Now');
  }

  function renderUpdateBanner() {
    if (!global.document || !global.document.body) return;
    var worker = waitingWorker || (registration && registration.waiting);
    if (!worker || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    if (dismissed) return;

    var existing = global.document.getElementById('pwa-update-banner');
    if (existing) {
      refreshBannerText();
      return;
    }

    var laterBtn = createEl(
      'button',
      {
        type: 'button',
        id: 'pwa-update-later-btn',
        class: 'pwa-update-btn-later',
        on: {
          click: function () {
            dismissed = true;
            removeBanner();
            emitStateChange();
          },
        },
      },
      t('pwa.later', 'Later')
    );

    var nowBtn = createEl(
      'button',
      {
        type: 'button',
        id: 'pwa-update-now-btn',
        class: 'pwa-update-btn-primary',
        on: {
          click: function () {
            applyUpdate();
          },
        },
      },
      t('pwa.update_now', 'Update Now')
    );

    var banner = createEl(
      'aside',
      {
        id: 'pwa-update-banner',
        class: 'pwa-update-banner',
        role: 'region',
        'aria-label': t('pwa.update_available', 'New update available'),
      },
      [
        createEl('div', { class: 'pwa-update-banner-content' }, [
          createEl('div', { class: 'pwa-update-banner-badge', 'aria-hidden': 'true' }, '↻'),
          createEl('div', { class: 'pwa-update-banner-text' }, [
            createEl('div', { class: 'pwa-update-banner-title' }, t('pwa.update_available', 'New update available')),
            createEl('div', { class: 'pwa-update-banner-sub' }, t('pwa.update_safe_sub', 'Offline orders & data stay safe')),
          ]),
        ]),
        createEl('div', { class: 'pwa-update-banner-actions' }, [laterBtn, nowBtn]),
      ]
    );

    global.document.body.appendChild(banner);
  }

  function triggerSafeReload() {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      global.location.reload();
    } catch (_) {}
  }

  function applyUpdate() {
    var worker = waitingWorker || (registration && registration.waiting);
    if (!worker) return false;

    userTriggeredUpdate = true;

    if (global.document) {
      var bannerBtn = global.document.getElementById('pwa-update-now-btn');
      if (bannerBtn) {
        bannerBtn.disabled = true;
        bannerBtn.textContent = t('pwa.updating', 'Updating...');
      }
      var settingsBtn = global.document.getElementById('btn-settings-update-now');
      if (settingsBtn) {
        settingsBtn.disabled = true;
        settingsBtn.textContent = t('pwa.updating', 'Updating...');
      }
      var adminBtn = global.document.getElementById('btn-admin-update-now');
      if (adminBtn) {
        adminBtn.disabled = true;
        adminBtn.textContent = t('pwa.updating', 'Updating...');
      }
    }

    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (_) {
      triggerSafeReload();
      return true;
    }

    global.setTimeout(function () {
      if (!isRefreshing) {
        triggerSafeReload();
      }
    }, FALLBACK_RELOAD_MS);

    return true;
  }

  function attachInstallingWorker(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', function () {
      if (worker.state === 'installed' && navigator.serviceWorker && navigator.serviceWorker.controller) {
        waitingWorker = worker;
        dismissed = false;
        renderUpdateBanner();
        emitStateChange();
      }
    });
  }

  async function fetchVersionInfo() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
      var res = await fetch('/api/v1/version', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res || !res.ok) return null;
      var data = await res.json();
      if (data && data.buildId) {
        latestVersionInfo = data;
        if (!initialVersionInfo) {
          initialVersionInfo = data;
        }
        emitStateChange();
        return data;
      }
    } catch (_) {}
    return null;
  }

  function waitForInstallingDecision(reg, timeoutMs) {
    return new Promise(function (resolve) {
      var target = reg && reg.installing;
      if (!target) {
        resolve(Boolean(reg && reg.waiting && navigator.serviceWorker.controller));
        return;
      }
      var settled = false;
      var timer = global.setTimeout(function () {
        if (settled) return;
        settled = true;
        resolve(Boolean(reg.waiting && navigator.serviceWorker.controller));
      }, timeoutMs || 4000);

      target.addEventListener('statechange', function () {
        if (settled) return;
        if (target.state === 'installed') {
          settled = true;
          global.clearTimeout(timer);
          resolve(Boolean(navigator.serviceWorker && navigator.serviceWorker.controller));
        } else if (target.state === 'redundant') {
          settled = true;
          global.clearTimeout(timer);
          resolve(Boolean(reg.waiting && navigator.serviceWorker.controller));
        }
      });
    });
  }

  async function checkForUpdates(opts) {
    var options = opts || {};
    var isManual = Boolean(options.manual);
    lastCheckAt = Date.now();

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (isManual) showToast(t('status.offline', 'Offline'), 'warning');
      return { status: 'offline' };
    }

    var previousInitialBuildId = initialVersionInfo ? initialVersionInfo.buildId : null;
    var remote = await fetchVersionInfo();

    if (registration && typeof registration.update === 'function') {
      try {
        await registration.update();
      } catch (_) {}
    }

    if (registration && registration.waiting && navigator.serviceWorker && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting;
      if (isManual || options.source === 'visibility') {
        dismissed = false;
      }
      renderUpdateBanner();
      emitStateChange();
      return { status: 'update-ready', versionInfo: remote || initialVersionInfo };
    }

    if (registration && registration.installing) {
      var becameWaiting = await waitForInstallingDecision(registration, 4000);
      if (becameWaiting || (registration.waiting && navigator.serviceWorker && navigator.serviceWorker.controller)) {
        waitingWorker = registration.waiting || waitingWorker;
        dismissed = false;
        renderUpdateBanner();
        emitStateChange();
        return { status: 'update-ready', versionInfo: remote || initialVersionInfo };
      }
    }

    if (remote && previousInitialBuildId && remote.buildId !== previousInitialBuildId) {
      if (registration && typeof registration.update === 'function') {
        try {
          await registration.update();
        } catch (_) {}
      }
      if (registration && registration.waiting && navigator.serviceWorker && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        dismissed = false;
        renderUpdateBanner();
        emitStateChange();
        return { status: 'update-ready', versionInfo: remote };
      }
    }

    if (isManual) {
      showToast(t('pwa.latest_version', "You're on the latest version"), 'success');
    }
    emitStateChange();
    return { status: 'up-to-date', versionInfo: remote || initialVersionInfo };
  }

  function wireEvents() {
    if (!global.document || !global.addEventListener) return;

    global.document.addEventListener('visibilitychange', function () {
      if (global.document.visibilityState !== 'visible') return;
      var now = Date.now();
      if (now - lastVisibilityAt < VISIBILITY_DEBOUNCE_MS) return;
      lastVisibilityAt = now;
      if (waitingWorker || (registration && registration.waiting && navigator.serviceWorker && navigator.serviceWorker.controller)) {
        dismissed = false;
        renderUpdateBanner();
        emitStateChange();
      }
      checkForUpdates({ source: 'visibility' });
    });

    global.addEventListener('focus', function () {
      var now = Date.now();
      if (now - lastFocusCheckAt < FOCUS_THROTTLE_MS || now - lastCheckAt < FOCUS_THROTTLE_MS) {
        return;
      }
      lastFocusCheckAt = now;
      checkForUpdates({ source: 'focus' });
    });

    global.addEventListener('online', function () {
      checkForUpdates({ source: 'online' });
    });

    global.addEventListener('frose:language-changed', function () {
      refreshBannerText();
      emitStateChange();
    });

    if (!pollTimerId) {
      pollTimerId = global.setInterval(function () {
        checkForUpdates({ source: 'poll' });
      }, POLL_INTERVAL_MS);
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;

    wireEvents();
    await fetchVersionInfo();

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadControllerAtStart && !userTriggeredUpdate) {
        hadControllerAtStart = true;
        return;
      }
      triggerSafeReload();
    });

    try {
      registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });

      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        renderUpdateBanner();
        emitStateChange();
      }

      if (registration.installing) {
        attachInstallingWorker(registration.installing);
      }

      registration.addEventListener('updatefound', function () {
        if (registration && registration.installing) {
          attachInstallingWorker(registration.installing);
        }
      });

      if (typeof navigator.onLine === 'undefined' || navigator.onLine) {
        registration.update().catch(function () {});
      }
    } catch (_) {}
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (item) {
        return item !== fn;
      });
    };
  }

  global.FrosePwaUpdater = {
    init: init,
    checkForUpdates: checkForUpdates,
    applyUpdate: applyUpdate,
    getVersionInfo: function () {
      return initialVersionInfo || latestVersionInfo;
    },
    formatVersionLabel: formatVersionLabel,
    hasWaitingUpdate: function () {
      return Boolean(
        waitingWorker ||
          (registration && registration.waiting && typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller)
      );
    },
    getState: getStateSnapshot,
    subscribe: subscribe,
  };

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
