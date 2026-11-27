/**
 * FROSE STREET — Super Admin Enterprise SaaS Console
 * CSP-safe, zero-emoji, theme-aware controller built on FroseSafeDom & FroseUI.
 */
(function () {
  'use strict';

  try {
    localStorage.removeItem('frose_vendors_directory');
  } catch (_) {}

  if (!localStorage.getItem('frose_session_active')) {
    window.location.replace('/login');
    return;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICON_PATHS = {
    search: [
      ['circle', { cx: '11', cy: '11', r: '8' }],
      ['line', { x1: '21', y1: '21', x2: '16.65', y2: '16.65' }],
    ],
    more: [
      ['circle', { cx: '12', cy: '12', r: '1.5' }],
      ['circle', { cx: '19', cy: '12', r: '1.5' }],
      ['circle', { cx: '5', cy: '12', r: '1.5' }],
    ],
    inspect: [
      ['path', { d: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z' }],
      ['circle', { cx: '12', cy: '12', r: '3' }],
    ],
    message: [
      ['path', { d: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' }],
    ],
    qr: [
      ['rect', { x: '3', y: '3', width: '7', height: '7' }],
      ['rect', { x: '14', y: '3', width: '7', height: '7' }],
      ['rect', { x: '3', y: '14', width: '7', height: '7' }],
      ['path', { d: 'M14 14h3v3h-3z' }],
      ['path', { d: 'M18 18h3v3h-3z' }],
    ],
    ledger: [
      ['line', { x1: '18', y1: '20', x2: '18', y2: '10' }],
      ['line', { x1: '12', y1: '20', x2: '12', y2: '4' }],
      ['line', { x1: '6', y1: '20', x2: '6', y2: '14' }],
    ],
    edit: [
      ['path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }],
      ['path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }],
    ],
    menu: [
      ['line', { x1: '8', y1: '6', x2: '21', y2: '6' }],
      ['line', { x1: '8', y1: '12', x2: '21', y2: '12' }],
      ['line', { x1: '8', y1: '18', x2: '21', y2: '18' }],
      ['line', { x1: '3', y1: '6', x2: '3.01', y2: '6' }],
      ['line', { x1: '3', y1: '12', x2: '3.01', y2: '12' }],
      ['line', { x1: '3', y1: '18', x2: '3.01', y2: '18' }],
    ],
    receipt: [
      ['path', { d: 'M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z' }],
      ['path', { d: 'M8 7h8' }],
      ['path', { d: 'M8 11h8' }],
    ],
    power: [
      ['path', { d: 'M18.36 6.64a9 9 0 1 1-12.73 0' }],
      ['line', { x1: '12', y1: '2', x2: '12', y2: '12' }],
    ],
    cloud: [
      ['path', { d: 'M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z' }],
    ],
    smartphone: [
      ['rect', { x: '5', y: '2', width: '14', height: '20', rx: '2', ry: '2' }],
      ['line', { x1: '12', y1: '18', x2: '12.01', y2: '18' }],
    ],
    sun: [
      ['circle', { cx: '12', cy: '12', r: '4' }],
      ['path', { d: 'M12 2v2' }],
      ['path', { d: 'M12 20v2' }],
      ['path', { d: 'm4.93 4.93 1.41 1.41' }],
      ['path', { d: 'm17.66 17.66 1.41 1.41' }],
      ['path', { d: 'M2 12h2' }],
      ['path', { d: 'M20 12h2' }],
      ['path', { d: 'm6.34 17.66-1.41 1.41' }],
      ['path', { d: 'm19.07 4.93-1.41 1.41' }],
    ],
    moon: [
      ['path', { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' }],
    ],
    contrast: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'M12 18a6 6 0 0 0 0-12v12z' }],
    ],
    check: [
      ['polyline', { points: '20 6 9 17 4 12' }],
    ],
    alert: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['line', { x1: '12', y1: '8', x2: '12', y2: '12' }],
      ['line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }],
    ],
  };

  function createIcon(name, size) {
    const px = size || 16;
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', String(px));
    svg.setAttribute('height', String(px));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    const shapes = ICON_PATHS[name] || ICON_PATHS.alert;
    shapes.forEach(([tag, attrs]) => {
      const node = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
      svg.appendChild(node);
    });
    return svg;
  }

  window.FroseAdminIcons = { create: createIcon };

  const VIEW_TITLES = {
    dashboard: 'Platform Overview',
    vendors: 'Vendors Directory',
    subscriptions: 'Subscriptions Ledger',
    analytics: 'Platform Sales Intelligence',
    users: 'Users & Staff Directory',
    audit: 'Audit & System Health',
    settings: 'Platform Settings',
    'add-restaurant': 'Provision New Stall',
  };

  let activeView = 'dashboard';
  let allVendors = [];
  let allUsers = [];
  let currentFilter = 'all';
  let currentSort = 'newest';
  let searchQuery = '';
  let usersSearchQuery = '';
  let usersRoleFilter = 'all';
  let vendorPage = 1;
  const VENDORS_PER_PAGE = 20;
  let activeVendorForMenu = null;
  let currentStallForQR = null;
  let activeQRSetupUrl = '';
  let platformNotifications = [];
  let pendingDeepLinkVendorId = null;

  function buildAdminUrl(viewName, vendorId) {
    const params = new URLSearchParams();
    params.set('tab', viewName || 'dashboard');
    if (vendorId) params.set('vendor', String(vendorId));
    return '?' + params.toString();
  }

  async function withButtonLock(btn, busyLabel, fn) {
    if (!btn) return fn();
    if (btn.disabled) return;
    const prevText = btn.textContent;
    btn.disabled = true;
    if (busyLabel) btn.textContent = busyLabel;
    try {
      return await fn();
    } finally {
      btn.disabled = false;
      if (busyLabel && btn.textContent === busyLabel) btn.textContent = prevText;
    }
  }

  function formatRupees(paise) {
    const p = typeof paise === 'string' ? BigInt(paise || '0') : BigInt(paise || 0);
    const rupees = Number(p / 100n);
    return '₹' + rupees.toLocaleString('en-IN');
  }

  function formatDate(isoStr, fallbackText = 'No expiry') {
    if (!isoStr) return fallbackText;
    try {
      const raw = isoStr instanceof Date ? isoStr : new Date(String(isoStr).trim());
      if (Number.isNaN(raw.getTime())) return fallbackText;
      return raw.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return fallbackText;
    }
  }

  function notify(msg, variant = 'info') {
    if (window.FroseUI && typeof window.FroseUI.showToast === 'function') {
      window.FroseUI.showToast(msg, variant);
    }
  }

  async function apiFetch(endpoint, options = {}) {
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn(endpoint, { ...options, credentials: 'same-origin' });
      if (!res || res.status === 401 || res.status === 403) {
        localStorage.removeItem('frose_session_active');
        return null;
      }
      return res;
    } catch (_) {
      return null;
    }
  }

  function syncScrollLock() {
    const anyOpen = document.querySelectorAll(
      '.modal-overlay.active, .saas-drawer-backdrop.active, .saas-sheet-backdrop.active'
    ).length > 0;
    document.body.classList.toggle('saas-modal-open', anyOpen);
    document.documentElement.classList.toggle('saas-modal-open', anyOpen);
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    syncScrollLock();
    if (modalId === 'modal-system-health') loadSystemHealth();
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
    syncScrollLock();
  }

  function closeAllOverflowMenus() {
    document.querySelectorAll('.admin-overflow-menu.open').forEach((m) => m.classList.remove('open'));
  }

  function dismissTopmostLayer() {
    const confirmModalEl = document.getElementById('frose-confirm-modal');
    if (confirmModalEl) {
      confirmModalEl.click();
      return true;
    }
    const activeModals = Array.from(document.querySelectorAll('.modal-overlay.active'));
    if (activeModals.length > 0) {
      closeModal(activeModals[activeModals.length - 1].id);
      return true;
    }
    const notifDrawer = document.getElementById('notifications-drawer');
    if (notifDrawer && notifDrawer.classList.contains('active')) {
      closeModal('notifications-drawer');
      return true;
    }
    const moreSheet = document.getElementById('mobile-more-sheet');
    if (moreSheet && moreSheet.classList.contains('active')) {
      closeModal('mobile-more-sheet');
      return true;
    }
    const inspectorDrawer = document.getElementById('vendor-inspector-drawer');
    if (inspectorDrawer && inspectorDrawer.classList.contains('active')) {
      closeVendorInspector(true);
      return true;
    }
    const openMenus = document.querySelectorAll('.admin-overflow-menu.open');
    const userDrop = document.getElementById('user-dropdown');
    if (openMenus.length > 0 || (userDrop && userDrop.classList.contains('active'))) {
      closeAllOverflowMenus();
      userDrop?.classList.remove('active');
      return true;
    }
    return false;
  }

  function switchView(viewName, pushHistory = true) {
    if (!VIEW_TITLES[viewName]) viewName = 'dashboard';
    if (pushHistory && (activeView !== viewName || (history.state && history.state.vendorId))) {
      history.pushState({ view: viewName, vendorId: null }, '', buildAdminUrl(viewName, null));
    }
    activeView = viewName;

    document.querySelectorAll('.saas-view').forEach((v) => v.classList.remove('active'));
    document.getElementById('view-' + viewName)?.classList.add('active');

    document.querySelectorAll('[data-nav-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-nav-view') === viewName);
    });

    const crumbTitle = document.getElementById('topbar-view-title');
    if (crumbTitle) crumbTitle.textContent = VIEW_TITLES[viewName];

    closeModal('mobile-more-sheet');
    closeAllOverflowMenus();

    if (viewName === 'vendors') renderStallsTable();
    if (viewName === 'users') loadUsers();
    if (viewName === 'analytics') loadAnalytics();
    if (viewName === 'subscriptions') loadSubscriptionsView();
    if (viewName === 'audit') loadAuditAndHealthView();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadOverview() {
    let stats = {
      totalVendors: allVendors.length,
      activeVendors: allVendors.filter((v) => v.subscriptionStatus === 'active').length,
      trialVendors: allVendors.filter((v) => v.subscriptionStatus === 'trial').length,
      expiredVendors: allVendors.filter((v) => v.subscriptionStatus === 'expired' || v.paymentStatus === 'overdue').length,
      expiringVendors: allVendors.filter((v) => v.paymentStatus === 'due_soon').length,
      suspendedVendors: allVendors.filter((v) => v.subscriptionStatus === 'suspended').length,
      cloudVendors: allVendors.filter((v) => v.edition !== 'local').length,
      localVendors: allVendors.filter((v) => v.edition === 'local').length,
      grossSalesPaise: allVendors.reduce((s, v) => s + BigInt(v.lifetimeSalesPaise || '0'), 0n).toString(),
      cashSalesPaise: '0',
      upiSalesPaise: '0',
      totalCollectedPaise: allVendors.reduce((s, v) => s + BigInt(v.totalCollectedPaise || '0'), 0n).toString(),
      totalPendingPaise: allVendors.reduce((s, v) => s + BigInt(v.pendingDuePaise || '0'), 0n).toString(),
      todayOrders: 0,
      activeDevicesCount: allVendors.reduce((s, v) => s + (v.activeDevices || 0), 0),
    };

    const res = await apiFetch('/api/v1/admin/overview');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (json.data) stats = { ...stats, ...json.data };
      } catch (_) {}
    }

    const heroSub = document.getElementById('hero-status-sub');
    if (heroSub) {
      heroSub.textContent = `${stats.activeVendors} Stalls Active • ${stats.cloudVendors} Cloud • ${stats.localVendors} Mobile P2P`;
    }

    const railCount = document.getElementById('rail-count-vendors');
    if (railCount) railCount.textContent = String(stats.totalVendors);

    const setTxt = (id, val) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(val);
    };

    setTxt('kpi-val-restaurants', stats.totalVendors);
    setTxt('kpi-sub-active', stats.activeVendors);
    setTxt('kpi-sub-trial', stats.trialVendors);
    setTxt('kpi-sub-expired', stats.expiredVendors);
    setTxt('kpi-val-revenue', formatRupees(stats.grossSalesPaise));
    setTxt('kpi-sub-cash', formatRupees(stats.cashSalesPaise));
    setTxt('kpi-sub-upi', formatRupees(stats.upiSalesPaise));
    setTxt('kpi-val-collections', formatRupees(stats.totalCollectedPaise));
    setTxt('kpi-val-orders', stats.todayOrders);
    setTxt('kpi-sub-devices', `${stats.activeDevicesCount} Active Devices Online`);

    const elSubRenew = document.getElementById('kpi-sub-renewals');
    if (elSubRenew && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(elSubRenew);
      elSubRenew.append(
        'Recv: ',
        el('strong', {}, [formatRupees(stats.totalCollectedPaise)]),
        ' • Due: ',
        el('strong', {}, [formatRupees(stats.totalPendingPaise)])
      );
    }

    setTxt('count-all', stats.totalVendors);
    setTxt('count-active', stats.activeVendors);
    setTxt('count-trial', stats.trialVendors);
    setTxt('count-expiring', stats.expiringVendors);
    setTxt('count-expired', stats.expiredVendors);
    setTxt('count-suspended', stats.suspendedVendors || 0);
    setTxt('count-cloud', stats.cloudVendors);
    setTxt('count-local', stats.localVendors);
    setTxt('count-gst', allVendors.filter((v) => v.taxMode && v.taxMode !== 'unregistered').length);

    renderActionNeededToday();
  }

  function renderActionNeededToday() {
    const list = document.getElementById('action-needed-list');
    if (!list || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    clear(list);

    const now = Date.now();
    const in7Days = now + 7 * 86400000;
    const urgent = allVendors.filter((v) => {
      const st = v.subscriptionStatus || 'active';
      const exp = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : 0;
      return st === 'suspended' || st === 'expired' || (exp > 0 && exp <= in7Days);
    }).slice(0, 5);

    if (urgent.length === 0) {
      list.appendChild(el('div', { class: 'admin-empty-box' }, ['All stalls are healthy and up to date.']));
      return;
    }

    urgent.forEach((v) => {
      const st = v.subscriptionStatus || 'active';
      const pillClass = st === 'suspended' || st === 'expired' ? 'overdue' : 'due_soon';
      list.appendChild(
        el('button', {
          type: 'button',
          class: 'admin-action-row',
          on: { click: () => openVendorInspector(v.id) },
        }, [
          el('div', {}, [
            el('div', { style: 'font-weight: 800; font-size: 13.5px;' }, [v.businessName || 'Stall']),
            el('div', { class: 'brand-platform-sub' }, [`${v.ownerName || 'Owner'} • ${v.phone || ''} • Due ${formatDate(v.subscriptionExpiresAt)}`]),
          ]),
          el('span', { class: `badge-status ${pillClass}` }, [st.toUpperCase()]),
        ])
      );
    });
  }

  async function loadVendors() {
    const tbody = document.getElementById('stalls-table-body');
    if (tbody && window.FroseSafeDom && allVendors.length === 0) {
      const { el, clear } = window.FroseSafeDom;
      clear(tbody);
      tbody.appendChild(
        el('tr', { 'data-empty-row': 'true' }, [
          el('td', { colspan: '7', style: 'padding: 16px;' }, [
            el('div', { class: 'saas-skeleton' }),
          ]),
        ])
      );
    }

    const res = await apiFetch('/api/v1/admin/vendors');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data)) {
          allVendors = json.data.filter((v) => !v.isSuperadmin && !v.is_superadmin);
        }
      } catch (_) {}
    }

    renderStallsTable();
    loadOverview();
    loadNotifications();

    if (pendingDeepLinkVendorId) {
      const targetId = pendingDeepLinkVendorId;
      pendingDeepLinkVendorId = null;
      openVendorInspector(targetId, true);
    }
  }

  function getFilteredSortedVendors() {
    const query = searchQuery.toLowerCase().trim();
    const now = Date.now();
    const in7Days = now + 7 * 86400000;

    const filtered = allVendors.filter((v) => {
      const bName = (v.businessName || '').toLowerCase();
      const oName = (v.ownerName || '').toLowerCase();
      const ph = (v.phone || '').toLowerCase();
      const city = (v.city || '').toLowerCase();
      const idStr = (v.id || '').toLowerCase();
      if (query && !bName.includes(query) && !oName.includes(query) && !ph.includes(query) && !city.includes(query) && !idStr.includes(query)) {
        return false;
      }

      const status = v.subscriptionStatus || 'active';
      const expiresAt = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : 0;
      const edition = v.edition || 'cloud';

      if (currentFilter === 'active') return status === 'active' && expiresAt >= now;
      if (currentFilter === 'trial') return status === 'trial';
      if (currentFilter === 'suspended') return status === 'suspended';
      if (currentFilter === 'expired') return status === 'expired' || (status !== 'suspended' && status !== 'trial' && expiresAt > 0 && expiresAt < now);
      if (currentFilter === 'expiring') return status !== 'suspended' && expiresAt > now && expiresAt <= in7Days;
      if (currentFilter === 'cloud') return edition === 'cloud';
      if (currentFilter === 'local') return edition === 'local';
      if (currentFilter === 'gst') return Boolean(v.taxMode && v.taxMode !== 'unregistered');
      return true;
    });

    filtered.sort((a, b) => {
      if (currentSort === 'name') return (a.businessName || '').localeCompare(b.businessName || '');
      if (currentSort === 'revenue') {
        const diff = BigInt(b.lifetimeSalesPaise || '0') - BigInt(a.lifetimeSalesPaise || '0');
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      }
      if (currentSort === 'expiry') {
        const ta = a.subscriptionExpiresAt ? new Date(a.subscriptionExpiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        const tb = b.subscriptionExpiresAt ? new Date(b.subscriptionExpiresAt).getTime() : Number.MAX_SAFE_INTEGER;
        return ta - tb;
      }
      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return cb - ca;
    });

    return filtered;
  }

  function buildVendorBadge(v) {
    const now = Date.now();
    const in7Days = now + 7 * 86400000;
    const status = v.subscriptionStatus || 'active';
    const expiresAt = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : 0;

    if (status === 'suspended') return { cls: 'suspended', label: 'SUSPENDED' };
    if (status === 'trial') return { cls: 'trial', label: 'TRIAL' };
    if (status === 'expired' || (expiresAt > 0 && expiresAt < now)) return { cls: 'overdue', label: 'EXPIRED' };
    if (expiresAt > now && expiresAt <= in7Days) return { cls: 'due_soon', label: 'DUE SOON' };
    return { cls: 'active', label: 'ACTIVE' };
  }

  function buildOverflowMenu(v, badge) {
    const { el } = window.FroseSafeDom;
    const isSuspended = (v.subscriptionStatus || 'active') === 'suspended';
    const menu = el('div', { class: 'admin-overflow-menu', role: 'menu' }, [
      el('button', { type: 'button', class: 'admin-overflow-item', 'data-action': 'qr', 'data-phone': v.phone || '' }, [
        createIcon('qr', 15), el('span', {}, ['Setup QR']),
      ]),
      el('button', { type: 'button', class: 'admin-overflow-item', 'data-action': 'ledger', 'data-id': v.id }, [
        createIcon('ledger', 15), el('span', {}, ['Fiscal Ledger']),
      ]),
      el('button', { type: 'button', class: 'admin-overflow-item', 'data-action': 'edit', 'data-id': v.id }, [
        createIcon('edit', 15), el('span', {}, ['Edit Stall']),
      ]),
      el('button', { type: 'button', class: 'admin-overflow-item', 'data-action': 'menu', 'data-id': v.id, 'data-name': v.businessName || '' }, [
        createIcon('menu', 15), el('span', {}, ['Menu Manager']),
      ]),
      el('button', { type: 'button', class: 'admin-overflow-item', 'data-action': 'receipt', 'data-id': v.id }, [
        createIcon('receipt', 15), el('span', {}, ['Tax Receipt']),
      ]),
      el('button', {
        type: 'button',
        class: isSuspended ? 'admin-overflow-item' : 'admin-overflow-item danger',
        'data-action': 'toggle-suspend',
        'data-id': v.id,
        'data-status': badge.label,
      }, [
        createIcon('power', 15), el('span', {}, [isSuspended ? 'Reactivate Stall' : 'Suspend Stall']),
      ]),
    ]);

    const trigger = el('button', {
      type: 'button',
      class: 'btn-table-action icon-only admin-overflow-trigger',
      title: 'More actions',
      'aria-label': 'More actions for ' + (v.businessName || 'stall'),
      on: {
        click: (e) => {
          e.stopPropagation();
          const wasOpen = menu.classList.contains('open');
          closeAllOverflowMenus();
          if (!wasOpen) menu.classList.add('open');
        },
      },
    }, [createIcon('more', 16)]);

    return el('div', { class: 'admin-overflow-wrap' }, [trigger, menu]);
  }

  function renderStallsTable() {
    const tbody = document.getElementById('stalls-table-body');
    const mobileCards = document.getElementById('stalls-mobile-cards');
    const pageInfo = document.getElementById('vendors-page-info');
    const prevBtn = document.getElementById('btn-vendors-prev');
    const nextBtn = document.getElementById('btn-vendors-next');
    if (!tbody || !window.FroseSafeDom) return;

    const { el, clear } = window.FroseSafeDom;
    const filtered = getFilteredSortedVendors();
    const totalPages = Math.max(1, Math.ceil(filtered.length / VENDORS_PER_PAGE));
    if (vendorPage > totalPages) vendorPage = totalPages;
    const startIdx = (vendorPage - 1) * VENDORS_PER_PAGE;
    const pageItems = filtered.slice(startIdx, startIdx + VENDORS_PER_PAGE);

    clear(tbody);
    if (mobileCards) clear(mobileCards);

    if (pageInfo) {
      pageInfo.textContent = filtered.length === 0
        ? 'Showing 0 stalls'
        : `Showing ${startIdx + 1}-${startIdx + pageItems.length} of ${filtered.length} stalls`;
    }
    if (prevBtn) prevBtn.disabled = vendorPage <= 1;
    if (nextBtn) nextBtn.disabled = vendorPage >= totalPages;

    if (pageItems.length === 0) {
      const msg = allVendors.length === 0
        ? 'No restaurant stalls onboarded yet. Provision your first stall to view live telemetry.'
        : 'No stalls match your current search or filter criteria.';
      tbody.appendChild(
        el('tr', { 'data-empty-row': 'true' }, [
          el('td', { colspan: '7', class: 'admin-empty-box' }, [
            el('div', { style: 'margin-bottom: 10px; font-weight: 700;' }, [msg]),
            allVendors.length === 0
              ? el('button', {
                  type: 'button',
                  class: 'saas-btn saas-btn-primary admin-btn-compact',
                  on: { click: () => switchView('add-restaurant') },
                }, ['+ Add Stall'])
              : null,
          ]),
        ])
      );
      if (mobileCards) {
        mobileCards.appendChild(el('div', { class: 'admin-empty-box', 'data-empty-row': 'true' }, [msg]));
      }
      return;
    }

    pageItems.forEach((v) => {
      const bName = v.businessName || 'Restaurant Stall';
      const oName = v.ownerName || 'Owner';
      const phone = v.phone || 'N/A';
      const edition = v.edition || 'cloud';
      const monthlyFeePaiseVal = BigInt(v.monthlyFeePaise || '0') > 0n ? v.monthlyFeePaise : '49900';
      const monthlyFee = formatRupees(monthlyFeePaiseVal);
      const lastPaid = formatDate(v.lastPaymentDate, 'N/A');
      const nextDue = formatDate(v.nextDueDate || v.subscriptionExpiresAt, 'No expiry');
      const badge = buildVendorBadge(v);

      const hostingBadge = edition === 'local'
        ? el('span', { class: 'badge-hosting local' }, [createIcon('smartphone', 13), el('span', {}, ['Mobile P2P'])])
        : el('span', { class: 'badge-hosting cloud' }, [createIcon('cloud', 13), el('span', {}, ['Cloud'])]);

      // Desktop Row
      tbody.appendChild(
        el('tr', {
          class: 'clickable-row',
          on: {
            click: (e) => {
              if (e.target && e.target.closest('button, a, input, select, .admin-overflow-menu')) return;
              openVendorInspector(v.id);
            },
          },
        }, [
          el('td', {}, [
            el('div', { style: 'font-weight: 800; font-size: 13.5px;' }, [bName]),
            el('div', { class: 'brand-platform-sub' }, [`${oName} • ${v.city || 'Hyderabad'}`]),
          ]),
          el('td', {}, [el('code', { class: 'mono-code' }, [phone])]),
          el('td', {}, [hostingBadge]),
          el('td', { class: 'num-col' }, [el('strong', {}, [`${monthlyFee}/mo`])]),
          el('td', {}, [
            el('div', { style: 'font-size: 11.5px;' }, ['Paid: ', el('strong', {}, [lastPaid])]),
            el('div', { style: 'font-size: 11.5px; color: var(--text-muted);' }, ['Due: ', el('strong', {}, [nextDue])]),
          ]),
          el('td', {}, [el('span', { class: `badge-status ${badge.cls}` }, [badge.label])]),
          el('td', { class: 'num-col' }, [
            el('div', { class: 'admin-row-actions' }, [
              el('button', {
                type: 'button',
                class: 'btn-table-action primary',
                'data-action': 'inspect',
                'data-id': v.id,
              }, [createIcon('inspect', 14), el('span', {}, ['Inspect'])]),
              el('button', {
                type: 'button',
                class: 'btn-table-action whatsapp icon-only',
                'data-action': 'whatsapp',
                'data-id': v.id,
                title: 'Send WhatsApp Reminder',
                'aria-label': 'WhatsApp ' + bName,
              }, [createIcon('message', 15)]),
              buildOverflowMenu(v, badge),
            ]),
          ]),
        ])
      );

      // Mobile Stacked Card (<768px)
      if (mobileCards) {
        mobileCards.appendChild(
          el('div', { class: 'admin-mobile-card' }, [
            el('div', { class: 'admin-mobile-card-head' }, [
              el('div', {}, [
                el('div', { style: 'font-weight: 800; font-size: 15px;' }, [bName]),
                el('div', { class: 'brand-platform-sub' }, [`${oName} • ${phone}`]),
              ]),
              el('span', { class: `badge-status ${badge.cls}` }, [badge.label]),
            ]),
            el('div', { class: 'admin-mobile-card-meta' }, [
              el('div', {}, [el('div', { class: 'admin-kv-label' }, ['Plan']), el('strong', {}, [`${monthlyFee}/mo`])]),
              el('div', {}, [el('div', { class: 'admin-kv-label' }, ['Due Date']), el('strong', {}, [nextDue])]),
              el('div', {}, [el('div', { class: 'admin-kv-label' }, ['Mode']), el('span', {}, [edition === 'local' ? 'Mobile P2P' : 'Cloud Managed'])]),
              el('div', {}, [el('div', { class: 'admin-kv-label' }, ['Lifetime']), el('strong', {}, [formatRupees(v.lifetimeSalesPaise || '0')])]),
            ]),
            el('div', { class: 'admin-mobile-card-actions' }, [
              el('button', {
                type: 'button',
                class: 'btn-table-action primary',
                'data-action': 'inspect',
                'data-id': v.id,
              }, [createIcon('inspect', 16), el('span', {}, ['Inspect'])]),
              el('button', {
                type: 'button',
                class: 'btn-table-action whatsapp',
                'data-action': 'whatsapp',
                'data-id': v.id,
              }, [createIcon('message', 16), el('span', {}, ['WhatsApp'])]),
              buildOverflowMenu(v, badge),
            ]),
          ])
        );
      }
    });
  }

  function closeVendorInspector(syncUrl = true) {
    const drawer = document.getElementById('vendor-inspector-drawer');
    if (!drawer || !drawer.classList.contains('active')) return;
    drawer.classList.remove('active');
    syncScrollLock();
    if (syncUrl) {
      if (history.state && history.state.vendorId) {
        history.back();
      } else {
        history.replaceState({ view: activeView, vendorId: null }, '', buildAdminUrl(activeView, null));
      }
    }
  }

  function openVendorInspector(stallId, pushHistory = true) {
    const stall = allVendors.find((v) => String(v.id) === String(stallId));
    const drawer = document.getElementById('vendor-inspector-drawer');
    const body = document.getElementById('vendor-inspector-body');
    const titleEl = document.getElementById('vendor-inspector-title');
    const subEl = document.getElementById('vendor-inspector-subtitle');
    if (!stall || !drawer || !body || !window.FroseSafeDom) return;

    if (pushHistory && (!history.state || String(history.state.vendorId || '') !== String(stall.id))) {
      history.pushState({ view: activeView, vendorId: stall.id }, '', buildAdminUrl(activeView, stall.id));
    }

    const { el, clear } = window.FroseSafeDom;
    const bName = stall.businessName || 'Restaurant Stall';
    const oName = stall.ownerName || 'Owner';
    const phone = stall.phone || 'N/A';
    const badge = buildVendorBadge(stall);
    const expFormatted = formatDate(stall.subscriptionExpiresAt, 'No expiry');
    const fee = formatRupees(BigInt(stall.monthlyFeePaise || '0') > 0n ? stall.monthlyFeePaise : '49900');
    const lifetime = formatRupees(stall.lifetimeSalesPaise || '0');

    if (titleEl) titleEl.textContent = bName;
    if (subEl) subEl.textContent = `${oName} • ${phone} • ${stall.edition === 'local' ? 'Mobile P2P' : 'Cloud Managed'}`;

    clear(body);
    body.appendChild(
      el('div', { class: 'admin-info-box' }, [
        el('div', { class: 'admin-kv-row' }, [
          el('span', { class: 'admin-kv-label' }, ['Subscription Status']),
          el('span', { class: `badge-status ${badge.cls}` }, [badge.label]),
        ]),
        el('div', { class: 'admin-kv-row' }, [
          el('span', { class: 'admin-kv-label' }, ['License Expires']),
          el('span', { class: 'admin-kv-value' }, [expFormatted]),
        ]),
        el('div', { class: 'admin-kv-row' }, [
          el('span', { class: 'admin-kv-label' }, ['Monthly Plan']),
          el('span', { class: 'admin-kv-value' }, [`${fee}/mo`]),
        ]),
        el('div', { class: 'admin-kv-row' }, [
          el('span', { class: 'admin-kv-label' }, ['Lifetime Sales']),
          el('span', { class: 'admin-kv-value' }, [lifetime]),
        ]),
      ])
    );

    body.appendChild(
      el('div', { class: 'form-group-wrap' }, [
        el('button', {
          type: 'button',
          class: 'saas-btn saas-btn-primary saas-btn-block',
          id: 'btn-inspector-renew',
          on: { click: () => openRenewModal(stall.id) },
        }, ['Renew / Extend License']),
        el('button', {
          type: 'button',
          class: 'saas-btn saas-btn-secondary saas-btn-block',
          on: { click: () => { closeVendorInspector(); openEditStallModal(stall.id); } },
        }, ['Edit Stall Settings']),
        el('button', {
          type: 'button',
          class: 'saas-btn saas-btn-secondary saas-btn-block',
          on: { click: () => { closeVendorInspector(); openMenuModal(stall.id, bName); } },
        }, ['Inspect Menu Catalog']),
        el('button', {
          type: 'button',
          class: 'saas-btn saas-btn-secondary saas-btn-block',
          on: { click: () => { closeVendorInspector(); window.openStallAnalytics(stall.id); } },
        }, ['Fiscal Turnover & Ledger']),
        el('button', {
          type: 'button',
          class: 'saas-btn saas-btn-secondary saas-btn-block',
          on: { click: () => { closeVendorInspector(); window.openStallSetupQR(stall); } },
        }, ['Setup QR & Pairing']),
        el('button', {
          type: 'button',
          class: stall.subscriptionStatus === 'suspended' ? 'saas-btn saas-btn-primary saas-btn-block' : 'saas-btn saas-btn-danger saas-btn-block',
          on: { click: () => toggleStallSuspension(stall.id) },
        }, [stall.subscriptionStatus === 'suspended' ? 'Reactivate Stall' : 'Suspend Stall (Kill-Switch)']),
      ])
    );

    drawer.classList.add('active');
    syncScrollLock();
  }

  function sendWhatsAppNotification(vendorId) {
    const v = allVendors.find((item) => String(item.id) === String(vendorId));
    if (!v) return;
    const cleanPhone = (v.phone || '').replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) {
      notify('Invalid phone number for WhatsApp', 'danger');
      return;
    }
    const badge = buildVendorBadge(v);
    const fee = formatRupees(BigInt(v.monthlyFeePaise || '0') > 0n ? v.monthlyFeePaise : '49900');
    const due = formatDate(v.subscriptionExpiresAt, 'Soon');
    const msg = badge.cls === 'active'
      ? `*FROSE Street POS — Payment Confirmation*\n\nDear ${v.ownerName || 'Owner'},\n\nYour subscription for *${v.businessName}* (${fee}/month) is active until *${due}*.\n\nThank you,\n*FROSE Street Team*`
      : `*FROSE Street POS — Subscription Renewal Reminder*\n\nDear ${v.ownerName || 'Owner'},\n\nYour subscription for *${v.businessName}* (${fee}/month) is due on *${due}*.\n\nPlease complete your renewal to ensure uninterrupted billing counter operations.\n\nThank you,\n*FROSE Street Team*`;
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  function openReceiptModal(stallId) {
    const stall = allVendors.find((v) => String(v.id) === String(stallId));
    const container = document.getElementById('receipt-modal-content');
    if (!stall || !container || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    const fee = formatRupees(BigInt(stall.monthlyFeePaise || '0') > 0n ? stall.monthlyFeePaise : '49900');
    const receiptId = 'FROSE-REC-' + String(stall.id || '').slice(0, 8).toUpperCase();

    clear(container);
    container.append(
      el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Receipt #']), el('span', { class: 'admin-kv-value mono-code' }, [receiptId])]),
      el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Restaurant']), el('span', { class: 'admin-kv-value' }, [stall.businessName || ''])]),
      el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Owner']), el('span', { class: 'admin-kv-value' }, [stall.ownerName || ''])]),
      el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Mobile']), el('span', { class: 'admin-kv-value mono-code' }, [stall.phone || ''])]),
      el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Plan Amount']), el('span', { class: 'admin-kv-value' }, [fee])]),
      el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Valid Until']), el('span', { class: 'admin-kv-value' }, [formatDate(stall.subscriptionExpiresAt)])])
    );

    const shareBtn = document.getElementById('btn-receipt-whatsapp-share');
    if (shareBtn) shareBtn.onclick = () => sendWhatsAppNotification(stall.id);
    openModal('modal-payment-receipt');
  }

  function openEditStallModal(stallId) {
    const stall = allVendors.find((v) => String(v.id) === String(stallId));
    if (!stall) return;
    document.getElementById('edit-stall-id').value = stall.id;
    document.getElementById('edit-stall-name').value = stall.businessName || '';
    document.getElementById('edit-owner-name').value = stall.ownerName || '';
    document.getElementById('edit-phone').value = stall.phone || '';
    document.getElementById('edit-city').value = stall.city || 'Hyderabad';
    document.getElementById('edit-edition').value = stall.edition || 'cloud';
    document.getElementById('edit-status').value = stall.subscriptionStatus || 'active';
    document.getElementById('edit-tax-mode').value = stall.taxMode || 'unregistered';
    document.getElementById('edit-monthly-fee').value = String(Math.round(Number(BigInt(stall.monthlyFeePaise || '49900') / 100n)));
    document.getElementById('edit-gstin').value = stall.gstin || '';
    document.getElementById('edit-fssai').value = stall.fssaiNumber || '';
    document.getElementById('edit-password').value = '';
    openModal('modal-edit-stall');
  }

  async function openMenuModal(stallId, stallName) {
    activeVendorForMenu = stallId;
    const stall = allVendors.find((v) => String(v.id) === String(stallId));
    const resolvedName = stallName || stall?.businessName || 'Stall';
    const title = document.getElementById('menu-modal-stall-name');
    if (title) title.textContent = `${resolvedName} — Menu Catalog`;

    const addForm = document.getElementById('form-add-dish-inline');
    if (addForm) addForm.style.display = 'none';

    const container = document.getElementById('dish-list-container');
    if (!container || !window.FroseSafeDom) return;

    const { el, clear } = window.FroseSafeDom;
    clear(container);
    container.appendChild(el('div', { class: 'saas-skeleton' }));
    openModal('modal-menu-manager');

    const res = await apiFetch(`/api/v1/admin/vendors/${stallId}/menu`);
    clear(container);
    if (!res || !res.ok) {
      container.appendChild(el('div', { class: 'admin-empty-box' }, ['Failed to load menu items from server.']));
      return;
    }

    let dishes = [];
    try {
      const json = await res.json();
      if (Array.isArray(json.data)) dishes = json.data;
    } catch (_) {}

    if (dishes.length === 0) {
      container.appendChild(el('div', { class: 'admin-empty-box' }, ['No dishes configured yet. Click "+ Add Dish" to add one.']));
      return;
    }

    dishes.forEach((d) => {
      let isAvail = Boolean(d.is_available ?? d.isAvailable ?? true);
      const availBtn = el('button', {
        type: 'button',
        class: isAvail ? 'btn-table-action primary' : 'btn-table-action',
        on: {
          click: async () => {
            const nextAvail = !isAvail;
            availBtn.disabled = true;
            try {
              const patchRes = await apiFetch(`/api/v1/admin/vendors/${stallId}/menu/${d.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ isAvailable: nextAvail }),
              });
              if (patchRes && patchRes.ok) {
                isAvail = nextAvail;
                availBtn.textContent = isAvail ? 'In Stock' : 'Out of Stock';
                availBtn.className = isAvail ? 'btn-table-action primary' : 'btn-table-action';
                notify(`${d.name} marked ${isAvail ? 'In Stock' : 'Out of Stock'}`, 'success');
              } else {
                notify('Failed to update dish availability', 'danger');
              }
            } catch (_) {
              notify('Network error updating dish', 'danger');
            } finally {
              availBtn.disabled = false;
            }
          },
        },
      }, [isAvail ? 'In Stock' : 'Out of Stock']);

      container.appendChild(
        el('div', { class: 'admin-kv-row', style: 'padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 10px;' }, [
          el('div', {}, [
            el('div', { style: 'font-weight: 800; font-size: 13.5px;' }, [d.name || '']),
            el('div', { class: 'brand-platform-sub' }, [`${d.category || 'General'} • ${formatRupees(d.price_paise || d.pricePaise)}`]),
          ]),
          availBtn,
        ])
      );
    });
  }

  function openRenewModal(stallId) {
    const stall = allVendors.find((v) => String(v.id) === String(stallId));
    if (!stall) return;
    document.getElementById('renew-vendor-id').value = stall.id;
    document.getElementById('renew-modal-title').textContent = `Renew ${stall.businessName || 'Stall'}`;
    const feeRupees = Math.round(Number(BigInt(stall.monthlyFeePaise || '49900') / 100n));
    document.getElementById('renew-amount-rupees').value = String(feeRupees || 499);
    document.getElementById('renew-preset-days').value = '30';
    document.getElementById('renew-custom-date-wrap').style.display = 'none';
    openModal('modal-renew-license');
  }

  async function toggleStallSuspension(stallId) {
    const stall = allVendors.find((v) => String(v.id) === String(stallId));
    if (!stall) return;
    const isSuspended = stall.subscriptionStatus === 'suspended';
    const nextStatus = isSuspended ? 'active' : 'suspended';
    const confirmed = window.FroseUI?.confirmModal
      ? await window.FroseUI.confirmModal({
          title: isSuspended ? 'Reactivate Stall?' : 'Suspend Stall (Kill-Switch)?',
          message: isSuspended
            ? `Restore active counter access for ${stall.businessName}?`
            : `Suspending ${stall.businessName} immediately revokes active refresh sessions.`,
          confirmLabel: isSuspended ? 'Reactivate' : 'Suspend Stall',
          danger: !isSuspended,
        })
      : false;
    if (!confirmed) return;

    const res = await apiFetch(`/api/v1/admin/vendors/${stall.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ subscriptionStatus: nextStatus }),
    });
    if (res && res.ok) {
      await loadVendors();
      closeVendorInspector();
      notify(`${stall.businessName} is now ${nextStatus}`, 'success');
    } else {
      notify('Failed to update stall status', 'danger');
    }
  }

  window.openStallAnalytics = function (vendorId) {
    const stall = allVendors.find((v) => String(v.id) === String(vendorId));
    if (!stall) return;
    document.getElementById('analytics-stall-title').textContent = `${stall.businessName || 'Stall'} — Fiscal Ledger`;
    document.getElementById('analytics-stall-subtitle').textContent = `${stall.ownerName || 'Owner'} • ${stall.phone || ''} • ${stall.city || ''}`;
    const zero = { totalPaise: '0', cashPaise: '0', upiPaise: '0' };
    const t = stall.turnover || { daily: zero, weekly: zero, monthly: zero, yearly: zero };
    ['daily', 'weekly', 'monthly', 'yearly'].forEach((p) => {
      const d = t[p] || zero;
      document.getElementById(`turnover-val-${p}`).textContent = formatRupees(d.totalPaise);
      document.getElementById(`turnover-cash-${p}`).textContent = formatRupees(d.cashPaise);
      document.getElementById(`turnover-upi-${p}`).textContent = formatRupees(d.upiPaise);
    });
    const ledgerContainer = document.getElementById('payment-ledger-container');
    const ledgerCount = document.getElementById('payment-ledger-count');
    const ledger = stall.paymentLedger || [];
    if (ledgerCount) ledgerCount.textContent = `${ledger.length} Record${ledger.length === 1 ? '' : 's'}`;
    if (ledgerContainer && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(ledgerContainer);
      if (ledger.length === 0) {
        ledgerContainer.appendChild(el('div', { class: 'admin-empty-box' }, ['No subscription payments recorded yet.']));
      } else {
        ledger.forEach((rec) => {
          ledgerContainer.appendChild(
            el('div', { class: 'admin-info-box' }, [
              el('div', { class: 'admin-kv-row' }, [
                el('span', { class: 'mono-code' }, [rec.paymentReference || rec.receiptId || 'SUB']),
                el('span', { class: 'badge-status active' }, [rec.status || 'active']),
              ]),
              el('div', { class: 'admin-kv-row' }, [
                el('span', { class: 'admin-kv-label' }, ['Amount']),
                el('span', { class: 'admin-kv-value' }, [formatRupees(rec.amountPaise || '0')]),
              ]),
            ])
          );
        });
      }
    }
    openModal('modal-stall-analytics');
  };

  async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    const mobileCards = document.getElementById('users-mobile-cards');
    if (!tbody || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;

    const res = await apiFetch('/api/v1/admin/users');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data)) allUsers = json.data;
      } catch (_) {}
    }

    const q = usersSearchQuery.toLowerCase().trim();
    const filtered = allUsers.filter((u) => {
      if (usersRoleFilter !== 'all' && String(u.role || 'owner').toLowerCase() !== usersRoleFilter) return false;
      if (!q) return true;
      return (u.name || '').toLowerCase().includes(q)
        || (u.phone || '').toLowerCase().includes(q)
        || (u.stallName || '').toLowerCase().includes(q);
    });

    clear(tbody);
    if (mobileCards) clear(mobileCards);

    if (filtered.length === 0) {
      tbody.appendChild(el('tr', { 'data-empty-row': 'true' }, [el('td', { colspan: '5', class: 'admin-empty-box' }, ['No users match the current filter.'])]));
      if (mobileCards) mobileCards.appendChild(el('div', { class: 'admin-empty-box' }, ['No users match the current filter.']));
      return;
    }

    filtered.forEach((u) => {
      const isAct = u.status === 'active';
      tbody.appendChild(
        el('tr', {}, [
          el('td', {}, [
            el('div', { style: 'font-weight: 700;' }, [u.name || '']),
            el('code', { class: 'mono-code', style: 'color: var(--text-muted);' }, [u.phone || '']),
          ]),
          el('td', {}, [el('span', { class: 'badge-status trial' }, [u.role || 'owner'])]),
          el('td', {}, [el('strong', {}, [u.stallName || ''])]),
          el('td', {}, [el('span', { class: `badge-status ${isAct ? 'active' : 'expired'}` }, [u.status || 'active'])]),
          el('td', { class: 'num-col' }, [
            el('button', {
              type: 'button',
              class: 'btn-table-action',
              on: {
                click: () => {
                  if (u.stallId) openEditStallModal(u.stallId);
                },
              },
            }, ['Manage']),
          ]),
        ])
      );

      if (mobileCards) {
        mobileCards.appendChild(
          el('div', { class: 'admin-mobile-card' }, [
            el('div', { class: 'admin-mobile-card-head' }, [
              el('div', {}, [
                el('div', { style: 'font-weight: 800;' }, [u.name || '']),
                el('div', { class: 'brand-platform-sub' }, [`${u.phone || ''} • ${u.stallName || ''}`]),
              ]),
              el('span', { class: `badge-status ${isAct ? 'active' : 'expired'}` }, [u.role || 'owner']),
            ]),
            u.stallId
              ? el('button', {
                  type: 'button',
                  class: 'saas-btn saas-btn-secondary saas-btn-block',
                  on: { click: () => openEditStallModal(u.stallId) },
                }, ['Manage Stall'])
              : null,
          ])
        );
      }
    });
  }

  async function loadAnalytics() {
    const res = await apiFetch('/api/v1/admin/analytics');
    if (!res || !res.ok) return;
    const json = await res.json().catch(() => ({}));
    const data = json.data;
    if (!data) return;

    const cash = BigInt(data.cashSalesPaise || '0');
    const upi = BigInt(data.upiSalesPaise || '0');
    const sum = cash + upi;
    const cashPct = sum > 0n ? Number((cash * 100n) / sum) : 0;
    const upiPct = sum > 0n ? 100 - cashPct : 0;

    document.getElementById('analytics-cash-val').textContent = formatRupees(cash);
    document.getElementById('analytics-upi-val').textContent = formatRupees(upi);
    document.getElementById('analytics-cash-pct').textContent = `${cashPct}%`;
    document.getElementById('analytics-upi-pct').textContent = `${upiPct}%`;
    document.getElementById('analytics-split-cash-bar').style.width = `${cashPct}%`;
    document.getElementById('analytics-split-upi-bar').style.width = `${upiPct}%`;

    const cloudN = Number(data.cloudVendors ?? allVendors.filter((v) => v.edition !== 'local').length);
    const localN = Number(data.localVendors ?? allVendors.filter((v) => v.edition === 'local').length);
    const totalDeploy = cloudN + localN;
    const cloudPct = totalDeploy > 0 ? Math.round((cloudN / totalDeploy) * 100) : 0;
    const localPct = totalDeploy > 0 ? 100 - cloudPct : 0;
    document.getElementById('analytics-cloud-breakdown').textContent = `${cloudN} Stalls (${cloudPct}%)`;
    document.getElementById('analytics-local-breakdown').textContent = `${localN} Stalls (${localPct}%)`;

    const tbody = document.getElementById('analytics-leaderboard-body');
    if (tbody && Array.isArray(data.leaderboard) && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(tbody);
      if (data.leaderboard.length === 0) {
        tbody.appendChild(el('tr', { 'data-empty-row': 'true' }, [el('td', { colspan: '5', class: 'admin-empty-box' }, ['No stall revenue recorded yet.'])]));
        return;
      }
      data.leaderboard.forEach((item, idx) => {
        tbody.appendChild(
          el('tr', {}, [
            el('td', {}, [el('strong', {}, [`#${idx + 1}`])]),
            el('td', {}, [el('strong', {}, [item.name || ''])]),
            el('td', {}, [item.city || '-']),
            el('td', { class: 'num-col' }, [String(item.totalOrders || 0)]),
            el('td', { class: 'num-col' }, [el('strong', {}, [formatRupees(item.salesPaise || '0')])]),
          ])
        );
      });
    }
  }

  async function loadSubscriptionsView() {
    const tbody = document.getElementById('subscriptions-table-body');
    const mobileCards = document.getElementById('subscriptions-mobile-cards');
    if (!tbody || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    clear(tbody);
    if (mobileCards) clear(mobileCards);
    tbody.appendChild(el('tr', { 'data-empty-row': 'true' }, [el('td', { colspan: '7', class: 'admin-empty-box' }, ['Loading subscription ledger...'])]));
  }

  async function loadSystemHealth() {
    const container = document.getElementById('system-health-modal-body');
    const stripSummary = document.getElementById('health-strip-summary');
    const res = await apiFetch('/api/v1/admin/system-health');
    if (!res || !res.ok) return;
    const json = await res.json().catch(() => ({}));
    const h = json.data || {};
    if (stripSummary) {
      stripSummary.textContent = `DB ${h.database?.status || 'healthy'} (${h.database?.latencyMs ?? 0}ms) • WS Clients: ${h.websocketHotspot?.connectedClients ?? 0} • Uptime: ${h.uptimeSeconds ?? 0}s`;
    }
    if (container && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(container);
      container.append(
        el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Database']), el('span', { class: 'admin-kv-value' }, [`${h.database?.status || 'healthy'} (${h.database?.latencyMs ?? 0}ms)`])]),
        el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['WebSocket Clients']), el('span', { class: 'admin-kv-value' }, [String(h.websocketHotspot?.connectedClients ?? 0)])]),
        el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Process Uptime']), el('span', { class: 'admin-kv-value' }, [`${h.uptimeSeconds ?? 0}s`])])
      );
    }
  }

  async function loadAuditAndHealthView() {
    await loadSystemHealth();
    const healthRows = document.getElementById('audit-health-rows');
    const runtimeRows = document.getElementById('audit-runtime-rows');
    const res = await apiFetch('/api/v1/admin/system-health');
    if (res && res.ok && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      const json = await res.json().catch(() => ({}));
      const h = json.data || {};
      if (healthRows) {
        clear(healthRows);
        healthRows.append(
          el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['PostgreSQL / Storage']), el('span', { class: 'admin-kv-value' }, [`${h.database?.status || 'healthy'} (${h.database?.latencyMs ?? 0}ms)`])]),
          el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Checked At']), el('span', { class: 'admin-kv-value' }, [formatDate(h.timestamp, 'Just now')])])
        );
      }
      if (runtimeRows) {
        clear(runtimeRows);
        runtimeRows.append(
          el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['WebSocket Clients']), el('span', { class: 'admin-kv-value' }, [String(h.websocketHotspot?.connectedClients ?? 0)])]),
          el('div', { class: 'admin-kv-row' }, [el('span', { class: 'admin-kv-label' }, ['Server Uptime']), el('span', { class: 'admin-kv-value' }, [`${h.uptimeSeconds ?? 0}s`])])
        );
      }
    }
  }

  function loadNotifications() {
    const now = Date.now();
    const in7Days = now + 7 * 86400000;
    const alerts = [];
    allVendors.forEach((v) => {
      const st = v.subscriptionStatus || 'active';
      const exp = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : 0;
      if (st === 'suspended') {
        alerts.push({ id: 'susp-' + v.id, vendorId: v.id, title: `${v.businessName} Suspended`, message: 'Counter access is currently suspended.', timestamp: formatDate(v.updatedAt, 'Recent') });
      } else if (st === 'expired' || (exp > 0 && exp < now)) {
        alerts.push({ id: 'exp-' + v.id, vendorId: v.id, title: `${v.businessName} License Expired`, message: `Expired on ${formatDate(v.subscriptionExpiresAt)}. Tap to inspect & renew.`, timestamp: formatDate(v.subscriptionExpiresAt) });
      } else if (exp > now && exp <= in7Days) {
        alerts.push({ id: 'soon-' + v.id, vendorId: v.id, title: `${v.businessName} Expiring Soon`, message: `Expires ${formatDate(v.subscriptionExpiresAt)}.`, timestamp: formatDate(v.subscriptionExpiresAt) });
      }
    });
    platformNotifications = alerts;
    renderNotifications();
  }

  function renderNotifications() {
    const container = document.getElementById('notifications-list-container');
    const badge = document.getElementById('notif-badge');
    const sub = document.getElementById('notif-unread-subtitle');
    if (!container || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    clear(container);

    if (badge) {
      badge.textContent = String(platformNotifications.length);
      badge.classList.toggle('is-hidden', platformNotifications.length === 0);
    }
    if (sub) sub.textContent = `${platformNotifications.length} alert${platformNotifications.length === 1 ? '' : 's'}`;

    if (platformNotifications.length === 0) {
      container.appendChild(el('div', { class: 'admin-empty-box' }, ['All caught up. Zero pending alerts.']));
      return;
    }

    platformNotifications.forEach((n) => {
      container.appendChild(
        el('button', {
          type: 'button',
          class: 'admin-notif-item unread',
          on: {
            click: () => {
              closeModal('notifications-drawer');
              if (n.vendorId) {
                switchView('vendors');
                openVendorInspector(n.vendorId);
              }
            },
          },
        }, [
          el('strong', { style: 'font-size: 13px;' }, [n.title]),
          el('span', { style: 'font-size: 12px; color: var(--text-secondary);' }, [n.message]),
          el('span', { style: 'font-size: 11px; color: var(--text-muted);' }, [n.timestamp || '']),
        ])
      );
    });
  }

  window.switchSetupQRTab = function (mode) {
    const tabWeb = document.getElementById('tab-qr-webapp');
    const tabBackend = document.getElementById('tab-qr-backend');
    const qrImg = document.getElementById('qr-modal-image');
    const helperText = document.getElementById('qr-modal-helper-text');
    const openBtnText = document.getElementById('btn-qr-modal-open-text');
    const openBtn = document.getElementById('btn-qr-modal-open');
    const waBtn = document.getElementById('btn-qr-modal-whatsapp');
    if (!currentStallForQR) return;

    const phone = (currentStallForQR.phone || '').replace(/\D/g, '').slice(-10);
    const bName = currentStallForQR.businessName || 'Restaurant Stall';
    const webUrl = window.location.origin + '/login?stall=' + phone;
    const downloadUrl = window.location.origin + '/downloads/frose-street-local-cloud.apk';

    if (mode === 'backend') {
      tabWeb?.classList.remove('active');
      tabBackend?.classList.add('active');
      if (qrImg && window.FroseQrLocal) qrImg.src = window.FroseQrLocal.toDataUrl(downloadUrl, 220);
      if (helperText) helperText.textContent = 'Scan to download the offline local Android APK bundle.';
      if (openBtnText) openBtnText.textContent = 'Download Local APK';
      activeQRSetupUrl = downloadUrl;
      if (openBtn) openBtn.onclick = () => window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      if (waBtn) waBtn.onclick = () => window.open('https://api.whatsapp.com/send?phone=91' + phone + '&text=' + encodeURIComponent(`Download FROSE Street Local Engine for *${bName}*:\n${downloadUrl}`), '_blank', 'noopener,noreferrer');
    } else {
      tabWeb?.classList.add('active');
      tabBackend?.classList.remove('active');
      if (qrImg && window.FroseQrLocal) qrImg.src = window.FroseQrLocal.toDataUrl(webUrl, 220);
      if (helperText) helperText.textContent = 'Scan with phone camera to open the login page pre-filled with your stall mobile number.';
      if (openBtnText) openBtnText.textContent = 'Open Counter in New Tab';
      activeQRSetupUrl = webUrl;
      if (openBtn) openBtn.onclick = () => window.open(webUrl, '_blank', 'noopener,noreferrer');
      if (waBtn) waBtn.onclick = () => window.open('https://api.whatsapp.com/send?phone=91' + phone + '&text=' + encodeURIComponent(`Welcome to FROSE Street!\n\nBilling counter for *${bName}*:\n${webUrl}\n\nMobile Login: ${phone}`), '_blank', 'noopener,noreferrer');
    }
  };

  window.openStallSetupQR = function (stall) {
    if (!stall) return;
    currentStallForQR = stall;
    const phone = (stall.phone || '').replace(/\D/g, '').slice(-10);
    const fee = formatRupees(BigInt(stall.monthlyFeePaise || '0') > 0n ? stall.monthlyFeePaise : '49900');
    document.getElementById('qr-modal-stall-name').textContent = stall.businessName || 'Restaurant Stall';
    document.getElementById('qr-modal-phone').textContent = phone;
    document.getElementById('qr-modal-pwd').textContent = 'Protected (never embedded in URL)';
    document.getElementById('qr-modal-plan').textContent = `${(stall.subscriptionStatus || 'trial').toUpperCase()} (${fee}/mo)`;
    window.switchSetupQRTab('webapp');
    openModal('modal-stall-setup-qr');
  };

  async function handleLogout() {
    const confirmed = window.FroseUI?.confirmModal
      ? await window.FroseUI.confirmModal({
          title: 'Sign Out?',
          message: 'Sign out of the Super Admin Console on this device?',
          confirmLabel: 'Sign Out',
          danger: true,
        })
      : true;
    if (!confirmed) return;
    try {
      await (window.froseApiFetch || fetch)('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-FROSE-CSRF': '1' },
      });
    } catch (_) {}
    localStorage.removeItem('frose_session_active');
    localStorage.removeItem('frose_current_vendor');
    localStorage.removeItem('frose_vendors_directory');
    window.location.replace('/login.html');
  }

  function syncThemeButton() {
    if (!window.FroseTheme) return;
    const theme = window.FroseTheme.getTheme();
    const iconSlot = document.getElementById('admin-theme-icon');
    const labelSlot = document.getElementById('admin-theme-label');
    if (iconSlot && window.FroseSafeDom) {
      window.FroseSafeDom.clear(iconSlot);
      const iconName = theme === 'dark' ? 'moon' : (theme === 'sunlight' ? 'contrast' : 'sun');
      iconSlot.appendChild(createIcon(iconName, 16));
    }
    if (labelSlot) {
      labelSlot.textContent = theme === 'dark' ? 'Dark' : (theme === 'sunlight' ? 'Sunlight' : 'Light');
    }
  }

  function initAdminConsole() {
    syncThemeButton();

    document.addEventListener('click', (e) => {
      const target = e.target;
      if (!target || !target.closest) return;

      if (!target.closest('.admin-overflow-wrap')) closeAllOverflowMenus();
      if (!target.closest('.admin-profile-wrap')) {
        document.getElementById('user-dropdown')?.classList.remove('active');
      }

      const navBtn = target.closest('[data-nav-view]');
      if (navBtn) {
        switchView(navBtn.getAttribute('data-nav-view'));
        return;
      }

      const moreBtn = target.closest('[data-more-view]');
      if (moreBtn) {
        switchView(moreBtn.getAttribute('data-more-view'));
        return;
      }

      const filterBtn = target.closest('#vendors-filter-row .filter-pill');
      if (filterBtn) {
        document.querySelectorAll('#vendors-filter-row .filter-pill').forEach((p) => p.classList.remove('active'));
        filterBtn.classList.add('active');
        currentFilter = filterBtn.getAttribute('data-filter') || 'all';
        vendorPage = 1;
        renderStallsTable();
        return;
      }

      const roleBtn = target.closest('#users-role-filter-row .filter-pill');
      if (roleBtn) {
        document.querySelectorAll('#users-role-filter-row .filter-pill').forEach((p) => p.classList.remove('active'));
        roleBtn.classList.add('active');
        usersRoleFilter = roleBtn.getAttribute('data-user-role') || 'all';
        loadUsers();
        return;
      }

      const actionEl = target.closest('[data-action]');
      if (actionEl) {
        const act = actionEl.getAttribute('data-action');
        const id = actionEl.getAttribute('data-id');
        closeAllOverflowMenus();
        if (act === 'inspect') openVendorInspector(id);
        else if (act === 'whatsapp') sendWhatsAppNotification(id);
        else if (act === 'qr') {
          const clean = (actionEl.getAttribute('data-phone') || '').replace(/\D/g, '').slice(-10);
          const stall = allVendors.find((v) => (v.phone || '').replace(/\D/g, '').slice(-10) === clean);
          if (stall) window.openStallSetupQR(stall);
        } else if (act === 'ledger') window.openStallAnalytics(id);
        else if (act === 'edit') openEditStallModal(id);
        else if (act === 'menu') openMenuModal(id, actionEl.getAttribute('data-name'));
        else if (act === 'receipt') openReceiptModal(id);
        else if (act === 'toggle-suspend') toggleStallSuspension(id);
        return;
      }

      if (target.closest('#btn-admin-theme') && window.FroseTheme) {
        const next = window.FroseTheme.cycleTheme();
        syncThemeButton();
        notify(`Theme: ${next}`, 'info');
        return;
      }

      if (target.closest('#btn-admin-profile')) {
        document.getElementById('user-dropdown')?.classList.toggle('active');
        return;
      }

      if (target.closest('#btn-header-notifications') || target.closest('#btn-action-view-all')) {
        openModal('notifications-drawer');
        return;
      }
      if (target.closest('#btn-close-notifications')) {
        closeModal('notifications-drawer');
        return;
      }
      if (target.closest('#btn-mobile-more')) {
        openModal('mobile-more-sheet');
        return;
      }
      if (target.closest('#btn-close-more-sheet')) {
        closeModal('mobile-more-sheet');
        return;
      }
      if (target.closest('#btn-header-search')) {
        switchView('vendors');
        setTimeout(() => document.getElementById('search-vendors-input')?.focus(), 40);
        return;
      }

      if (target.closest('#btn-rail-add-stall') || target.closest('#btn-overview-add-stall') || target.closest('#btn-top-add-stall')) {
        switchView('add-restaurant');
        return;
      }
      if (target.closest('#btn-back-to-vendors')) {
        switchView('vendors');
        return;
      }
      if (target.closest('#btn-hero-reports') || target.closest('#card-kpi-revenue') || target.closest('#card-kpi-orders')) {
        switchView('analytics');
        return;
      }
      if (target.closest('#card-kpi-restaurants')) {
        switchView('vendors');
        return;
      }
      if (target.closest('#card-kpi-renewals')) {
        currentFilter = 'expiring';
        document.querySelectorAll('#vendors-filter-row .filter-pill').forEach((p) => {
          p.classList.toggle('active', p.getAttribute('data-filter') === 'expiring');
        });
        switchView('vendors');
        return;
      }
      if (target.closest('#btn-view-health')) {
        openModal('modal-system-health');
        return;
      }
      if (target.closest('#btn-menu-profile')) {
        document.getElementById('user-dropdown')?.classList.remove('active');
        switchView('settings');
        return;
      }
      if (target.closest('#btn-menu-system')) {
        document.getElementById('user-dropdown')?.classList.remove('active');
        switchView('audit');
        return;
      }
      if (target.closest('#btn-menu-logout') || target.closest('#btn-settings-logout') || target.closest('#btn-more-logout')) {
        document.getElementById('user-dropdown')?.classList.remove('active');
        handleLogout();
        return;
      }

      if (target.closest('#btn-close-inspector') || target.closest('#btn-inspector-back')) {
        closeVendorInspector(true);
        return;
      }
      if (target.closest('#btn-close-add-modal')) { closeModal('modal-add-stall'); return; }
      if (target.closest('#btn-close-edit-modal')) { closeModal('modal-edit-stall'); return; }
      if (target.closest('#btn-close-menu-modal')) { closeModal('modal-menu-manager'); return; }
      if (target.closest('#btn-close-health-modal')) { closeModal('modal-system-health'); return; }
      if (target.closest('#btn-close-stall-analytics-modal')) { closeModal('modal-stall-analytics'); return; }
      if (target.closest('#btn-close-receipt-modal')) { closeModal('modal-payment-receipt'); return; }
      if (target.closest('#btn-close-renew-modal')) { closeModal('modal-renew-license'); return; }
      if (target.closest('#btn-close-qr-modal')) { closeModal('modal-stall-setup-qr'); return; }
      if (target.closest('#tab-qr-webapp')) { window.switchSetupQRTab('webapp'); return; }
      if (target.closest('#tab-qr-backend')) { window.switchSetupQRTab('backend'); return; }
      if (target.closest('#btn-qr-modal-copy') && activeQRSetupUrl && navigator.clipboard) {
        navigator.clipboard.writeText(activeQRSetupUrl).then(() => notify('Setup link copied', 'success'));
        return;
      }
      if (target.closest('#btn-receipt-print')) { window.print(); return; }
      if (target.closest('#btn-vendors-prev') && vendorPage > 1) { vendorPage--; renderStallsTable(); return; }
      if (target.closest('#btn-vendors-next')) { vendorPage++; renderStallsTable(); return; }
      if (target.closest('#btn-refresh-health')) { loadAuditAndHealthView(); return; }

      // Tap-outside backdrop close for modals, drawers & sheets
      if (target.classList.contains('modal-overlay') && target.classList.contains('active')) {
        closeModal(target.id);
        return;
      }
      if (target.id === 'vendor-inspector-drawer' && target.classList.contains('active')) {
        closeVendorInspector(true);
        return;
      }
      if (target.classList.contains('saas-drawer-backdrop') && target.classList.contains('active')) {
        closeModal(target.id);
        return;
      }
      if (target.classList.contains('saas-sheet-backdrop') && target.classList.contains('active')) {
        closeModal(target.id);
      }
    });

    // Keyboard ergonomics: Escape closes topmost layer; / or Ctrl/Cmd+K focuses search
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (dismissTopmostLayer()) {
          e.preventDefault();
        }
        return;
      }

      const activeTag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
      const isTyping = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select' || Boolean(document.activeElement?.isContentEditable);

      if ((e.key === '/' && !isTyping) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (activeView !== 'vendors') switchView('vendors');
        setTimeout(() => document.getElementById('search-vendors-input')?.focus(), 40);
      }
    });

    // Browser Back / Forward state sync
    window.addEventListener('popstate', (e) => {
      const activeModals = document.querySelectorAll('.modal-overlay.active');
      if (activeModals.length > 0) {
        activeModals.forEach((m) => m.classList.remove('active'));
      }
      closeModal('notifications-drawer');
      closeModal('mobile-more-sheet');
      closeAllOverflowMenus();

      const params = new URLSearchParams(window.location.search);
      const state = e.state || {};
      const nextView = state.view || params.get('tab') || 'dashboard';
      const nextVendor = state.vendorId || params.get('vendor') || null;

      if (nextView !== activeView) {
        switchView(nextView, false);
      }
      if (nextVendor) {
        openVendorInspector(nextVendor, false);
      } else {
        closeVendorInspector(false);
      }
    });

    document.getElementById('search-vendors-input')?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      vendorPage = 1;
      renderStallsTable();
    });

    document.getElementById('sort-vendors-select')?.addEventListener('change', (e) => {
      currentSort = e.target.value;
      vendorPage = 1;
      renderStallsTable();
    });

    document.getElementById('search-users-input')?.addEventListener('input', (e) => {
      usersSearchQuery = e.target.value;
      loadUsers();
    });

    const btnAddDishToggle = document.getElementById('btn-add-dish-toggle');
    const addDishForm = document.getElementById('form-add-dish-inline');
    if (btnAddDishToggle && addDishForm) {
      btnAddDishToggle.addEventListener('click', () => {
        addDishForm.style.display = addDishForm.style.display === 'flex' ? 'none' : 'flex';
      });
      addDishForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!activeVendorForMenu) return;
        const btn = document.getElementById('btn-submit-add-dish');
        const name = document.getElementById('menu-add-name')?.value.trim() || '';
        const priceRupees = Number(document.getElementById('menu-add-price')?.value || 0);
        const category = document.getElementById('menu-add-category')?.value.trim() || 'General';
        if (!name || priceRupees <= 0) {
          notify('Enter valid dish name and price', 'danger');
          return;
        }
        await withButtonLock(btn, 'Saving...', async () => {
          const res = await apiFetch(`/api/v1/admin/vendors/${activeVendorForMenu}/menu`, {
            method: 'POST',
            body: JSON.stringify({ name, pricePaise: Math.round(priceRupees * 100), category }),
          });
          if (res && res.ok) {
            addDishForm.reset();
            addDishForm.style.display = 'none';
            notify('Dish added to menu', 'success');
            await openMenuModal(activeVendorForMenu);
          } else {
            notify('Failed to add dish', 'danger');
          }
        });
      });
    }

    document.getElementById('form-add-stall-page')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('btn-submit-add-stall-page');
      const payload = {
        businessName: document.getElementById('page-add-stall-name').value.trim(),
        ownerName: document.getElementById('page-add-owner-name').value.trim(),
        phone: document.getElementById('page-add-phone').value.trim(),
        password: document.getElementById('page-add-password').value.trim(),
        city: document.getElementById('page-add-city').value.trim() || 'Hyderabad',
        edition: document.getElementById('page-add-edition').value,
        monthlyFeeRupees: Number(document.getElementById('page-add-monthly-fee').value) || 499,
        billingCycle: document.getElementById('page-add-billing-cycle').value,
        initialPaymentStatus: document.getElementById('page-add-initial-status').value,
        upiId: document.getElementById('page-add-upi').value.trim() || undefined,
      };
      if (!payload.businessName || payload.phone.length !== 10 || payload.password.length < 10) {
        notify('Enter valid stall name, 10-digit mobile number, and 10+ char passphrase', 'danger');
        return;
      }
      await withButtonLock(submitBtn, 'Provisioning...', async () => {
        const res = await apiFetch('/api/v1/admin/vendors', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res || !res.ok) {
          const err = res ? await res.json().catch(() => ({})) : {};
          notify(err.message || 'Failed to provision stall', 'danger');
          return;
        }
        await loadVendors();
        document.getElementById('form-add-stall-page').reset();
        notify(`${payload.businessName} provisioned`, 'success');
        switchView('vendors');
        const created = allVendors.find((v) => String(v.phone) === String(payload.phone));
        if (created) window.openStallSetupQR(created);
      });
    });

    document.getElementById('form-edit-stall')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('edit-stall-id').value;
      const btn = document.getElementById('btn-submit-edit-stall');
      const body = {
        businessName: document.getElementById('edit-stall-name').value.trim(),
        ownerName: document.getElementById('edit-owner-name').value.trim(),
        phone: document.getElementById('edit-phone').value.trim(),
        city: document.getElementById('edit-city').value.trim(),
        edition: document.getElementById('edit-edition').value,
        subscriptionStatus: document.getElementById('edit-status').value,
      };
      const pwd = document.getElementById('edit-password').value.trim();
      if (pwd) body.password = pwd;
      await withButtonLock(btn, 'Saving...', async () => {
        const res = await apiFetch(`/api/v1/admin/vendors/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (res && res.ok) {
          await loadVendors();
          closeModal('modal-edit-stall');
          notify('Stall updated', 'success');
        } else {
          const err = res ? await res.json().catch(() => ({})) : {};
          notify(err.message || 'Failed to update stall', 'danger');
        }
      });
    });

    try {
      const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
      if (v.ownerName) {
        const n = document.getElementById('settings-profile-name');
        const h = document.getElementById('header-profile-name');
        if (n) n.textContent = v.ownerName;
        if (h) h.textContent = v.ownerName;
      }
      if (v.phone) {
        const p = document.getElementById('settings-profile-phone');
        if (p) p.textContent = '+91 ' + v.phone;
      }
    } catch (_) {}

    // Restore initial tab and vendor deep-link from URL
    const initParams = new URLSearchParams(window.location.search);
    const initTab = VIEW_TITLES[initParams.get('tab') || ''] ? initParams.get('tab') : 'dashboard';
    const initVendor = initParams.get('vendor');
    history.replaceState({ view: initTab, vendorId: null }, '', buildAdminUrl(initTab, null));
    if (initTab !== 'dashboard') switchView(initTab, false);
    if (initVendor) pendingDeepLinkVendorId = initVendor;

    loadVendors();
    loadSystemHealth();
  }

  window.switchView = switchView;
  window.openModal = openModal;
  window.closeModal = closeModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminConsole);
  } else {
    initAdminConsole();
  }
})();
