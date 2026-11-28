/**
 * FROSE Street — Orders Tab (Active + History + Order Detail Drawer + Live Edit Sheet)
 * Phase 4 UX-04 — Strictly CSP-safe via FroseSafeDom & integer paise math.
 */
(function (global) {
  'use strict';

  var IST_OFFSET_MS = 19800000;

  function getIstDate(offsetDays) {
    var now = Date.now() + (offsetDays || 0) * 86400000 + IST_OFFSET_MS;
    return new Date(now).toISOString().slice(0, 10);
  }

  function formatIstTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch (_) {
      return '';
    }
  }

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
    viewMode: 'active', // 'active' | 'history'
    datePreset: 'today', // 'today' | 'yesterday' | 'custom'
    dateFrom: getIstDate(0),
    dateTo: getIstDate(0),
    filterPill: 'all', // 'all' | 'cash' | 'upi' | 'split' | 'cancelled'
    search: '',
    orders: [],
    summary: null,
    loading: false,
    editingOrder: null,
    editDraft: null,
    isSubmittingEdit: false,
  };

  var sharedOrdersChannel = null;
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

  function getStatusVariant(status) {
    if (status === 'cancelled') return 'rose';
    if (status === 'served') return 'emerald';
    if (status === 'ready') return 'blue';
    return 'amber';
  }

  function formatPaymentBadge(order) {
    var m = String(order.paymentMethod || 'cash').toLowerCase();
    if (m === 'upi') return 'Marked paid (UPI)';
    if (m === 'split') {
      return 'Split: Cash ' + fmt(order.cashPaise || 0) + ' + Marked paid (UPI) ' + fmt(order.upiPaise || 0);
    }
    return 'Paid (Cash)';
  }

  async function fetchOrders() {
    var root = global.document.getElementById('orders-panel-root');
    if (!root || !global.FroseSafeDom) return;
    state.loading = true;
    renderShell();
    var listWrap = global.document.getElementById('orders-list-container');
    if (listWrap && global.FroseUI) {
      global.FroseUI.renderSkeletonList(listWrap, 4);
    }

    var orders = [];
    var summary = null;
    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var sessionActive = !!global.localStorage.getItem('frose_session_active');

    if (online && sessionActive) {
      try {
        var fn = global.froseApiFetch || fetch;
        if (state.viewMode === 'active') {
          var resLive = await fn('/api/v1/orders/live', { credentials: 'same-origin' });
          if (resLive && resLive.ok) {
            var liveJson = await resLive.json();
            orders = [].concat(liveJson.kitchenQueue || [], liveJson.packagingQueue || []);
          }
        } else {
          var params = new URLSearchParams();
          if (state.dateFrom) params.set('dateFrom', state.dateFrom);
          if (state.dateTo) params.set('dateTo', state.dateTo);
          if (state.filterPill === 'cancelled') {
            params.set('status', 'cancelled');
          } else if (['cash', 'upi', 'split'].indexOf(state.filterPill) !== -1) {
            params.set('paymentMode', state.filterPill);
          }
          if (state.search.trim()) params.set('search', state.search.trim());
          params.set('limit', '50');
          var resHist = await fn('/api/v1/orders/history?' + params.toString(), { credentials: 'same-origin' });
          if (resHist && resHist.ok) {
            var histJson = await resHist.json();
            orders = histJson.orders || [];
            summary = histJson.summary || null;
          }
        }
      } catch (_) {}
    }

    if (orders.length === 0 && !online && global.FroseIdbStore && ws().getVendorKey) {
      try {
        orders = await global.FroseIdbStore.getOrders(ws().getVendorKey());
      } catch (_) {}
    }

    if (state.viewMode === 'active') {
      orders = orders.filter(function (o) {
        if (state.filterPill === 'cancelled') return false;
        if (['cash', 'upi', 'split'].indexOf(state.filterPill) !== -1 && o.paymentMethod !== state.filterPill) return false;
        if (state.search.trim()) {
          var q = state.search.trim().toLowerCase().replace(/^#/, '');
          var matchToken = String(o.tokenNo || '') === q;
          var matchItems = (o.items || []).some(function (it) { return String(it.itemName || it.name || '').toLowerCase().includes(q); });
          return matchToken || matchItems;
        }
        return true;
      });
    }

    state.orders = orders;
    state.summary = summary;
    state.loading = false;
    renderOrdersList();
  }

  function renderShell() {
    var root = global.document.getElementById('orders-panel-root');
    if (!root || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(root);

    var headerRow = el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px;' }, [
      el('div', {}, [
        el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 900;' }, 'Orders'),
        el('div', { style: 'font-size: 12.5px; color: var(--text-muted);' }, 'Live kitchen tickets, order editing, and history'),
      ]),
      el('button', {
        type: 'button',
        class: 'saas-btn saas-btn-secondary',
        id: 'btn-orders-refresh',
        on: { click: function () { fetchOrders(); } },
      }, '↻ Refresh'),
    ]);

    var segWrap = el('div', { class: 'saas-segmented', style: 'margin-bottom: 12px;' }, [
      el('button', {
        type: 'button',
        id: 'btn-orders-mode-active',
        class: 'saas-seg-btn' + (state.viewMode === 'active' ? ' active' : ''),
        on: {
          click: function () {
            state.viewMode = 'active';
            if (state.filterPill === 'cancelled') state.filterPill = 'all';
            fetchOrders();
          },
        },
      }, 'Active Queue'),
      el('button', {
        type: 'button',
        id: 'btn-orders-mode-history',
        class: 'saas-seg-btn' + (state.viewMode === 'history' ? ' active' : ''),
        on: {
          click: function () {
            state.viewMode = 'history';
            fetchOrders();
          },
        },
      }, 'History & Receipts'),
    ]);

    root.appendChild(headerRow);
    root.appendChild(segWrap);

    if (state.viewMode === 'history') {
      var dateRow = el('div', { style: 'display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; align-items: center;' }, [
        el('button', {
          type: 'button',
          class: 'saas-chip' + (state.datePreset === 'today' ? ' active' : ''),
          on: {
            click: function () {
              state.datePreset = 'today';
              state.dateFrom = getIstDate(0);
              state.dateTo = getIstDate(0);
              fetchOrders();
            },
          },
        }, 'Today'),
        el('button', {
          type: 'button',
          class: 'saas-chip' + (state.datePreset === 'yesterday' ? ' active' : ''),
          on: {
            click: function () {
              state.datePreset = 'yesterday';
              state.dateFrom = getIstDate(-1);
              state.dateTo = getIstDate(-1);
              fetchOrders();
            },
          },
        }, 'Yesterday'),
        el('button', {
          type: 'button',
          class: 'saas-chip' + (state.datePreset === 'custom' ? ' active' : ''),
          on: {
            click: function () {
              state.datePreset = 'custom';
              renderShell();
              renderOrdersList();
            },
          },
        }, 'Custom Range'),
      ]);
      root.appendChild(dateRow);

      if (state.datePreset === 'custom') {
        root.appendChild(
          el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 12px;' }, [
            el('input', {
              type: 'date',
              id: 'orders-date-from',
              class: 'saas-input',
              value: state.dateFrom,
              on: { change: function (e) { state.dateFrom = e.target.value; } },
            }),
            el('input', {
              type: 'date',
              id: 'orders-date-to',
              class: 'saas-input',
              value: state.dateTo,
              on: { change: function (e) { state.dateTo = e.target.value; } },
            }),
            el('button', {
              type: 'button',
              class: 'saas-btn saas-btn-primary',
              on: { click: function () { fetchOrders(); } },
            }, 'Apply'),
          ])
        );
      }
    }

    var searchSvg = global.FroseSafeDom.svgEl('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      global.FroseSafeDom.svgEl('circle', { cx: 11, cy: 11, r: 8 }),
      global.FroseSafeDom.svgEl('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }),
    ]);
    var searchBox = el('div', { class: 'saas-search-wrap', style: 'margin-bottom: 10px;' }, [
      el('span', { class: 'saas-search-icon' }, [searchSvg]),
      el('input', {
        type: 'search',
        id: 'orders-search-input',
        class: 'saas-search-input',
        placeholder: 'Search token #, receipt FS-..., or dish name',
        value: state.search,
        on: {
          input: function (e) {
            state.search = e.target.value || '';
          },
          keydown: function (e) {
            if (e.key === 'Enter') fetchOrders();
          },
        },
      }),
    ]);
    root.appendChild(searchBox);

    var pills = [
      { id: 'all', label: 'All' },
      { id: 'cash', label: 'Cash' },
      { id: 'upi', label: 'UPI' },
      { id: 'split', label: 'Split' },
    ];
    if (state.viewMode === 'history') {
      pills.push({ id: 'cancelled', label: 'Cancelled' });
    }

    var pillRow = el('div', { class: 'saas-chip-row', style: 'margin-bottom: 12px;' });
    pills.forEach(function (p) {
      pillRow.appendChild(
        el('button', {
          type: 'button',
          class: 'saas-chip' + (state.filterPill === p.id ? ' active' : ''),
          on: {
            click: function () {
              state.filterPill = p.id;
              fetchOrders();
            },
          },
        }, p.label)
      );
    });
    root.appendChild(pillRow);

    if (state.viewMode === 'history' && state.summary) {
      root.appendChild(
        el('div', { class: 'saas-kpi-grid', style: 'margin-bottom: 14px;' }, [
          el('div', { class: 'saas-kpi-card' }, [
            el('span', { class: 'saas-kpi-label' }, 'Filtered Sales'),
            el('span', { class: 'saas-kpi-value' }, fmt(state.summary.netSalesPaise)),
            el('span', { class: 'saas-kpi-sub' }, state.summary.orderCount + ' orders · ' + state.summary.voidCount + ' void'),
          ]),
          el('div', { class: 'saas-kpi-card' }, [
            el('span', { class: 'saas-kpi-label' }, 'Cash / UPI Split'),
            el('span', { class: 'saas-kpi-value', style: 'font-size: 16px;' }, fmt(state.summary.cashPaise) + ' / ' + fmt(state.summary.upiPaise)),
            el('span', { class: 'saas-kpi-sub' }, 'IST filtered range'),
          ]),
        ])
      );
    }

    root.appendChild(el('div', { id: 'orders-list-container', class: 'pos-list-stack' }));
  }

  function renderOrdersList() {
    var listWrap = global.document.getElementById('orders-list-container');
    if (!listWrap || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(listWrap);

    if (!state.orders || state.orders.length === 0) {
      var emptySvg = global.FroseSafeDom.svgEl('svg', { width: 32, height: 32, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'margin-bottom: 6px;' }, [
        global.FroseSafeDom.svgEl('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
        global.FroseSafeDom.svgEl('polyline', { points: '14 2 14 8 20 8' }),
        global.FroseSafeDom.svgEl('line', { x1: 16, y1: 13, x2: 8, y2: 13 }),
        global.FroseSafeDom.svgEl('line', { x1: 16, y1: 17, x2: 8, y2: 17 }),
      ]);
      listWrap.appendChild(
        el('div', { class: 'saas-empty-state' }, [
          emptySvg,
          el('div', { style: 'font-weight: 800; font-size: 15px;' }, state.viewMode === 'active' ? 'No active orders in queue' : 'No matching orders found'),
          el('div', { style: 'font-size: 12.5px; margin-top: 4px;' }, 'Punched orders appear here instantly.'),
        ])
      );
      return;
    }

    state.orders.forEach(function (ord) {
      var status = String(ord.orderStatus || ord.status || 'preparing');
      var itemPreview = (ord.items || []).map(function (it) {
        return it.quantity + 'x ' + (it.itemName || it.name || 'Item');
      }).join(', ');

      var statusBadge = global.FroseUI
        ? global.FroseUI.createStatusPill(status.toUpperCase(), getStatusVariant(status))
        : el('span', { class: 'saas-pill' }, status.toUpperCase());

      var badges = [statusBadge];
      if (ord.editedAt) {
        badges.push(el('span', { class: 'saas-pill saas-pill-blue' }, 'EDITED'));
      }

      listWrap.appendChild(
        el('div', {
          class: 'pos-row-card is-clickable',
          'data-order-id': ord.id,
          on: { click: function () { openOrderDetailDrawer(ord); } },
        }, [
          el('div', { style: 'min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px;' }, [
            el('div', { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' }, [
              el('span', { class: 'tabular-nums', style: 'font-size: 15px; font-weight: 900;' }, ord.tokenDisplay || ('#' + (ord.tokenNo || ''))),
              ord.receiptNumber ? el('span', { class: 'tabular-nums', style: 'font-size: 12px; color: var(--text-muted); font-weight: 700;' }, ord.receiptNumber) : null,
              badges[0],
              badges[1] || null,
            ]),
            itemPreview ? el('div', { style: 'font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;' }, itemPreview) : null,
            el('div', { style: 'font-size: 12px; color: var(--text-muted);' }, formatPaymentBadge(ord) + (ord.createdAt ? ' · ' + formatIstTime(ord.createdAt) : '')),
          ]),
          el('div', { style: 'text-align: right; flex-shrink: 0;' }, [
            el('div', { class: 'tabular-nums', style: 'font-size: 16px; font-weight: 900;' }, fmt(ord.totalPaise)),
            el('div', { style: 'font-size: 12px; color: var(--accent-primary); font-weight: 700;' }, 'Details →'),
          ]),
        ])
      );
    });
  }

  async function openOrderDetailDrawer(orderSummary) {
    var drawer = global.document.getElementById('order-detail-drawer');
    var titleEl = global.document.getElementById('drawer-order-title');
    var bodyEl = global.document.getElementById('order-detail-drawer-body');
    if (!drawer || !bodyEl || !global.FroseSafeDom) return;

    var fullOrder = orderSummary;
    if (orderSummary.id && global.localStorage.getItem('frose_session_active') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      try {
        var fn = global.froseApiFetch || fetch;
        var res = await fn('/api/v1/orders/' + orderSummary.id, { credentials: 'same-origin' });
        if (res && res.ok) {
          var json = await res.json();
          if (json && json.order) fullOrder = json.order;
        }
      } catch (_) {}
    }

    if (titleEl) {
      titleEl.textContent = (fullOrder.tokenDisplay || '#' + fullOrder.tokenNo) + (fullOrder.receiptNumber ? ' · ' + fullOrder.receiptNumber : '');
    }

    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(bodyEl);

    var status = String(fullOrder.orderStatus || fullOrder.status || 'preparing');
    var isCancelled = status === 'cancelled';

    bodyEl.appendChild(
      el('div', { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px;' }, [
        global.FroseUI ? global.FroseUI.createStatusPill(status.toUpperCase(), getStatusVariant(status)) : el('span', {}, status),
        fullOrder.editedAt ? el('span', { class: 'saas-pill saas-pill-blue' }, 'EDITED') : null,
        el('span', { class: 'saas-pill saas-pill-slate' }, formatPaymentBadge(fullOrder)),
      ])
    );

    if (fullOrder.editNote) {
      bodyEl.appendChild(
        el('div', { style: 'padding: 10px 12px; border-radius: var(--radius-md); background: var(--accent-blue-soft); color: var(--text-primary); font-size: 12.5px; font-weight: 700; margin-bottom: 12px;' }, 'Edit Note: ' + fullOrder.editNote)
      );
    }

    if (fullOrder.cancelReason) {
      bodyEl.appendChild(
        el('div', { style: 'padding: 10px 12px; border-radius: var(--radius-md); background: var(--accent-rose-soft); color: var(--accent-rose); font-size: 12.5px; font-weight: 700; margin-bottom: 12px;' }, 'Void Reason: ' + fullOrder.cancelReason)
      );
    }

    var itemsBox = el('div', { class: 'pos-list-stack', style: 'margin-bottom: 14px;' });
    (fullOrder.items || []).forEach(function (it) {
      var unitP = Number(it.unitPricePaise ?? it.pricePaise ?? 0);
      var lineP = Number(it.lineTotalPaise ?? (unitP * Number(it.quantity || 1)));
      itemsBox.appendChild(
        el('div', { class: 'pos-cart-row' }, [
          el('div', { class: 'pos-cart-row-info' }, [
            el('div', { class: 'pos-cart-row-title' }, it.quantity + 'x ' + (it.itemName || it.name || 'Item')),
            it.notes ? el('div', { class: 'pos-cart-row-sub' }, 'Note: ' + it.notes) : null,
          ]),
          el('span', { class: 'tabular-nums', style: 'font-weight: 800;' }, fmt(lineP)),
        ])
      );
    });
    bodyEl.appendChild(itemsBox);

    var totalsBox = el('div', { class: 'pos-summary-box', style: 'margin-bottom: 16px;' }, [
      el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Subtotal'), el('span', {}, fmt(fullOrder.subtotalPaise ?? fullOrder.totalPaise))]),
      Number(fullOrder.cgstPaise || 0) > 0 ? el('div', { class: 'pos-summary-line' }, [el('span', {}, 'CGST'), el('span', {}, fmt(fullOrder.cgstPaise))]) : null,
      Number(fullOrder.sgstPaise || 0) > 0 ? el('div', { class: 'pos-summary-line' }, [el('span', {}, 'SGST'), el('span', {}, fmt(fullOrder.sgstPaise))]) : null,
      el('div', { class: 'pos-summary-total' }, [el('span', {}, 'Total'), el('span', {}, fmt(fullOrder.totalPaise))]),
    ]);
    bodyEl.appendChild(totalsBox);

    var actionsBox = el('div', { style: 'display: flex; flex-direction: column; gap: 10px;' });
    if (!isCancelled && fullOrder.id) {
      actionsBox.appendChild(
        el('button', {
          type: 'button',
          id: 'btn-drawer-edit-order',
          class: 'saas-btn saas-btn-primary saas-btn-block',
          on: { click: function () { openEditOrderSheet(fullOrder); } },
        }, 'Edit Order Items / Payment')
      );
    }

    actionsBox.appendChild(
      el('button', {
        type: 'button',
        id: 'btn-drawer-view-receipt',
        class: 'saas-btn saas-btn-secondary saas-btn-block',
        on: {
          click: function () {
            global.closeOrderDetailDrawer();
            if (ws().openReceiptModal) ws().openReceiptModal(fullOrder);
          },
        },
      }, 'View / Print / Copy Receipt')
    );

    if (!isCancelled && status !== 'served' && fullOrder.id) {
      actionsBox.appendChild(
        el('button', {
          type: 'button',
          id: 'btn-drawer-void-order',
          class: 'saas-btn saas-btn-danger saas-btn-block',
          on: {
            click: function () {
              if (ws().openVoidOrderModal) ws().openVoidOrderModal(fullOrder.id, fullOrder.tokenDisplay || '#' + fullOrder.tokenNo);
            },
          },
        }, 'Void / Cancel Order')
      );
    }

    bodyEl.appendChild(actionsBox);
    if (global.FroseUI && typeof global.FroseUI.openSheet === 'function') {
      global.FroseUI.openSheet('order-detail-drawer');
    } else {
      drawer.classList.add('active');
      global.document.body.classList.add('saas-modal-open');
    }
  }

  global.closeOrderDetailDrawer = function () {
    if (global.FroseUI && typeof global.FroseUI.closeSheet === 'function') {
      global.FroseUI.closeSheet('order-detail-drawer');
      return;
    }
    var drawer = global.document.getElementById('order-detail-drawer');
    if (drawer) drawer.classList.remove('active');
    var remaining = global.document.querySelectorAll('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active');
    if (remaining.length === 0) global.document.body.classList.remove('saas-modal-open');
  };

  function parseOrderItemVariant(item, catalog) {
    var menuItem = catalog.find(function (m) { return m.id === item.menuItemId; });
    var rawName = String(item.itemName || item.name || '');
    if (menuItem && Array.isArray(menuItem.variants)) {
      var matched = menuItem.variants.find(function (v) {
        return rawName === menuItem.name + ' (' + v.name + ')';
      });
      if (matched) return matched.name;
    }
    return undefined;
  }

  function openEditOrderSheet(order) {
    var catalog = ws().getMenuCatalog ? ws().getMenuCatalog() : [];
    state.editingOrder = order;
    state.editDraft = {
      items: (order.items || []).map(function (it) {
        return {
          menuItemId: it.menuItemId,
          itemName: it.itemName || it.name,
          variantName: parseOrderItemVariant(it, catalog),
          quantity: Number(it.quantity || 1),
          unitPricePaise: Number(it.unitPricePaise || 0),
          notes: it.notes || '',
        };
      }),
      paymentMode: order.paymentMethod || 'cash',
      cashRupees: Math.round(Number(order.cashPaise || 0) / 100),
      notes: order.notes || '',
      editNote: order.editNote || '',
    };
    renderEditOrderSheet();
    global.FroseUI.openSheet('order-edit-sheet');
  }

  function computeEditSubtotalPaise() {
    if (!state.editDraft) return 0;
    return state.editDraft.items.reduce(function (sum, it) {
      return sum + Number(it.unitPricePaise || 0) * Number(it.quantity || 0);
    }, 0);
  }

  function computeEditGrandTotalPaise() {
    var sub = computeEditSubtotalPaise();
    var v = ws().getActiveVendorProfile ? ws().getActiveVendorProfile() : {};
    var taxMode = v.taxMode || v.tax_mode || 'unregistered';
    var bps = taxMode === 'regular' ? Number(v.gstRateBps ?? v.gst_rate_bps ?? 500) : 0;
    if (taxMode !== 'regular' || bps <= 0) return sub;
    var tax = Number((BigInt(sub) * BigInt(bps) + 5000n) / 10000n);
    return sub + tax;
  }

  function renderEditOrderSheet() {
    var body = global.document.getElementById('order-edit-sheet-body');
    var titleEl = global.document.getElementById('order-edit-title');
    if (!body || !state.editDraft || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(body);

    if (titleEl && state.editingOrder) {
      titleEl.textContent = 'Edit Order ' + (state.editingOrder.tokenDisplay || '#' + state.editingOrder.tokenNo);
    }

    var catalog = ws().getMenuCatalog ? ws().getMenuCatalog() : [];
    var grandTotalPaise = computeEditGrandTotalPaise();

    var itemsList = el('div', { class: 'pos-list-stack', style: 'margin-bottom: 12px;' });
    state.editDraft.items.forEach(function (it, idx) {
      itemsList.appendChild(
        el('div', { class: 'pos-cart-row' }, [
          el('div', { class: 'pos-cart-row-info' }, [
            el('div', { class: 'pos-cart-row-title' }, it.itemName),
            el('div', { class: 'pos-cart-row-sub' }, fmt(it.unitPricePaise) + ' each'),
          ]),
          el('div', { class: 'saas-stepper' }, [
            el('button', {
              type: 'button',
              class: 'saas-stepper-btn',
              on: {
                click: function () {
                  if (it.quantity > 1) {
                    it.quantity -= 1;
                  } else {
                    state.editDraft.items.splice(idx, 1);
                  }
                  renderEditOrderSheet();
                },
              },
            }, '−'),
            el('span', { class: 'saas-stepper-qty' }, String(it.quantity)),
            el('button', {
              type: 'button',
              class: 'saas-stepper-btn',
              on: {
                click: function () {
                  it.quantity += 1;
                  renderEditOrderSheet();
                },
              },
            }, '+'),
          ]),
        ])
      );
    });
    body.appendChild(itemsList);

    if (catalog.length > 0) {
      var addSelect = el('select', { class: 'saas-select', id: 'edit-order-add-item-select' });
      catalog.filter(function (m) { return m.isAvailable !== false; }).forEach(function (m) {
        if (Array.isArray(m.variants) && m.variants.length > 0) {
          m.variants.forEach(function (v) {
            addSelect.appendChild(el('option', { value: m.id + '::' + v.name }, m.name + ' (' + v.name + ') — ' + fmt(v.pricePaise)));
          });
        } else {
          addSelect.appendChild(el('option', { value: m.id }, m.name + ' — ' + fmt(m.pricePaise)));
        }
      });
      body.appendChild(
        el('div', { style: 'display: grid; grid-template-columns: 1fr auto; gap: 8px; margin-bottom: 12px;' }, [
          addSelect,
          el('button', {
            type: 'button',
            class: 'saas-btn saas-btn-secondary',
            on: {
              click: function () {
                var val = addSelect.value;
                if (!val) return;
                var parts = val.split('::');
                var dishId = parts[0];
                var vName = parts[1] || undefined;
                var dish = catalog.find(function (d) { return d.id === dishId; });
                if (!dish) return;
                var priceP = Number(dish.pricePaise);
                var displayName = dish.name;
                if (vName && Array.isArray(dish.variants)) {
                  var vObj = dish.variants.find(function (v) { return v.name === vName; });
                  if (vObj) {
                    priceP = Number(vObj.pricePaise);
                    displayName = dish.name + ' (' + vObj.name + ')';
                  }
                }
                var existing = state.editDraft.items.find(function (x) {
                  return x.menuItemId === dishId && x.variantName === vName;
                });
                if (existing) existing.quantity += 1;
                else state.editDraft.items.push({
                  menuItemId: dishId,
                  itemName: displayName,
                  variantName: vName,
                  quantity: 1,
                  unitPricePaise: priceP,
                  notes: '',
                });
                renderEditOrderSheet();
              },
            },
          }, '+ Add'),
        ])
      );
    }

    body.appendChild(
      el('div', { class: 'saas-field', style: 'margin-bottom: 10px;' }, [
        el('label', { class: 'saas-label' }, 'Order Note'),
        el('input', {
          type: 'text',
          id: 'edit-order-note-input',
          class: 'saas-input',
          value: state.editDraft.notes,
          placeholder: 'Optional note',
          on: { input: function (e) { state.editDraft.notes = e.target.value; } },
        }),
      ])
    );

    body.appendChild(
      el('div', { class: 'saas-field', style: 'margin-bottom: 12px;' }, [
        el('label', { class: 'saas-label' }, 'Edit Reason / Note'),
        el('input', {
          type: 'text',
          id: 'edit-order-reason-input',
          class: 'saas-input',
          value: state.editDraft.editNote,
          placeholder: 'e.g. Customer added 1 extra plate',
          on: { input: function (e) { state.editDraft.editNote = e.target.value; } },
        }),
      ])
    );

    var paySeg = el('div', { class: 'saas-segmented', style: 'margin-bottom: 12px;' }, [
      el('button', {
        type: 'button',
        class: 'saas-seg-btn' + (state.editDraft.paymentMode === 'cash' ? ' active' : ''),
        on: { click: function () { state.editDraft.paymentMode = 'cash'; renderEditOrderSheet(); } },
      }, 'Cash'),
      el('button', {
        type: 'button',
        class: 'saas-seg-btn' + (state.editDraft.paymentMode === 'upi' ? ' active' : ''),
        on: { click: function () { state.editDraft.paymentMode = 'upi'; renderEditOrderSheet(); } },
      }, 'UPI'),
      el('button', {
        type: 'button',
        class: 'saas-seg-btn' + (state.editDraft.paymentMode === 'split' ? ' active' : ''),
        on: { click: function () { state.editDraft.paymentMode = 'split'; renderEditOrderSheet(); } },
      }, 'Split'),
    ]);
    body.appendChild(paySeg);

    if (state.editDraft.paymentMode === 'split') {
      var cashP = Math.min(grandTotalPaise, Math.max(0, Math.round(Number(state.editDraft.cashRupees || 0) * 100)));
      var upiP = Math.max(0, grandTotalPaise - cashP);
      body.appendChild(
        el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;' }, [
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label' }, 'Cash (₹)'),
            el('input', {
              type: 'number',
              id: 'edit-order-split-cash',
              class: 'saas-input tabular-nums',
              value: String(state.editDraft.cashRupees || 0),
              on: {
                input: function (e) {
                  state.editDraft.cashRupees = Number(e.target.value || 0);
                  var remNode = global.document.getElementById('edit-order-split-upi');
                  if (remNode) {
                    var cP = Math.min(grandTotalPaise, Math.max(0, Math.round(state.editDraft.cashRupees * 100)));
                    remNode.textContent = fmt(Math.max(0, grandTotalPaise - cP));
                  }
                },
              },
            }),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label' }, 'UPI Remainder'),
            el('div', { id: 'edit-order-split-upi', class: 'saas-input tabular-nums', style: 'display: flex; align-items: center; background: var(--bg-subtle);' }, fmt(upiP)),
          ]),
        ])
      );
    }

    body.appendChild(
      el('div', { class: 'pos-summary-box', style: 'margin-bottom: 14px;' }, [
        el('div', { class: 'pos-summary-total' }, [
          el('span', {}, 'New Total (incl. GST if applicable)'),
          el('span', {}, fmt(grandTotalPaise)),
        ]),
      ])
    );

    body.appendChild(
      el('button', {
        type: 'button',
        id: 'btn-save-order-edit',
        class: 'saas-btn saas-btn-primary saas-btn-block',
        on: { click: submitOrderEdit },
      }, 'Save Order Changes')
    );
  }

  async function submitOrderEdit() {
    if (state.isSubmittingEdit || !state.editingOrder || !state.editDraft) return;
    if (state.editDraft.items.length === 0) {
      toast('Order must have at least 1 item', 'warning');
      return;
    }

    var grandTotalPaise = computeEditGrandTotalPaise();
    var payload = {
      items: state.editDraft.items.map(function (it) {
        var obj = { menuItemId: it.menuItemId, quantity: it.quantity };
        if (it.variantName) obj.variantName = it.variantName;
        if (it.notes) obj.notes = it.notes;
        return obj;
      }),
      paymentMode: state.editDraft.paymentMode,
      notes: state.editDraft.notes ? state.editDraft.notes.trim() : null,
    };
    if (state.editDraft.editNote && state.editDraft.editNote.trim()) {
      payload.editNote = state.editDraft.editNote.trim();
    }
    if (state.editDraft.paymentMode === 'split') {
      var cashPaise = Math.round(Number(state.editDraft.cashRupees || 0) * 100);
      if (cashPaise < 0 || cashPaise > grandTotalPaise) {
        toast('Split cash must be between ₹0 and total', 'danger');
        return;
      }
      payload.cashPaise = cashPaise;
      payload.upiPaise = grandTotalPaise - cashPaise;
    }

    var saveBtn = global.document.getElementById('btn-save-order-edit');
    state.isSubmittingEdit = true;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      var fn = global.froseApiFetch || fetch;
      var res = await fn('/api/v1/orders/' + state.editingOrder.id, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
        body: JSON.stringify(payload),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        toast(data?.error?.message || data?.message || 'Failed to update order', 'danger');
        return;
      }

      var ch = getOrdersBroadcastChannel();
      if (ch && data.order) {
        try {
          ch.postMessage({ event: 'order:updated', data: data.order });
        } catch (_) {}
      }

      global.FroseUI.closeSheet('order-edit-sheet');
      await fetchOrders();
      if (data.order) openOrderDetailDrawer(data.order);
      toast('Order updated & synced to Kitchen', 'success');
    } catch (_) {
      toast('Network error updating order', 'danger');
    } finally {
      state.isSubmittingEdit = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Order Changes';
      }
    }
  }

  global.FroseOrdersPanel = {
    mount: function () {
      renderShell();
      fetchOrders();
    },
    refresh: fetchOrders,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
