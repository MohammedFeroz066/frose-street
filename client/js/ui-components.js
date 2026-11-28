/**
 * FROSE Street — CSP-Safe UI Kit Components (Phase 4 UX-02)
 * Strictly uses FroseSafeDom (createElement/textContent/addEventListener).
 * Zero unsafe HTML string sinks or inline attributes.
 */
(function (global) {
  'use strict';

  function getSafeDom() {
    if (global.FroseSafeDom) return global.FroseSafeDom;
    if (typeof require === 'function') {
      try { return require('./safe-dom.js'); } catch (_) {}
    }
    return null;
  }

  function formatINR(paiseInput, opts) {
    var options = opts || {};
    var p = typeof paiseInput === 'bigint' ? paiseInput : BigInt(Math.round(Number(paiseInput || 0)));
    var negative = p < 0n;
    var abs = negative ? -p : p;
    var rupees = Number(abs / 100n);
    var rem = Number(abs % 100n);
    var prefix = negative ? '-₹' : '₹';
    var rupeeStr = rupees.toLocaleString('en-IN');
    if (options.alwaysDecimals || rem !== 0) {
      return prefix + rupeeStr + '.' + String(rem).padStart(2, '0');
    }
    return prefix + rupeeStr;
  }

  function showToast(message, variant, durationMs) {
    if (!global.document || !global.document.body) return null;
    var dom = getSafeDom();
    if (!dom) return null;
    var stack = global.document.getElementById('frose-toast-stack');
    if (!stack) {
      stack = dom.el('div', { id: 'frose-toast-stack', class: 'saas-toast-stack', role: 'status', 'aria-live': 'polite' });
      global.document.body.appendChild(stack);
    }
    var cls = 'saas-toast';
    if (variant === 'success') cls += ' toast-success';
    else if (variant === 'warning') cls += ' toast-warning';
    else if (variant === 'danger') cls += ' toast-danger';

    var toast = dom.el('div', { class: cls }, [
      dom.el('span', {}, String(message || '')),
    ]);
    stack.appendChild(toast);
    var ms = typeof durationMs === 'number' && durationMs > 0 ? durationMs : 2600;
    setTimeout(function () {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, ms);
    return toast;
  }

  var overlayStack = [];
  var suppressPopstateCount = 0;

  function syncModalScrollLock() {
    if (!global.document || !global.document.body) return;
    var remaining = global.document.querySelectorAll('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active');
    var locked = overlayStack.length > 0 || remaining.length > 0;
    global.document.body.classList.toggle('saas-modal-open', locked);
    global.document.documentElement.classList.toggle('saas-modal-open', locked);
  }

  function removeFromOverlayStack(id) {
    overlayStack = overlayStack.filter(function (entry) { return entry.id !== id; });
  }

  function openSheet(id, opts) {
    if (!global.document) return;
    var options = opts || {};
    var node = global.document.getElementById(id);
    if (!node) return;
    node.classList.add('active');
    if (!overlayStack.some(function (entry) { return entry.id === id; })) {
      overlayStack.push({
        id: id,
        onClose: typeof options.onClose === 'function' ? options.onClose : null,
        staticBackdrop: node.getAttribute('data-static-backdrop') === 'true',
      });
      if (!options.skipHistory && global.history && typeof global.history.pushState === 'function') {
        try {
          var nextState = Object.assign({}, global.history.state || {}, { froseOverlay: id });
          global.history.pushState(nextState, '', '');
        } catch (_) {}
      }
    }
    syncModalScrollLock();
  }

  function closeSheet(id, opts) {
    if (!global.document) return;
    var options = opts || {};
    var entry = overlayStack.find(function (item) { return item.id === id; });
    removeFromOverlayStack(id);
    var node = global.document.getElementById(id);
    if (node) node.classList.remove('active');
    if (entry && typeof entry.onClose === 'function' && !options.skipOnClose) {
      try { entry.onClose(); } catch (_) {}
    }
    syncModalScrollLock();

    if (!options.fromPopstate && global.history && global.history.state && global.history.state.froseOverlay === id) {
      setTimeout(function () {
        var stillClosed = !overlayStack.some(function (item) { return item.id === id; });
        if (stillClosed && global.history && global.history.state && global.history.state.froseOverlay === id) {
          suppressPopstateCount += 1;
          try { global.history.back(); } catch (_) { suppressPopstateCount = Math.max(0, suppressPopstateCount - 1); }
        }
      }, 0);
    }
  }

  function closeTopOverlay(opts) {
    if (overlayStack.length > 0) {
      var top = overlayStack[overlayStack.length - 1];
      closeSheet(top.id, opts);
      return true;
    }
    if (!global.document) return false;
    var activeNodes = global.document.querySelectorAll('.saas-drawer-backdrop.active, .saas-sheet-backdrop.active, .modal-overlay.active');
    if (activeNodes.length > 0) {
      var last = activeNodes[activeNodes.length - 1];
      last.classList.remove('active');
      syncModalScrollLock();
      return true;
    }
    return false;
  }

  function getOverlayStack() {
    return overlayStack.map(function (entry) { return entry.id; });
  }

  function consumeSuppressedPopstate() {
    if (suppressPopstateCount > 0) {
      suppressPopstateCount -= 1;
      return true;
    }
    return false;
  }

  if (global.document && typeof global.document.addEventListener === 'function' && !global.__FROSE_OVERLAY_LISTENERS__) {
    global.__FROSE_OVERLAY_LISTENERS__ = true;

    // Global tap-outside backdrop dismissal (unless data-static-backdrop="true")
    global.document.addEventListener('click', function (e) {
      var target = e.target;
      if (!target || !target.classList) return;
      var isBackdrop = target.classList.contains('saas-sheet-backdrop') ||
        target.classList.contains('saas-drawer-backdrop') ||
        target.classList.contains('modal-overlay');
      if (!isBackdrop || !target.classList.contains('active')) return;
      if (target.getAttribute('data-static-backdrop') === 'true') return;
      if (target.id === 'frose-confirm-modal') return; // handled directly by confirmModal
      if (target.id) {
        closeSheet(target.id);
      } else {
        target.classList.remove('active');
        syncModalScrollLock();
      }
    });

    // Global Escape key dismissal for topmost overlay
    global.document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var confirmBackdrop = global.document.getElementById('frose-confirm-modal');
      if (confirmBackdrop && confirmBackdrop.classList.contains('active')) return; // confirmModal handles Escape
      if (overlayStack.length > 0 || global.document.querySelector('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active')) {
        e.preventDefault();
        closeTopOverlay();
      }
    });

    if (typeof global.addEventListener === 'function') {
      global.addEventListener('popstate', function () {
        if (global.__FROSE_CUSTOM_POPSTATE__) return;
        if (consumeSuppressedPopstate()) return;
        if (overlayStack.length > 0) {
          closeTopOverlay({ fromPopstate: true });
        }
      });
    }
  }

  function confirmModal(opts) {
    var options = opts || {};
    var dom = getSafeDom();
    if (!dom || !global.document || !global.document.body) {
      return Promise.resolve(false);
    }
    return new Promise(function (resolve) {
      var existing = global.document.getElementById('frose-confirm-modal');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      var settled = false;
      var inputNode = null;
      function onKeyDown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish(options.returnObject ? { confirmed: false, value: '' } : false);
        }
      }
      function finish(result) {
        if (settled) return;
        settled = true;
        global.document.removeEventListener('keydown', onKeyDown);
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
        var remaining = global.document.querySelectorAll('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active');
        if (remaining.length === 0) {
          global.document.body.classList.remove('saas-modal-open');
          global.document.documentElement.classList.remove('saas-modal-open');
        }
        resolve(result);
      }

      var bodyNodes = [
        dom.el('div', { class: 'saas-sheet-handle' }),
        dom.el('h3', { style: 'margin: 0 0 8px 0; font-size: 17px; font-weight: 800;' }, options.title || 'Confirm Action'),
        dom.el('p', { style: 'margin: 0 0 14px 0; font-size: 14px; color: var(--text-secondary); line-height: 1.5;' }, options.message || 'Are you sure?'),
      ];

      if (options.inputLabel) {
        inputNode = dom.el('input', {
          type: 'text',
          class: 'saas-input',
          placeholder: options.inputPlaceholder || '',
          value: options.inputDefault || '',
          style: 'margin-bottom: 14px;',
        });
        bodyNodes.push(
          dom.el('label', { class: 'saas-label', style: 'display: block; margin-bottom: 6px;' }, options.inputLabel),
          inputNode
        );
      }

      bodyNodes.push(
        dom.el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
          dom.el('button', {
            type: 'button',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function () { finish(options.returnObject ? { confirmed: false, value: '' } : false); } },
          }, options.cancelLabel || 'Cancel'),
          dom.el('button', {
            type: 'button',
            class: options.danger ? 'saas-btn saas-btn-danger' : 'saas-btn saas-btn-primary',
            on: {
              click: function () {
                var val = inputNode ? String(inputNode.value || '').trim() : '';
                if (options.inputRequired && !val) {
                  if (inputNode) inputNode.focus();
                  showToast(options.inputRequiredMessage || 'Please enter a reason to continue', 'warning');
                  return;
                }
                finish(options.returnObject ? { confirmed: true, value: val } : true);
              },
            },
          }, options.confirmLabel || 'Confirm'),
        ])
      );

      var backdrop = dom.el('div', {
        id: 'frose-confirm-modal',
        class: 'saas-sheet-backdrop active',
        on: {
          click: function (e) {
            if (e.target === backdrop) finish(options.returnObject ? { confirmed: false, value: '' } : false);
          },
        },
      }, [
        dom.el('div', { class: 'saas-sheet', role: 'dialog', 'aria-modal': 'true' }, bodyNodes),
      ]);

      global.document.addEventListener('keydown', onKeyDown);
      global.document.body.classList.add('saas-modal-open');
      global.document.body.appendChild(backdrop);
      if (inputNode) setTimeout(function () { inputNode.focus(); }, 30);
    });
  }

  function renderSkeletonList(container, count) {
    var dom = getSafeDom();
    if (!container || !dom) return;
    dom.clear(container);
    var n = typeof count === 'number' && count > 0 ? count : 4;
    for (var i = 0; i < n; i++) {
      container.appendChild(dom.el('div', { class: 'saas-skeleton', style: 'margin-bottom: 10px;' }));
    }
  }

  function createStatusPill(label, variant) {
    var dom = getSafeDom();
    if (!dom) return null;
    var map = {
      emerald: 'saas-pill-emerald',
      amber: 'saas-pill-amber',
      rose: 'saas-pill-rose',
      blue: 'saas-pill-blue',
      slate: 'saas-pill-slate',
    };
    var vClass = map[variant] || 'saas-pill-slate';
    return dom.el('span', { class: 'saas-pill ' + vClass }, String(label || ''));
  }

  function createVegBadge(isVeg) {
    var dom = getSafeDom();
    if (!dom) return null;
    return dom.el('span', {
      class: 'saas-veg-badge' + (isVeg === false ? ' nonveg' : ''),
      title: isVeg === false ? 'Non-Veg' : 'Veg',
      'aria-label': isVeg === false ? 'Non-Veg' : 'Veg',
    });
  }

  function renderSegmentedControl(container, options, activeValue, handleSelect) {
    var dom = getSafeDom();
    if (!container || !dom) return;
    dom.clear(container);
    var wrap = dom.el('div', { class: 'saas-segmented' });
    (options || []).forEach(function (opt) {
      var btn = dom.el('button', {
        type: 'button',
        class: 'saas-seg-btn' + (opt.value === activeValue ? ' active' : ''),
        on: {
          click: function () {
            if (typeof handleSelect === 'function') handleSelect(opt.value);
          },
        },
      }, opt.label);
      wrap.appendChild(btn);
    });
    container.appendChild(wrap);
  }

  function renderThemeIcon(containerEl, theme) {
    var dom = getSafeDom();
    if (!containerEl || !dom) return;
    dom.clear(containerEl);
    var t = String(theme || 'light').toLowerCase();
    var attrs = {
      viewBox: '0 0 24 24',
      width: 18,
      height: 18,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': 1.75,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
    };
    if (t === 'dark') {
      containerEl.appendChild(
        dom.svgEl('svg', attrs, [
          dom.svgEl('path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }),
        ])
      );
    } else if (t === 'sunlight') {
      containerEl.appendChild(
        dom.svgEl('svg', attrs, [
          dom.svgEl('circle', { cx: 12, cy: 12, r: 5 }),
          dom.svgEl('path', { d: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42' }),
        ])
      );
    } else {
      containerEl.appendChild(
        dom.svgEl('svg', attrs, [
          dom.svgEl('circle', { cx: 12, cy: 12, r: 4 }),
          dom.svgEl('path', { d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41' }),
        ])
      );
    }
  }

  var api = {
    formatINR: formatINR,
    showToast: showToast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    closeTopOverlay: closeTopOverlay,
    getOverlayStack: getOverlayStack,
    consumeSuppressedPopstate: consumeSuppressedPopstate,
    confirmModal: confirmModal,
    renderSkeletonList: renderSkeletonList,
    createStatusPill: createStatusPill,
    createVegBadge: createVegBadge,
    renderSegmentedControl: renderSegmentedControl,
    renderThemeIcon: renderThemeIcon,
  };

  global.FroseUI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
