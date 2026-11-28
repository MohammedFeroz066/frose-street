/**
 * FROSE Street — Unified Vendor Workspace & Billing POS Controller (Phase 4: UX-03)
 * - 5-Tab Workspace Shell (Bill, Orders, Menu, Payments, Settings)
 * - Live search, category chips, Veg/Non-Veg dots, variant picker sheet
 * - Dynamic Island Cart Pill + Desktop Split-Pane Cart
 * - Cash quick-tender + Change Due, Honest UPI QR, Split (Cash + UPI)
 * - Full Phase 2 Offline Billing + Ed25519 License + Clock-Rollback Guard + SW Update Banner
 */

(function () {
  'use strict';

  let menuCatalog = [];
  let customCategories = [];
  // cartKey -> { key, item, variantName, unitPricePaise: BigInt, quantity }
  const cart = new Map();
  let activeCategory = 'all';
  let billSearchQuery = '';
  let currentTokenNumber = 1;
  let currentOrderType = 'dinein'; // 'dinein' | 'counter' (Parcel)
  let checkoutPaymentMode = 'cash'; // 'cash' | 'upi' | 'split'
  let activeVendorId = '';
  let syncEngine = null;
  let lastCompletedOrder = null;
  let activeReceiptOrder = null;
  let flashAutoCloseTimer = null;
  let activeTab = 'bill';
  let formDishIsVeg = true;
  let isSubmittingOrder = false;
  let isSubmittingVoid = false;
  let isSubmittingDish = false;
  let isSubmittingCustomItem = false;
  let lastCartTotalPaise = 0n;
  let billSearchTimer = null;
  let sharedOrdersChannel = null;

  function getOrdersBroadcastChannel() {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!sharedOrdersChannel) {
      try {
        sharedOrdersChannel = new BroadcastChannel('frose_orders');
      } catch (_) {
        return null;
      }
    }
    return sharedOrdersChannel;
  }

  function getActiveVendorProfile() {
    try {
      return JSON.parse(localStorage.getItem('frose_current_vendor') || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function getVendorKey() {
    if (activeVendorId) return activeVendorId;
    try {
      const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
      return v.id || v.phone || localStorage.getItem('frose_stall_phone') || 'primary_vendor';
    } catch (_) {
      return localStorage.getItem('frose_stall_phone') || 'primary_vendor';
    }
  }

  function toSafeIntPaise(val) {
    if (window.FroseIdbStore && typeof window.FroseIdbStore.toSafeIntegerPaise === 'function') {
      return window.FroseIdbStore.toSafeIntegerPaise(val, 'pricePaise');
    }
    const n = typeof val === 'bigint' ? Number(val) : Number(val || 0);
    if (!Number.isSafeInteger(n)) throw new Error('Invalid integer paise value');
    return n;
  }

  function formatINR(paise) {
    if (window.FroseUI && typeof window.FroseUI.formatINR === 'function') {
      return window.FroseUI.formatINR(paise);
    }
    const p = typeof paise === 'bigint' ? paise : BigInt(Math.round(Number(paise || 0)));
    const rupees = Number(p / 100n);
    const rem = Number(p % 100n);
    return rem === 0 ? `₹${rupees.toLocaleString('en-IN')}` : `₹${rupees.toLocaleString('en-IN')}.${String(rem).padStart(2, '0')}`;
  }

  function notify(msg, variant) {
    if (window.FroseUI && typeof window.FroseUI.showToast === 'function') {
      window.FroseUI.showToast(msg, variant || 'success');
    }
  }

  function tr(key, fallback, vars) {
    if (window.FroseI18n && typeof window.FroseI18n.t === 'function') {
      const out = window.FroseI18n.t(key, vars);
      if (out && out !== key) return out;
    }
    if (!vars || !fallback) return fallback || key;
    return String(fallback).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  }

  function computeCartTaxBreakdown(subtotalPaiseBig) {
    const sub = typeof subtotalPaiseBig === 'bigint' ? Number(subtotalPaiseBig) : Number(subtotalPaiseBig || 0);
    const v = getActiveVendorProfile();
    const taxMode = v.taxMode || v.tax_mode || 'unregistered';
    const bps = taxMode === 'regular' ? Number(v.gstRateBps ?? v.gst_rate_bps ?? 500) : 0;
    if (taxMode !== 'regular' || !Number.isSafeInteger(bps) || bps <= 0) {
      return { subtotalPaise: sub, cgstPaise: 0, sgstPaise: 0, totalPaise: sub, taxMode, gstRateBps: 0 };
    }
    const totalTax = Number((BigInt(sub) * BigInt(bps) + 5000n) / 10000n);
    const cgstPaise = Math.floor(totalTax / 2);
    const sgstPaise = totalTax - cgstPaise;
    return {
      subtotalPaise: sub,
      cgstPaise,
      sgstPaise,
      totalPaise: sub + cgstPaise + sgstPaise,
      taxMode,
      gstRateBps: bps,
    };
  }

  function getCartTotals() {
    let totalItems = 0;
    let subtotalPaise = 0n;
    cart.forEach((entry) => {
      totalItems += entry.quantity;
      subtotalPaise += entry.unitPricePaise * BigInt(entry.quantity);
    });
    const taxInfo = computeCartTaxBreakdown(subtotalPaise);
    return { totalItems, taxInfo };
  }

  function renderSyncStatusBadge(snapshot) {
    const badge = document.getElementById('pos-sync-status-badge');
    if (!badge || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    const state = snapshot?.state || (navigator.onLine ? 'online' : 'offline');
    const pendingCount = Number(snapshot?.pendingCount || 0);
    let label = snapshot?.label || '';
    if (!label) {
      if (state === 'syncing') label = tr('status.syncing', 'Syncing');
      else if (state === 'offline') label = tr('status.offline_pending', `Offline — ${pendingCount} pending`, { count: pendingCount });
      else label = tr('status.online', 'Online');
    }

    badge.classList.remove('is-offline', 'is-syncing');
    if (state === 'syncing') {
      badge.classList.add('is-syncing');
    } else if (state === 'offline' || pendingCount > 0) {
      badge.classList.add('is-offline');
    }
    clear(badge);
    badge.appendChild(el('span', {}, label));
  }

  async function initOfflineRuntime() {

    if (window.FroseIdbStore) {
      if (typeof window.FroseIdbStore.requestPersistentStorage === 'function') {
        window.FroseIdbStore.requestPersistentStorage().catch(() => {});
      }
      if ((typeof navigator === 'undefined' || navigator.onLine !== false) && typeof window.FroseIdbStore.recordLastSeenAt === 'function') {
        window.FroseIdbStore.recordLastSeenAt(Date.now()).catch(() => {});
      }
    }

    const storageMod = window.__FROSE_STORAGE__ || {};
    const vKey = getVendorKey();
    if (storageMod.SyncEngine && window.FroseIdbStore) {
      if (!syncEngine) {
        syncEngine = new storageMod.SyncEngine({
          store: window.FroseIdbStore,
          vendorId: vKey,
          onStatusChange: renderSyncStatusBadge,
          onOrderSynced: (srvOrder) => {
            if (srvOrder && typeof srvOrder.tokenNo === 'number') {
              currentTokenNumber = srvOrder.tokenNo;
            }
          },
        });
        window.__FROSE_SYNC_ENGINE__ = syncEngine;
        syncEngine.startListeners();
      } else {
        syncEngine.setVendorId(vKey);
      }
      await syncEngine.notifyStatus();
      if (typeof navigator === 'undefined' || navigator.onLine !== false) {
        syncEngine.flushOutbox().catch(() => {});
      }
    }
  }

  function updateThemeCycleIcon(theme) {
    const iconEl = document.getElementById('theme-cycle-icon');
    if (!iconEl || !window.FroseTheme) return;
    const t = theme || window.FroseTheme.getTheme();
    if (window.FroseUI && typeof window.FroseUI.renderThemeIcon === 'function') {
      window.FroseUI.renderThemeIcon(iconEl, t);
    }
  }

  window.cycleWorkspaceTheme = function () {
    if (!window.FroseTheme) return;
    const next = window.FroseTheme.cycleTheme();
    updateThemeCycleIcon();
    const labelMap = { light: 'Crisp Light', dark: 'Obsidian Dark', sunlight: 'Sunlight High-Contrast' };
    notify(`Theme: ${labelMap[next] || next}`, 'success');
    if (window.__FROSE_SETTINGS_REFRESH__) window.__FROSE_SETTINGS_REFRESH__();
  };

  window.switchWorkspaceTab = function (tabName, opts) {
    const valid = ['bill', 'orders', 'menu', 'payments', 'settings'];
    const target = valid.includes(tabName) ? tabName : 'bill';
    const prevTab = activeTab;
    activeTab = target;

    if ((!opts || !opts.fromPopstate) && target !== prevTab && window.history && typeof window.history.pushState === 'function') {
      try {
        if (target !== 'bill') {
          window.history.pushState({ view: 'billing', froseTab: target }, '', '');
        }
      } catch (_) {}
    }

    document.querySelectorAll('.saas-view-panel').forEach((p) => {
      p.classList.toggle('active', p.getAttribute('data-tab-panel') === target);
    });
    document.querySelectorAll('.saas-nav-tab, .saas-rail-btn[data-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === target);
    });

    const pill = document.getElementById('pos-floating-cart-pill');
    const { totalItems } = getCartTotals();
    if (pill) {
      pill.style.display = (target === 'bill' && totalItems > 0) ? 'flex' : 'none';
    }
    document.body.classList.toggle('has-cart-items', target === 'bill' && totalItems > 0);

    if (target === 'orders' && window.FroseOrdersPanel && typeof window.FroseOrdersPanel.mount === 'function') {
      window.FroseOrdersPanel.mount();
    } else if (target === 'menu' && window.FroseMenuPanel && typeof window.FroseMenuPanel.mount === 'function') {
      window.FroseMenuPanel.mount();
    } else if (target === 'payments' && window.FrosePaymentsPanel && typeof window.FrosePaymentsPanel.mount === 'function') {
      window.FrosePaymentsPanel.mount();
    } else if (target === 'settings' && typeof window.initSettingsModal === 'function') {
      window.initSettingsModal();
    }
  };

  function isUserCustomDish(item) {
    return Boolean(item && item.name && item.isUserCreated !== false);
  }

  window.clearMenuCatalogToCleanSlate = async function () {
    const vKey = getVendorKey();
    if (window.FroseIdbStore) {
      await window.FroseIdbStore.putMenuItems(vKey, []);
      await window.FroseIdbStore.deleteMeta('categories');
    }
    menuCatalog = [];
    customCategories = [];
    cart.clear();
    renderCategoryChips();
    renderDishesGrid();
    updateCartUI();
  };

  async function loadCatalog() {
    const store = window.FroseIdbStore;
    let vKey = getVendorKey();
    if (store && vKey && vKey !== 'primary_vendor') {
      await store.ensureVendorScope(vKey);
    } else if (store) {
      const storedVendorId = await store.getActiveVendorId();
      if (storedVendorId) {
        activeVendorId = storedVendorId;
        vKey = storedVendorId;
      }
    }

    const sessionActive = localStorage.getItem('frose_session_active');
    let cats = [];
    if (store) {
      try {
        const catMeta = await store.getMeta('categories');
        if (catMeta && Array.isArray(catMeta.value) && (!catMeta.vendor_id || catMeta.vendor_id === vKey)) {
          cats = catMeta.value;
        }
      } catch (_) {}
    }

    if (sessionActive && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      try {
        const fn = window.froseApiFetch || fetch;
        const res = await fn('/api/v1/menu', {
          headers: { 'X-FROSE-CSRF': '1' },
          credentials: 'same-origin',
        });
        if (res && res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            menuCatalog = data.items.map((item) => {
              const intPaise = toSafeIntPaise(item.pricePaise !== undefined ? item.pricePaise : 5000);
              return {
                ...item,
                vendor_id: vKey,
                isUserCreated: true,
                isVeg: item.isVeg !== false,
                variants: Array.isArray(item.variants) ? item.variants : null,
                image: item.imageUrl || item.image || '',
                pricePaise: BigInt(intPaise),
              };
            });
            if (store) {
              await store.putMenuItems(vKey, menuCatalog.map((d) => ({
                ...d,
                pricePaise: Number(d.pricePaise),
              })));
            }
            const dishCats = Array.from(new Set(menuCatalog.map((d) => d.category).filter(Boolean)));
            if (cats.length === 0 && dishCats.length > 0) {
              cats = dishCats;
              if (store) {
                await store.setMeta('categories', { vendor_id: vKey, value: cats });
              }
            }
            customCategories = cats;
            renderCategoryChips();
            return;
          }
        }
      } catch (_) {}
    }

    if (store) {
      try {
        const cachedItems = await store.getMenuItems(vKey);
        if (Array.isArray(cachedItems) && cachedItems.length > 0) {
          menuCatalog = cachedItems.filter(isUserCustomDish).map((item) => ({
            ...item,
            isVeg: item.isVeg !== false,
            variants: Array.isArray(item.variants) ? item.variants : null,
            image: item.imageUrl || item.image || '',
            pricePaise: BigInt(toSafeIntPaise(item.pricePaise)),
          }));
          if (cats.length === 0) {
            cats = Array.from(new Set(menuCatalog.map((d) => d.category).filter(Boolean)));
          }
          customCategories = cats;
          renderCategoryChips();
          return;
        }
      } catch (_) {}
    }

    menuCatalog = [];
    customCategories = cats;
    renderCategoryChips();
  }

  function getMergedCategories() {
    const set = new Set();
    customCategories.forEach((c) => { if (c) set.add(c); });
    menuCatalog.forEach((d) => { if (d.category) set.add(d.category); });
    return Array.from(set);
  }

  function renderCategoryChips() {
    const bar = document.getElementById('pos-category-sidebar');
    if (!bar || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    clear(bar);

    const cats = getMergedCategories();
    const isAll = activeCategory === 'all';
    const allChip = el('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': isAll ? 'true' : 'false',
      class: 'pos-category-rail-item' + (isAll ? ' active' : ''),
      'data-category': 'all',
      on: { click: () => window.selectCategory('all') },
    }, [
      el('span', { class: 'pos-category-rail-label' }, 'All'),
      el('span', { class: 'pos-category-rail-count' }, `${menuCatalog.length}`),
    ]);
    bar.appendChild(allChip);

    cats.forEach((cat) => {
      const slug = cat.toLowerCase().replace(/\s+/g, '-');
      const isActive = activeCategory === slug || activeCategory === cat.toLowerCase();
      const count = menuCatalog.filter((item) => {
        const itemSlug = (item.category || '').toLowerCase().replace(/\s+/g, '-');
        return itemSlug === slug || (item.category || '').toLowerCase() === cat.toLowerCase();
      }).length;
      bar.appendChild(el('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        class: 'pos-category-rail-item' + (isActive ? ' active' : ''),
        'data-category': slug,
        on: { click: () => window.selectCategory(slug) },
      }, [
        el('span', { class: 'pos-category-rail-label' }, cat),
        el('span', { class: 'pos-category-rail-count' }, `${count}`),
      ]));
    });

    bar.appendChild(el('button', {
      type: 'button',
      class: 'pos-category-rail-item pos-category-rail-add',
      id: 'btn-rail-add-category',
      on: { click: () => window.openAddSectionModal() },
    }, '+ Add'));
  }

  window.selectCategory = function (catSlug) {
    activeCategory = catSlug || 'all';
    renderCategoryChips();
    renderDishesGrid();
  };

  function getQtyForDish(dishId) {
    let total = 0;
    cart.forEach((entry) => {
      if (entry.item.id === dishId) total += entry.quantity;
    });
    return total;
  }

  function buildDishActionNode(item) {
    const { el } = window.FroseSafeDom;
    const isSoldOut = item.isAvailable === false;
    const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
    const qty = getQtyForDish(item.id);

    if (isSoldOut) {
      return el('span', { class: 'saas-pill saas-pill-rose' }, tr('bill.sold_out', 'Sold Out'));
    }
    if (hasVariants) {
      return el('button', {
        type: 'button',
        class: 'saas-add-btn',
        on: {
          click: (e) => {
            e.stopPropagation();
            window.openVariantPicker(item.id);
          },
        },
      }, qty > 0 ? `+ (${qty})` : tr('bill.add_short', '+ Add'));
    }
    if (qty === 0) {
      return el('button', {
        type: 'button',
        class: 'saas-add-btn',
        on: {
          click: (e) => {
            e.stopPropagation();
            window.addItemToCart(item.id, e);
          },
        },
      }, tr('bill.add_short', '+ Add'));
    }
    return el('div', { class: 'saas-stepper' }, [
      el('button', {
        type: 'button',
        class: 'saas-stepper-btn',
        on: {
          click: (e) => {
            e.stopPropagation();
            window.decrementCartItem(item.id, e);
          },
        },
      }, '−'),
      el('span', { class: 'saas-stepper-qty' }, String(qty)),
      el('button', {
        type: 'button',
        class: 'saas-stepper-btn',
        on: {
          click: (e) => {
            e.stopPropagation();
            window.addItemToCart(item.id, e);
          },
        },
      }, '+'),
    ]);
  }

  function patchDishCardAction(dishId) {
    const grid = document.getElementById('pos-dishes-grid');
    if (!grid || !window.FroseSafeDom) return;
    const { clear } = window.FroseSafeDom;

    const patchCard = (card, targetId) => {
      const slot = card.querySelector('.saas-dish-action-slot');
      const item = menuCatalog.find((d) => d.id === targetId);
      if (!slot || !item) return;
      clear(slot);
      slot.appendChild(buildDishActionNode(item));
    };

    if (dishId) {
      const cards = grid.querySelectorAll('[data-dish-id]');
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-dish-id') === dishId) {
          patchCard(cards[i], dishId);
          break;
        }
      }
      return;
    }

    grid.querySelectorAll('[data-dish-id]').forEach((card) => {
      const id = card.getAttribute('data-dish-id');
      if (id) patchCard(card, id);
    });
  }

  function renderDishesGrid() {
    const grid = document.getElementById('pos-dishes-grid');
    if (!grid || !window.FroseSafeDom) return;
    const { el, clear, safeImageUrl } = window.FroseSafeDom;
    clear(grid);

    if (menuCatalog.length === 0) {
      const { svgEl } = window.FroseSafeDom;
      const emptyDishIcon = svgEl('svg', { width: 38, height: 38, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'margin-bottom: 8px;' }, [
        svgEl('path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }),
        svgEl('path', { d: 'M7 2v20' }),
        svgEl('path', { d: 'M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }),
      ]);
      grid.appendChild(
        el('div', { class: 'saas-empty-state', style: 'grid-column: 1 / -1;' }, [
          emptyDishIcon,
          el('h3', { style: 'margin: 0 0 6px 0; font-size: 17px; font-weight: 800;' }, 'Your menu is empty'),
          el('p', { style: 'margin: 0 0 16px 0; font-size: 13.5px; color: var(--text-muted);' }, 'Add your stall dishes with prices in ₹ to start billing in seconds.'),
          el('button', {
            type: 'button',
            id: 'btn-onboarding-add-dish',
            class: 'saas-btn saas-btn-primary',
            on: { click: () => window.openAddDishModal() },
          }, '+ Add First Dish'),
        ])
      );
      return;
    }

    const q = billSearchQuery.trim().toLowerCase();
    const filtered = menuCatalog.filter((item) => {
      const catSlug = (item.category || '').toLowerCase().replace(/\s+/g, '-');
      const catMatch = activeCategory === 'all' || catSlug === activeCategory || (item.category || '').toLowerCase() === activeCategory;
      const searchMatch = !q || item.name.toLowerCase().includes(q) || (item.category || '').toLowerCase().includes(q);
      return catMatch && searchMatch;
    });

    const catHeaderEl = document.getElementById('pos-category-header');
    if (catHeaderEl) {
      if (activeCategory === 'all') {
        catHeaderEl.textContent = tr('bill.all_items', `All · ${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`, { count: filtered.length });
      } else {
        const matchedCat = getMergedCategories().find((c) => c.toLowerCase().replace(/\s+/g, '-') === activeCategory || c.toLowerCase() === activeCategory);
        const label = matchedCat || activeCategory;
        catHeaderEl.textContent = tr('bill.category_items', `${label} · ${filtered.length} ${filtered.length === 1 ? 'item' : 'items'}`, { category: label, count: filtered.length });
      }
    }

    if (filtered.length === 0) {
      const { svgEl } = window.FroseSafeDom;
      const searchEmptySvg = svgEl('svg', { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'margin-bottom: 6px;' }, [
        svgEl('circle', { cx: 11, cy: 11, r: 8 }),
        svgEl('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
      ]);
      grid.appendChild(
        el('div', { class: 'saas-empty-state', style: 'grid-column: 1 / -1;' }, [
          searchEmptySvg,
          el('div', { style: 'font-weight: 700;' }, 'No matching dishes found'),
        ])
      );
      return;
    }

    filtered.forEach((item) => {
      const isSoldOut = item.isAvailable === false;
      const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
      const imgSrc = safeImageUrl(item.image || item.imageUrl);
      const minPricePaise = hasVariants
        ? Math.min.apply(null, item.variants.map((v) => Number(v.pricePaise)))
        : Number(item.pricePaise);

      const mediaNode = imgSrc
        ? el('img', {
            src: imgSrc,
            alt: item.name,
            loading: 'lazy',
            on: { error: (e) => { e.target.style.display = 'none'; } },
          })
        : el('div', { class: 'saas-dish-monogram' }, (item.name || 'D').slice(0, 2).toUpperCase());

      const card = el('div', {
        class: 'saas-dish-card' + (isSoldOut ? ' sold-out' : ''),
        'data-dish-id': item.id,
        'data-id': item.id,
        on: {
          click: () => {
            if (isSoldOut) {
              notify(`${item.name} is marked Sold Out`, 'warning');
              return;
            }
            if (hasVariants) window.openVariantPicker(item.id);
            else window.addItemToCart(item.id);
          },
        },
      }, [
        el('div', { class: 'saas-dish-media' }, [
          mediaNode,
          el('div', { style: 'position: absolute; top: 8px; left: 8px;' }, [
            window.FroseUI ? window.FroseUI.createVegBadge(item.isVeg !== false) : null,
          ]),
          hasVariants ? el('span', {
            class: 'pos-variant-tag',
            style: 'position: absolute; bottom: 8px; left: 8px; background: var(--bg-glass);',
          }, tr('bill.sizes_count', `${item.variants.length} sizes`, { count: item.variants.length })) : null,
        ]),
        el('div', { class: 'saas-dish-body' }, [
          el('div', { class: 'saas-dish-head' }, [
            el('div', { class: 'saas-dish-name', title: item.name }, item.name),
          ]),
          el('div', { class: 'saas-dish-foot' }, [
            el('div', { class: 'saas-dish-price' }, hasVariants ? tr('bill.from_price', `From ${formatINR(minPricePaise)}`, { price: formatINR(minPricePaise) }) : formatINR(minPricePaise)),
            el('div', { class: 'saas-dish-action-slot' }, [buildDishActionNode(item)]),
          ]),
        ]),
      ]);

      grid.appendChild(card);
    });
  }

  window.openVariantPicker = function (dishId) {
    const item = menuCatalog.find((d) => d.id === dishId);
    if (!item || !Array.isArray(item.variants) || item.variants.length === 0) return;
    const titleEl = document.getElementById('variant-picker-title');
    const listEl = document.getElementById('variant-picker-list');
    if (titleEl) titleEl.textContent = item.name;
    if (listEl && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(listEl);
      item.variants.forEach((variant) => {
        const key = `${item.id}::${variant.name}`;
        const existing = cart.get(key);
        const qty = existing ? existing.quantity : 0;
        listEl.appendChild(
          el('button', {
            type: 'button',
            class: 'pos-row-card is-clickable',
            style: 'width: 100%; text-align: left; font-family: inherit;',
            on: {
              click: () => {
                addCartKey(item, variant.name, BigInt(variant.pricePaise));
                window.closeModal('variant-picker-modal');
                notify(`Added ${item.name} (${variant.name})`, 'success');
              },
            },
          }, [
            el('div', {}, [
              el('div', { style: 'font-size: 15px; font-weight: 800;' }, variant.name),
              qty > 0 ? el('div', { style: 'font-size: 12px; color: var(--accent-primary); font-weight: 700;' }, `${qty} in cart`) : null,
            ]),
            el('div', { style: 'display: flex; align-items: center; gap: 10px;' }, [
              el('span', { class: 'tabular-nums', style: 'font-size: 16px; font-weight: 900;' }, formatINR(variant.pricePaise)),
              el('span', { class: 'saas-add-btn' }, '+ Add'),
            ]),
          ])
        );
      });
    }
    window.openModal('variant-picker-modal');
  };

  function addCartKey(item, variantName, unitPricePaise) {
    const key = variantName ? `${item.id}::${variantName}` : item.id;
    const existing = cart.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.set(key, {
        key,
        item,
        variantName: variantName || null,
        unitPricePaise,
        quantity: 1,
      });
    }
    updateCartUI(item.id);
  }

  window.addItemToCart = function (cartKeyOrDishId, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const existingEntry = cart.get(cartKeyOrDishId);
    if (existingEntry) {
      existingEntry.quantity += 1;
      updateCartUI(existingEntry.item.id);
      return;
    }
    const item = menuCatalog.find((i) => i.id === cartKeyOrDishId);
    if (!item || item.isAvailable === false) return;
    if (Array.isArray(item.variants) && item.variants.length > 0) {
      window.openVariantPicker(item.id);
      return;
    }
    addCartKey(item, null, BigInt(item.pricePaise));
  };

  window.decrementCartItem = function (cartKeyOrDishId, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const existing = cart.get(cartKeyOrDishId);
    if (!existing) return;
    const affectedDishId = existing.item.id;
    if (existing.quantity > 1) {
      existing.quantity -= 1;
    } else {
      cart.delete(cartKeyOrDishId);
    }
    updateCartUI(affectedDishId);
  };

  window.clearCurrentCart = async function () {
    if (cart.size === 0) return;
    const { totalItems } = getCartTotals();
    if (window.FroseUI && typeof window.FroseUI.confirmModal === 'function') {
      const ok = await window.FroseUI.confirmModal({
        title: 'Clear Current Order?',
        message: `Remove all ${totalItems} ${totalItems === 1 ? 'item' : 'items'} from the current bill?`,
        confirmLabel: 'Clear Cart',
        danger: true,
      });
      if (!ok) return;
    }
    cart.clear();
    const noteEl = document.getElementById('checkout-order-note');
    if (noteEl) noteEl.value = '';
    const cashIn = document.getElementById('cash-tendered-input');
    if (cashIn) cashIn.value = '';
    const splitIn = document.getElementById('split-cash-input');
    if (splitIn) splitIn.value = '';
    updateCartUI();
    window.closeModal('checkout-drawer-modal');
  };

  function renderCartRowsInto(container, refreshCallback) {
    if (!container || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    clear(container);
    if (cart.size === 0) {
      container.appendChild(
        el('div', { style: 'text-align: center; color: var(--text-muted); padding: 20px 8px; font-size: 13px;' }, tr('bill.empty_cart', 'Cart is empty. Tap dishes to add.'))
      );
      return;
    }
    cart.forEach((entry, key) => {
      const displayName = entry.variantName ? `${entry.item.name} (${entry.variantName})` : entry.item.name;
      const lineTotal = formatINR(entry.unitPricePaise * BigInt(entry.quantity));
      const isParcelItem = Boolean(entry.notes && entry.notes.toLowerCase().includes('parcel'));
      container.appendChild(
        el('div', { class: 'pos-cart-row' }, [
          el('div', { class: 'pos-cart-row-info' }, [
            el('div', { class: 'pos-cart-row-title' }, displayName),
            el('div', { class: 'pos-cart-row-sub', style: 'display: flex; align-items: center; gap: 6px; flex-wrap: wrap;' }, [
              el('span', {}, `${formatINR(entry.unitPricePaise)} each`),
              el('button', {
                type: 'button',
                class: 'saas-chip' + (isParcelItem ? ' active' : ''),
                style: 'min-height: 44px; min-width: 64px; padding: 4px 12px; font-size: 12px;',
                on: {
                  click: () => {
                    entry.notes = isParcelItem ? '' : 'Parcel';
                    renderCartRowsInto(container, refreshCallback);
                  },
                },
              }, isParcelItem ? 'Parcel' : '+ Parcel'),
            ]),
          ]),
          el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
            el('div', { class: 'saas-stepper' }, [
              el('button', {
                type: 'button',
                class: 'saas-stepper-btn',
                on: { click: () => { window.decrementCartItem(key); if (refreshCallback) refreshCallback(); } },
              }, '−'),
              el('span', { class: 'saas-stepper-qty' }, String(entry.quantity)),
              el('button', {
                type: 'button',
                class: 'saas-stepper-btn',
                on: { click: () => { window.addItemToCart(key); if (refreshCallback) refreshCallback(); } },
              }, '+'),
            ]),
            el('span', { class: 'tabular-nums', style: 'font-weight: 900; min-width: 52px; text-align: right;' }, lineTotal),
          ]),
        ])
      );
    });
  }

  function renderTaxBreakdownInto(elTarget, taxInfo) {
    if (!elTarget || !window.FroseSafeDom) return;
    const { el, clear } = window.FroseSafeDom;
    clear(elTarget);
    if (taxInfo.taxMode === 'regular' && taxInfo.gstRateBps > 0 && taxInfo.subtotalPaise > 0) {
      elTarget.style.display = 'flex';
      elTarget.style.flexDirection = 'column';
      elTarget.style.gap = '4px';
      elTarget.appendChild(el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Subtotal'), el('span', {}, formatINR(taxInfo.subtotalPaise))]));
      elTarget.appendChild(el('div', { class: 'pos-summary-line' }, [el('span', {}, 'CGST'), el('span', {}, formatINR(taxInfo.cgstPaise))]));
      elTarget.appendChild(el('div', { class: 'pos-summary-line' }, [el('span', {}, 'SGST'), el('span', {}, formatINR(taxInfo.sgstPaise))]));
    } else {
      elTarget.style.display = 'none';
    }
  }

  function updateCashChangeCalculator() {
    const { taxInfo } = getCartTotals();
    const totalPaise = taxInfo.totalPaise;
    const inputEl = document.getElementById('cash-tendered-input');
    const dueEl = document.getElementById('cash-change-due');
    if (!dueEl) return;
    const tenderedRupees = Number(inputEl?.value || 0);
    const tenderedPaise = Number.isFinite(tenderedRupees) && tenderedRupees > 0 ? Math.round(tenderedRupees * 100) : totalPaise;
    const diff = tenderedPaise - totalPaise;
    if (diff >= 0) {
      dueEl.textContent = formatINR(diff);
    } else {
      dueEl.textContent = `Short ${formatINR(-diff)}`;
    }
  }

  function updateSplitRemainder() {
    const { taxInfo } = getCartTotals();
    const totalPaise = taxInfo.totalPaise;
    const cashInput = document.getElementById('split-cash-input');
    const upiRemEl = document.getElementById('split-upi-remainder');
    if (!upiRemEl) return;
    const cashRupees = Number(cashInput?.value || 0);
    let cashPaise = Number.isFinite(cashRupees) && cashRupees >= 0 ? Math.round(cashRupees * 100) : 0;
    if (cashPaise > totalPaise) cashPaise = totalPaise;
    const upiPaise = Math.max(0, totalPaise - cashPaise);
    upiRemEl.textContent = formatINR(upiPaise);
  }

  function updateCartUI(affectedDishId) {
    const { totalItems, taxInfo } = getCartTotals();
    const totalPaiseBig = BigInt(taxInfo.totalPaise || 0);
    if (totalPaiseBig !== lastCartTotalPaise) {
      lastCartTotalPaise = totalPaiseBig;
      const cashTenderEl = document.getElementById('cash-tendered-input');
      if (cashTenderEl) cashTenderEl.value = '';
      const splitCashEl = document.getElementById('split-cash-input');
      if (splitCashEl) splitCashEl.value = '';
    }
    const totalFormatted = formatINR(taxInfo.totalPaise);

    const pill = document.getElementById('pos-floating-cart-pill');
    const pillStats = document.getElementById('cart-pill-stats');
    if (pill && pillStats) {
      pill.classList.toggle('is-empty', totalItems === 0);
      pill.style.display = (activeTab === 'bill' && totalItems > 0) ? 'flex' : 'none';
      const unitWord = totalItems === 1 ? tr('bill.item_singular', 'item') : tr('bill.item_plural', 'items');
      pillStats.textContent = tr('bill.cart_summary', `${totalItems} ${unitWord} · ${totalFormatted}`, {
        count: totalItems,
        unit: unitWord,
        total: totalFormatted,
      });
    }
    document.body.classList.toggle('has-cart-items', activeTab === 'bill' && totalItems > 0);

    const compatTotal = document.getElementById('cart-total-rupees');
    if (compatTotal) compatTotal.textContent = totalFormatted;

    const desktopItems = document.getElementById('desktop-cart-items');
    renderCartRowsInto(desktopItems);
    renderTaxBreakdownInto(document.getElementById('desktop-tax-breakdown'), taxInfo);
    const desktopTotal = document.getElementById('desktop-grand-total');
    if (desktopTotal) desktopTotal.textContent = totalFormatted;
    const desktopCheckoutBtn = document.getElementById('btn-desktop-checkout');
    if (desktopCheckoutBtn) desktopCheckoutBtn.disabled = totalItems === 0;

    const grandTotalEl = document.getElementById('checkout-grand-total');
    if (grandTotalEl) grandTotalEl.textContent = totalFormatted;
    const btnCashAmount = document.getElementById('btn-cash-amount');
    if (btnCashAmount) btnCashAmount.textContent = totalFormatted;
    const btnUpiAmount = document.getElementById('btn-upi-amount');
    if (btnUpiAmount) btnUpiAmount.textContent = totalFormatted;
    renderTaxBreakdownInto(document.getElementById('checkout-tax-breakdown'), taxInfo);

    updateCashChangeCalculator();
    updateSplitRemainder();
    patchDishCardAction(affectedDishId);
  }

  window.openCheckoutDrawer = function () {
    const list = document.getElementById('checkout-cart-items');
    if (!list) return;
    renderCartRowsInto(list, () => window.openCheckoutDrawer());
    const { taxInfo } = getCartTotals();
    renderTaxBreakdownInto(document.getElementById('checkout-tax-breakdown'), taxInfo);

    const cashInput = document.getElementById('cash-tendered-input');
    if (cashInput) cashInput.value = taxInfo.totalPaise > 0 ? String(Math.round(taxInfo.totalPaise / 100)) : '';
    const splitCashInput = document.getElementById('split-cash-input');
    if (splitCashInput && !splitCashInput.value && taxInfo.totalPaise > 0) {
      splitCashInput.value = String(Math.floor(taxInfo.totalPaise / 200));
    }
    const splitConfirm = document.getElementById('split-upi-confirm-check');
    if (splitConfirm) splitConfirm.checked = false;

    window.setCheckoutPaymentMode(checkoutPaymentMode || 'cash');
    updateCashChangeCalculator();
    updateSplitRemainder();
    window.openModal('checkout-drawer-modal');
  };

  window.setOrderType = function (type) {
    const norm = String(type || '').toLowerCase();
    currentOrderType = (norm === 'counter' || norm === 'parcel' || norm === 'takeaway') ? 'counter' : 'dinein';
    const pairs = [
      ['btn-type-dinein', 'btn-type-counter'],
      ['btn-desktop-type-dinein', 'btn-desktop-type-counter'],
    ];
    pairs.forEach(([dineId, parcelId]) => {
      const d = document.getElementById(dineId);
      const p = document.getElementById(parcelId);
      if (d) d.classList.toggle('active', currentOrderType === 'dinein');
      if (p) p.classList.toggle('active', currentOrderType === 'counter');
    });
  };

  window.setCheckoutPaymentMode = function (mode) {
    checkoutPaymentMode = ['cash', 'upi', 'split'].includes(mode) ? mode : 'cash';
    document.querySelectorAll('#checkout-payment-tabs .saas-seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-pay-mode') === checkoutPaymentMode);
    });
    const panels = {
      cash: document.getElementById('checkout-panel-cash'),
      upi: document.getElementById('checkout-panel-upi'),
      split: document.getElementById('checkout-panel-split'),
    };
    Object.keys(panels).forEach((k) => {
      if (panels[k]) panels[k].style.display = k === checkoutPaymentMode ? 'flex' : 'none';
    });
  };

  window.selectCashTender = function (val) {
    document.querySelectorAll('#cash-tender-chips .pos-tender-chip').forEach((c) => {
      c.classList.toggle('active', c.getAttribute('data-tender') === String(val));
    });
    const { taxInfo } = getCartTotals();
    const inputEl = document.getElementById('cash-tendered-input');
    if (inputEl) {
      inputEl.value = val === 'exact' ? String(Math.round(taxInfo.totalPaise / 100)) : String(val);
    }
    updateCashChangeCalculator();
  };

  window.payCashOrder = function () {
    if (isSubmittingOrder) return;
    if (cart.size === 0) {
      notify('Add dishes to cart first', 'warning');
      return;
    }
    executeOrderSuccess('cash');
  };

  window.payUpiOrder = function () {
    if (cart.size === 0) {
      notify('Add dishes to cart first', 'warning');
      return;
    }
    window.closeModal('checkout-drawer-modal');
    const { taxInfo } = getCartTotals();
    const formatted = formatINR(taxInfo.totalPaise);

    const confirmCheck = document.getElementById('upi-manual-confirm-check');
    if (confirmCheck) confirmCheck.checked = false;

    const upiAmountEl = document.getElementById('upi-qr-amount');
    if (upiAmountEl) upiAmountEl.textContent = formatted;

    const customQr = localStorage.getItem('frose_custom_scanner_qr');
    const v = getActiveVendorProfile();
    const upiId = (v.upiId || localStorage.getItem('frose_custom_upi_id') || '').trim();
    const payeeName = (v.payeeName || v.businessName || v.name || 'Stall Counter').trim();
    const rupeesAmount = (Number(taxInfo.totalPaise) / 100).toFixed(2);

    const upiVpaEl = document.getElementById('upi-qr-vpa');
    if (upiVpaEl) {
      upiVpaEl.textContent = upiId ? `${payeeName} · ${upiId}` : 'UPI ID not configured yet';
    }

    const qrCanvas = document.getElementById('upi-qr-code-canvas');
    if (qrCanvas && window.FroseSafeDom) {
      const { el, svgEl, clear, safeImageUrl } = window.FroseSafeDom;
      clear(qrCanvas);
      const safeQr = safeImageUrl(customQr);
      if (safeQr) {
        qrCanvas.appendChild(
          el('img', {
            src: safeQr,
            alt: 'Counter UPI Scanner',
            id: 'cart-upi-scanner-img',
            style: 'width: 190px; height: 190px; object-fit: contain; border-radius: 8px; display: block;',
          })
        );
      } else if (!upiId) {
        const qrIcon = svgEl('svg', {
          viewBox: '0 0 24 24',
          width: 36,
          height: 36,
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.75,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }, [
          svgEl('rect', { x: 3, y: 3, width: 7, height: 7, rx: 1 }),
          svgEl('rect', { x: 14, y: 3, width: 7, height: 7, rx: 1 }),
          svgEl('rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }),
          svgEl('path', { d: 'M14 14h3v3h-3zM17 17h4v4h-4zM14 20h3' }),
        ]);
        qrCanvas.appendChild(
          el('div', { style: 'padding: 16px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 8px;' }, [
            qrIcon,
            el('div', { style: 'font-size: 13.5px; font-weight: 800; color: var(--text-primary);' }, 'No UPI ID configured'),
            el('div', { style: 'font-size: 12px;' }, 'Add your stall UPI ID once to generate scannable customer QRs.'),
            el('button', {
              type: 'button',
              id: 'btn-upi-goto-settings',
              class: 'saas-btn saas-btn-primary',
              style: 'min-height: 44px; padding: 0 16px; margin-top: 4px;',
              on: {
                click: () => {
                  window.closeModal('upi-qr-modal');
                  window.switchWorkspaceTab('settings');
                },
              },
            }, 'Set UPI ID in Settings'),
          ])
        );
      } else {
        const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${rupeesAmount}&cu=INR`;
        const qrDataUrl = window.FroseQrLocal ? window.FroseQrLocal.toDataUrl(upiUri, 220) : '';
        if (qrDataUrl) {
          qrCanvas.appendChild(
            el('img', {
              src: qrDataUrl,
              alt: `UPI QR for ${upiId}`,
              id: 'cart-upi-dynamic-qr-img',
              'data-upi-uri': upiUri,
              style: 'width: 196px; height: 196px; object-fit: contain; border-radius: 10px; display: block; image-rendering: pixelated; background: #FFFFFF; padding: 6px;',
            })
          );
        } else if (window.FroseQrLocal && typeof window.FroseQrLocal.toSvgElement === 'function') {
          qrCanvas.appendChild(window.FroseQrLocal.toSvgElement(upiUri, 196));
        }
      }
    }
    window.openModal('upi-qr-modal');
  };

  window.confirmUpiReceived = function () {
    if (isSubmittingOrder) return;
    const confirmCheck = document.getElementById('upi-manual-confirm-check');
    if (confirmCheck && !confirmCheck.checked) {
      notify('Confirm UPI receipt on Soundbox/App first', 'warning');
      return;
    }
    window.closeModal('upi-qr-modal');
    executeOrderSuccess('upi');
  };

  window.paySplitOrder = function () {
    if (isSubmittingOrder) return;
    if (cart.size === 0) {
      notify('Add dishes to cart first', 'warning');
      return;
    }
    const { taxInfo } = getCartTotals();
    const totalPaise = taxInfo.totalPaise;
    const cashRupees = Number(document.getElementById('split-cash-input')?.value || 0);
    if (!Number.isFinite(cashRupees) || cashRupees < 0) {
      notify('Enter a valid Cash amount', 'danger');
      return;
    }
    const cashPaise = Math.round(cashRupees * 100);
    if (cashPaise > totalPaise) {
      notify('Cash amount cannot exceed order total', 'danger');
      return;
    }
    const upiPaise = totalPaise - cashPaise;
    const confirmCheck = document.getElementById('split-upi-confirm-check');
    if (upiPaise > 0 && confirmCheck && !confirmCheck.checked) {
      notify('Confirm UPI remainder on Soundbox/App first', 'warning');
      return;
    }
    executeOrderSuccess('split', { cashPaise, upiPaise });
  };

  function setOrderSubmitLock(locked) {
    const ids = ['btn-pay-cash', 'btn-pay-upi', 'btn-pay-split', 'btn-confirm-upi'];
    ids.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.disabled = locked;
        btn.classList.toggle('is-loading', locked);
      }
    });
  }

  async function executeOrderSuccess(method, splitOpts) {
    if (isSubmittingOrder) return;
    isSubmittingOrder = true;
    setOrderSubmitLock(true);

    try {
    window.closeModal('checkout-drawer-modal');
    window.closeModal('upi-qr-modal');

    const itemsList = [];
    const apiItems = [];
    let subtotalPaise = 0n;

    cart.forEach((entry) => {
      subtotalPaise += entry.unitPricePaise * BigInt(entry.quantity);
      const displayName = entry.variantName ? `${entry.item.name} (${entry.variantName})` : entry.item.name;
      itemsList.push({
        menuItemId: entry.item.id,
        id: entry.item.id,
        name: displayName,
        variantName: entry.variantName || undefined,
        quantity: entry.quantity,
        pricePaise: Number(entry.unitPricePaise),
      });
      const apiItem = { menuItemId: entry.item.id, quantity: entry.quantity };
      if (entry.variantName) apiItem.variantName = entry.variantName;
      if (entry.notes) apiItem.notes = entry.notes;
      apiItems.push(apiItem);
    });

    const taxInfo = computeCartTaxBreakdown(subtotalPaise);
    const paymentMethodNormalized = ['cash', 'upi', 'split'].includes(String(method).toLowerCase())
      ? String(method).toLowerCase()
      : 'cash';

    const noteInput = document.getElementById('checkout-order-note')?.value.trim() || '';
    const orderNote = currentOrderType === 'counter'
      ? (noteInput ? `Parcel: ${noteInput}` : 'Parcel')
      : (noteInput || undefined);

    const payloadBody = {
      items: apiItems,
      paymentMethod: paymentMethodNormalized,
      paymentStatus: 'paid',
      orderType: currentOrderType === 'counter' ? 'parcel' : 'dinein',
      source: 'pos',
    };
    if (orderNote) payloadBody.notes = orderNote;
    if (paymentMethodNormalized === 'split' && splitOpts) {
      payloadBody.cashPaise = splitOpts.cashPaise;
      payloadBody.upiPaise = splitOpts.upiPaise;
    }

    const storageMod = window.__FROSE_STORAGE__ || {};
    const clientOrderId = typeof storageMod.generateUuidV4 === 'function'
      ? storageMod.generateUuidV4()
      : (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : ('ord-' + Date.now()));
    const createdAtClient = new Date().toISOString();
    payloadBody.clientOrderId = clientOrderId;
    payloadBody.createdAtClient = createdAtClient;

    let serverOrder = null;
    let shouldQueueOffline = (typeof navigator !== 'undefined' && navigator.onLine === false);

    if (!shouldQueueOffline && localStorage.getItem('frose_session_active') && apiItems.length > 0) {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timerId = controller ? setTimeout(() => controller.abort(), 4000) : null;
      try {
        const fn = window.froseApiFetch || fetch;
        const res = await fn('/api/v1/orders', {
          method: 'POST',
          credentials: 'same-origin',
          signal: controller ? controller.signal : undefined,
          headers: {
            'Content-Type': 'application/json',
            'X-FROSE-CSRF': '1',
          },
          body: JSON.stringify(payloadBody),
        });
        if (res && res.ok) {
          const json = await res.json();
          if (json && json.order) serverOrder = json.order;
        } else if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
          let errMsg = 'Order rejected by server';
          try {
            const errJson = await res.json();
            errMsg = errJson?.message || errJson?.error?.message || errMsg;
          } catch (_) {}
          notify(errMsg, 'danger');
          return;
        } else {
          shouldQueueOffline = true;
        }
      } catch (_) {
        shouldQueueOffline = true;
      } finally {
        if (timerId) clearTimeout(timerId);
      }
    } else if (!localStorage.getItem('frose_session_active')) {
      shouldQueueOffline = true;
    }

    let orderData = null;
    let tokenStr = '';

    if (serverOrder) {
      currentTokenNumber = serverOrder.tokenNo ?? (currentTokenNumber + 1);
      tokenStr = `TOKEN #${currentTokenNumber}`;
      orderData = {
        ...serverOrder,
        client_order_id: serverOrder.clientOrderId || clientOrderId,
        orderType: serverOrder.orderType || (currentOrderType === 'counter' ? 'parcel' : 'dinein'),
        items: serverOrder.items && serverOrder.items.length > 0 ? serverOrder.items : itemsList,
        totalPaise: Number(serverOrder.totalPaise ?? taxInfo.totalPaise),
        syncStatus: 'synced',
      };
      if (window.FroseIdbStore) {
        try {
          await window.FroseIdbStore.saveOrder(getVendorKey(), orderData);
        } catch (_) {}
      }
    } else if (shouldQueueOffline && syncEngine) {
      try {
        const offlineRes = await syncEngine.queueOfflineOrder({
          vendorId: getVendorKey(),
          clientOrderId,
          createdAtClient,
          items: itemsList,
          totalPaise: Number(taxInfo.totalPaise),
          paymentMethod: paymentMethodNormalized,
          cashPaise: paymentMethodNormalized === 'split' && splitOpts ? splitOpts.cashPaise : undefined,
          upiPaise: paymentMethodNormalized === 'split' && splitOpts ? splitOpts.upiPaise : undefined,
          notes: orderNote,
          paymentStatus: 'paid',
          orderType: currentOrderType,
        });
        orderData = {
          ...offlineRes.order,
          subtotalPaise: taxInfo.subtotalPaise,
          cgstPaise: taxInfo.cgstPaise,
          sgstPaise: taxInfo.sgstPaise,
          taxModeSnapshot: taxInfo.taxMode,
          receiptNumber: 'OFFLINE-PENDING',
        };
        tokenStr = `TOKEN ${orderData.localTokenDisplay || ('OFF-' + String(orderData.tokenNo).padStart(2, '0'))}`;
      } catch (licErr) {
        notify(licErr?.message || 'Offline billing blocked: valid offline license required.', 'danger');
        return;
      }
    } else {
      currentTokenNumber = currentTokenNumber + 1;
      tokenStr = `TOKEN #${currentTokenNumber}`;
      orderData = {
        id: clientOrderId,
        client_order_id: clientOrderId,
        tokenNo: currentTokenNumber,
        orderType: currentOrderType,
        items: itemsList,
        subtotalPaise: taxInfo.subtotalPaise,
        cgstPaise: taxInfo.cgstPaise,
        sgstPaise: taxInfo.sgstPaise,
        taxModeSnapshot: taxInfo.taxMode,
        totalPaise: Number(taxInfo.totalPaise),
        paymentMethod: paymentMethodNormalized,
        status: 'pending',
        syncStatus: 'pending',
        createdAt: createdAtClient,
      };
    }

    lastCompletedOrder = orderData;

    const fToken = document.getElementById('flash-token-number');
    if (fToken) fToken.textContent = tokenStr;

    const finalPaise = Number(orderData?.totalPaise ?? taxInfo.totalPaise);
    let paymentText = 'Paid (Cash)';
    if (paymentMethodNormalized === 'upi') paymentText = 'Marked paid (UPI)';
    else if (paymentMethodNormalized === 'split') {
      const cP = Number(orderData?.cashPaise ?? splitOpts?.cashPaise ?? 0);
      const uP = Number(orderData?.upiPaise ?? splitOpts?.upiPaise ?? 0);
      paymentText = `Split (Cash ${formatINR(cP)} + Marked paid (UPI) ${formatINR(uP)})`;
    }
    const fAmount = document.getElementById('flash-token-amount');
    if (fAmount) fAmount.textContent = `${formatINR(finalPaise)} · ${paymentText}`;

    const fMeta = document.getElementById('flash-receipt-meta');
    if (fMeta) {
      fMeta.textContent = orderData.receiptNumber ? `Receipt: ${orderData.receiptNumber}` : 'Queued for sync';
    }

    try {
      const orderChannel = getOrdersBroadcastChannel();
      if (orderChannel && orderData) {
        orderChannel.postMessage({ event: 'order:new', data: orderData });
      }
    } catch (_) {}

    window.openModal('token-flash-modal');
    cart.clear();
    const noteInputNode = document.getElementById('checkout-order-note');
    if (noteInputNode) noteInputNode.value = '';
    updateCartUI();

    if (flashAutoCloseTimer) clearTimeout(flashAutoCloseTimer);
    flashAutoCloseTimer = setTimeout(() => {
      window.closeModal('token-flash-modal');
    }, 6500);
    } finally {
      isSubmittingOrder = false;
      setOrderSubmitLock(false);
    }
  }

  window.setReceiptPaperWidth = function (width) {
    const area = document.getElementById('receipt-print-area');
    const b58 = document.getElementById('btn-width-58mm');
    const b80 = document.getElementById('btn-width-80mm');
    const w = String(width) === '80' ? '80' : '58';
    if (area) {
      area.classList.remove('thermal-58mm', 'thermal-80mm');
      area.classList.add(w === '80' ? 'thermal-80mm' : 'thermal-58mm');
    }
    if (b58) b58.classList.toggle('active', w === '58');
    if (b80) b80.classList.toggle('active', w === '80');
  };

  window.openReceiptModal = function (orderObj) {
    if (!orderObj || !window.FroseReceiptView || !window.FroseSafeDom) return;
    if (flashAutoCloseTimer) {
      clearTimeout(flashAutoCloseTimer);
      flashAutoCloseTimer = null;
    }
    window.closeModal('token-flash-modal');
    window.closeModal('order-history-modal');
    activeReceiptOrder = orderObj;

    let printerWidth = '58';
    try {
      const prefs = JSON.parse(localStorage.getItem('frose_counter_preferences') || '{}');
      if (prefs.printerWidth === '80') printerWidth = '80';
    } catch (_) {}
    window.setReceiptPaperWidth(printerWidth);

    const area = document.getElementById('receipt-print-area');
    window.FroseReceiptView.renderReceiptDom(area, orderObj, getActiveVendorProfile(), window.FroseSafeDom);
    window.openModal('receipt-modal');
  };

  window.openLastReceiptModal = function () {
    if (lastCompletedOrder) window.openReceiptModal(lastCompletedOrder);
  };

  window.printThermalReceipt = function () {
    window.print();
  };

  async function copyOrderReceiptText(orderObj) {
    if (!orderObj || !window.FroseReceiptView) return;
    const text = window.FroseReceiptView.buildPlainTextReceipt(orderObj, getActiveVendorProfile());
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        notify('Bill text copied for WhatsApp', 'success');
        return;
      } catch (_) {}
    }
    notify('Receipt text ready', 'success');
  }

  window.copyBillTextWhatsApp = function () {
    return copyOrderReceiptText(activeReceiptOrder);
  };

  window.copyLastBillTextWhatsApp = function () {
    return copyOrderReceiptText(lastCompletedOrder);
  };

  window.openVoidOrderModal = function (orderId, tokenLabel) {
    const idEl = document.getElementById('void-order-id');
    const lblEl = document.getElementById('void-order-label');
    const reasonEl = document.getElementById('void-order-reason');
    if (idEl) idEl.value = orderId;
    if (lblEl) lblEl.textContent = `Order ${tokenLabel || ''} — enter reason to void:`;
    if (reasonEl) reasonEl.value = '';
    window.openModal('void-order-modal');
  };

  window.submitVoidOrder = async function (e) {
    e.preventDefault();
    if (isSubmittingVoid) return;
    const orderId = document.getElementById('void-order-id')?.value;
    const reason = document.getElementById('void-order-reason')?.value.trim() || '';
    if (!orderId || reason.length < 3) {
      notify('Enter a void reason (min 3 characters)', 'warning');
      return;
    }
    const submitBtn = document.getElementById('btn-submit-void-order');
    isSubmittingVoid = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.dataset.origLabel = submitBtn.textContent || 'Confirm Void Order';
      submitBtn.textContent = 'Voiding...';
    }
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-FROSE-CSRF': '1',
        },
        body: JSON.stringify({ status: 'cancelled', reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data?.error?.message || data?.message || 'Could not void order', 'danger');
        return;
      }
      window.closeModal('void-order-modal');
      if (window.closeOrderDetailDrawer) window.closeOrderDetailDrawer();
      notify('Order voided', 'success');
      if (window.FroseOrdersPanel && typeof window.FroseOrdersPanel.refresh === 'function') {
        await window.FroseOrdersPanel.refresh();
      }
    } catch (_) {
      notify('Network error voiding order', 'danger');
    } finally {
      isSubmittingVoid = false;
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.origLabel || 'Confirm Void Order';
      }
    }
  };

  // Section & Dish Modal Handlers (shared with Menu Tab)
  window.openAddSectionModal = function () {
    const inp = document.getElementById('input-new-section-name');
    if (inp) inp.value = '';
    window.openModal('modal-add-section');
  };

  window.submitAddSection = async function (e) {
    e.preventDefault();
    const name = document.getElementById('input-new-section-name')?.value.trim();
    if (!name) return;
    if (!customCategories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      customCategories.push(name);
      if (window.FroseIdbStore) {
        try {
          await window.FroseIdbStore.setMeta('categories', { vendor_id: getVendorKey(), value: customCategories });
        } catch (_) {}
      }
    }
    window.closeModal('modal-add-section');
    renderCategoryChips();
    window.selectCategory(name.toLowerCase().replace(/\s+/g, '-'));
    if (window.FroseMenuPanel && typeof window.FroseMenuPanel.render === 'function') {
      window.FroseMenuPanel.render();
    }
    notify(`Category "${name}" added`, 'success');
  };

  window.setDishVegFlag = function (val) {
    formDishIsVeg = val !== 'nonveg';
    const bVeg = document.getElementById('btn-dish-veg');
    const bNonVeg = document.getElementById('btn-dish-nonveg');
    if (bVeg) bVeg.classList.toggle('active', formDishIsVeg);
    if (bNonVeg) bNonVeg.classList.toggle('active', !formDishIsVeg);
  };

  window.addDishVariantRow = function (preset) {
    const container = document.getElementById('dish-variants-rows');
    if (!container || !window.FroseSafeDom) return;
    const { el } = window.FroseSafeDom;
    const row = el('div', {
      class: 'dish-variant-row',
      style: 'display: grid; grid-template-columns: 1fr 110px 44px; gap: 8px; align-items: center;',
    }, [
      el('input', {
        type: 'text',
        class: 'saas-input variant-name-input',
        placeholder: 'Size (e.g. Half)',
        value: preset && preset.name ? preset.name : '',
      }),
      el('input', {
        type: 'number',
        class: 'saas-input tabular-nums variant-price-input',
        placeholder: '₹',
        min: 1,
        step: 1,
        value: preset && preset.pricePaise ? String(Math.round(Number(preset.pricePaise) / 100)) : '',
      }),
      el('button', {
        type: 'button',
        class: 'saas-btn saas-btn-danger',
        style: 'padding: 0; min-width: 44px; min-height: 44px;',
        'aria-label': 'Remove Variant',
        on: { click: () => { if (row.parentNode) row.parentNode.removeChild(row); } },
      }, [window.FroseSafeDom.svgEl('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
        window.FroseSafeDom.svgEl('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
        window.FroseSafeDom.svgEl('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
      ])]),
    ]);
    container.appendChild(row);
  };

  let activeDishPhotoDataUrl = '';

  function setDishPhotoPreviewState(src, labelText) {
    const { safeImageUrl } = window.FroseSafeDom;
    const preview = document.getElementById('dish-photo-preview-img');
    const placeholder = document.getElementById('dish-photo-placeholder');
    const statusEl = document.getElementById('dish-photo-preview-status');
    const removeBtn = document.getElementById('btn-remove-dish-photo');
    const safe = safeImageUrl(src);

    if (safe) {
      if (preview) {
        preview.src = safe;
        preview.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (removeBtn) removeBtn.style.display = 'inline-flex';
      if (statusEl) statusEl.textContent = labelText || (safe.startsWith('data:image/') ? 'Compressed photo ready' : 'Image attached');
    } else {
      if (preview) {
        preview.removeAttribute('src');
        preview.style.display = 'none';
      }
      if (placeholder) placeholder.style.display = 'flex';
      if (removeBtn) removeBtn.style.display = 'none';
      if (statusEl) statusEl.textContent = 'No photo attached (optional)';
    }
  }

  window.clearDishPhoto = function () {
    activeDishPhotoDataUrl = '';
    const urlInput = document.getElementById('input-dish-photo-url');
    const selectEl = document.getElementById('input-dish-photo-select');
    const camInput = document.getElementById('input-dish-photo-camera');
    const galInput = document.getElementById('input-dish-photo-gallery');
    if (urlInput) urlInput.value = '';
    if (selectEl) selectEl.value = '';
    if (camInput) camInput.value = '';
    if (galInput) galInput.value = '';
    setDishPhotoPreviewState('');
  };

  window.updateDishPhotoPreview = function (val) {
    const urlInput = document.getElementById('input-dish-photo-url');
    const selectEl = document.getElementById('input-dish-photo-select');
    if (val !== undefined && val !== '') {
      activeDishPhotoDataUrl = '';
    }
    const raw = (val !== undefined ? val : (activeDishPhotoDataUrl || urlInput?.value.trim() || selectEl?.value || ''));
    setDishPhotoPreviewState(raw);
  };

  async function compressDishImageFile(file) {
    if (!file) return;
    const type = String(file.type || '').toLowerCase();
    const isRasterImage = type.startsWith('image/') && type !== 'image/svg+xml';
    if (!isRasterImage) {
      notify('Unsupported file type. Please choose a JPG, PNG, or WebP image.', 'danger');
      return;
    }

    const loadImage = (f) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Invalid or corrupted image file'));
        img.src = String(reader.result || '');
      };
      reader.readAsDataURL(f);
    });

    try {
      const img = await loadImage(file);
      const maxDim = 400;
      const srcW = img.naturalWidth || img.width || 400;
      const srcH = img.naturalHeight || img.height || 400;
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      let targetW = Math.max(1, Math.round(srcW * scale));
      let targetH = Math.max(1, Math.round(srcH * scale));

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      const encodeAttempt = (w, h, mime, q) => {
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL(mime, q);
      };

      const TARGET_CHARS = 82000; // ~60 KB binary
      const HARD_CAP_CHARS = 164000; // ~120 KB binary
      let dataUrl = encodeAttempt(targetW, targetH, 'image/webp', 0.75);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = encodeAttempt(targetW, targetH, 'image/jpeg', 0.75);
      }
      const mimeUsed = dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';

      const qualities = [0.6, 0.45];
      for (let i = 0; i < qualities.length && dataUrl.length > TARGET_CHARS; i++) {
        dataUrl = encodeAttempt(targetW, targetH, mimeUsed, qualities[i]);
      }
      if (dataUrl.length > HARD_CAP_CHARS) {
        targetW = Math.max(1, Math.round(targetW * 0.75));
        targetH = Math.max(1, Math.round(targetH * 0.75));
        dataUrl = encodeAttempt(targetW, targetH, 'image/jpeg', 0.55);
      }

      if (dataUrl.length > 180000) {
        notify('Image is still too large after compression. Please pick a smaller photo.', 'danger');
        return;
      }

      activeDishPhotoDataUrl = dataUrl;
      const urlInput = document.getElementById('input-dish-photo-url');
      const selectEl = document.getElementById('input-dish-photo-select');
      if (urlInput) urlInput.value = '';
      if (selectEl) selectEl.value = '';
      const approxKb = Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));
      setDishPhotoPreviewState(dataUrl, `Photo ready (${approxKb} KB)`);
    } catch (err) {
      notify(err && err.message ? err.message : 'Could not process image', 'danger');
    }
  }

  window.openAddDishModal = async function (editDish) {
    const heading = document.getElementById('dish-modal-heading');
    const editIdEl = document.getElementById('dish-form-edit-id');
    const nameEl = document.getElementById('input-dish-name');
    const priceEl = document.getElementById('input-dish-price');
    const photoEl = document.getElementById('input-dish-photo-select');
    const photoUrlEl = document.getElementById('input-dish-photo-url');
    const fallbackDetails = document.getElementById('dish-photo-fallback-details');
    const delBtn = document.getElementById('btn-delete-dish-in-modal');
    const varRows = document.getElementById('dish-variants-rows');
    if (varRows && window.FroseSafeDom) window.FroseSafeDom.clear(varRows);
    if (fallbackDetails) fallbackDetails.open = false;

    const cats = getMergedCategories();
    if (cats.length === 0) cats.push('Special Items');

    const select = document.getElementById('input-dish-category');
    if (select && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(select);
      cats.forEach((c) => select.appendChild(el('option', { value: c }, c)));
    }

    const isEditMode = Boolean(editDish && typeof editDish === 'object' && !editDish.nodeType && editDish.id);
    if (isEditMode) {
      if (heading) heading.textContent = 'Edit Dish';
      if (editIdEl) editIdEl.value = editDish.id;
      if (nameEl) nameEl.value = editDish.name || '';
      if (priceEl) priceEl.value = String(Math.round(Number(editDish.pricePaise || 0) / 100));
      if (select && editDish.category) select.value = editDish.category;
      const imgVal = editDish.imageUrl || editDish.image || '';
      activeDishPhotoDataUrl = imgVal.startsWith('data:image/') ? imgVal : '';
      if (photoEl) photoEl.value = imgVal.startsWith('/images/') ? imgVal : '';
      if (photoUrlEl) photoUrlEl.value = imgVal && !imgVal.startsWith('/images/') && !imgVal.startsWith('data:image/') ? imgVal : '';
      setDishPhotoPreviewState(imgVal);
      if (delBtn) delBtn.style.display = 'inline-flex';
      window.setDishVegFlag(editDish.isVeg === false ? 'nonveg' : 'veg');
      if (Array.isArray(editDish.variants)) {
        editDish.variants.forEach((v) => window.addDishVariantRow(v));
      }
    } else {
      if (heading) heading.textContent = 'Add Dish';
      if (editIdEl) editIdEl.value = '';
      if (nameEl) nameEl.value = '';
      if (priceEl) priceEl.value = '';
      window.clearDishPhoto();
      if (delBtn) delBtn.style.display = 'none';
      window.setDishVegFlag('veg');
    }

    window.openModal('modal-add-dish');
  };

  window.submitAddDish = async function (e) {
    e.preventDefault();
    if (isSubmittingDish) return;
    const { safeImageUrl } = window.FroseSafeDom;
    const editId = document.getElementById('dish-form-edit-id')?.value.trim() || '';
    const name = document.getElementById('input-dish-name')?.value.trim() || '';
    const category = document.getElementById('input-dish-category')?.value || 'General';
    const priceRupees = Number(document.getElementById('input-dish-price')?.value || 0);
    const customUrlRaw = document.getElementById('input-dish-photo-url')?.value.trim() || '';
    if (customUrlRaw && !safeImageUrl(customUrlRaw)) {
      notify('Rejected unsafe image URL (use https:// or preset)', 'danger');
      return;
    }
    const presetVal = document.getElementById('input-dish-photo-select')?.value || '';
    const photo = safeImageUrl(activeDishPhotoDataUrl || customUrlRaw || presetVal) || '';

    if (!name || !Number.isFinite(priceRupees) || priceRupees <= 0) {
      notify('Enter a valid dish name and price', 'warning');
      return;
    }

    const saveBtn = document.getElementById('btn-save-dish-modal');
    isSubmittingDish = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.dataset.origLabel = saveBtn.textContent || 'Save Dish';
      saveBtn.textContent = 'Saving...';
    }

    try {

    const pricePaiseNum = Math.round(priceRupees * 100);
    const variants = [];
    document.querySelectorAll('#dish-variants-rows .dish-variant-row').forEach((row) => {
      const vName = row.querySelector('.variant-name-input')?.value.trim() || '';
      const vPriceR = Number(row.querySelector('.variant-price-input')?.value || 0);
      if (vName && Number.isFinite(vPriceR) && vPriceR > 0) {
        variants.push({ name: vName, pricePaise: Math.round(vPriceR * 100) });
      }
    });

    const payload = {
      name,
      category,
      pricePaise: pricePaiseNum,
      imageUrl: photo,
      isVeg: formDishIsVeg,
      variants: variants.length > 0 ? variants : null,
      isAvailable: true,
    };

    if (editId) {
      let updatedItem = null;
      if (localStorage.getItem('frose_session_active')) {
        try {
          const fn = window.froseApiFetch || fetch;
          const res = await fn(`/api/v1/menu/${editId}`, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
            body: JSON.stringify(payload),
          });
          if (res && res.ok) {
            const json = await res.json();
            updatedItem = json.item;
          }
        } catch (_) {}
      }
      menuCatalog = menuCatalog.map((d) => {
        if (d.id !== editId) return d;
        const src = updatedItem || payload;
        return {
          ...d,
          ...src,
          pricePaise: BigInt(src.pricePaise || pricePaiseNum),
          image: src.imageUrl || photo,
        };
      });
      notify(`Updated "${name}"`, 'success');
    } else {
      let newDish = {
        id: 'dish-' + Date.now().toString(36),
        ...payload,
        pricePaise: BigInt(pricePaiseNum),
        image: photo,
        isUserCreated: true,
      };
      if (localStorage.getItem('frose_session_active')) {
        try {
          const fn = window.froseApiFetch || fetch;
          const res = await fn('/api/v1/menu', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
            body: JSON.stringify(payload),
          });
          if (res && res.ok) {
            const json = await res.json();
            if (json && json.item) {
              newDish = {
                ...json.item,
                pricePaise: BigInt(json.item.pricePaise || pricePaiseNum),
                image: json.item.imageUrl || photo,
                isUserCreated: true,
              };
            }
          }
        } catch (_) {}
      }
      menuCatalog.push(newDish);
      notify(`Added "${name}" to menu`, 'success');
    }

    if (window.FroseIdbStore) {
      try {
        await window.FroseIdbStore.putMenuItems(getVendorKey(), menuCatalog.map((d) => ({ ...d, pricePaise: Number(d.pricePaise) })));
      } catch (_) {}
    }

    window.closeModal('modal-add-dish');
    renderCategoryChips();
    renderDishesGrid();
    updateCartUI();
    if (window.FroseMenuPanel && typeof window.FroseMenuPanel.render === 'function') {
      window.FroseMenuPanel.render();
    }
    } finally {
      isSubmittingDish = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = saveBtn.dataset.origLabel || 'Save Dish';
      }
    }
  };

  window.deleteActiveFormDish = async function () {
    const editId = document.getElementById('dish-form-edit-id')?.value.trim();
    if (!editId) return;
    await window.deleteDishById(editId);
    window.closeModal('modal-add-dish');
  };

  window.deleteDishById = async function (dishId) {
    const ok = window.FroseUI
      ? await window.FroseUI.confirmModal({
          title: 'Remove Dish?',
          message: 'This dish will be removed from your active menu.',
          confirmLabel: 'Remove',
          danger: true,
        })
      : false;
    if (!ok) return;

    if (localStorage.getItem('frose_session_active')) {
      try {
        const fn = window.froseApiFetch || fetch;
        await fn(`/api/v1/menu/${dishId}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'X-FROSE-CSRF': '1' },
        });
      } catch (_) {}
    }

    menuCatalog = menuCatalog.filter((d) => d.id !== dishId);
    cart.forEach((_, key) => {
      if (key === dishId || key.startsWith(`${dishId}::`)) cart.delete(key);
    });
    if (window.FroseIdbStore) {
      try {
        await window.FroseIdbStore.putMenuItems(getVendorKey(), menuCatalog.map((d) => ({ ...d, pricePaise: Number(d.pricePaise) })));
      } catch (_) {}
    }
    renderCategoryChips();
    renderDishesGrid();
    updateCartUI();
    if (window.FroseMenuPanel && typeof window.FroseMenuPanel.render === 'function') {
      window.FroseMenuPanel.render();
    }
    notify('Dish removed', 'success');
  };

  // Compatibility helpers for modal-edit-dish
  let activeEditingDishId = null;
  window.openEditDishModal = function (dishId, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const dish = menuCatalog.find((i) => i.id === dishId);
    if (dish) window.openAddDishModal(dish);
    activeEditingDishId = dishId;
  };
  window.submitEditDish = function (e) { e.preventDefault(); window.closeModal('modal-edit-dish'); };
  window.deleteDish = function () { if (activeEditingDishId) window.deleteDishById(activeEditingDishId); };

  function populateProfileInfo() {
    try {
      const v = getActiveVendorProfile();
      const name = v.businessName || localStorage.getItem('frose_stall_name') || 'Stall Client';
      const owner = v.ownerName || 'Stall Owner';
      const phone = v.phone || localStorage.getItem('frose_stall_phone') || '';
      const initials = (owner || name).split(' ').map((w) => w[0]).join('').substring(0, 2).toUpperCase() || 'SC';

      const headerTitle = document.getElementById('pos-header-stall-name');
      if (headerTitle) headerTitle.textContent = name;
      document.querySelectorAll('.pos-avatar-badge, #settings-client-avatar').forEach((el) => { el.textContent = initials; });
      document.querySelectorAll('.pos-avatar-label, #settings-client-stall').forEach((el) => { el.textContent = name; });
      const ownerEl = document.getElementById('settings-client-owner');
      if (ownerEl) ownerEl.textContent = owner;
      const phoneEl = document.getElementById('settings-client-phone');
      if (phoneEl && phone) phoneEl.textContent = '+91 ' + phone;
    } catch (_) {}
  }

  window.openModal = function (modalId) {
    if (window.FroseUI && typeof window.FroseUI.openSheet === 'function') {
      window.FroseUI.openSheet(modalId);
      return;
    }
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
  };

  window.closeModal = function (modalId) {
    if (window.FroseUI && typeof window.FroseUI.closeSheet === 'function') {
      window.FroseUI.closeSheet(modalId);
      return;
    }
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
  };

  window.handleLogout = async function () {
    if (window.FroseIdbStore && typeof window.FroseIdbStore.safeLogout === 'function') {
      await window.FroseIdbStore.safeLogout({
        vendorId: getVendorKey(),
        confirmMessage: 'Sign out of Stall Account?',
      });
      return;
    }
  };

  window.openOutboxInspector = async function () {
    const listEl = document.getElementById('outbox-inspector-list');
    if (listEl && window.FroseSafeDom) {
      const { el, clear } = window.FroseSafeDom;
      clear(listEl);
      let pendingEntries = [];
      if (window.FroseIdbStore && typeof window.FroseIdbStore.getOutbox === 'function') {
        try {
          pendingEntries = await window.FroseIdbStore.getOutbox(getVendorKey(), ['pending', 'syncing', 'failed']);
        } catch (_) {}
      }
      if (pendingEntries.length === 0) {
        listEl.appendChild(
          el('div', { class: 'saas-empty-state' }, [
            el('div', { style: 'font-weight: 800;' }, 'All orders synced to cloud'),
            el('div', { style: 'font-size: 12px; color: var(--text-muted); margin-top: 4px;' }, navigator.onLine ? 'Online and connected.' : 'Offline mode active — new bills queue here safely.'),
          ])
        );
      } else {
        pendingEntries.forEach((entry) => {
          const payload = entry.payload || {};
          listEl.appendChild(
            el('div', { class: 'pos-row-card' }, [
              el('div', { style: 'min-width: 0; flex: 1;' }, [
                el('div', { style: 'font-size: 14px; font-weight: 800;' }, entry.localTokenDisplay || ('Pending #' + String(entry.client_order_id || '').slice(0, 6))),
                el('div', { style: 'font-size: 12px; color: var(--text-muted);' }, `${String(payload.paymentMethod || 'cash').toUpperCase()} · Attempts: ${Number(entry.retryCount || 0)}`),
              ]),
              el('span', { class: 'saas-pill saas-pill-amber' }, String(entry.status || 'pending').toUpperCase()),
            ])
          );
        });
      }
    }
    window.openModal('outbox-inspector-modal');
  };

  window.triggerOutboxSync = async function () {
    const btn = document.getElementById('btn-outbox-sync-now');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Syncing...';
    }
    try {
      if (syncEngine && typeof syncEngine.flushOutbox === 'function') {
        const res = await syncEngine.flushOutbox({ force: true });
        await syncEngine.notifyStatus();
        notify(`Sync finished: ${res.synced} synced`, 'success');
      } else {
        notify('Sync completed', 'success');
      }
      await window.openOutboxInspector();
    } catch (_) {
      notify('Could not sync right now — check connection', 'warning');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Sync Now';
      }
    }
  };

  window.openCustomItemModal = function () {
    const nameEl = document.getElementById('input-custom-item-name');
    const priceEl = document.getElementById('input-custom-item-price');
    const qtyEl = document.getElementById('input-custom-item-qty');
    if (nameEl) nameEl.value = '';
    if (priceEl) priceEl.value = '';
    if (qtyEl) qtyEl.value = '1';
    window.openModal('modal-custom-item');
    setTimeout(() => { if (nameEl) nameEl.focus(); }, 60);
  };

  window.submitCustomItem = async function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingCustomItem) return;

    const name = document.getElementById('input-custom-item-name')?.value.trim();
    const rupeesVal = Number(document.getElementById('input-custom-item-price')?.value || 0);
    const qty = Math.max(1, parseInt(document.getElementById('input-custom-item-qty')?.value || '1', 10) || 1);

    if (!name || !Number.isFinite(rupeesVal) || rupeesVal <= 0) {
      notify('Enter a valid item label and ₹ amount', 'danger');
      return;
    }

    const pricePaiseNum = Math.round(rupeesVal * 100);
    if (!Number.isSafeInteger(pricePaiseNum) || pricePaiseNum <= 0) {
      notify('Invalid ₹ amount', 'danger');
      return;
    }

    const saveBtn = document.getElementById('btn-save-custom-item');
    isSubmittingCustomItem = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Adding...';
    }

    try {
      let itemObj = {
        id: 'custom-' + Date.now().toString(36),
        name,
        category: 'Custom Items',
        pricePaise: BigInt(pricePaiseNum),
        isVeg: true,
        isAvailable: true,
        isUserCreated: true,
        image: '',
      };

      if (localStorage.getItem('frose_session_active') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        try {
          const fn = window.froseApiFetch || fetch;
          const res = await fn('/api/v1/menu', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
            body: JSON.stringify({
              name,
              category: 'Custom Items',
              pricePaise: pricePaiseNum,
              isVeg: true,
              isAvailable: true,
            }),
          });
          if (res && res.ok) {
            const json = await res.json();
            if (json && json.item) {
              itemObj = {
                ...json.item,
                pricePaise: BigInt(json.item.pricePaise || pricePaiseNum),
                isVeg: json.item.isVeg !== false,
                isUserCreated: true,
              };
            }
          }
        } catch (_) {}
      }

      menuCatalog.push(itemObj);
      for (let i = 0; i < qty; i++) {
        addCartKey(itemObj, null, BigInt(itemObj.pricePaise));
      }
      window.closeModal('modal-custom-item');
      renderCategoryChips();
      renderDishesGrid();
      notify(`Added ${qty}x ${name} to bill`, 'success');
    } finally {
      isSubmittingCustomItem = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Add to Bill';
      }
    }
  };

  async function checkSubscriptionStatus() {
    const banner = document.getElementById('pos-subscription-banner');
    const textEl = document.getElementById('pos-subscription-banner-text');
    if (!banner || !textEl) return;
    if (!localStorage.getItem('frose_session_active') || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn('/api/v1/subscriptions/status', { credentials: 'same-origin' });
      if (!res || !res.ok) return;
      const sub = await res.json();
      const days = typeof sub.daysRemaining === 'number' ? sub.daysRemaining : null;
      if (sub.isReadOnly || sub.status === 'expired_readonly') {
        textEl.textContent = 'Subscription expired (read-only mode). Renew plan to punch new bills.';
        banner.style.display = 'flex';
      } else if (sub.status === 'grace_period') {
        textEl.textContent = `Plan expired — grace period (${sub.gracePeriodDaysRemaining || 0} days left). Renew in Settings.`;
        banner.style.display = 'flex';
      } else if (sub.status === 'trial_expiring' || (days !== null && days <= 3)) {
        textEl.textContent = `Plan expires in ${Math.max(0, days || 0)} day${days === 1 ? '' : 's'}. Review subscription in Settings.`;
        banner.style.display = 'flex';
      } else {
        banner.style.display = 'none';
      }
    } catch (_) {}
  }

  let _licenseSyncedInSession = false;

  async function refreshPOS() {
    await loadCatalog();
    await initOfflineRuntime();
    checkSubscriptionStatus();
    if (!_licenseSyncedInSession && localStorage.getItem('frose_session_active') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      _licenseSyncedInSession = true;
      const storageMod = window.__FROSE_STORAGE__ || {};
      if (storageMod.LicenseManager) {
        storageMod.LicenseManager.syncLicenseFromServer(getVendorKey()).catch(() => {});
      }
    }
    renderCategoryChips();
    renderDishesGrid();
    updateCartUI();
    populateProfileInfo();
    updateThemeCycleIcon();
  }

  // Expose workspace API cleanly to Orders / Menu / Payments / Settings panels
  window.__FROSE_WORKSPACE__ = {
    getMenuCatalog: () => menuCatalog,
    setMenuCatalog: (items) => { menuCatalog = items; },
    getCategories: getMergedCategories,
    reloadCatalog: async () => {
      await loadCatalog();
      renderCategoryChips();
      renderDishesGrid();
      updateCartUI();
    },
    getVendorKey,
    getActiveVendorProfile,
    formatINR,
    notify,
    switchTab: (tab) => window.switchWorkspaceTab(tab),
    openAddDishModal: (dish) => window.openAddDishModal(dish),
    deleteDishById: (id) => window.deleteDishById(id),
    openAddSectionModal: () => window.openAddSectionModal(),
    openReceiptModal: (ord) => window.openReceiptModal(ord),
    openVoidOrderModal: (id, lbl) => window.openVoidOrderModal(id, lbl),
    refreshProfileUI: populateProfileInfo,
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('bill-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        billSearchQuery = searchInput.value || '';
        if (billSearchTimer) clearTimeout(billSearchTimer);
        if (!billSearchQuery) {
          renderDishesGrid();
          return;
        }
        billSearchTimer = setTimeout(() => {
          billSearchTimer = null;
          renderDishesGrid();
        }, 120);
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (billSearchTimer) {
            clearTimeout(billSearchTimer);
            billSearchTimer = null;
          }
          billSearchQuery = searchInput.value || '';
          renderDishesGrid();
        } else if (e.key === 'Escape') {
          if (searchInput.value) {
            searchInput.value = '';
            billSearchQuery = '';
            renderDishesGrid();
          } else {
            searchInput.blur();
          }
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (activeTab !== 'bill') return;
      const openBackdrop = document.querySelector('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active');
      if (openBackdrop) return;
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || document.activeElement?.isContentEditable) return;
      const inp = document.getElementById('bill-search-input');
      if (inp) {
        e.preventDefault();
        inp.focus();
      }
    });
    const cashTenderInput = document.getElementById('cash-tendered-input');
    if (cashTenderInput) {
      cashTenderInput.addEventListener('input', updateCashChangeCalculator);
    }
    const splitCashInput = document.getElementById('split-cash-input');
    if (splitCashInput) {
      splitCashInput.addEventListener('input', updateSplitRemainder);
    }
    const photoUrlInput = document.getElementById('input-dish-photo-url');
    if (photoUrlInput) {
      photoUrlInput.addEventListener('input', () => window.updateDishPhotoPreview(photoUrlInput.value));
    }
    const camPhotoInput = document.getElementById('input-dish-photo-camera');
    if (camPhotoInput) {
      camPhotoInput.addEventListener('change', (e) => {
        const f = e.target && e.target.files && e.target.files[0];
        if (f) compressDishImageFile(f);
      });
    }
    const galPhotoInput = document.getElementById('input-dish-photo-gallery');
    if (galPhotoInput) {
      galPhotoInput.addEventListener('change', (e) => {
        const f = e.target && e.target.files && e.target.files[0];
        if (f) compressDishImageFile(f);
      });
    }

    await refreshPOS();
    if (window.FroseTheme && typeof window.FroseTheme.subscribe === 'function') {
      window.FroseTheme.subscribe((t) => updateThemeCycleIcon(t));
    }
    window.addEventListener('frose:language-changed', () => {
      renderCategoryChips();
      renderDishesGrid();
      updateCartUI();
      if (syncEngine && typeof syncEngine.notifyStatus === 'function') {
        syncEngine.notifyStatus();
      } else {
        renderSyncStatusBadge();
      }
    });

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('type') === 'dinein') window.setOrderType('dinein');
    if (urlParams.get('tab')) window.switchWorkspaceTab(urlParams.get('tab'));
  });
})();
