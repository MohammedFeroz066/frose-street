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

  var state = {
    search: '',
    category: 'all',
  };

  async function toggleOptimisticAvailability(item) {
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
      }
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
          el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 900;' }, 'Menu Manager'),
          el('div', { style: 'font-size: 12.5px; color: var(--text-muted);' }, catalog.length + ' items · Instant Sold-Out & variants'),
        ]),
        el('div', { style: 'display: flex; gap: 8px;' }, [
          el('button', {
            type: 'button',
            id: 'btn-menu-add-category',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function () { if (ws().openAddSectionModal) ws().openAddSectionModal(); } },
          }, '+ Category'),
          el('button', {
            type: 'button',
            id: 'btn-menu-add-item',
            class: 'saas-btn saas-btn-primary',
            on: { click: function () { if (ws().openAddDishModal) ws().openAddDishModal(); } },
          }, '+ Add Item'),
        ]),
      ])
    );

    root.appendChild(
      el('div', { class: 'saas-search-wrap', style: 'margin-bottom: 10px;' }, [
        el('span', { class: 'saas-search-icon' }, '🔍'),
        el('input', {
          type: 'search',
          id: 'menu-manager-search',
          class: 'saas-search-input',
          placeholder: 'Search menu items...',
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
      }, 'All (' + catalog.length + ')')
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
        listEl.appendChild(
          el('div', { class: 'saas-empty-state' }, [
            el('div', { style: 'font-size: 30px; margin-bottom: 6px;' }, '🍽️'),
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
              el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
                el('span', { style: 'font-size: 12px; font-weight: 700; color: var(--text-secondary);' }, isAvailable ? 'In Stock' : 'Sold Out'),
                el('button', {
                  type: 'button',
                  class: 'saas-switch' + (isAvailable ? ' on' : ''),
                  style: 'min-width: 48px; min-height: 44px;',
                  'aria-label': isAvailable ? 'Mark Sold Out' : 'Mark Available',
                  title: isAvailable ? 'Available' : 'Sold Out',
                  on: { click: function () { toggleOptimisticAvailability(item); } },
                }),
              ]),
              el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
                el('button', {
                  type: 'button',
                  class: 'saas-btn saas-btn-secondary',
                  style: 'min-width: 44px; min-height: 44px; padding: 0 12px;',
                  title: 'Edit Dish',
                  on: { click: function () { if (ws().openAddDishModal) ws().openAddDishModal(item); } },
                }, '✏️ Edit'),
                el('button', {
                  type: 'button',
                  class: 'saas-btn saas-btn-danger',
                  style: 'min-width: 44px; min-height: 44px; padding: 0 12px;',
                  title: 'Delete Dish',
                  on: { click: function () { if (ws().deleteDishById) ws().deleteDishById(item.id); } },
                }, '🗑️'),
              ]),
            ]),
          ])
        );
      });
    }
  }

  global.FroseMenuPanel = {
    mount: render,
    render: render,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
