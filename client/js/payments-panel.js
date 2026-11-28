/**
 * FROSE Street — Payments, Multi-Period Reports & Owner PIN Protection (RPTS-03)
 * - Period selector: Today, Yesterday, This Week, This Month, Custom Date
 * - Financial Summary Grid (Total Sales, Cash, UPI, Expenses, Net Profit)
 * - 4-Digit Owner PIN Gate (verify or inline first-time setup) for Expense Edit/Delete & Net Profit Adjustment
 * - Binary PDF, Word (.docx), Sales CSV & Expenses CSV downloads
 * - Strictly CSP-safe via FroseSafeDom & integer paise math; zero raw OS emojis
 */
(function (global) {
  'use strict';

  var IST_OFFSET_MS = 19800000;

  function getIstDate(offsetDays) {
    var d = new Date(Date.now() + (offsetDays || 0) * 86400000 + IST_OFFSET_MS);
    return d.toISOString().slice(0, 10);
  }

  function getTodayIst() {
    return getIstDate(0);
  }

  function getWeekStartIst() {
    var istNow = new Date(Date.now() + IST_OFFSET_MS);
    var day = istNow.getUTCDay(); // 0=Sun, 1=Mon
    var diffToMon = day === 0 ? 6 : day - 1;
    return getIstDate(-diffToMon);
  }

  function getMonthStartIst() {
    return getTodayIst().slice(0, 8) + '01';
  }

  function ws() {
    return global.__FROSE_WORKSPACE__ || {};
  }

  function fmt(paise) {
    if (ws().formatINR) return ws().formatINR(paise);
    var n = Math.round(Number(paise || 0) / 100);
    return (n < 0 ? '-₹' : '₹') + Math.abs(n).toLocaleString('en-IN');
  }

  function tr(key, fallback) {
    if (global.FroseI18n && typeof global.FroseI18n.t === 'function') {
      var val = global.FroseI18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  function toast(msg, variant) {
    if (ws().notify) ws().notify(msg, variant);
    else if (global.FroseUI && global.FroseUI.showToast) global.FroseUI.showToast(msg, variant);
  }

  var state = {
    period: 'today', // 'today' | 'yesterday' | 'week' | 'month' | 'custom'
    from: getTodayIst(),
    to: getTodayIst(),
    filter: 'all', // 'all' | 'cash' | 'upi' | 'split' | 'expenses'
    report: null,
    summary: null,
    orders: [],
    expenses: [],
    adjustments: [],
    hasOwnerPin: null,
    zReportText: null,
    isClosingDay: false,
    isLoggingExpense: false,
    isDownloading: false,
  };

  function getCachedHasOwnerPin() {
    try {
      var raw = global.localStorage.getItem('frose_current_vendor');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (typeof parsed.hasOwnerPin === 'boolean') return parsed.hasOwnerPin;
      }
    } catch (_) {}
    return state.hasOwnerPin === true;
  }

  function setCachedHasOwnerPin(val) {
    state.hasOwnerPin = Boolean(val);
    try {
      var raw = global.localStorage.getItem('frose_current_vendor');
      var parsed = raw ? JSON.parse(raw) : {};
      parsed.hasOwnerPin = state.hasOwnerPin;
      global.localStorage.setItem('frose_current_vendor', JSON.stringify(parsed));
    } catch (_) {}
  }

  function selectPeriod(periodKey) {
    state.period = periodKey;
    var today = getTodayIst();
    if (periodKey === 'today') {
      state.from = today;
      state.to = today;
    } else if (periodKey === 'yesterday') {
      var yest = getIstDate(-1);
      state.from = yest;
      state.to = yest;
    } else if (periodKey === 'week') {
      state.from = getWeekStartIst();
      state.to = today;
    } else if (periodKey === 'month') {
      state.from = getMonthStartIst();
      state.to = today;
    } else if (periodKey === 'custom') {
      renderShell();
      renderLedger();
      return;
    }
    refresh();
  }

  async function refresh() {
    var root = global.document.getElementById('payments-panel-root');
    if (!root || !global.FroseSafeDom) return;
    renderShell();

    var ledgerEl = global.document.getElementById('payments-ledger-list');
    if (ledgerEl && global.FroseUI) global.FroseUI.renderSkeletonList(ledgerEl, 3);

    var online = typeof navigator === 'undefined' || navigator.onLine !== false;
    var sessionActive = !!global.localStorage.getItem('frose_session_active');
    if (online && sessionActive) {
      try {
        var fn = global.froseApiFetch || fetch;
        var fromStr = encodeURIComponent(state.from);
        var toStr = encodeURIComponent(state.to);
        var reqs = [
          fn('/api/v1/galla/report?from=' + fromStr + '&to=' + toStr, { credentials: 'same-origin' }),
          fn('/api/v1/orders/history?dateFrom=' + fromStr + '&dateTo=' + toStr + '&limit=50', { credentials: 'same-origin' }),
          fn('/api/v1/auth/me', { credentials: 'same-origin' }),
        ];
        if (state.from === state.to) {
          reqs.push(fn('/api/v1/galla/summary?date=' + toStr, { credentials: 'same-origin' }));
        }
        var results = await Promise.all(reqs);

        if (results[0] && results[0].ok) {
          var rJson = await results[0].json();
          state.report = rJson.report || null;
          if (state.report) {
            state.expenses = state.report.expenses || [];
            state.adjustments = state.report.adjustments || [];
          }
        }
        if (results[1] && results[1].ok) {
          var oJson = await results[1].json();
          state.orders = oJson.orders || [];
        }
        if (results[2] && results[2].ok) {
          var meJson = await results[2].json();
          if (typeof meJson.hasOwnerPin === 'boolean') {
            setCachedHasOwnerPin(meJson.hasOwnerPin);
          }
        }
        if (results[3] && results[3].ok) {
          var sJson = await results[3].json();
          state.summary = sJson.summary || null;
        } else {
          state.summary = null;
        }
      } catch (_) {}
    }

    renderShell();
    renderLedger();
  }

  async function downloadBinaryFile(url, filename, btnEl, origLabel) {
    if (state.isDownloading) return;
    state.isDownloading = true;
    if (btnEl) {
      btnEl.disabled = true;
      btnEl.textContent = 'Downloading...';
    }
    try {
      var fn = global.froseApiFetch || fetch;
      var res = await fn(url, { credentials: 'same-origin' });
      if (!res || !res.ok) {
        var err = res ? await res.json().catch(function () { return {}; }) : {};
        toast(err?.error?.message || 'Export failed (' + (res ? res.status : 'network') + ')', 'danger');
        return;
      }
      var blob = await res.blob();
      var objectUrl = URL.createObjectURL(blob);
      var a = global.document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      global.document.body.appendChild(a);
      a.click();
      global.document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast('Downloaded ' + filename, 'success');
    } catch (_) {
      toast('Network error downloading report', 'danger');
    } finally {
      state.isDownloading = false;
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.textContent = origLabel;
      }
    }
  }

  function downloadCsv(kind, btnEl) {
    var from = state.from || getTodayIst();
    var to = state.to || from;
    var endpoint = kind === 'expenses' ? '/api/v1/galla/export/expenses.csv' : '/api/v1/galla/export/sales.csv';
    var url = endpoint + '?dateFrom=' + encodeURIComponent(from) + '&dateTo=' + encodeURIComponent(to);
    var filename = 'frose-' + (kind === 'expenses' ? 'expenses' : 'sales') + '-' + to + '.csv';
    downloadBinaryFile(url, filename, btnEl, btnEl ? btnEl.textContent : 'Export CSV');
  }

  function downloadFormattedReport(format, btnEl) {
    var from = state.from || getTodayIst();
    var to = state.to || from;
    var url = '/api/v1/galla/report/export?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to) + '&format=' + encodeURIComponent(format);
    var filename = 'frose-street-report-' + from + '-to-' + to + '.' + format;
    downloadBinaryFile(url, filename, btnEl, btnEl ? btnEl.textContent : 'Download');
  }

  function renderShell() {
    var root = global.document.getElementById('payments-panel-root');
    if (!root || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var svgEl = global.FroseSafeDom.svgEl;
    var clear = global.FroseSafeDom.clear;
    clear(root);

    var rep = state.report || {
      from: state.from,
      to: state.to,
      grossSalesPaise: state.summary ? state.summary.totalSalesPaise : 0,
      cashSalesPaise: state.summary ? state.summary.cashSalesPaise : 0,
      upiSalesPaise: state.summary ? state.summary.upiSalesPaise : 0,
      splitSalesPaise: 0,
      totalOrders: state.summary ? state.summary.totalOrders : 0,
      cancelledOrders: state.summary ? state.summary.cancelledOrders : 0,
      averageOrderPaise: 0,
      totalExpensesPaise: state.summary ? state.summary.totalExpensesPaise : 0,
      profitAdjustmentsPaise: 0,
      netProfitPaise: state.summary ? state.summary.netProfitPaise : 0,
      dailyBreakdown: [],
      topItems: [],
      expenses: state.expenses || [],
      adjustments: state.adjustments || [],
    };

    var cashDrawerPaise = state.summary
      ? state.summary.cashInDrawerPaise
      : Number(rep.cashSalesPaise || 0);

    // Header + Primary Export & Add Expense actions
    root.appendChild(
      el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;' }, [
        el('div', {}, [
          el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 900;' }, tr('payments.title', 'Payments & Reports')),
          el('div', { style: 'font-size: 12.5px; color: var(--text-muted);' }, state.from === state.to ? ('Business Date: ' + state.from + ' (IST)') : ('Period: ' + state.from + ' to ' + state.to + ' (IST)')),
        ]),
        el('div', { class: 'rpts-export-row' }, [
          el('button', {
            type: 'button',
            id: 'btn-export-report-pdf',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function (e) { downloadFormattedReport('pdf', e.currentTarget); } },
          }, tr('reports.download_pdf', 'Download PDF')),
          el('button', {
            type: 'button',
            id: 'btn-export-report-docx',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function (e) { downloadFormattedReport('docx', e.currentTarget); } },
          }, tr('reports.download_docx', 'Download Word (.docx)')),
          el('button', {
            type: 'button',
            id: 'btn-open-add-expense',
            class: 'saas-btn saas-btn-primary',
            on: { click: openAddExpenseSheet },
          }, tr('payments.add_expense', '+ Add Expense')),
        ]),
      ])
    );

    // Segmented Period Selector Pills
    var periods = [
      { id: 'today', btnId: 'btn-period-today', label: tr('reports.period_today', 'Today') },
      { id: 'yesterday', btnId: 'btn-period-yesterday', label: tr('reports.period_yesterday', 'Yesterday') },
      { id: 'week', btnId: 'btn-period-week', label: tr('reports.period_week', 'This Week') },
      { id: 'month', btnId: 'btn-period-month', label: tr('reports.period_month', 'This Month') },
      { id: 'custom', btnId: 'btn-period-custom', label: tr('reports.period_custom', 'Custom Date') },
    ];
    root.appendChild(
      el('div', { class: 'rpts-period-bar', role: 'tablist', 'aria-label': 'Report Period' }, periods.map(function (p) {
        return el('button', {
          type: 'button',
          id: p.btnId,
          class: 'rpts-period-pill' + (state.period === p.id ? ' active' : ''),
          on: { click: function () { selectPeriod(p.id); } },
        }, p.label);
      }))
    );

    // Custom From / To Date Picker
    if (state.period === 'custom') {
      var fromIn = el('input', {
        type: 'date',
        id: 'payments-date-from',
        class: 'saas-input',
        value: state.from,
        on: { change: function (e) { state.from = e.target.value || getTodayIst(); } },
      });
      var toIn = el('input', {
        type: 'date',
        id: 'payments-date-to',
        class: 'saas-input',
        value: state.to,
        on: { change: function (e) { state.to = e.target.value || state.from; } },
      });
      root.appendChild(
        el('div', { class: 'rpts-custom-range' }, [
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label', for: 'payments-date-from' }, 'From (IST)'), fromIn]),
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label', for: 'payments-date-to' }, 'To (IST)'), toIn]),
          el('button', {
            type: 'button',
            id: 'btn-apply-custom-range',
            class: 'saas-btn saas-btn-primary',
            on: {
              click: function () {
                if (state.from > state.to) {
                  toast('From date cannot be after To date', 'warning');
                  return;
                }
                refresh();
              },
            },
          }, 'Apply'),
        ])
      );
    }

    // Stripe/Linear-style Financial Summary Grid + Highlighted Net Profit Card
    root.appendChild(
      el('div', { class: 'saas-kpi-grid', style: 'margin-bottom: 12px;' }, [
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, tr('payments.net_sales', 'Total Sales')),
          el('span', { class: 'saas-kpi-value', id: 'kpi-net-sales' }, fmt(rep.grossSalesPaise)),
          el('span', { class: 'saas-kpi-sub' }, (rep.totalOrders || 0) + ' paid · Avg ' + fmt(rep.averageOrderPaise || 0)),
        ]),
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, state.summary ? tr('payments.cash_drawer', 'Cash in Drawer') : 'Cash Sales'),
          el('span', { class: 'saas-kpi-value', id: 'kpi-cash-drawer' }, fmt(cashDrawerPaise)),
          el('span', { class: 'saas-kpi-sub' }, state.summary ? 'Cash sales minus cash out' : 'Cash collected in period'),
        ]),
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, tr('payments.upi_received', 'UPI Received')),
          el('span', { class: 'saas-kpi-value', id: 'kpi-upi-received' }, fmt(rep.upiSalesPaise)),
          el('span', { class: 'saas-kpi-sub' }, 'Marked paid (UPI)'),
        ]),
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, tr('payments.expenses', 'Purchase / Stall Expenses')),
          el('span', { class: 'saas-kpi-value', id: 'kpi-total-expenses' }, fmt(rep.totalExpensesPaise)),
          el('span', { class: 'saas-kpi-sub' }, (state.expenses.length || 0) + ' entries'),
        ]),
      ])
    );

    var isNegProfit = Number(rep.netProfitPaise || 0) < 0;
    var lockIcon = svgEl('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      svgEl('rect', { x: 3, y: 11, width: 18, height: 11, rx: 2, ry: 2 }),
      svgEl('path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }),
    ]);

    root.appendChild(
      el('div', { class: 'rpts-profit-card' + (isNegProfit ? ' is-negative' : ''), style: 'margin-bottom: 14px;' }, [
        el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;' }, [
          el('div', {}, [
            el('div', { class: 'saas-kpi-label' }, tr('reports.net_profit', 'Net Profit')),
            el('div', { class: 'rpts-profit-value', id: 'kpi-net-profit' }, fmt(rep.netProfitPaise)),
            el('div', { style: 'font-size: 12px; color: var(--text-secondary); font-weight: 700;' },
              'Sales - Expenses' + (Number(rep.profitAdjustmentsPaise || 0) !== 0 ? (' + Adjustments (' + fmt(rep.profitAdjustmentsPaise) + ')') : '')
            ),
          ]),
          el('button', {
            type: 'button',
            id: 'btn-adjust-net-profit',
            class: 'saas-btn saas-btn-slate',
            style: 'min-height: 44px;',
            on: { click: function () { startAdjustProfitFlow(); } },
          }, [lockIcon, el('span', {}, tr('reports.adjust_profit', 'Edit / Adjust (PIN)'))]),
        ]),
      ])
    );

    // Cash vs UPI Split + CSV & Z-Report Actions
    var totalSplit = Number(rep.cashSalesPaise || 0) + Number(rep.upiSalesPaise || 0);
    var cashPct = totalSplit > 0 ? Math.round((Number(rep.cashSalesPaise || 0) * 100) / totalSplit) : 50;
    var upiPct = 100 - cashPct;

    root.appendChild(
      el('div', { class: 'saas-card', style: 'margin-bottom: 14px;' }, [
        el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; gap: 10px;' }, [
          el('span', { style: 'font-size: 13px; font-weight: 800;' }, 'Cash vs UPI Split'),
          el('span', { class: 'tabular-nums', style: 'font-size: 12.5px; color: var(--text-muted); font-weight: 700;' }, 'Cash ' + cashPct + '% · UPI ' + upiPct + '%'),
        ]),
        el('div', { class: 'saas-split-bar', style: 'margin-bottom: 12px;' }, [
          el('div', { class: 'saas-split-cash', style: 'width: ' + cashPct + '%;' }),
          el('div', { class: 'saas-split-upi', style: 'width: ' + upiPct + '%;' }),
        ]),
        el('div', { style: 'display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;' }, [
          el('span', { style: 'font-size: 12.5px; color: var(--text-muted); font-weight: 700;' },
            state.summary ? (state.summary.isDayClosed ? 'Day Closed — Z-Report saved' : 'Shift Open') : (state.from + ' to ' + state.to)
          ),
          el('div', { style: 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;' }, [
            el('button', {
              type: 'button',
              id: 'btn-export-sales-csv',
              class: 'saas-btn saas-btn-secondary',
              on: { click: function (e) { downloadCsv('sales', e.currentTarget); } },
            }, tr('payments.export_sales_csv', 'Export Sales CSV (CA / GST)')),
            el('button', {
              type: 'button',
              id: 'btn-export-expenses-csv',
              class: 'saas-btn saas-btn-secondary',
              on: { click: function (e) { downloadCsv('expenses', e.currentTarget); } },
            }, tr('payments.export_expenses_csv', 'Export Expenses CSV')),
            el('button', {
              type: 'button',
              id: 'btn-open-close-day',
              class: 'saas-btn saas-btn-slate',
              on: { click: openCloseDayDrawer },
            }, state.summary && state.summary.isDayClosed ? tr('payments.view_z_report', 'View / Update Z-Report') : tr('payments.close_day', 'Close Day / Z-Report')),
          ]),
        ]),
      ])
    );

    // Daily Breakdown (when multi-day selected)
    if (Array.isArray(rep.dailyBreakdown) && rep.dailyBreakdown.length > 1) {
      root.appendChild(
        el('div', { class: 'saas-card', style: 'margin-bottom: 14px;' }, [
          el('div', { style: 'font-size: 14px; font-weight: 800; margin-bottom: 10px;' }, 'Daily Breakdown (' + rep.dailyBreakdown.length + ' days)'),
          el('div', { class: 'rpts-breakdown-list' }, rep.dailyBreakdown.map(function (d) {
            return el('div', { class: 'rpts-breakdown-row' }, [
              el('div', {}, [
                el('div', { class: 'tabular-nums', style: 'font-weight: 800;' }, d.date),
                el('div', { style: 'font-size: 11.5px; color: var(--text-muted);' }, d.orderCount + ' orders · Exp ' + fmt(d.expensesPaise)),
              ]),
              el('div', { style: 'text-align: right;' }, [
                el('div', { class: 'tabular-nums', style: 'font-weight: 900;' }, fmt(d.grossSalesPaise)),
                el('div', { class: 'tabular-nums', style: 'font-size: 11.5px; font-weight: 800; color: ' + (d.netProfitPaise < 0 ? 'var(--accent-rose);' : 'var(--accent-primary);') }, 'Net ' + fmt(d.netProfitPaise)),
              ]),
            ]);
          })),
        ])
      );
    }

    // Top-Selling Dishes for Period
    if (Array.isArray(rep.topItems) && rep.topItems.length > 0) {
      root.appendChild(
        el('div', { class: 'saas-card', style: 'margin-bottom: 14px;' }, [
          el('div', { style: 'font-size: 14px; font-weight: 800; margin-bottom: 10px;' }, 'Top-Selling Dishes'),
          el('div', { class: 'rpts-breakdown-list' }, rep.topItems.slice(0, 6).map(function (it) {
            return el('div', { class: 'rpts-breakdown-row' }, [
              el('span', { style: 'font-weight: 700;' }, it.itemName),
              el('span', { class: 'tabular-nums', style: 'font-weight: 800; color: var(--accent-primary);' }, it.quantity + ' sold · ' + fmt(it.revenuePaise)),
            ]);
          })),
        ])
      );
    }

    // Profit Adjustments Audit Trail
    if (Array.isArray(state.adjustments) && state.adjustments.length > 0) {
      root.appendChild(
        el('div', { class: 'saas-card', style: 'margin-bottom: 14px;' }, [
          el('div', { style: 'font-size: 14px; font-weight: 800; margin-bottom: 10px;' }, 'Net Profit Adjustments Audit'),
          el('div', { class: 'rpts-breakdown-list' }, state.adjustments.map(function (adj) {
            var pos = Number(adj.amountPaise || 0) >= 0;
            return el('div', { class: 'rpts-breakdown-row' }, [
              el('div', {}, [
                el('div', { style: 'font-weight: 700;' }, adj.note),
                el('div', { style: 'font-size: 11.5px; color: var(--text-muted);' }, adj.businessDate),
              ]),
              el('span', {
                class: 'tabular-nums',
                style: 'font-weight: 900; color: ' + (pos ? 'var(--accent-primary);' : 'var(--accent-rose);'),
              }, (pos ? '+' : '') + fmt(adj.amountPaise)),
            ]);
          })),
        ])
      );
    }

    // Ledger Filter Chips
    var filterBar = el('div', { class: 'saas-chip-row', style: 'margin-bottom: 12px;' });
    [
      { id: 'all', label: 'All Ledger' },
      { id: 'cash', label: 'Cash' },
      { id: 'upi', label: 'UPI' },
      { id: 'split', label: 'Split' },
      { id: 'expenses', label: 'Expenses' },
    ].forEach(function (f) {
      filterBar.appendChild(
        el('button', {
          type: 'button',
          class: 'saas-chip' + (state.filter === f.id ? ' active' : ''),
          on: {
            click: function () {
              state.filter = f.id;
              renderShell();
              renderLedger();
            },
          },
        }, f.label)
      );
    });
    root.appendChild(filterBar);
    root.appendChild(el('div', { id: 'payments-ledger-list', class: 'pos-list-stack' }));
  }

  function renderLedger() {
    var listEl = global.document.getElementById('payments-ledger-list');
    if (!listEl || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var svgEl = global.FroseSafeDom.svgEl;
    var clear = global.FroseSafeDom.clear;
    clear(listEl);

    var rows = [];
    if (state.filter !== 'expenses') {
      state.orders.forEach(function (ord) {
        if (state.filter !== 'all' && ord.paymentMethod !== state.filter) return;
        rows.push({ kind: 'order', createdAt: ord.createdAt, data: ord });
      });
    }
    if (state.filter === 'all' || state.filter === 'expenses') {
      state.expenses.forEach(function (exp) {
        rows.push({ kind: 'expense', createdAt: exp.createdAt, data: exp });
      });
    }

    rows.sort(function (a, b) {
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    if (rows.length === 0) {
      var ledgerSvg = svgEl('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', style: 'margin-bottom: 6px;' }, [
        svgEl('rect', { x: 4, y: 2, width: 16, height: 20, rx: 2 }),
        svgEl('line', { x1: 8, y1: 6, x2: 16, y2: 6 }),
        svgEl('line', { x1: 8, y1: 10, x2: 16, y2: 10 }),
        svgEl('line', { x1: 8, y1: 14, x2: 12, y2: 14 }),
      ]);
      listEl.appendChild(
        el('div', { class: 'saas-empty-state' }, [
          ledgerSvg,
          el('div', { style: 'font-weight: 800;' }, 'No ledger entries for this period'),
        ])
      );
      return;
    }

    rows.forEach(function (row) {
      if (row.kind === 'expense') {
        var exp = row.data;
        listEl.appendChild(
          el('div', { class: 'pos-row-card', 'data-expense-id': exp.id }, [
            el('div', { style: 'min-width: 0; flex: 1;' }, [
              el('div', { style: 'font-size: 14px; font-weight: 800;' }, exp.title || exp.description || 'Expense'),
              el('div', { style: 'font-size: 12px; color: var(--text-muted);' },
                'Expense · ' + String(exp.category || 'general') + ' · ' + String(exp.paymentMethod || 'cash').toUpperCase() + (exp.businessDate ? (' · ' + exp.businessDate) : '')
              ),
            ]),
            el('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
              el('span', { class: 'tabular-nums', style: 'font-size: 15px; font-weight: 900; color: var(--accent-rose); margin-right: 4px;' }, '-' + fmt(exp.amountPaise)),
              el('button', {
                type: 'button',
                class: 'saas-btn saas-btn-secondary btn-edit-expense',
                style: 'min-width: 44px; min-height: 44px; padding: 0 10px;',
                'aria-label': 'Edit Expense',
                title: 'Edit Expense (PIN)',
                on: { click: function () { startEditExpenseFlow(exp); } },
              }, [svgEl('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
                svgEl('path', { d: 'M12 20h9' }),
                svgEl('path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }),
              ])]),
              el('button', {
                type: 'button',
                class: 'saas-btn saas-btn-danger btn-delete-expense',
                style: 'min-width: 44px; min-height: 44px; padding: 0 10px;',
                'aria-label': 'Delete Expense',
                title: 'Delete Expense (PIN)',
                on: { click: function () { startDeleteExpenseFlow(exp); } },
              }, [svgEl('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
                svgEl('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
                svgEl('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
              ])]),
            ]),
          ])
        );
      } else {
        var ord = row.data;
        var modeLabel = ord.paymentMethod === 'upi' ? 'Marked paid (UPI)' : (ord.paymentMethod === 'split' ? 'Split' : 'Cash');
        var isCancelled = ord.orderStatus === 'cancelled';
        listEl.appendChild(
          el('div', { class: 'pos-row-card' }, [
            el('div', { style: 'min-width: 0; flex: 1;' }, [
              el('div', { style: 'font-size: 14px; font-weight: 800;' }, (ord.tokenDisplay || '#' + ord.tokenNo) + (ord.receiptNumber ? ' · ' + ord.receiptNumber : '')),
              el('div', { style: 'font-size: 12px; color: var(--text-muted);' }, modeLabel + (isCancelled ? ' · VOIDED' : '')),
            ]),
            el('span', {
              class: 'tabular-nums',
              style: 'font-size: 15px; font-weight: 900; color: ' + (isCancelled ? 'var(--text-muted); text-decoration: line-through;' : 'var(--accent-primary);'),
            }, (isCancelled ? '' : '+') + fmt(ord.totalPaise)),
          ])
        );
      }
    });
  }

  // ============================================================================
  // 4-Digit Owner PIN Verification / First-Time Setup Sheet
  // ============================================================================

  function openOwnerPinGate(actionTitle, onVerified) {
    var body = global.document.getElementById('owner-pin-sheet-body');
    var titleEl = global.document.getElementById('owner-pin-sheet-title');
    if (!body || !global.FroseSafeDom || !global.FroseUI) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(body);

    var hasPin = getCachedHasOwnerPin();
    if (titleEl) {
      titleEl.textContent = hasPin ? tr('pin.title_verify', 'Enter 4-Digit Owner PIN') : tr('pin.title_setup', 'Set 4-Digit Owner PIN');
    }

    var pinValue = '';
    var isSubmitting = false;

    var dotsWrap = el('div', { class: 'rpts-pin-dots', 'aria-hidden': 'true' }, [
      el('span', { class: 'rpts-pin-dot' }),
      el('span', { class: 'rpts-pin-dot' }),
      el('span', { class: 'rpts-pin-dot' }),
      el('span', { class: 'rpts-pin-dot' }),
    ]);

    var errorEl = el('div', {
      id: 'owner-pin-error',
      role: 'alert',
      style: 'display: none; padding: 8px 12px; border-radius: var(--radius-md); background: var(--accent-rose-soft); color: var(--accent-rose); font-size: 12.5px; font-weight: 800; margin-bottom: 8px; text-align: center;',
    });

    var pinInput = el('input', {
      type: 'password',
      id: 'owner-pin-input',
      class: 'saas-input tabular-nums',
      style: 'text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 8px;',
      inputmode: 'numeric',
      maxlength: 4,
      autocomplete: 'off',
      placeholder: '••••',
      'aria-label': '4-digit Owner PIN',
    });

    function syncDots() {
      pinValue = String(pinInput.value || '').replace(/\D/g, '').slice(0, 4);
      pinInput.value = pinValue;
      var dots = dotsWrap.children;
      for (var i = 0; i < dots.length; i++) {
        dots[i].classList.toggle('filled', i < pinValue.length);
      }
    }

    pinInput.addEventListener('input', function () {
      errorEl.style.display = 'none';
      syncDots();
    });

    var submitBtn = el('button', {
      type: 'submit',
      id: 'btn-submit-owner-pin',
      class: 'saas-btn saas-btn-primary saas-btn-block',
      style: 'margin-top: 12px;',
    }, hasPin ? 'Verify Owner PIN' : 'Save Owner PIN & Continue');

    var keypadGrid = el('div', { class: 'rpts-pin-keypad' });
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Del'].forEach(function (k) {
      keypadGrid.appendChild(
        el('button', {
          type: 'button',
          class: 'rpts-pin-key',
          on: {
            click: function () {
              errorEl.style.display = 'none';
              if (k === 'Clear') pinInput.value = '';
              else if (k === 'Del') pinInput.value = pinValue.slice(0, -1);
              else if (pinValue.length < 4) pinInput.value = pinValue + k;
              syncDots();
            },
          },
        }, k)
      );
    });

    var form = el('form', {
      on: {
        submit: async function (e) {
          e.preventDefault();
          if (isSubmitting) return;
          syncDots();
          if (!/^\d{4}$/.test(pinValue)) {
            errorEl.textContent = 'Please enter a 4-digit numeric Owner PIN';
            errorEl.style.display = 'block';
            return;
          }
          isSubmitting = true;
          submitBtn.disabled = true;
          submitBtn.textContent = hasPin ? 'Verifying...' : 'Saving PIN...';
          errorEl.style.display = 'none';

          try {
            var fn = global.froseApiFetch || fetch;
            if (!hasPin) {
              var setRes = await fn('/api/v1/auth/owner-pin', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
                body: JSON.stringify({ pin: pinValue }),
              });
              var setData = await setRes.json().catch(function () { return {}; });
              if (!setRes || !setRes.ok) {
                errorEl.textContent = setData?.error?.message || setData?.detail || 'Could not save Owner PIN';
                errorEl.style.display = 'block';
                return;
              }
              setCachedHasOwnerPin(true);
              toast('4-digit Owner PIN configured', 'success');
              global.FroseUI.closeSheet('owner-pin-sheet');
              onVerified(pinValue);
              return;
            }

            var verRes = await fn('/api/v1/auth/owner-pin/verify', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
              body: JSON.stringify({ pin: pinValue }),
            });
            var verData = await verRes.json().catch(function () { return {}; });
            if (!verRes || !verRes.ok) {
              errorEl.textContent = verData?.error?.message || verData?.detail || 'Invalid 4-digit Owner PIN';
              errorEl.style.display = 'block';
              pinInput.value = '';
              syncDots();
              return;
            }

            global.FroseUI.closeSheet('owner-pin-sheet');
            onVerified(pinValue);
          } catch (_) {
            errorEl.textContent = 'Network error verifying Owner PIN';
            errorEl.style.display = 'block';
          } finally {
            isSubmitting = false;
            submitBtn.disabled = false;
            submitBtn.textContent = hasPin ? 'Verify Owner PIN' : 'Save Owner PIN & Continue';
          }
        },
      },
    }, [
      el('div', { style: 'font-size: 13px; color: var(--text-secondary); text-align: center; margin-bottom: 6px;' },
        hasPin
          ? ('Authorize action: ' + actionTitle)
          : ('No Owner PIN is set yet. Create a 4-digit Owner PIN to authorize: ' + actionTitle)
      ),
      dotsWrap,
      errorEl,
      pinInput,
      keypadGrid,
      submitBtn,
    ]);

    body.appendChild(form);
    global.FroseUI.openSheet('owner-pin-sheet');
    setTimeout(function () { pinInput.focus(); }, 40);
  }

  function startDeleteExpenseFlow(exp) {
    openOwnerPinGate('Delete "' + (exp.title || exp.description || 'Expense') + '"', async function (pin) {
      try {
        var fn = global.froseApiFetch || fetch;
        var res = await fn('/api/v1/galla/expenses/' + exp.id, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
          body: JSON.stringify({ ownerPin: pin }),
        });
        var data = await res.json().catch(function () { return {}; });
        if (res && res.ok) {
          toast('Expense deleted', 'success');
          await refresh();
        } else {
          toast(data?.error?.message || data?.detail || 'Could not delete expense', 'danger');
        }
      } catch (_) {
        toast('Network error deleting expense', 'danger');
      }
    });
  }

  function startEditExpenseFlow(exp) {
    openOwnerPinGate('Edit "' + (exp.title || exp.description || 'Expense') + '"', function (pin) {
      openEditExpenseSheet(exp, pin);
    });
  }

  function openEditExpenseSheet(exp, verifiedPin) {
    var body = global.document.getElementById('expense-edit-sheet-body');
    if (!body || !global.FroseSafeDom || !global.FroseUI) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(body);

    var titleIn = el('input', { type: 'text', id: 'edit-exp-title-input', class: 'saas-input', value: exp.title || exp.description || '', required: true });
    var amtIn = el('input', { type: 'number', id: 'edit-exp-amount-input', class: 'saas-input tabular-nums', min: 1, step: 1, value: String(Math.round(Number(exp.amountPaise || 0) / 100)), required: true });
    var catSel = el('select', { id: 'edit-exp-category-select', class: 'saas-select' }, [
      el('option', { value: 'ingredients', selected: exp.category === 'ingredients' }, 'Ingredients & Supplies'),
      el('option', { value: 'fuel', selected: exp.category === 'fuel' }, 'Gas / Fuel'),
      el('option', { value: 'packaging', selected: exp.category === 'packaging' }, 'Packaging'),
      el('option', { value: 'staff', selected: exp.category === 'staff' }, 'Staff / Wage'),
      el('option', { value: 'general', selected: !exp.category || exp.category === 'general' }, 'General / Misc'),
    ]);
    var modeSel = el('select', { id: 'edit-exp-method-select', class: 'saas-select' }, [
      el('option', { value: 'cash', selected: exp.paymentMethod !== 'upi' }, 'Paid from Cash Drawer'),
      el('option', { value: 'upi', selected: exp.paymentMethod === 'upi' }, 'Paid via UPI'),
    ]);
    var dateIn = el('input', { type: 'date', id: 'edit-exp-date-input', class: 'saas-input', value: exp.businessDate || exp.expenseDate || state.to });

    var saving = false;
    var saveBtn = el('button', { type: 'submit', id: 'btn-submit-edit-expense', class: 'saas-btn saas-btn-primary saas-btn-block' }, 'Save Expense Changes');

    body.appendChild(
      el('form', {
        style: 'display: flex; flex-direction: column; gap: 12px;',
        on: {
          submit: async function (e) {
            e.preventDefault();
            if (saving) return;
            var title = titleIn.value.trim();
            var rupees = Number(amtIn.value || 0);
            if (!title || !Number.isFinite(rupees) || rupees <= 0) {
              toast('Enter valid description and ₹ amount', 'warning');
              return;
            }
            saving = true;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            try {
              var fn = global.froseApiFetch || fetch;
              var res = await fn('/api/v1/galla/expenses/' + exp.id, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
                body: JSON.stringify({
                  title: title,
                  amountPaise: Math.round(rupees * 100),
                  category: catSel.value,
                  paymentMethod: modeSel.value,
                  businessDate: dateIn.value || state.to,
                  ownerPin: verifiedPin,
                }),
              });
              var data = await res.json().catch(function () { return {}; });
              if (res && res.ok) {
                global.FroseUI.closeSheet('expense-edit-sheet');
                toast('Expense updated', 'success');
                await refresh();
              } else {
                toast(data?.error?.message || data?.detail || 'Failed to update expense', 'danger');
              }
            } catch (_) {
              toast('Network error updating expense', 'danger');
            } finally {
              saving = false;
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save Expense Changes';
            }
          },
        },
      }, [
        el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Description *'), titleIn]),
        el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Amount (₹) *'), amtIn]),
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Date (IST)'), dateIn]),
        ]),
        el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Category'), catSel]),
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Paid Mode'), modeSel]),
        ]),
        saveBtn,
      ])
    );

    global.FroseUI.openSheet('expense-edit-sheet');
  }

  function startAdjustProfitFlow() {
    openOwnerPinGate('Adjust Net Profit', function (pin) {
      openAdjustProfitSheet(pin);
    });
  }

  function openAdjustProfitSheet(verifiedPin) {
    var body = global.document.getElementById('profit-adjust-sheet-body');
    if (!body || !global.FroseSafeDom || !global.FroseUI) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(body);

    var direction = 'deduct'; // 'add' | 'deduct'
    var btnAdd = el('button', { type: 'button', class: 'saas-seg-btn', on: { click: function () { direction = 'add'; syncDir(); } } }, '+ Add Income');
    var btnDeduct = el('button', { type: 'button', class: 'saas-seg-btn active', on: { click: function () { direction = 'deduct'; syncDir(); } } }, '- Deduct Cost');

    function syncDir() {
      btnAdd.classList.toggle('active', direction === 'add');
      btnDeduct.classList.toggle('active', direction === 'deduct');
    }

    var dateIn = el('input', { type: 'date', id: 'profit-adj-date-input', class: 'saas-input', value: state.to || getTodayIst() });
    var amtIn = el('input', { type: 'number', id: 'profit-adj-amount-input', class: 'saas-input tabular-nums', min: 1, step: 1, placeholder: '150', required: true });
    var noteIn = el('input', { type: 'text', id: 'profit-adj-note-input', class: 'saas-input', maxlength: 300, placeholder: 'e.g. Bulk oil purchase / Cash rebate', required: true });
    var saveBtn = el('button', { type: 'submit', id: 'btn-submit-profit-adjust', class: 'saas-btn saas-btn-primary saas-btn-block' }, 'Save Net Profit Adjustment');
    var saving = false;

    body.appendChild(
      el('form', {
        style: 'display: flex; flex-direction: column; gap: 12px;',
        on: {
          submit: async function (e) {
            e.preventDefault();
            if (saving) return;
            var rupees = Number(amtIn.value || 0);
            var note = noteIn.value.trim();
            if (!Number.isFinite(rupees) || rupees <= 0 || !note) {
              toast('Enter valid ₹ amount and reason note', 'warning');
              return;
            }
            var signedPaise = Math.round(rupees * 100) * (direction === 'deduct' ? -1 : 1);
            saving = true;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            try {
              var fn = global.froseApiFetch || fetch;
              var res = await fn('/api/v1/galla/profit-adjustments', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
                body: JSON.stringify({
                  businessDate: dateIn.value || getTodayIst(),
                  amountPaise: signedPaise,
                  note: note,
                  ownerPin: verifiedPin,
                }),
              });
              var data = await res.json().catch(function () { return {}; });
              if (res && res.ok) {
                global.FroseUI.closeSheet('profit-adjust-sheet');
                toast('Net profit adjustment recorded', 'success');
                await refresh();
              } else {
                toast(data?.error?.message || data?.detail || 'Failed to record adjustment', 'danger');
              }
            } catch (_) {
              toast('Network error recording adjustment', 'danger');
            } finally {
              saving = false;
              saveBtn.disabled = false;
              saveBtn.textContent = 'Save Net Profit Adjustment';
            }
          },
        },
      }, [
        el('div', { class: 'saas-segmented' }, [btnDeduct, btnAdd]),
        el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Amount (₹) *'), amtIn]),
          el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Business Date'), dateIn]),
        ]),
        el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Audit Note / Reason *'), noteIn]),
        saveBtn,
      ])
    );

    global.FroseUI.openSheet('profit-adjust-sheet');
  }

  function openAddExpenseSheet() {
    var body = global.document.getElementById('expense-add-sheet-body');
    if (!body || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(body);

    var descIn = el('input', { type: 'text', id: 'exp-desc-input', class: 'saas-input', placeholder: 'e.g. Cooking oil, Ice, Gas cylinder', required: true });
    var amtIn = el('input', { type: 'number', id: 'exp-amount-input', class: 'saas-input tabular-nums', min: 1, step: 1, placeholder: '200', required: true });
    var catSel = el('select', { id: 'exp-category-select', class: 'saas-select' }, [
      el('option', { value: 'ingredients' }, 'Ingredients & Supplies'),
      el('option', { value: 'fuel' }, 'Gas / Fuel'),
      el('option', { value: 'packaging' }, 'Packaging'),
      el('option', { value: 'staff' }, 'Staff / Wage'),
      el('option', { value: 'general' }, 'General / Misc'),
    ]);
    var modeSel = el('select', { id: 'exp-method-select', class: 'saas-select' }, [
      el('option', { value: 'cash' }, 'Paid from Cash Drawer'),
      el('option', { value: 'upi' }, 'Paid via UPI'),
    ]);

    var form = el('form', {
      style: 'display: flex; flex-direction: column; gap: 12px;',
      on: {
        submit: async function (e) {
          e.preventDefault();
          if (state.isLoggingExpense) return;
          var desc = descIn.value.trim();
          var rupees = Number(amtIn.value || 0);
          if (!desc || !Number.isFinite(rupees) || rupees <= 0) {
            toast('Enter valid description and ₹ amount', 'warning');
            return;
          }
          var amountPaise = Math.round(rupees * 100);
          var submitBtn = global.document.getElementById('btn-submit-expense');
          state.isLoggingExpense = true;
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
          }
          try {
            var fn = global.froseApiFetch || fetch;
            var res = await fn('/api/v1/galla/expenses', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
              body: JSON.stringify({
                description: desc,
                amountPaise: amountPaise,
                category: catSel.value,
                paymentMethod: modeSel.value,
                expenseDate: state.to || getTodayIst(),
              }),
            });
            if (res && res.ok) {
              global.FroseUI.closeSheet('expense-add-sheet');
              toast('Expense logged', 'success');
              await refresh();
            } else {
              var err = await res.json().catch(function () { return {}; });
              toast(err?.error?.message || 'Failed to log expense', 'danger');
            }
          } catch (_) {
            toast('Network error logging expense', 'danger');
          } finally {
            state.isLoggingExpense = false;
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Save Expense';
            }
          }
        },
      },
    }, [
      el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Description *'), descIn]),
      el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Amount (₹) *'), amtIn]),
      el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
        el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Category'), catSel]),
        el('div', { class: 'saas-field' }, [el('label', { class: 'saas-label' }, 'Paid Mode'), modeSel]),
      ]),
      el('button', { type: 'submit', id: 'btn-submit-expense', class: 'saas-btn saas-btn-primary saas-btn-block' }, 'Save Expense'),
    ]);

    body.appendChild(form);
    global.FroseUI.openSheet('expense-add-sheet');
  }

  function openCloseDayDrawer() {
    var drawer = global.document.getElementById('close-day-drawer');
    var body = global.document.getElementById('close-day-drawer-body');
    if (!drawer || !body || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(body);

    var targetDate = state.to || getTodayIst();
    var s = state.summary || {
      cashInDrawerPaise: state.report ? state.report.cashSalesPaise : 0,
      totalSalesPaise: state.report ? state.report.grossSalesPaise : 0,
      upiSalesPaise: state.report ? state.report.upiSalesPaise : 0,
      totalExpensesPaise: state.report ? state.report.totalExpensesPaise : 0,
    };
    var expectedPaise = Number(s.cashInDrawerPaise || 0);

    var countedInput = el('input', {
      type: 'number',
      id: 'zreport-counted-cash',
      class: 'saas-input tabular-nums',
      min: '0',
      value: String(Math.max(0, Math.round(expectedPaise / 100))),
    });
    var varianceBox = el('div', { class: 'pos-change-banner', id: 'zreport-variance-box' }, [
      el('span', {}, 'Variance'),
      el('span', {}, 'Exact Match (₹0)'),
    ]);

    function updateVariance() {
      var countedP = Math.round(Number(countedInput.value || 0) * 100);
      var diff = countedP - expectedPaise;
      var labelEl = varianceBox.lastChild;
      if (!labelEl) return;
      if (diff === 0) labelEl.textContent = 'Exact Match (₹0)';
      else if (diff > 0) labelEl.textContent = '+' + fmt(diff) + ' Over';
      else labelEl.textContent = fmt(diff) + ' Short';
    }
    countedInput.addEventListener('input', updateVariance);
    updateVariance();

    var notesInput = el('input', { type: 'text', id: 'zreport-notes', class: 'saas-input', placeholder: 'Shift closing notes (optional)' });

    body.appendChild(
      el('div', { class: 'pos-summary-box', style: 'margin-bottom: 14px;' }, [
        el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Date (IST)'), el('span', {}, targetDate)]),
        el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Net Sales'), el('span', {}, fmt(s.totalSalesPaise))]),
        el('div', { class: 'pos-summary-line' }, [el('span', {}, 'UPI Received'), el('span', {}, fmt(s.upiSalesPaise))]),
        el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Total Expenses'), el('span', {}, fmt(s.totalExpensesPaise))]),
        el('div', { class: 'pos-summary-total' }, [el('span', {}, 'Expected Drawer Cash'), el('span', {}, fmt(expectedPaise))]),
      ])
    );

    body.appendChild(el('div', { class: 'saas-field', style: 'margin-bottom: 10px;' }, [
      el('label', { class: 'saas-label' }, 'Counted Physical Cash in Drawer (₹)'),
      countedInput,
    ]));
    body.appendChild(el('div', { style: 'margin-bottom: 12px;' }, [varianceBox]));
    body.appendChild(el('div', { class: 'saas-field', style: 'margin-bottom: 14px;' }, [
      el('label', { class: 'saas-label' }, 'Closing Notes'),
      notesInput,
    ]));

    body.appendChild(
      el('button', {
        type: 'button',
        id: 'btn-submit-close-day',
        class: 'saas-btn saas-btn-primary saas-btn-block',
        on: {
          click: async function () {
            if (state.isClosingDay) return;
            var closeBtn = global.document.getElementById('btn-submit-close-day');
            state.isClosingDay = true;
            if (closeBtn) {
              closeBtn.disabled = true;
              closeBtn.textContent = 'Closing Day...';
            }
            try {
              var fn = global.froseApiFetch || fetch;
              var res = await fn('/api/v1/galla/close-day', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
                body: JSON.stringify({
                  date: targetDate,
                  countedCashPaise: Math.max(0, Math.round(Number(countedInput.value || 0) * 100)),
                  notes: notesInput.value.trim() || undefined,
                }),
              });
              var data = await res.json().catch(function () { return {}; });
              if (!res.ok) {
                toast(data?.error?.message || 'Failed to close day', 'danger');
                return;
              }
              state.zReportText = data.zReportText || null;
              toast('Day closed & Z-Report saved', 'success');
              await refresh();
              if (state.zReportText) {
                var pre = el('pre', { style: 'white-space: pre-wrap; font-family: var(--font-mono); font-size: 12px; background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-md); margin-top: 14px;' }, state.zReportText);
                body.appendChild(pre);
                body.appendChild(
                  el('button', {
                    type: 'button',
                    class: 'saas-btn saas-btn-secondary saas-btn-block',
                    style: 'margin-top: 8px;',
                    on: {
                      click: async function () {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(state.zReportText);
                          toast('Z-Report copied for WhatsApp', 'success');
                        }
                      },
                    },
                  }, 'Copy Z-Report (WhatsApp)')
                );
              }
            } catch (_) {
              toast('Network error closing day', 'danger');
            } finally {
              state.isClosingDay = false;
              if (closeBtn) {
                closeBtn.disabled = false;
                closeBtn.textContent = 'Seal & Generate Z-Report';
              }
            }
          },
        },
      }, 'Seal & Generate Z-Report')
    );

    if (global.FroseUI && typeof global.FroseUI.openSheet === 'function') {
      global.FroseUI.openSheet('close-day-drawer');
    } else {
      drawer.classList.add('active');
      global.document.body.classList.add('saas-modal-open');
    }
  }

  global.closeCloseDayDrawer = function () {
    if (global.FroseUI && typeof global.FroseUI.closeSheet === 'function') {
      global.FroseUI.closeSheet('close-day-drawer');
      return;
    }
    var drawer = global.document.getElementById('close-day-drawer');
    if (drawer) drawer.classList.remove('active');
    var remaining = global.document.querySelectorAll('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active');
    if (remaining.length === 0) global.document.body.classList.remove('saas-modal-open');
  };

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('frose:language-changed', function () {
      var root = global.document && global.document.getElementById('payments-panel-root');
      if (root && root.children && root.children.length > 0) {
        renderShell();
        renderLedger();
      }
    });
  }

  global.FrosePaymentsPanel = {
    mount: refresh,
    refresh: refresh,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
