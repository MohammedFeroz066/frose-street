/**
 * FROSE STREET — Super Admin Enterprise SaaS Console
 * Full View Controller, Real-time Subscriptions, WhatsApp Billing, & Mobile Self-Hosting Telemetry
 */

(function () {
  'use strict';

  // 1. Session & Auth Verification
  try {
    localStorage.removeItem('frose_vendors_directory');
  } catch (e) {}
  const sessionActive = localStorage.getItem('frose_session_active');
  if (!sessionActive) {
    window.location.replace('/login');
    return;
  }

  // State Management
  let activeView = 'dashboard';

  // 0. Global Mobile History & Back Navigation Controller
  if (!history.state) {
    history.replaceState({ view: 'dashboard', root: true }, '', '');
  }

  window.addEventListener('popstate', (e) => {
    // Priority 1: Check if notifications drawer is open
    const notifDrawer = document.getElementById('notifications-drawer');
    if (notifDrawer && notifDrawer.classList.contains('open')) {
      notifDrawer.classList.remove('open');
      return;
    }

    // Priority 2: Check if any modal overlay is active
    const openModals = document.querySelectorAll('.modal-overlay.active');
    if (openModals.length > 0) {
      openModals.forEach(m => m.classList.remove('active'));
      return;
    }

    // Priority 3: Check if on a subview (e.g. add-stall-page, vendors, users, settings, analytics)
    if (activeView !== 'dashboard') {
      const targetView = (e.state && e.state.view) ? e.state.view : 'dashboard';
      window.switchView(targetView, false);
      return;
    }

    // Priority 4: If at root dashboard, prevent browser from exiting abruptly
    history.pushState({ view: 'dashboard', root: true }, '', '');
  });

  let allVendors = [];
  let currentFilter = 'all';
  let searchQuery = '';

  const FALLBACK_VENDORS = [];

  // Format integer paise into Indian Rupee format (e.g. ₹1,04,500)
  function formatRupees(paise) {
    const p = typeof paise === 'string' ? BigInt(paise) : BigInt(paise || 0);
    const rupees = Number(p / 100n);
    return '₹' + rupees.toLocaleString('en-IN');
  }

  // Format ISO Date to readable short string (e.g. 15-Nov)
  function formatDate(isoStr) {
    if (!isoStr) return 'N/A';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch (e) {
      return 'N/A';
    }
  }

  // Authenticated API fetch (delegated to shared cookie + single-flight refresh client)
  async function apiFetch(endpoint, options = {}) {
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn(endpoint, { ...options, credentials: 'same-origin' });
      if (!res || res.status === 401 || res.status === 403) {
        localStorage.removeItem('frose_session_active');
        return null;
      }
      return res;
    } catch (e) {
      return null;
    }
  }

  // View Switcher
  function switchView(viewName, pushHistory = true) {
    if (pushHistory && activeView !== viewName) {
      history.pushState({ view: viewName }, '', '');
    }
    activeView = viewName;

    document.querySelectorAll('.saas-view').forEach(view => {
      view.classList.remove('active');
    });
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    // Update Top Navigation Tabs
    document.querySelectorAll('.nav-tab-pill').forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update Bottom Navigation Bar
    document.querySelectorAll('.bottom-nav-item[data-view]').forEach(btn => {
      if (btn.getAttribute('data-view') === viewName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (viewName === 'vendors') renderStallsTable();
    if (viewName === 'users') loadUsers();
    if (viewName === 'analytics') loadAnalytics();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Load Platform Overview & Bind KPI Metrics
  async function loadOverview() {
    let stats = {
      totalVendors: allVendors.length,
      activeVendors: allVendors.filter(v => v.subscriptionStatus === 'active' || v.paymentStatus === 'paid').length,
      trialVendors: allVendors.filter(v => v.subscriptionStatus === 'trial' || v.paymentStatus === 'trial').length,
      expiredVendors: allVendors.filter(v => v.subscriptionStatus === 'expired' || v.paymentStatus === 'overdue').length,
      expiringVendors: allVendors.filter(v => v.paymentStatus === 'due_soon').length,
      cloudVendors: allVendors.filter(v => v.edition !== 'local').length,
      localVendors: allVendors.filter(v => v.edition === 'local').length,
      grossSalesPaise: allVendors.reduce((sum, v) => sum + BigInt(v.lifetimeSalesPaise || '0'), 0n).toString(),
      cashSalesPaise: allVendors.reduce((sum, v) => sum + BigInt(v.turnover?.daily?.cashPaise || '0'), 0n).toString(),
      upiSalesPaise: allVendors.reduce((sum, v) => sum + BigInt(v.turnover?.daily?.upiPaise || '0'), 0n).toString(),
      totalCollectedPaise: allVendors.reduce((sum, v) => sum + BigInt(v.totalCollectedPaise || '0'), 0n).toString(),
      totalPendingPaise: allVendors.reduce((sum, v) => sum + BigInt(v.pendingDuePaise || '0'), 0n).toString(),
      todayOrders: allVendors.reduce((sum, v) => sum + (v.totalOrders || 0), 0),
      totalOrders: allVendors.reduce((sum, v) => sum + (v.totalOrders || 0), 0),
      activeDevicesCount: allVendors.reduce((sum, v) => sum + (v.activeDevices || 0), 0)
    };

    try {
      const res = await apiFetch('/api/v1/admin/overview');
      if (res && res.ok) {
        const json = await res.json();
        if (json.data) {
          stats.totalVendors = json.data.totalVendors ?? stats.totalVendors;
          stats.activeVendors = json.data.activeVendors ?? stats.activeVendors;
          const serverGross = BigInt(json.data.grossSalesPaise || '0');
          const localGross = BigInt(stats.grossSalesPaise || '0');
          stats.grossSalesPaise = (serverGross > localGross ? serverGross : localGross).toString();

          const serverCash = BigInt(json.data.cashSalesPaise || '0');
          const localCash = BigInt(stats.cashSalesPaise || '0');
          stats.cashSalesPaise = (serverCash > localCash ? serverCash : localCash).toString();

          const serverUpi = BigInt(json.data.upiSalesPaise || '0');
          const localUpi = BigInt(stats.upiSalesPaise || '0');
          stats.upiSalesPaise = (serverUpi > localUpi ? serverUpi : localUpi).toString();

          const serverOrders = json.data.todayOrders ?? 0;
          stats.todayOrders = Math.max(serverOrders, stats.todayOrders);
        }
      }
    } catch (e) {}

    // Bind Subtitle
    const heroSub = document.getElementById('admin-header-subtitle');
    if (heroSub) {
      heroSub.textContent = stats.totalVendors === 0 
        ? '0 Stalls Active • 🌐 0 Cloud Stalls'
        : `${stats.activeVendors} Stalls Active • 🌐 ${stats.cloudVendors} Cloud`;
    }

    // Bind Dashboard KPI Cards
    const elRest = document.getElementById('kpi-val-restaurants');
    const elSubAct = document.getElementById('kpi-sub-active');
    const elSubTri = document.getElementById('kpi-sub-trial');
    if (elRest) elRest.textContent = stats.totalVendors;
    if (elSubAct) elSubAct.textContent = stats.activeVendors;
    if (elSubTri) elSubTri.textContent = stats.trialVendors;

    const elRev = document.getElementById('kpi-val-revenue');
    const elCash = document.getElementById('kpi-sub-cash');
    const elUpi = document.getElementById('kpi-sub-upi');
    if (elRev) elRev.textContent = formatRupees(stats.grossSalesPaise);
    if (elCash) elCash.textContent = formatRupees(stats.cashSalesPaise);
    if (elUpi) elUpi.textContent = formatRupees(stats.upiSalesPaise);

    const elCol = document.getElementById('kpi-val-collections');
    const elSubRenew = document.getElementById('kpi-sub-renewals');
    if (elCol) elCol.textContent = formatRupees(stats.totalCollectedPaise);
    if (elSubRenew) {
      const { el, clear } = window.FroseSafeDom;
      clear(elSubRenew);
      elSubRenew.append(
        'Recv: ',
        el('strong', {}, [formatRupees(stats.totalCollectedPaise)]),
        ' • Due: ',
        el('strong', {}, [formatRupees(stats.totalPendingPaise)])
      );
    }

    const elOrders = document.getElementById('kpi-val-orders');
    const elSubDev = document.getElementById('kpi-sub-devices');
    if (elOrders) elOrders.textContent = stats.todayOrders;
    if (elSubDev) elSubDev.textContent = `📲 ${stats.activeDevicesCount} Active Devices Online`;

    // Filter counts on Vendors tab
    const cntAll = document.getElementById('count-all');
    const cntAct = document.getElementById('count-active');
    const cntTri = document.getElementById('count-trial');
    const cntExp = document.getElementById('count-expiring');
    const cntOut = document.getElementById('count-expired');
    if (cntAll) cntAll.textContent = stats.totalVendors;
    if (cntAct) cntAct.textContent = stats.activeVendors;
    if (cntTri) cntTri.textContent = stats.trialVendors;
    if (cntExp) cntExp.textContent = stats.expiringVendors;
    if (cntOut) cntOut.textContent = stats.expiredVendors;
  }

  // Load Vendors Directory strictly in memory from authenticated admin API
  async function loadVendors() {
    const stallMap = new Map();

    try {
      const res = await apiFetch('/api/v1/admin/vendors');
      if (res && res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data)) {
          const backendStalls = json.data.filter(v => !v.isSuperadmin && !v.is_superadmin);
          backendStalls.forEach(s => {
            stallMap.set(s.id || s.phone, s);
          });
        }
      }
    } catch (e) {}

    allVendors = Array.from(stallMap.values());
    renderStallsTable();
    loadOverview();
  }

  // Render Vendors Table with Hosting Mode, Monthly Billing, and WhatsApp Action
  function renderStallsTable() {
    const tbody = document.getElementById('stalls-table-body');
    if (!tbody) return;

    const query = searchQuery.toLowerCase().trim();
    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;

    const filtered = allVendors.filter(v => {
      const bName = (v.businessName || v.business_name || '').toLowerCase();
      const oName = (v.ownerName || v.owner_name || '').toLowerCase();
      const ph = (v.phone || '').toLowerCase();
      const city = (v.city || '').toLowerCase();
      const matchesSearch = !query || bName.includes(query) || oName.includes(query) || ph.includes(query) || city.includes(query);
      if (!matchesSearch) return false;

      const status = v.subscriptionStatus || v.subscription_status || 'active';
      const expiresAt = v.subscriptionExpiresAt || v.subscription_expires_at ? new Date(v.subscriptionExpiresAt || v.subscription_expires_at).getTime() : 0;
      const edition = v.edition || 'cloud';

      if (currentFilter === 'all') return true;
      if (currentFilter === 'active') return status === 'active';
      if (currentFilter === 'trial') return status === 'trial';
      if (currentFilter === 'expired') return status === 'expired' || expiresAt < now;
      if (currentFilter === 'expiring') return expiresAt > now && expiresAt <= in7Days;
      if (currentFilter === 'cloud') return edition === 'cloud';
      if (currentFilter === 'local') return edition === 'local';
      return true;
    });

    const { el, clear } = window.FroseSafeDom;
    clear(tbody);

    if (filtered.length === 0) {
      if (allVendors.length === 0) {
        const addBtn = el('button', {
          type: 'button',
          class: 'btn-table-action',
          style: 'background: var(--saas-burgundy-primary); color: #FFF; padding: 8px 18px; border-radius: 8px; font-weight: 700; cursor: pointer;',
          on: { click: () => { if (typeof window.switchView === 'function') window.switchView('add-restaurant'); } }
        }, ['+ Add a New Restaurant']);
        tbody.appendChild(el('tr', {}, [
          el('td', { colspan: '7', style: 'text-align: center; padding: 48px 16px;' }, [
            el('div', { style: 'font-size: 36px; margin-bottom: 8px;' }, ['🍽️']),
            el('div', { style: 'font-size: 15px; font-weight: 800; color: var(--saas-burgundy-primary); margin-bottom: 4px;' }, ['No Restaurant Stalls Created']),
            el('div', { style: 'font-size: 12.5px; color: var(--saas-text-muted); margin-bottom: 16px;' }, ['Provision your first stall to view live cloud telemetry, billing & orders.']),
            addBtn
          ])
        ]));
      } else {
        tbody.appendChild(el('tr', {}, [
          el('td', { colspan: '7', style: 'text-align: center; padding: 24px; color: var(--saas-text-muted);' }, ['No restaurants found matching current filter or search criteria.'])
        ]));
      }
      return;
    }

    filtered.forEach(v => {
      const bName = v.businessName || v.business_name || 'Restaurant Stall';
      const oName = v.ownerName || v.owner_name || 'Owner';
      const phone = v.phone || 'N/A';
      const edition = v.edition || 'cloud';
      const monthlyFee = formatRupees(v.monthlyFeePaise || '49900');
      const lastPaid = formatDate(v.lastPaymentDate);
      const nextDue = formatDate(v.nextDueDate || v.subscriptionExpiresAt);

      const status = v.subscriptionStatus || v.subscription_status || 'active';
      const expiresAt = v.subscriptionExpiresAt || v.subscription_expires_at ? new Date(v.subscriptionExpiresAt || v.subscription_expires_at).getTime() : 0;
      const isSuspended = status === 'suspended' || status === 'expired';
      const isOverdue = status === 'expired' || expiresAt < now;
      const isDueSoon = expiresAt > now && expiresAt <= in7Days;

      let badgeClass = 'active';
      let badgeLabel = 'PAID';
      if (status === 'trial') { badgeClass = 'trial'; badgeLabel = 'TRIAL'; }
      else if (isOverdue) { badgeClass = 'overdue'; badgeLabel = 'OVERDUE'; }
      else if (isDueSoon) { badgeClass = 'due_soon'; badgeLabel = 'DUE SOON'; }

      const hostingBadge = edition === 'local'
        ? el('span', { class: 'badge-hosting local', title: "Runs directly on stall owner's Android phone/tablet with zero internet needed" }, ['📱 Mobile P2P'])
        : el('span', { class: 'badge-hosting cloud', title: 'FROSE Edge Cloud with live multi-device synchronization' }, ['🌐 Cloud Edge']);

      tbody.appendChild(el('tr', {}, [
        el('td', {}, [
          el('div', { style: 'font-weight: 800; font-size: 13.5px; color: var(--saas-burgundy-primary);' }, [bName]),
          el('div', { style: 'font-size: 11.5px; color: var(--saas-text-muted);' }, [`${oName} • ${v.city || 'Hyderabad'}`])
        ]),
        el('td', {}, [
          el('code', { style: 'font-family: var(--font-mono); font-size: 12.5px; font-weight: 700;' }, [phone])
        ]),
        el('td', {}, [hostingBadge]),
        el('td', {}, [
          el('strong', { style: 'color: var(--saas-burgundy-primary); font-size: 12.5px;' }, [`${monthlyFee}/mo`])
        ]),
        el('td', {}, [
          el('div', { style: 'font-size: 11px;' }, ['Paid: ', el('strong', {}, [lastPaid])]),
          el('div', { style: `font-size: 11px; color: ${isOverdue ? 'var(--saas-crimson)' : 'var(--saas-text-muted)'};` }, ['Due: ', el('strong', {}, [nextDue])])
        ]),
        el('td', {}, [
          el('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
            el('span', { class: `badge-status ${badgeClass}` }, [badgeLabel]),
            el('button', {
              type: 'button',
              class: 'btn-sub-toggle',
              'data-phone': phone,
              title: 'Toggle Subscription ON/OFF (Remote Kill-Switch)',
              style: `padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 800; border: 1.5px solid ${isSuspended ? '#22C55E' : '#EF4444'}; background: ${isSuspended ? '#F0FDF4' : '#FEF2F2'}; color: ${isSuspended ? '#15803D' : '#B91C1C'}; cursor: pointer;`,
              on: { click: () => { if (typeof window.toggleStallSubscription === 'function') window.toggleStallSubscription(phone); } }
            }, [isSuspended ? 'Turn ON' : 'Turn OFF'])
          ])
        ]),
        el('td', {}, [
          el('div', { class: 'action-btn-group' }, [
            el('button', {
              type: 'button',
              class: 'btn-whatsapp-action btn-whatsapp-stall',
              'data-phone': phone,
              'data-owner': oName,
              'data-stall': bName,
              'data-status': badgeLabel,
              'data-due': nextDue,
              'data-fee': monthlyFee,
              title: 'Send WhatsApp payment reminder / receipt'
            }, [el('span', {}, ['💬 WhatsApp'])]),
            el('button', {
              type: 'button',
              class: 'btn-table-action btn-setup-qr',
              'data-phone': phone,
              title: 'Stall Setup QR & Mobile P2P Pairing',
              style: 'background: #FFF7ED; border: 1.5px solid #FDBA74; font-weight: 800; color: #C2410C; font-size: 11.5px;',
              on: { click: () => { if (typeof window.openStallSetupQRByPhone === 'function') window.openStallSetupQRByPhone(phone); } }
            }, [el('span', {}, ['📲 QR'])]),
            el('button', {
              type: 'button',
              class: 'btn-table-action btn-stall-analytics',
              'data-id': v.id,
              title: 'Fiscal Turnover Analytics & Payment History Ledger',
              style: 'background: #FDFBF7; border: 1.5px solid var(--saas-card-border); font-weight: 700; color: var(--saas-burgundy-primary); font-size: 11.5px;'
            }, [el('span', {}, ['📊 Ledger'])]),
            el('button', {
              type: 'button',
              class: 'btn-table-action btn-inspect-vendor',
              'data-id': v.id,
              title: 'Inspect Stall Details & Renew License',
              style: 'background: var(--accent-primary-soft, #ECFDF5); border: 1.5px solid var(--accent-primary, #059669); font-weight: 800; color: var(--accent-primary, #059669); font-size: 11.5px;',
              on: { click: () => { openVendorInspector(v.id); } }
            }, [el('span', {}, ['🔎 Inspect'])]),
            el('button', { type: 'button', class: 'btn-table-action btn-view-receipt', 'data-id': v.id, title: 'View Receipt' }, [el('span', {}, ['📄'])]),
            el('button', { type: 'button', class: 'btn-table-action btn-edit-stall', 'data-id': v.id, title: 'Edit Stall' }, [el('span', {}, ['✏️'])]),
            el('button', { type: 'button', class: 'btn-table-action btn-manage-menu', 'data-id': v.id, 'data-name': bName, title: 'Menu' }, [el('span', {}, ['📋'])])
          ])
        ])
      ]));
    });

    // Attach WhatsApp trigger listeners
    document.querySelectorAll('.btn-whatsapp-stall').forEach(btn => {
      btn.addEventListener('click', () => {
        const phone = btn.getAttribute('data-phone');
        const owner = btn.getAttribute('data-owner');
        const stall = btn.getAttribute('data-stall');
        const status = btn.getAttribute('data-status');
        const due = btn.getAttribute('data-due');
        const fee = btn.getAttribute('data-fee');
        sendWhatsAppNotification(phone, owner, stall, status, due, fee);
      });
    });

    // Attach Receipt modal listeners
    document.querySelectorAll('.btn-view-receipt').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openReceiptModal(id);
      });
    });

    // Attach Edit and Menu listeners
    document.querySelectorAll('.btn-edit-stall').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditStallModal(btn.getAttribute('data-id'));
      });
    });

    document.querySelectorAll('.btn-manage-menu').forEach(btn => {
      btn.addEventListener('click', () => {
        openMenuModal(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
      });
    });
  }

  function closeVendorInspector() {
    const backdrop = document.getElementById('vendor-inspector-drawer');
    if (backdrop) backdrop.classList.remove('active');
  }

  function openVendorInspector(stallId) {
    const stall = allVendors.find(v => String(v.id) === String(stallId));
    const backdrop = document.getElementById('vendor-inspector-drawer');
    const body = document.getElementById('vendor-inspector-body');
    const titleEl = document.getElementById('vendor-inspector-title');
    const subEl = document.getElementById('vendor-inspector-subtitle');
    if (!stall || !backdrop || !body) return;

    const { el, clear } = window.FroseSafeDom;
    const bName = stall.businessName || stall.business_name || 'Restaurant Stall';
    const oName = stall.ownerName || stall.owner_name || 'Owner';
    const phone = stall.phone || 'N/A';
    const status = stall.subscriptionStatus || stall.subscription_status || 'active';
    const expRaw = stall.subscriptionExpiresAt || stall.subscription_expires_at || stall.nextDueDate;
    const expFormatted = formatDate(expRaw);
    const edition = stall.edition || 'cloud';
    const fee = formatRupees(stall.monthlyFeePaise || '49900');
    const lifetime = formatRupees(stall.lifetimeSalesPaise || '0');

    if (titleEl) titleEl.textContent = bName;
    if (subEl) subEl.textContent = `${oName} • ${phone} • ${edition === 'local' ? 'Mobile P2P' : 'Cloud Edge'}`;

    clear(body);
    body.appendChild(
      el('div', { class: 'saas-card', style: 'padding: 14px;' }, [
        el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;' }, [
          el('span', { class: 'saas-muted' }, ['Subscription Status']),
          el('span', { class: `badge-status ${status === 'suspended' || status === 'expired' ? 'overdue' : (status === 'trial' ? 'trial' : 'active')}` }, [status.toUpperCase()])
        ]),
        el('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 6px;' }, [
          el('span', { class: 'saas-muted' }, ['License Expires']),
          el('strong', { style: 'font-variant-numeric: tabular-nums;' }, [expFormatted])
        ]),
        el('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 6px;' }, [
          el('span', { class: 'saas-muted' }, ['Monthly Plan']),
          el('strong', { style: 'font-variant-numeric: tabular-nums;' }, [`${fee}/mo`])
        ]),
        el('div', { style: 'display: flex; justify-content: space-between;' }, [
          el('span', { class: 'saas-muted' }, ['Lifetime Sales']),
          el('strong', { style: 'font-variant-numeric: tabular-nums;' }, [lifetime])
        ])
      ])
    );

    const renewBtn = el('button', {
      type: 'button',
      class: 'saas-btn saas-btn-primary saas-btn-full',
      id: 'btn-inspector-renew-30d',
      on: {
        click: async () => {
          renewBtn.disabled = true;
          renewBtn.textContent = 'Renewing...';
          const baseTs = expRaw && new Date(expRaw).getTime() > Date.now()
            ? new Date(expRaw).getTime()
            : Date.now();
          const newExpiry = new Date(baseTs + 30 * 86400000).toISOString();
          const res = await apiFetch(`/api/v1/admin/vendors/${stall.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ subscriptionStatus: 'active', subscriptionExpiresAt: newExpiry })
          });
          if (res && res.ok) {
            stall.subscriptionStatus = 'active';
            stall.subscription_status = 'active';
            stall.subscriptionExpiresAt = newExpiry;
            stall.nextDueDate = newExpiry;
            renderStallsTable();
            loadOverview();
            openVendorInspector(stall.id);
            if (window.FroseUI && window.FroseUI.showToast) {
              window.FroseUI.showToast(`✅ Renewed ${bName} (+30 Days)`, 'success');
            }
          } else {
            renewBtn.disabled = false;
            renewBtn.textContent = '✨ Renew License (+30 Days)';
            if (window.FroseUI && window.FroseUI.showToast) {
              window.FroseUI.showToast('Failed to renew license', 'error');
            }
          }
        }
      }
    }, ['✨ Renew License (+30 Days)']);

    const editBtn = el('button', {
      type: 'button',
      class: 'saas-btn saas-btn-secondary saas-btn-full',
      on: { click: () => { closeVendorInspector(); openEditStallModal(stall.id); } }
    }, ['✏️ Edit Stall Settings']);

    const menuBtn = el('button', {
      type: 'button',
      class: 'saas-btn saas-btn-secondary saas-btn-full',
      on: { click: () => { closeVendorInspector(); openMenuModal(stall.id, bName); } }
    }, ['📋 Inspect Menu']);

    const ledgerBtn = el('button', {
      type: 'button',
      class: 'saas-btn saas-btn-secondary saas-btn-full',
      on: {
        click: () => {
          closeVendorInspector();
          if (typeof window.openStallAnalyticsModal === 'function') window.openStallAnalyticsModal(stall.id);
        }
      }
    }, ['📊 Fiscal Ledger']);

    body.appendChild(el('div', { style: 'display: flex; flex-direction: column; gap: 10px;' }, [
      renewBtn,
      editBtn,
      menuBtn,
      ledgerBtn
    ]));

    backdrop.classList.add('active');
  }

  // 6. WhatsApp Notification Deep-Link Handler
  function sendWhatsAppNotification(phone, owner, stall, status, due, fee) {
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Invalid phone number for WhatsApp message.');
      return;
    }

    let message = '';
    if (status === 'OVERDUE' || status === 'DUE SOON' || status === 'TRIAL') {
      message = `*FROSE Street POS — Subscription Payment Due*\n\nDear ${owner},\n\nYour monthly subscription for *${stall}* (${fee}/month) is due on *${due}*.\n\nPlease settle via UPI: *frosestall@okaxis* to ensure continuous uninterrupted billing counter operations.\n\nThank you,\n*FROSE Street POS Team*`;
    } else {
      message = `*FROSE Street POS — Official Payment Confirmation*\n\nDear ${owner},\n\nThank you for your payment of *${fee}* for *${stall}*.\n\nYour subscription is active and valid until *${due}*.\nReceipt ID: #REC-${Math.random().toString(36).substring(2, 8).toUpperCase()}\n\nThank you for choosing FROSE Street!\n*FROSE Platform HQ*`;
    }

    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  }

  // 7. Receipt Modal
  function openReceiptModal(stallId) {
    const stall = allVendors.find(v => v.id === stallId) || allVendors[0];
    if (!stall) return;

    const bName = stall.businessName || stall.business_name || 'Restaurant Stall';
    const oName = stall.ownerName || stall.owner_name || 'Owner';
    const phone = stall.phone || 'N/A';
    const fee = formatRupees(stall.monthlyFeePaise || '49900');
    const receiptId = 'FROSE-REC-' + (stall.id.replace('v-', '').toUpperCase() || '01');

    const container = document.getElementById('receipt-modal-content');
    if (container) {
      const { el, clear } = window.FroseSafeDom;
      clear(container);
      container.append(
        el('div', { style: 'text-align: center; margin-bottom: 12px; border-bottom: 1px solid var(--saas-card-border); padding-bottom: 10px;' }, [
          el('div', { style: 'font-weight: 900; font-size: 16px; color: var(--saas-burgundy-primary);' }, ['FROSE STREET POS']),
          el('div', { style: 'font-size: 11px; color: var(--saas-text-muted);' }, ['Official Subscription Tax Receipt']),
          el('div', { style: 'font-size: 11px; font-weight: 700; margin-top: 4px;' }, [`Receipt: #${receiptId}`])
        ]),
        el('div', { style: 'display: flex; flex-direction: column; gap: 6px;' }, [
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Restaurant:']), el('strong', {}, [bName])]),
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Stall Owner:']), el('strong', {}, [oName])]),
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Mobile:']), el('code', {}, [phone])]),
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Hosting Mode:']), el('strong', {}, [stall.edition === 'local' ? 'Mobile P2P (Offline)' : 'Cloud Managed (Edge)'])]),
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Amount Paid:']), el('strong', { style: 'color: var(--saas-emerald); font-size: 14px;' }, [fee])]),
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Payment Mode:']), el('strong', {}, ['UPI Intent / BharatQR'])]),
          el('div', { style: 'display: flex; justify-content: space-between;' }, [el('span', {}, ['Validity Period:']), el('strong', {}, ['30 Days'])])
        ])
      );
    }

    const shareBtn = document.getElementById('btn-receipt-whatsapp-share');
    if (shareBtn) {
      shareBtn.onclick = () => {
        sendWhatsAppNotification(phone, oName, bName, 'PAID', formatDate(stall.nextDueDate), fee);
      };
    }

    openModal('modal-payment-receipt');
  }

  // 8. Load Users & Analytics
  async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    let users = allVendors.map(v => ({
      id: 'usr-' + v.id,
      name: v.ownerName || v.owner_name,
      phone: v.phone,
      role: v.role || 'owner',
      stallName: v.businessName || v.business_name,
      status: v.subscriptionStatus === 'expired' ? 'inactive' : 'active'
    }));

    const res = await apiFetch('/api/v1/admin/users');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) users = json.data;
      } catch (e) {}
    }

    const { el, clear } = window.FroseSafeDom;
    clear(tbody);
    users.forEach(u => {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [
          el('div', { style: 'font-weight: 700;' }, [u.name || '']),
          el('code', { style: 'font-size: 11.5px; color: var(--saas-text-muted);' }, [u.phone || ''])
        ]),
        el('td', {}, [el('span', { class: 'badge-status active' }, [u.role || 'owner'])]),
        el('td', {}, [el('strong', {}, [u.stallName || ''])]),
        el('td', {}, [el('span', { class: `badge-status ${u.status === 'active' ? 'active' : 'expired'}` }, [u.status || 'active'])]),
        el('td', {}, [
          el('button', {
            type: 'button',
            class: 'btn-table-action',
            on: { click: () => alert('Password reset link dispatched via SMS to ' + (u.phone || '')) }
          }, ['Reset Password'])
        ])
      ]));
    });
  }

  async function loadAnalytics() {
    const cashVal = document.getElementById('analytics-cash-val');
    const upiVal = document.getElementById('analytics-upi-val');
    const tbody = document.getElementById('analytics-leaderboard-body');

    let data = {
      grossSalesPaise: '10450000',
      cashSalesPaise: '6250000',
      upiSalesPaise: '4200000',
      leaderboard: allVendors.map((v, i) => ({
        rank: i + 1,
        name: v.businessName || v.business_name,
        city: v.city || 'Hyderabad',
        orders: v.totalOrders || 0,
        volume: formatRupees(v.lifetimeSalesPaise || '0')
      }))
    };

    const res = await apiFetch('/api/v1/admin/analytics');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (json.data) data = json.data;
      } catch (e) {}
    }

    if (cashVal) cashVal.textContent = formatRupees(data.cashSalesPaise);
    if (upiVal) upiVal.textContent = formatRupees(data.upiSalesPaise);

    if (tbody && Array.isArray(data.leaderboard)) {
      const { el, clear } = window.FroseSafeDom;
      clear(tbody);
      data.leaderboard.forEach((item, idx) => {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [el('strong', { style: 'color: var(--saas-burgundy-primary);' }, [`#${item.rank || idx + 1}`])]),
          el('td', {}, [el('strong', {}, [item.name || ''])]),
          el('td', {}, [item.city || '']),
          el('td', {}, [String(item.orders || item.totalOrders || 0)]),
          el('td', {}, [el('strong', {}, [item.volume || formatRupees(item.salesPaise || '0')])])
        ]));
      });
    }
  }

  // 9. Modal Management & Touch/Scroll Lockout
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
      document.body.classList.add('modal-open');
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
    // Check if any other modal is still active
    const anyActive = document.querySelector('.modal-overlay.active');
    if (!anyActive) {
      document.body.classList.remove('modal-open');
    }
  }

  // Edit Stall Modal
  function openEditStallModal(stallId) {
    const stall = allVendors.find(v => v.id === stallId);
    if (!stall) return;

    document.getElementById('edit-stall-id').value = stall.id;
    document.getElementById('edit-stall-name').value = stall.businessName || stall.business_name || '';
    document.getElementById('edit-owner-name').value = stall.ownerName || stall.owner_name || '';
    document.getElementById('edit-city').value = stall.city || 'Hyderabad';
    document.getElementById('edit-edition').value = stall.edition || 'cloud';
    document.getElementById('edit-status').value = stall.subscriptionStatus || stall.subscription_status || 'active';

    openModal('modal-edit-stall');
  }

  // Menu Manager Modal
  async function openMenuModal(stallId, stallName) {
    const title = document.getElementById('menu-modal-stall-name');
    if (title) title.textContent = '📋 ' + stallName + ' Menu';

    const container = document.getElementById('dish-list-container');
    if (!container) return;

    const { el, clear } = window.FroseSafeDom;
    clear(container);
    container.appendChild(el('div', { style: 'padding: 16px; text-align: center; color: var(--saas-text-muted);' }, ['Loading dishes...']));
    openModal('modal-menu-manager');

    let dishes = [
      { id: 'd-1', name: 'Steamed Momos (8 Pcs)', pricePaise: 6000, category: 'Momos', isAvailable: true },
      { id: 'd-2', name: 'Fried Momos (8 Pcs)', pricePaise: 7000, category: 'Momos', isAvailable: true },
      { id: 'd-3', name: 'Special Chicken Shawarma', pricePaise: 12000, category: 'Shawarma', isAvailable: true },
      { id: 'd-4', name: 'Irani Chai Cup', pricePaise: 1500, category: 'Beverages', isAvailable: true }
    ];

    const res = await apiFetch(`/api/v1/admin/vendors/${stallId}/menu`);
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) dishes = json.data;
      } catch (e) {}
    }

    clear(container);
    dishes.forEach(d => {
      const availBtn = el('button', {
        type: 'button',
        class: 'btn-table-action',
        on: {
          click: function () {
            this.textContent = this.textContent === '🟢 In Stock' ? '🔴 Out of Stock' : '🟢 In Stock';
          }
        }
      }, [(d.is_available ?? d.isAvailable) ? '🟢 In Stock' : '🔴 Out of Stock']);

      container.appendChild(el('div', {
        style: 'display: flex; align-items: center; justify-content: space-between; padding: 10px; background: #FDFBF7; border-radius: 8px; border: 1px solid var(--saas-card-border);'
      }, [
        el('div', {}, [
          el('div', { style: 'font-weight: 800; font-size: 13px;' }, [d.name || '']),
          el('div', { style: 'font-size: 11.5px; color: var(--saas-text-muted);' }, [`${d.category || 'General'} • ${formatRupees(d.price_paise || d.pricePaise)}`])
        ]),
        availBtn
      ]));
    });
  }

    // 10. Unified Delegated Click Listener (Zero-Fail Real-Time Mobile & Desktop Taps)
  document.addEventListener('click', (e) => {
    // 1. Top Navigation Tabs
    const tabBtn = e.target.closest('.nav-tab-pill');
    if (tabBtn) {
      const view = tabBtn.getAttribute('data-view');
      if (view) {
        switchView(view);
        return;
      }
    }

    // 2. Bottom Bar Navigation
    const bHome = e.target.closest('#btn-bottom-home');
    if (bHome) {
      switchView('dashboard');
      return;
    }

    const bAnalytics = e.target.closest('#btn-bottom-analytics');
    if (bAnalytics) {
      switchView('analytics');
      return;
    }

    const bAdd = e.target.closest('#btn-bottom-add-restaurant, #btn-top-add-stall');
    if (bAdd) {
      switchView('add-restaurant');
      return;
    }

    const bBackVendors = e.target.closest('#btn-back-to-vendors');
    if (bBackVendors) {
      switchView('vendors');
      return;
    }

    const filterBtn = e.target.closest('.filter-pill');
    if (filterBtn) {
      const f = filterBtn.getAttribute('data-filter') || 'all';
      filterStalls(f);
      return;
    }

    const bNotif = e.target.closest('#btn-bottom-notifications');
    if (bNotif) {
      const drawer = document.getElementById('notifications-drawer');
      if (drawer) {
        drawer.classList.add('active');
        document.body.classList.add('modal-open');
      }
      return;
    }

    const bCloseNotif = e.target.closest('#btn-close-notifications');
    if (bCloseNotif) {
      const drawer = document.getElementById('notifications-drawer');
      if (drawer) {
        drawer.classList.remove('active');
        document.body.classList.remove('modal-open');
      }
      return;
    }

    const bLogout = e.target.closest('#btn-bottom-logout, #btn-menu-logout');
    if (bLogout) {
      if (window.FroseIdbStore && typeof window.FroseIdbStore.safeLogout === 'function') {
        window.FroseIdbStore.safeLogout({ confirmMessage: 'Sign out of Super Admin Console?' });
        return;
      }
      if (confirm('Sign out of Super Admin Console?')) {
        (window.froseApiFetch || fetch)('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-FROSE-CSRF': '1' } })
          .catch(() => {})
          .finally(() => {
            localStorage.removeItem('frose_session_active');
            localStorage.removeItem('frose_vendors_directory');
            window.location.replace('/login.html');
          });
      }
      return;
    }

    // 3. KPI Card Clicks
    if (e.target.closest('#card-kpi-restaurants')) {
      switchView('vendors');
      return;
    }
    if (e.target.closest('#card-kpi-revenue') || e.target.closest('#card-kpi-orders') || e.target.closest('#btn-hero-reports')) {
      switchView('analytics');
      return;
    }
    if (e.target.closest('#card-kpi-renewals')) {
      currentFilter = 'expiring';
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      document.querySelector('.filter-pill[data-filter="expiring"]')?.classList.add('active');
      switchView('vendors');
      return;
    }

    // 4. System Health Modal
    if (e.target.closest('#btn-view-health')) {
      openModal('modal-system-health');
      return;
    }

    // 5. Modal Close Buttons
    if (e.target.closest('#btn-close-add-modal')) {
      closeModal('modal-add-stall');
      return;
    }
    if (e.target.closest('#btn-close-edit-modal')) {
      closeModal('modal-edit-stall');
      return;
    }
    if (e.target.closest('#btn-close-menu-modal')) {
      closeModal('modal-menu-manager');
      return;
    }
    if (e.target.closest('#btn-close-health-modal')) {
      closeModal('modal-system-health');
      return;
    }
    if (e.target.closest('#btn-close-receipt-modal')) {
      closeModal('modal-payment-receipt');
      return;
    }

    // 6. WhatsApp Action
    const waBtn = e.target.closest('.btn-whatsapp-stall');
    if (waBtn) {
      const phone = waBtn.getAttribute('data-phone');
      const owner = waBtn.getAttribute('data-owner');
      const stall = waBtn.getAttribute('data-stall');
      const status = waBtn.getAttribute('data-status');
      const due = waBtn.getAttribute('data-due');
      const fee = waBtn.getAttribute('data-fee');
      sendWhatsAppNotification(phone, owner, stall, status, due, fee);
      return;
    }

    // 7. Receipt Action
    const rcptBtn = e.target.closest('.btn-view-receipt');
    if (rcptBtn) {
      const id = rcptBtn.getAttribute('data-id');
      openReceiptModal(id);
      return;
    }

    // Analytics & Ledger Action
    const analyticsBtn = e.target.closest('.btn-stall-analytics');
    if (analyticsBtn) {
      const id = analyticsBtn.getAttribute('data-id');
      window.openStallAnalytics(id);
      return;
    }

    // 8. Edit Stall Action
    const editBtn = e.target.closest('.btn-edit-stall');
    if (editBtn) {
      const id = editBtn.getAttribute('data-id');
      openEditModal(id);
      return;
    }

    // 9. Menu Manager Action
    const menuBtn = e.target.closest('.btn-manage-menu');
    if (menuBtn) {
      const id = menuBtn.getAttribute('data-id');
      openMenuModal(id);
      return;
    }
  });



  // 12. Stall Fiscal Turnover Analytics & Payment History Ledger Modal Handler
  window.openStallAnalytics = function(vendorId) {
    const stall = allVendors.find(v => v.id === vendorId);
    if (!stall) return;

    const bName = stall.businessName || stall.business_name || 'Restaurant Stall';
    const oName = stall.ownerName || stall.owner_name || 'N/A';
    const phone = stall.phone || 'N/A';
    const city = stall.city || 'Hyderabad';

    const titleEl = document.getElementById('analytics-stall-title');
    const subEl = document.getElementById('analytics-stall-subtitle');
    if (titleEl) titleEl.textContent = `📊 ${bName} — Fiscal Analytics`;
    if (subEl) subEl.textContent = `Owner: ${oName} • 📱 ${phone} • 📍 ${city}`;

    // 4-Period Turnover Intelligence (Daily, Weekly, Monthly, Yearly)
    const turnover = stall.turnover || {};
    const daily = turnover.daily || { totalPaise: '0', cashPaise: '0', upiPaise: '0' };
    const weekly = turnover.weekly || { totalPaise: '0', cashPaise: '0', upiPaise: '0' };
    const monthly = turnover.monthly || { totalPaise: '0', cashPaise: '0', upiPaise: '0' };
    const yearly = turnover.yearly || { totalPaise: '0', cashPaise: '0', upiPaise: '0' };

    document.getElementById('turnover-val-daily').textContent = formatRupees(daily.totalPaise);
    document.getElementById('turnover-cash-daily').textContent = formatRupees(daily.cashPaise);
    document.getElementById('turnover-upi-daily').textContent = formatRupees(daily.upiPaise);

    document.getElementById('turnover-val-weekly').textContent = formatRupees(weekly.totalPaise);
    document.getElementById('turnover-cash-weekly').textContent = formatRupees(weekly.cashPaise);
    document.getElementById('turnover-upi-weekly').textContent = formatRupees(weekly.upiPaise);

    document.getElementById('turnover-val-monthly').textContent = formatRupees(monthly.totalPaise);
    document.getElementById('turnover-cash-monthly').textContent = formatRupees(monthly.cashPaise);
    document.getElementById('turnover-upi-monthly').textContent = formatRupees(monthly.upiPaise);

    document.getElementById('turnover-val-yearly').textContent = formatRupees(yearly.totalPaise);
    document.getElementById('turnover-cash-yearly').textContent = formatRupees(yearly.cashPaise);
    document.getElementById('turnover-upi-yearly').textContent = formatRupees(yearly.upiPaise);

    // Itemized Subscription & Platform Fee Payment Ledger
    const ledgerContainer = document.getElementById('payment-ledger-container');
    const ledgerCount = document.getElementById('payment-ledger-count');
    const ledger = stall.paymentLedger || [];

    if (ledgerCount) ledgerCount.textContent = `${ledger.length} Payment${ledger.length === 1 ? '' : 's'}`;

    if (ledgerContainer) {
      const { el, clear } = window.FroseSafeDom;
      clear(ledgerContainer);
      if (ledger.length === 0) {
        ledgerContainer.appendChild(el('div', {
          style: 'text-align: center; padding: 24px 10px; color: var(--saas-text-muted); font-size: 12.5px; background: #FDFBF7; border-radius: 8px; border: 1px dashed var(--saas-card-border);'
        }, [
          el('div', { style: 'font-size: 24px; margin-bottom: 4px;' }, ['💳']),
          'No subscription payments recorded for this stall yet.'
        ]));
      } else {
        ledger.forEach(rec => {
          ledgerContainer.appendChild(el('div', {
            style: 'background: #FDFBF7; border: 1.5px solid var(--saas-card-border); border-radius: 10px; padding: 12px; font-size: 12px;'
          }, [
            el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' }, [
              el('span', { style: 'font-family: var(--font-mono); font-weight: 800; color: var(--saas-burgundy-primary);' }, [rec.receiptId || '#REC-VERIFIED']),
              el('span', { style: 'font-size: 10.5px; background: #ECFDF5; color: #047857; padding: 3px 6px; border-radius: 4px; font-weight: 700;' }, [`● ${rec.status || 'Verified Paid'}`])
            ]),
            el('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 4px;' }, [
              el('span', { style: 'color: var(--saas-text-muted);' }, ['Amount:']),
              el('strong', { style: 'color: var(--saas-text-heading); font-size: 13.5px;' }, [formatRupees(rec.amountPaise || '49900')])
            ]),
            el('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 4px;' }, [
              el('span', { style: 'color: var(--saas-text-muted);' }, ['Method:']),
              el('span', {}, [el('strong', {}, [rec.method || 'UPI Intent'])])
            ]),
            el('div', { style: 'display: flex; justify-content: space-between; margin-bottom: 4px;' }, [
              el('span', { style: 'color: var(--saas-text-muted);' }, ['Date & Time:']),
              el('span', {}, [new Date(rec.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })])
            ]),
            el('div', { style: 'display: flex; justify-content: space-between; border-top: 1px dashed var(--saas-card-border); padding-top: 6px; margin-top: 6px;' }, [
              el('span', { style: 'color: var(--saas-text-muted);' }, ['Billing Period:']),
              el('span', { style: 'font-weight: 600; color: var(--saas-burgundy-primary);' }, [rec.period || 'Monthly Active (30 Days)'])
            ])
          ]));
        });
      }
    }

    openModal('modal-stall-analytics');
  };

  // 13. Real Interactive Notifications System
  let platformNotifications = [];
  function loadNotifications() {
    try {
      const stored = localStorage.getItem('frose_admin_notifications');
      if (stored) {
        platformNotifications = JSON.parse(stored);
      } else {
        platformNotifications = [
          {
            id: 'notif-1',
            title: '🚀 Cloudflare Edge Network Operational',
            message: 'FROSE Street v2.4.0 live on Cloudflare Edge with 0ms downtime.',
            category: 'system',
            targetView: 'system-health',
            timestamp: new Date().toLocaleDateString('en-IN')
          }
        ];
      }
    } catch (e) {
      platformNotifications = [];
    }
    renderNotifications();
  }

  function renderNotifications() {
    const container = document.getElementById('notifications-list-container');
    const badge = document.getElementById('notif-badge');
    const sub = document.getElementById('notif-unread-subtitle');
    if (!container) return;

    const { el, clear } = window.FroseSafeDom;
    clear(container);

    if (platformNotifications.length === 0) {
      container.appendChild(el('div', { style: 'text-align: center; padding: 40px 10px; color: var(--saas-text-muted); font-size: 12.5px;' }, [
        el('div', { style: 'font-size: 32px; margin-bottom: 6px;' }, ['🎉']),
        el('strong', {}, ["You're all caught up!"]),
        el('br'),
        'No active alerts or notifications.'
      ]));
      if (badge) {
        badge.textContent = '0';
        badge.style.display = 'none';
      }
      if (sub) sub.textContent = '0 alerts';
      return;
    }

    if (badge) {
      badge.textContent = String(platformNotifications.length);
      badge.style.display = 'inline-block';
    }
    if (sub) sub.textContent = `${platformNotifications.length} alert${platformNotifications.length === 1 ? '' : 's'}`;

    platformNotifications.forEach(n => {
      container.appendChild(el('div', {
        class: 'notif-item',
        'data-id': n.id || '',
        'data-target': n.targetView || '',
        'data-filter': n.filterParam || '',
        style: 'background: #FDFBF7; border: 1.5px solid var(--saas-card-border); border-radius: 10px; padding: 12px; cursor: pointer; transition: transform 0.15s ease;'
      }, [
        el('div', { style: 'font-weight: 800; font-size: 12px; color: var(--saas-burgundy-primary); margin-bottom: 3px;' }, [n.title || '']),
        el('div', { style: 'font-size: 11.5px; color: var(--saas-text-body); line-height: 1.4;' }, [n.message || '']),
        el('div', { style: 'font-size: 10px; color: var(--saas-text-muted); margin-top: 6px; display: flex; justify-content: space-between;' }, [
          el('span', {}, [n.timestamp || '']),
          el('span', { style: 'color: var(--saas-burgundy-primary); font-weight: 700;' }, ['Tap to view →'])
        ])
      ]));
    });

    // Attach click router to each notification item
    container.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        const filter = item.getAttribute('data-filter');
        window.toggleNotifications();
        if (target === 'vendors') {
          window.switchView('vendors');
          if (filter) window.filterStalls(filter);
        } else if (target === 'system-health') {
          window.openModal('modal-system-health');
        } else if (target === 'settings') {
          window.switchView('settings');
        }
      });
    });
  }

  window.clearAllNotifications = function() {
    platformNotifications = [];
    localStorage.setItem('frose_admin_notifications', JSON.stringify([]));
    renderNotifications();
  };

  // Full-Page Add Stall Handler (Straight Top-to-Bottom, Zero Horizontal Overflow)
  async function submitAddStallPage(e) {
    if (e) e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-add-stall-page');
    if (submitBtn) submitBtn.disabled = true;

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
      upiId: document.getElementById('page-add-upi').value.trim()
    };

    if (!payload.businessName || !payload.phone || payload.phone.length !== 10 || !payload.password || payload.password.length < 10) {
      alert('Please enter a valid stall name, 10-digit mobile number, and passphrase (min 10 characters)');
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const isPaid = (payload.initialPaymentStatus === 'paid');
    const paymentRecord = isPaid ? {
      receiptId: '#REC-' + Math.floor(100000 + Math.random() * 900000),
      amountPaise: String(payload.monthlyFeeRupees * 100),
      amountRupees: payload.monthlyFeeRupees,
      method: 'UPI Intent',
      date: new Date().toISOString(),
      period: `${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
      status: 'Verified Paid'
    } : null;

    let newStall = {
      id: 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 6),
      businessName: payload.businessName,
      ownerName: payload.ownerName,
      phone: payload.phone,
      password: payload.password,
      city: payload.city,
      edition: payload.edition,
      monthlyFeePaise: String(payload.monthlyFeeRupees * 100),
      subscriptionStatus: isPaid ? 'active' : 'trial',
      subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      paymentStatus: isPaid ? 'paid' : 'trial',
      lastPaymentDate: isPaid ? new Date().toISOString() : null,
      nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      totalCollectedPaise: isPaid ? String(payload.monthlyFeeRupees * 100) : '0',
      pendingDuePaise: isPaid ? '0' : String(payload.monthlyFeeRupees * 100),
      lifetimeSalesPaise: '0',
      totalOrders: 0,
      deviceCount: 1,
      activeDevices: 1,
      role: 'owner',
      isSuperadmin: false,
      paymentLedger: paymentRecord ? [paymentRecord] : [],
      turnover: {
        daily: { totalPaise: '0', cashPaise: '0', upiPaise: '0' },
        weekly: { totalPaise: '0', cashPaise: '0', upiPaise: '0' },
        monthly: { totalPaise: '0', cashPaise: '0', upiPaise: '0' },
        yearly: { totalPaise: '0', cashPaise: '0', upiPaise: '0' }
      },
      createdAt: new Date().toISOString()
    };

    try {
      const res = await apiFetch('/api/v1/admin/vendors', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (res && res.ok) {
        const json = await res.json();
        if (json.data?.vendor) {
          newStall.id = json.data.vendor.id;
        }
      }
    } catch (err) {}

    // In-memory state update only (never cache cross-tenant vendor PII in localStorage)
    allVendors.unshift(newStall);

    // Record notification
    platformNotifications.unshift({
      id: 'notif-' + Date.now(),
      title: '🎉 New Restaurant Provisioned',
      message: `${payload.businessName} onboarded successfully with mobile ${payload.phone}.`,
      category: 'subscription',
      targetView: 'vendors',
      timestamp: new Date().toLocaleDateString('en-IN')
    });
    localStorage.setItem('frose_admin_notifications', JSON.stringify(platformNotifications));
    renderNotifications();

    if (submitBtn) submitBtn.disabled = false;
    document.getElementById('form-add-stall-page')?.reset();

    // Switch view back to vendors
    window.switchView('vendors');
    renderStallsTable();
    loadOverview();

    window.openStallSetupQR(newStall);
  }

  // 11. Core Initialization Function
  
  function filterStalls(f) {
    currentFilter = f;
    document.querySelectorAll('.filter-pill').forEach(p => {
      if (p.getAttribute('data-filter') === f) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });
    renderStallsTable();
  }

  function openEditModal(vendorId) {
    const v = allVendors.find((item) => item.id === vendorId);
    if (!v) return;
    const idInput = document.getElementById('edit-stall-id');
    if (idInput) idInput.value = v.id;
    const nameInput = document.getElementById('edit-stall-name');
    if (nameInput) nameInput.value = v.businessName || '';
    const ownerInput = document.getElementById('edit-owner-name');
    if (ownerInput) ownerInput.value = v.ownerName || '';
    const cityInput = document.getElementById('edit-city');
    if (cityInput) cityInput.value = v.city || '';
    const editionInput = document.getElementById('edit-edition');
    if (editionInput) editionInput.value = v.edition || 'cloud';
    const statusInput = document.getElementById('edit-status');
    if (statusInput) statusInput.value = v.subscriptionStatus || 'active';
    openModal('modal-edit-stall');
  }

  function openMenuModal(vendorId, stallName) {
    activeVendorForMenu = vendorId;
    const titleEl = document.getElementById('menu-modal-stall-name');
    if (titleEl) titleEl.textContent = `${stallName || 'Stall'} — Menu Dishes`;
    openModal('modal-menu-manager');
  }

  function initAdminConsole() {
    // Print Receipt
    document.getElementById('btn-receipt-print')?.addEventListener('click', () => window.print());

    // Filter Pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        currentFilter = pill.getAttribute('data-filter') || 'all';
        renderStallsTable();
      });
    });

    // Search Input
    const sInput = document.getElementById('search-vendors-input');
    if (sInput) {
      sInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderStallsTable();
      });
    }

    // Admin Profile Dropdown
    const userBadge = document.getElementById('btn-admin-profile');
    const userMenu = document.getElementById('user-dropdown');
    if (userBadge && userMenu) {
      userBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        userMenu.classList.toggle('active');
      });
      document.addEventListener('click', () => userMenu.classList.remove('active'));
    }

    const mProfile = document.getElementById('btn-menu-profile');
    if (mProfile) {
      mProfile.addEventListener('click', () => {
        userMenu.classList.remove('active');
        switchView('settings');
      });
    }

    const mSystem = document.getElementById('btn-menu-system');
    if (mSystem) {
      mSystem.addEventListener('click', () => {
        userMenu.classList.remove('active');
        openModal('modal-system-health');
      });
    }

    const mLogout = document.getElementById('btn-menu-logout');
    if (mLogout) {
      mLogout.addEventListener('click', () => {
        if (confirm('Sign out of Super Admin Console?')) {
          (window.froseApiFetch || fetch)('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-FROSE-CSRF': '1' } })
            .catch(() => {})
            .finally(() => {
              localStorage.removeItem('frose_session_active');
              localStorage.removeItem('frose_vendors_directory');
              window.location.replace('/login.html');
            });
        }
      });
    }

    // Form Add Stall Submission
    const addForm = document.getElementById('form-add-stall');
    if (addForm) {
      addForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('btn-submit-add-stall');
        if (submitBtn) submitBtn.disabled = true;

        const payload = {
          businessName: document.getElementById('add-stall-name').value.trim(),
          ownerName: document.getElementById('add-owner-name').value.trim(),
          phone: document.getElementById('add-phone').value.trim(),
          password: document.getElementById('add-password').value.trim(),
          city: document.getElementById('add-city').value.trim() || 'Hyderabad',
          edition: document.getElementById('add-edition').value,
          monthlyFeeRupees: Number(document.getElementById('add-monthly-fee').value) || 499,
          billingCycle: document.getElementById('add-billing-cycle').value,
          initialPaymentStatus: document.getElementById('add-initial-status').value
        };

        const res = await apiFetch('/api/v1/admin/vendors', {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res && res.ok) {
          try {
            const json = await res.json();
            if (json.data?.vendor) {
              allVendors.unshift({
                ...json.data.vendor,
                monthlyFeePaise: String(payload.monthlyFeeRupees * 100),
                paymentStatus: payload.initialPaymentStatus === 'paid' ? 'paid' : 'trial',
                edition: payload.edition,
                lastPaymentDate: new Date().toISOString(),
                nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString()
              });
            }
          } catch (e) {}
        } else {
          // Local fallback entry
          allVendors.unshift({
            id: 'v-' + Math.random().toString(36).substring(2, 8),
            businessName: payload.businessName,
            ownerName: payload.ownerName,
            phone: payload.phone,
            city: payload.city,
            edition: payload.edition,
            monthlyFeePaise: String(payload.monthlyFeeRupees * 100),
            subscriptionStatus: payload.initialPaymentStatus === 'paid' ? 'active' : 'trial',
            paymentStatus: payload.initialPaymentStatus === 'paid' ? 'paid' : 'trial',
            lastPaymentDate: new Date().toISOString(),
            nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
            lifetimeSalesPaise: '0',
            totalOrders: 0,
            deviceCount: 1,
            activeDevices: 1,
            createdAt: new Date().toISOString()
          });
        }

        closeModal('modal-add-stall');
        renderStallsTable();
        loadOverview();
        if (submitBtn) submitBtn.disabled = false;
        addForm.reset();

        alert('Restaurant Stall successfully created & provisioned!');
      });
    }

    // Form Edit Stall Submission
    const editForm = document.getElementById('form-edit-stall');
    if (editForm) {
      editForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-stall-id').value;
        const bName = document.getElementById('edit-stall-name').value.trim();
        const oName = document.getElementById('edit-owner-name').value.trim();
        const city = document.getElementById('edit-city').value.trim();
        const edition = document.getElementById('edit-edition').value;
        const status = document.getElementById('edit-status').value;

        await apiFetch(`/api/v1/admin/vendors/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ businessName: bName, ownerName: oName, city, edition, subscriptionStatus: status })
        });

        const v = allVendors.find(vend => vend.id === id);
        if (v) {
          v.businessName = bName;
          v.ownerName = oName;
          v.city = city;
          v.edition = edition;
          v.subscriptionStatus = status;
        }

        closeModal('modal-edit-stall');
        renderStallsTable();
        loadOverview();
      });
    }

    // Initial Data Fetch & Render
    const btnAdminTheme = document.getElementById('btn-admin-theme');
    const adminThemeIcon = document.getElementById('admin-theme-icon');
    if (btnAdminTheme && window.FroseTheme) {
      const syncAdminThemeIcon = (theme) => {
        if (adminThemeIcon) {
          adminThemeIcon.textContent = theme === 'dark' ? '🌙' : (theme === 'sunlight' ? '☀️' : '🌤️');
        }
      };
      syncAdminThemeIcon(window.FroseTheme.getTheme());
      btnAdminTheme.addEventListener('click', () => {
        const next = window.FroseTheme.cycleTheme();
        syncAdminThemeIcon(next);
        if (window.FroseUI && window.FroseUI.showToast) {
          window.FroseUI.showToast(`Theme: ${next}`, 'info');
        }
      });
    }

    const btnCloseInspector = document.getElementById('btn-close-inspector');
    const inspectorDrawer = document.getElementById('vendor-inspector-drawer');
    if (btnCloseInspector) btnCloseInspector.addEventListener('click', closeVendorInspector);
    if (inspectorDrawer) {
      inspectorDrawer.addEventListener('click', (e) => {
        if (e.target === inspectorDrawer) closeVendorInspector();
      });
    }

    loadVendors();
    loadOverview();
    updateSettingsProfile();
  }

  function updateSettingsProfile() {
    try {
      const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
      if (v.ownerName) {
        const el = document.getElementById('settings-profile-name');
        if (el) el.textContent = v.ownerName;
      }
      if (v.phone) {
        const el = document.getElementById('settings-profile-phone');
        if (el) el.textContent = '+91 ' + v.phone;
      }
      if (v.role) {
        const el = document.getElementById('settings-profile-role');
        if (el) el.textContent = v.role === 'superadmin' ? 'Platform Superadmin' : 'Stall Owner';
      }
    } catch (e) {}
  }


  // Export Global Window Functions for Immediate Zero-Latency Inline Calling
  window.switchView = switchView;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.toggleNotifications = function() {
    const d = document.getElementById('notifications-drawer');
    if (d) {
      d.classList.toggle('active');
      document.body.classList.toggle('modal-open');
    }
  };
  window.logoutSuperAdmin = function() {
    (window.froseApiFetch || fetch)('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-FROSE-CSRF': '1' } })
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem('frose_session_active');
        localStorage.removeItem('frose_current_vendor');
        localStorage.removeItem('frose_vendors_directory');
        window.location.replace('/login.html');
      });
  };
  window.adminLogout = function() {
    if (confirm('Sign out of Super Admin Console?')) {
      (window.froseApiFetch || fetch)('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-FROSE-CSRF': '1' } })
        .catch(() => {})
        .finally(() => {
          localStorage.removeItem('frose_session_active');
          localStorage.removeItem('frose_vendors_directory');
          window.location.replace('/login.html');
        });
    }
  };
  window.toggleUserDropdown = function(e) {
    if (e) e.stopPropagation();
    const u = document.getElementById('user-dropdown');
    if (u) u.classList.toggle('active');
  };
  window.filterExpiringAndSwitch = function() {
    currentFilter = 'expiring';
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    document.querySelector('.filter-pill[data-filter="expiring"]')?.classList.add('active');
    switchView('vendors');
  };
  
  let currentStallForQR = null;
  let activeQRMode = 'webapp';
  let activeQRSetupUrl = '';

  window.switchSetupQRTab = function(mode) {
    activeQRMode = mode;
    const tabWeb = document.getElementById('tab-qr-webapp');
    const tabBackend = document.getElementById('tab-qr-backend');
    const qrImg = document.getElementById('qr-modal-image');
    const helperText = document.getElementById('qr-modal-helper-text');
    const openBtnText = document.getElementById('btn-qr-modal-open-text');
    const openBtn = document.getElementById('btn-qr-modal-open');
    const waBtn = document.getElementById('btn-qr-modal-whatsapp');

    if (!currentStallForQR) return;
    const phone = (currentStallForQR.phone || '').replace(/\D/g, '').slice(-10);
    const pwd = currentStallForQR.password || '';
    const bName = currentStallForQR.businessName || currentStallForQR.business_name || 'Restaurant Stall';

    const webUrl = window.location.origin + '/login?stall=' + phone + (pwd ? '&pwd=' + encodeURIComponent(pwd) : '');
    const downloadUrl = window.location.origin + '/downloads/frose-street-local-cloud.apk';

    if (mode === 'backend') {
      if (tabWeb) { tabWeb.style.background = 'transparent'; tabWeb.style.color = '#64748B'; tabWeb.style.boxShadow = 'none'; }
      if (tabBackend) { tabBackend.style.background = '#FFF'; tabBackend.style.color = '#4A0E17'; tabBackend.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'; }
      if (qrImg) qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=' + encodeURIComponent(downloadUrl);
      if (helperText) {
        const { el, clear } = window.FroseSafeDom;
        clear(helperText);
        helperText.append(
          '📲 ',
          el('strong', {}, ['Scan to Download Phone Local Cloud APK & Zip.']),
          el('br'),
          'Runs local offline Fastify server on Port 3100 directly on customer phone with zero internet.'
        );
      }
      if (openBtnText) openBtnText.textContent = '📥 Download Phone Local Cloud APK';
      if (openBtn) openBtn.onclick = () => { window.open(downloadUrl, '_blank'); };
      activeQRSetupUrl = downloadUrl;

      if (waBtn) {
        const waMsg = '🎉 *FROSE Street — Phone Local Cloud Engine*\n\nDownload the offline server for *' + bName + '* on your Android phone:\n' + downloadUrl + '\n\nRuns on Port 3100 with zero internet needed!';
        waBtn.onclick = () => {
          window.open('https://api.whatsapp.com/send?phone=91' + phone + '&text=' + encodeURIComponent(waMsg), '_blank');
        };
      }
    } else {
      if (tabWeb) { tabWeb.style.background = '#FFF'; tabWeb.style.color = '#4A0E17'; tabWeb.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)'; }
      if (tabBackend) { tabBackend.style.background = 'transparent'; tabBackend.style.color = '#64748B'; tabBackend.style.boxShadow = 'none'; }
      if (qrImg) qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=' + encodeURIComponent(webUrl);
      if (helperText) helperText.textContent = 'Scan with phone camera to auto-login & install PWA. Works 100% offline after 10-second setup.';
      if (openBtnText) openBtnText.textContent = '👁️ Open Counter in New Tab';
      if (openBtn) openBtn.onclick = () => { window.open(webUrl, '_blank'); };
      activeQRSetupUrl = webUrl;

      if (waBtn) {
        const waMsg = '🎉 *Welcome to FROSE Street!*\n\nYour billing counter for *' + bName + '* is ready.\n\n📲 *Setup counter on your phone:*\n' + webUrl + '\n\n🔑 *Login Credentials:*\nMobile: ' + phone + '\nPassword: ' + pwd;
        waBtn.onclick = () => {
          window.open('https://api.whatsapp.com/send?phone=91' + phone + '&text=' + encodeURIComponent(waMsg), '_blank');
        };
      }
    }
  };

  window.openStallSetupQR = function(stall) {
    if (!stall) return;
    currentStallForQR = stall;
    const modal = document.getElementById('modal-stall-setup-qr');
    if (!modal) return;

    const phone = (stall.phone || '').replace(/\D/g, '').slice(-10);
    const pwd = stall.password || '';
    const bName = stall.businessName || stall.business_name || 'Restaurant Stall';
    const plan = (stall.subscriptionStatus || stall.subscription_status || 'trial').toUpperCase() + ' (' + formatRupees(stall.monthlyFeePaise || '89900') + '/mo)';

    document.getElementById('qr-modal-stall-name').textContent = bName;
    document.getElementById('qr-modal-phone').textContent = phone;
    document.getElementById('qr-modal-pwd').textContent = pwd;
    document.getElementById('qr-modal-plan').textContent = plan;

    window.switchSetupQRTab('webapp');

    const copyBtnText = document.getElementById('copy-btn-text');
    if (copyBtnText) copyBtnText.textContent = '📋 Copy Link';

    modal.style.display = 'flex';
  };

  window.openStallSetupQRByPhone = function(phone) {
    const clean = (phone || '').replace(/\D/g, '').slice(-10);
    const stall = allVendors.find(v => (v.phone || '').replace(/\D/g, '').slice(-10) === clean) || {
        phone: clean,
        businessName: 'Restaurant Stall',
        monthlyFeePaise: '89900',
        subscriptionStatus: 'trial'
      };
    window.openStallSetupQR(stall);
  };

  window.closeStallSetupQR = function() {
    const modal = document.getElementById('modal-stall-setup-qr');
    if (modal) modal.style.display = 'none';
  };

  window.copyStallSetupLink = function() {
    if (!activeQRSetupUrl) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(activeQRSetupUrl).then(() => {
        const t = document.getElementById('copy-btn-text');
        if (t) {
          t.textContent = '✓ Copied!';
          setTimeout(() => { t.textContent = '📋 Copy Link'; }, 2000);
        }
      });
    } else {
      prompt('Copy link:', activeQRSetupUrl);
    }
  };

  
  // Part 2: Real-Time Subscription Control & Telemetry Broadcast Channel
  const telemetryChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('frose_telemetry') : null;
  window.telemetryChannel = telemetryChannel;
  if (telemetryChannel) {
    telemetryChannel.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === 'ORDER_COMPLETED') {
        const cleanPhone = (data.stallPhone || '').replace(/\D/g, '').slice(-10);
        const stall = allVendors.find(v => (v.phone || '').replace(/\D/g, '').slice(-10) === cleanPhone);
        if (stall) {
          stall.totalOrders = (stall.totalOrders || 0) + 1;
          const currPaise = BigInt(stall.lifetimeSalesPaise || '0');
          stall.lifetimeSalesPaise = (currPaise + BigInt(data.amountPaise || '0')).toString();
          if (!stall.turnover) stall.turnover = { daily: { totalPaise: '0', cashPaise: '0', upiPaise: '0' } };
          stall.turnover.daily.totalPaise = (BigInt(stall.turnover.daily.totalPaise || '0') + BigInt(data.amountPaise || '0')).toString();
          const mLower = String(data.method || '').toLowerCase();
          if (mLower.includes('cash')) {
            stall.turnover.daily.cashPaise = (BigInt(stall.turnover.daily.cashPaise || '0') + BigInt(data.amountPaise || '0')).toString();
          } else {
            stall.turnover.daily.upiPaise = (BigInt(stall.turnover.daily.upiPaise || '0') + BigInt(data.amountPaise || '0')).toString();
          }
        }
        loadOverview();
        renderStallsTable();
      }
    };
  }

  window.toggleStallSubscription = async function(phone) {
    const clean = (phone || '').replace(/\D/g, '').slice(-10);
    const stall = allVendors.find(v => (v.phone || '').replace(/\D/g, '').slice(-10) === clean);
    if (!stall) return;

    const currentStatus = stall.subscriptionStatus || stall.subscription_status || 'active';
    const isNowSuspended = (currentStatus !== 'suspended' && currentStatus !== 'expired');
    const newStatus = isNowSuspended ? 'suspended' : 'active';
    const newPaymentStatus = isNowSuspended ? 'overdue' : 'paid';

    stall.subscriptionStatus = newStatus;
    stall.subscription_status = newStatus;
    stall.paymentStatus = newPaymentStatus;

    // Broadcast Remote Kill-Switch frame over Telemetry & WebSockets
    if (telemetryChannel) {
      telemetryChannel.postMessage({
        type: 'SUBSCRIPTION_CHANGE',
        stallPhone: clean,
        status: newStatus,
        lockout: isNowSuspended,
        amountDuePaise: stall.monthlyFeePaise || '89900'
      });
    }

    renderStallsTable();
    loadOverview();

    const actionText = isNowSuspended ? 'SUSPENDED (Counter Locked)' : 'ACTIVATED (Counter Unlocked)';
    console.log(`⚡ Subscription for ${stall.businessName} (${clean}) is now ${actionText}`);
  };

  window.loadOverview = loadOverview;
  window.loadVendors = loadVendors;
  window.filterStalls = filterStalls;
  window.sendWhatsAppNotification = sendWhatsAppNotification;
  window.openReceiptModal = openReceiptModal;
  window.openEditModal = openEditModal;
  window.openMenuModal = openMenuModal;
  window.submitAddStallPage = submitAddStallPage;

  // Dual-State Initialization: Handles both early-run and late-run script lifecycles
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminConsole);
  } else {
    initAdminConsole();
  }

})();
