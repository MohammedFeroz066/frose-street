/**
 * FROSE Street — Payments & Galla Tab Controller (Phase 4: UX-04)
 * 4 KPIs (Net Sales, Cash in Drawer, UPI Received, Expenses),
 * Cash vs UPI Split Ratio Bar, Filterable Ledger, + Add Expense, and Close Day / Z-Report.
 */
(function (global) {
  'use strict';

  var IST_OFFSET_MS = 19800000;

  function getTodayIst() {
    return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
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
    date: getTodayIst(),
    filter: 'all', // 'all' | 'cash' | 'upi' | 'split' | 'expenses'
    summary: null,
    orders: [],
    expenses: [],
    zReportText: null,
  };

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
        var results = await Promise.all([
          fn('/api/v1/galla/summary?date=' + encodeURIComponent(state.date), { credentials: 'same-origin' }),
          fn('/api/v1/galla/expenses?date=' + encodeURIComponent(state.date), { credentials: 'same-origin' }),
          fn('/api/v1/orders/history?dateFrom=' + encodeURIComponent(state.date) + '&dateTo=' + encodeURIComponent(state.date) + '&limit=50', { credentials: 'same-origin' }),
        ]);
        if (results[0] && results[0].ok) {
          var sJson = await results[0].json();
          state.summary = sJson.summary || null;
        }
        if (results[1] && results[1].ok) {
          var eJson = await results[1].json();
          state.expenses = eJson.expenses || [];
        }
        if (results[2] && results[2].ok) {
          var oJson = await results[2].json();
          state.orders = oJson.orders || [];
        }
      } catch (_) {}
    }

    renderShell();
    renderLedger();
  }

  function renderShell() {
    var root = global.document.getElementById('payments-panel-root');
    if (!root || !global.FroseSafeDom) return;
    var el = global.FroseSafeDom.el;
    var clear = global.FroseSafeDom.clear;
    clear(root);

    var s = state.summary || {
      totalSalesPaise: 0,
      cashInDrawerPaise: 0,
      upiSalesPaise: 0,
      cashSalesPaise: 0,
      totalExpensesPaise: 0,
      totalOrders: 0,
      isDayClosed: false,
    };

    root.appendChild(
      el('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 14px;' }, [
        el('div', {}, [
          el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 900;' }, 'Payments & Galla'),
          el('div', { style: 'font-size: 12.5px; color: var(--text-muted);' }, 'Cash drawer tally, UPI receipts, and expenses'),
        ]),
        el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
          el('input', {
            type: 'date',
            id: 'payments-date-input',
            class: 'saas-input',
            style: 'width: auto; min-height: 44px;',
            value: state.date,
            on: {
              change: function (e) {
                state.date = e.target.value || getTodayIst();
                refresh();
              },
            },
          }),
          el('button', {
            type: 'button',
            id: 'btn-open-add-expense',
            class: 'saas-btn saas-btn-primary',
            on: { click: openAddExpenseSheet },
          }, '+ Add Expense'),
        ]),
      ])
    );

    root.appendChild(
      el('div', { class: 'saas-kpi-grid', style: 'margin-bottom: 14px;' }, [
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, 'Net Sales'),
          el('span', { class: 'saas-kpi-value', id: 'kpi-net-sales' }, fmt(s.totalSalesPaise)),
          el('span', { class: 'saas-kpi-sub' }, (s.totalOrders || 0) + ' paid orders'),
        ]),
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, 'Cash in Drawer'),
          el('span', { class: 'saas-kpi-value', id: 'kpi-cash-drawer' }, fmt(s.cashInDrawerPaise)),
          el('span', { class: 'saas-kpi-sub' }, 'Cash sales minus cash out'),
        ]),
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, 'UPI Received'),
          el('span', { class: 'saas-kpi-value', id: 'kpi-upi-received' }, fmt(s.upiSalesPaise)),
          el('span', { class: 'saas-kpi-sub' }, 'Marked paid (UPI)'),
        ]),
        el('div', { class: 'saas-kpi-card' }, [
          el('span', { class: 'saas-kpi-label' }, 'Expenses'),
          el('span', { class: 'saas-kpi-value', id: 'kpi-total-expenses' }, fmt(s.totalExpensesPaise)),
          el('span', { class: 'saas-kpi-sub' }, (state.expenses.length || 0) + ' entries'),
        ]),
      ])
    );

    var totalSplit = Number(s.cashSalesPaise || 0) + Number(s.upiSalesPaise || 0);
    var cashPct = totalSplit > 0 ? Math.round((Number(s.cashSalesPaise || 0) * 100) / totalSplit) : 50;
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
          el('span', { style: 'font-size: 12.5px; color: var(--text-muted); font-weight: 700;' }, s.isDayClosed ? 'Day Closed — Z-Report saved' : 'Shift Open'),
          el('button', {
            type: 'button',
            id: 'btn-open-close-day',
            class: 'saas-btn saas-btn-slate',
            on: { click: openCloseDayDrawer },
          }, s.isDayClosed ? 'View / Update Z-Report' : 'Close Day / Z-Report'),
        ]),
      ])
    );

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
      listEl.appendChild(
        el('div', { class: 'saas-empty-state' }, [
          el('div', { style: 'font-size: 28px; margin-bottom: 6px;' }, '📒'),
          el('div', { style: 'font-weight: 800;' }, 'No ledger entries for this date'),
        ])
      );
      return;
    }

    rows.forEach(function (row) {
      if (row.kind === 'expense') {
        var exp = row.data;
        listEl.appendChild(
          el('div', { class: 'pos-row-card' }, [
            el('div', { style: 'min-width: 0; flex: 1;' }, [
              el('div', { style: 'font-size: 14px; font-weight: 800;' }, exp.description || 'Expense'),
              el('div', { style: 'font-size: 12px; color: var(--text-muted);' }, 'Expense · ' + String(exp.category || 'general') + ' · ' + String(exp.paymentMethod || 'cash').toUpperCase()),
            ]),
            el('div', { style: 'display: flex; align-items: center; gap: 10px;' }, [
              el('span', { class: 'tabular-nums', style: 'font-size: 15px; font-weight: 900; color: var(--accent-rose);' }, '-' + fmt(exp.amountPaise)),
              el('button', {
                type: 'button',
                class: 'saas-btn saas-btn-danger',
                style: 'min-height: 44px; padding: 0 10px;',
                on: { click: function () { deleteExpense(exp.id); } },
              }, '✕'),
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

  async function deleteExpense(id) {
    try {
      var fn = global.froseApiFetch || fetch;
      var res = await fn('/api/v1/galla/expenses/' + id, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-FROSE-CSRF': '1' },
      });
      if (res && res.ok) {
        toast('Expense deleted', 'success');
        await refresh();
      }
    } catch (_) {
      toast('Could not delete expense', 'danger');
    }
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
          var desc = descIn.value.trim();
          var rupees = Number(amtIn.value || 0);
          if (!desc || !Number.isFinite(rupees) || rupees <= 0) {
            toast('Enter valid description and ₹ amount', 'warning');
            return;
          }
          var amountPaise = Math.round(rupees * 100);
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
                expenseDate: state.date,
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

    var s = state.summary || { cashInDrawerPaise: 0, totalSalesPaise: 0, upiSalesPaise: 0, totalExpensesPaise: 0 };
    var expectedPaise = Number(s.cashInDrawerPaise || 0);

    var countedInput = el('input', {
      type: 'number',
      id: 'zreport-counted-cash',
      class: 'saas-input tabular-nums',
      value: String(Math.round(expectedPaise / 100)),
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

    var notesInput = el('input', { type: 'text', id: 'zreport-notes', class: 'saas-input', placeholder: 'Shift closing notes (optional)' });

    body.appendChild(
      el('div', { class: 'pos-summary-box', style: 'margin-bottom: 14px;' }, [
        el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Date (IST)'), el('span', {}, state.date)]),
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
            try {
              var fn = global.froseApiFetch || fetch;
              var res = await fn('/api/v1/galla/close-day', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
                body: JSON.stringify({
                  date: state.date,
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
                  }, '📋 Copy Z-Report (WhatsApp)')
                );
              }
            } catch (_) {
              toast('Network error closing day', 'danger');
            }
          },
        },
      }, 'Seal & Generate Z-Report')
    );

    drawer.classList.add('active');
    global.document.body.classList.add('saas-modal-open');
  }

  global.closeCloseDayDrawer = function () {
    var drawer = global.document.getElementById('close-day-drawer');
    if (drawer) drawer.classList.remove('active');
    var remaining = global.document.querySelectorAll('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active');
    if (remaining.length === 0) global.document.body.classList.remove('saas-modal-open');
  };

  global.FrosePaymentsPanel = {
    mount: refresh,
    refresh: refresh,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
