/**
 * FROSE Street — Menu Manager Tab Controller (Phase 4: UX-05)
 * Search, category chips, + Category, + Add Item sheet,
 * 1-tap optimistic Available / Sold-Out switch, Edit, and Delete.
 */
(function (global) {
  'use strict';

  function ws() {
    return global.__FROSE_WORKSPACE__ || {};
  }

  function fmt(paise) {
    if (ws().formatINR) return ws().formatINR(paise);
    return '₹' + Math.round(Number(paise || 0) / 100);
  }

  function toast(msg, variant) {
    if (ws().notify) ws().notify(msg, variant);
  }

  function tr(key, fallback, vars) {
    if (global.FroseI18n && typeof global.FroseI18n.t === 'function') {
      var out = global.FroseI18n.t(key, vars);
      if (out && out !== key) return out;
    }
    return fallback || key;
  }

  var state = {
    search: '',
    category: 'all',
  };
  var togglingItemIds = new Set();

  async function toggleOptimisticAvailability(item) {
    if (togglingItemIds.has(item.id)) return;
    togglingItemIds.add(item.id);
    var prev = item.isAvailable !== false;
    var next = !prev;
    item.isAvailable = next;
    render();
    if (global.__FROSE_WORKSPACE__ && global.__FROSE_WORKSPACE__.reloadCatalog) {
      // Keep Billing grid in sync optimistically without waiting for network
    }

    var catalog = ws().getMenuCatalog ? ws().getMenuCatalog() : [];
    if (global.FroseIdbStore && ws().getVendorKey) {
      global.FroseIdbStore.putMenuItems(
        ws().getVendorKey(),
        catalog.map(function (d) { return Object.assign({}, d, { pricePaise: Number(d.pricePaise) }); })
      ).catch(function () {});
    }

    if (global.localStorage.getItem('frose_session_active') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      try {
        var fn = global.froseApiFetch || fetch;
        var res = await fn('/api/v1/menu/' + item.id + '/toggle-available', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'X-FROSE-CSRF': '1' },
        });
        if (!res || !res.ok) {
          item.isAvailable = prev;
          render();
          toast('Failed to update availability', 'danger');
          return;
        }
        toast(item.name + ': ' + (next ? 'Available' : 'Sold Out'), 'success');
        if (ws().reloadCatalog) await ws().reloadCatalog();
        render();
      } catch (_) {
        item.isAvailable = prev;
        render();
        toast('Network error toggling stock', 'danger');
      } finally {
        togglingItemIds.delete(item.id);
      }
    } else {
      togglingItemIds.delete(item.id);
    }
  }

  function render() {
    var root = global.document.getElementById('menu-panel-root');
    if (!root || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    var safeImageUrl = global.FroseSafeDom.safeImageUrl;
    clear(root);

    var catalog = ws().getMenuCatalog ? ws().getMenuCatalog() : [];
    var categories = ws().getCategories ? ws().getCategories() : [];

    root.appendChild(
      el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;' }, [
        el('div', {}, [
          el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 900;' }, tr('menu.title', 'Menu Manager')),
          el('div', { style: 'font-size: 12.5px; color: var(--text-muted);' }, catalog.length + ' items · Instant Sold-Out & variants'),
        ]),
        el('div', { style: 'display: flex; gap: 8px;' }, [
          el('button', {
            type: 'button',
            id: 'btn-menu-add-category',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function () { if (ws().openAddSectionModal) ws().openAddSectionModal(); } },
          }, tr('menu.add_category', '+ Category')),
          el('button', {
            type: 'button',
            id: 'btn-menu-add-item',
            class: 'saas-btn saas-btn-primary',
            on: { click: function () { if (ws().openAddDishModal) ws().openAddDishModal(); } },
          }, tr('menu.add_item', '+ Add Item')),
        ]),
      ])
    );

    var searchSvg = global.FroseSafeDom.svgEl('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      global.FroseSafeDom.svgEl('circle', { cx: 11, cy: 11, r: 8 }),
      global.FroseSafeDom.svgEl('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
    ]);
    root.appendChild(
      el('div', { class: 'saas-search-wrap', style: 'margin-bottom: 10px;' }, [
        el('span', { class: 'saas-search-icon' }, [searchSvg]),
        el('input', {
          type: 'search',
          id: 'menu-manager-search',
          class: 'saas-search-input',
          placeholder: tr('menu.search_placeholder', 'Search menu items...'),
          value: state.search,
          on: {
            input: function (e) {
              state.search = e.target.value || '';
              renderItemsOnly();
            },
          },
        }),
      ])
    );

    var chipRow = el('div', { class: 'saas-chip-row', style: 'margin-bottom: 12px;' });
    chipRow.appendChild(
      el('button', {
        type: 'button',
        class: 'saas-chip' + (state.category === 'all' ? ' active' : ''),
        on: { click: function () { state.category = 'all'; render(); } },
      }, tr('menu.all_count', 'All (' + catalog.length + ')', { count: catalog.length }))
    );
    categories.forEach(function (cat) {
      var slug = cat.toLowerCase().replace(/\s+/g, '-');
      chipRow.appendChild(
        el('button', {
          type: 'button',
          class: 'saas-chip' + (state.category === slug ? ' active' : ''),
          on: { click: function () { state.category = slug; render(); } },
        }, cat)
      );
    });
    root.appendChild(chipRow);
    root.appendChild(el('div', { id: 'menu-manager-list', class: 'pos-list-stack' }));
    renderItemsOnly();

    function renderItemsOnly() {
      var listEl = global.document.getElementById('menu-manager-list');
      if (!listEl) return;
      clear(listEl);

      var q = state.search.trim().toLowerCase();
      var filtered = catalog.filter(function (item) {
        var catSlug = (item.category || '').toLowerCase().replace(/\s+/g, '-');
        var catOk = state.category === 'all' || catSlug === state.category;
        var qOk = !q || String(item.name || '').toLowerCase().includes(q) || String(item.category || '').toLowerCase().includes(q);
        return catOk && qOk;
      });

      if (filtered.length === 0) {
        var emptyMenuSvg = global.FroseSafeDom.svgEl('svg', { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'margin-bottom: 8px;' }, [
          global.FroseSafeDom.svgEl('path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }),
          global.FroseSafeDom.svgEl('path', { d: 'M7 2v20' }),
          global.FroseSafeDom.svgEl('path', { d: 'M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }),
        ]);
        listEl.appendChild(
          el('div', { class: 'saas-empty-state' }, [
            emptyMenuSvg,
            el('div', { style: 'font-weight: 800;' }, catalog.length === 0 ? 'No dishes configured yet' : 'No matching dishes'),
            catalog.length === 0 ? el('button', {
              type: 'button',
              class: 'saas-btn saas-btn-primary',
              style: 'margin-top: 12px;',
              on: { click: function () { if (ws().openAddDishModal) ws().openAddDishModal(); } },
            }, '+ Add First Item') : null,
          ])
        );
        return;
      }

      filtered.forEach(function (item) {
        var isAvailable = item.isAvailable !== false;
        var imgSrc = safeImageUrl(item.imageUrl || item.image);
        var thumb = imgSrc
          ? el('img', { src: imgSrc, alt: item.name, style: 'width: 48px; height: 48px; border-radius: 10px; object-fit: cover; flex-shrink: 0;' })
          : el('div', { style: 'width: 48px; height: 48px; border-radius: 10px; background: var(--bg-subtle); display: flex; align-items: center; justify-content: center; font-weight: 900; flex-shrink: 0;' }, (item.name || 'D').slice(0, 2).toUpperCase());

        var variantsDesc = Array.isArray(item.variants) && item.variants.length > 0
          ? item.variants.map(function (v) { return v.name + ' ' + fmt(v.pricePaise); }).join(' · ')
          : fmt(item.pricePaise);

        var editSvg = global.FroseSafeDom.svgEl('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
          global.FroseSafeDom.svgEl('path', { d: 'M12 20h9' }),
          global.FroseSafeDom.svgEl('path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }),
        ]);
        var trashSvg = global.FroseSafeDom.svgEl('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
          global.FroseSafeDom.svgEl('polyline', { points: '3 6 5 6 21 6' }),
          global.FroseSafeDom.svgEl('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
        ]);

        listEl.appendChild(
          el('div', { class: 'pos-row-card pos-menu-row-card', 'data-menu-id': item.id }, [
            el('div', { class: 'pos-menu-row-main' }, [
              thumb,
              el('div', { style: 'min-width: 0; flex: 1;' }, [
                el('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
                  global.FroseUI ? global.FroseUI.createVegBadge(item.isVeg !== false) : null,
                  el('span', { class: 'pos-menu-row-title' }, item.name),
                ]),
                el('div', { class: 'tabular-nums', style: 'font-size: 12.5px; color: var(--text-muted); margin-top: 2px;' }, (item.category || 'General') + ' · ' + variantsDesc),
              ]),
            ]),
            el('div', { class: 'pos-menu-row-actions' }, [
              el('label', {
                class: 'saas-switch-wrap',
                on: {
                  click: function (e) {
                    e.preventDefault();
                    toggleOptimisticAvailability(item);
                  },
                },
              }, [
                el('span', { style: 'font-size: 12px; font-weight: 700; color: var(--text-secondary);' }, isAvailable ? tr('menu.available', 'In Stock') : tr('menu.sold_out', 'Sold Out')),
                el('button', {
                  type: 'button',
                  class: 'saas-switch' + (isAvailable ? ' on' : ''),
                  'aria-label': isAvailable ? 'Mark Sold Out' : 'Mark Available',
                  title: isAvailable ? tr('menu.available', 'Available') : tr('menu.sold_out', 'Sold Out'),
                }),
              ]),
              el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
                el('button', {
                  type: 'button',
                  class: 'saas-btn saas-btn-secondary',
                  style: 'min-width: 44px; min-height: 44px; padding: 0 12px;',
                  title: 'Edit Dish',
                  on: { click: function () { if (ws().openAddDishModal) ws().openAddDishModal(item); } },
                }, [editSvg, el('span', {}, 'Edit')]),
                el('button', {
                  type: 'button',
                  class: 'saas-btn saas-btn-danger',
                  style: 'min-width: 44px; min-height: 44px; padding: 0 12px;',
                  title: 'Delete Dish',
                  'aria-label': 'Delete Dish',
                  on: { click: function () { if (ws().deleteDishById) ws().deleteDishById(item.id); } },
                }, [trashSvg]),
              ]),
            ]),
          ])
        );
      });
    }
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('frose:language-changed', function () {
      var root = global.document && global.document.getElementById('menu-panel-root');
      if (root && root.children && root.children.length > 0) render();
    });
  }

  global.FroseMenuPanel = {
    mount: render,
    render: render,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
