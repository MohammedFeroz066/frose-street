(function () {
  'use strict';

  // Guard against unauthenticated visitors
  const token = localStorage.getItem('frose_auth_token');
  if (!token) {
    window.location.replace('/login');
    return;
  }

  // DOM Elements
  const statTotalStalls = document.getElementById('stat-total-stalls');
  const statActiveSub = document.getElementById('stat-active-sub');
  const statTrialSub = document.getElementById('stat-trial-sub');
  const statGrossVolume = document.getElementById('stat-gross-volume');
  const statCashSales = document.getElementById('stat-cash-sales');
  const statUpiSales = document.getElementById('stat-upi-sales');
  const statExpiringSoon = document.getElementById('stat-expiring-soon');
  const statTodayOrders = document.getElementById('stat-today-orders');
  const statTotalOrders = document.getElementById('stat-total-orders');

  const countAll = document.getElementById('count-all');
  const countActive = document.getElementById('count-active');
  const countTrial = document.getElementById('count-trial');
  const countExpiring = document.getElementById('count-expiring');
  const countExpired = document.getElementById('count-expired');

  const searchInput = document.getElementById('stall-search-input');
  const filterPills = document.querySelectorAll('.filter-pill');
  const tableBody = document.getElementById('stalls-table-body');
  const btnSignout = document.getElementById('btn-admin-signout');

  // Modals
  const modalAddStall = document.getElementById('modal-add-stall');
  const modalEditStall = document.getElementById('modal-edit-stall');
  const modalMenuManager = document.getElementById('modal-menu-manager');

  const btnOpenAddStall = document.getElementById('btn-open-add-stall');
  const formAddStall = document.getElementById('form-add-stall');
  const formEditStall = document.getElementById('form-edit-stall');
  const formAddDish = document.getElementById('form-add-dish');

  let allVendors = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let activeVendorForMenu = null;

  // Format integer paise into Indian Rupee format (e.g. ₹1,49,900)
  function formatRupees(paise) {
    const p = typeof paise === 'string' ? BigInt(paise) : BigInt(paise || 0);
    const rupees = Number(p / 100n);
    return '₹' + rupees.toLocaleString('en-IN');
  }

  // Generic authenticated API fetch helper
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    };
    const res = await fetch(endpoint, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      alert('Super Admin session expired or unauthorized. Please sign in again.');
      localStorage.removeItem('frose_auth_token');
      window.location.replace('/login');
      return null;
    }
    return res;
  }

  // Load Platform Overview KPIs
  async function loadOverview() {
    try {
      const res = await apiFetch('/api/v1/admin/overview');
      if (!res || !res.ok) return;
      const json = await res.json();
      const stats = json.data;

      statTotalStalls.textContent = stats.totalVendors;
      statActiveSub.textContent = `${stats.activeVendors} Active`;
      statTrialSub.textContent = `${stats.trialVendors} Trial`;

      statGrossVolume.textContent = formatRupees(stats.grossSalesPaise);
      statCashSales.textContent = formatRupees(stats.cashSalesPaise);
      statUpiSales.textContent = formatRupees(stats.upiSalesPaise);

      statExpiringSoon.textContent = stats.expiringVendors;
      statTodayOrders.textContent = stats.todayOrders;
      statTotalOrders.textContent = stats.totalOrders;

      countAll.textContent = stats.totalVendors;
      countActive.textContent = stats.activeVendors;
      countTrial.textContent = stats.trialVendors;
      countExpiring.textContent = stats.expiringVendors;
      countExpired.textContent = stats.expiredVendors;
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }

  // Load and Render Stalls Table
  async function loadVendors() {
    try {
      const res = await apiFetch('/api/v1/admin/vendors');
      if (!res || !res.ok) return;
      const json = await res.json();
      allVendors = json.data || [];
      renderTable();
    } catch (err) {
      console.error('Failed to load vendors:', err);
    }
  }

  function getStatusBadge(v) {
    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;
    const expiresAt = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : 0;

    if (v.subscriptionStatus === 'trial') {
      return '<span class="status-badge status-trial">Trial</span>';
    }
    if (expiresAt < now || v.subscriptionStatus === 'expired') {
      return '<span class="status-badge status-expired">Expired</span>';
    }
    if (expiresAt <= in7Days) {
      return '<span class="status-badge status-expiring">Expiring Soon</span>';
    }
    return '<span class="status-badge status-active">Active</span>';
  }

  function renderTable() {
    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;

    const filtered = allVendors.filter((v) => {
      // Filter tab
      const expiresAt = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : 0;
      if (currentFilter === 'active') {
        if (expiresAt < now || v.subscriptionStatus === 'expired' || v.subscriptionStatus === 'trial') return false;
      } else if (currentFilter === 'trial') {
        if (v.subscriptionStatus !== 'trial') return false;
      } else if (currentFilter === 'expiring') {
        if (expiresAt < now || expiresAt > in7Days) return false;
      } else if (currentFilter === 'expired') {
        if (expiresAt >= now && v.subscriptionStatus !== 'expired') return false;
      }

      // Search query
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = (v.businessName || '').toLowerCase().includes(q);
        const matchesOwner = (v.ownerName || '').toLowerCase().includes(q);
        const matchesPhone = (v.phone || '').includes(q);
        const matchesCity = (v.city || '').toLowerCase().includes(q);
        if (!matchesName && !matchesOwner && !matchesPhone && !matchesCity) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 32px; color: #94A3B8;">No restaurants found matching filters.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered
      .map((v) => {
        const expiryFormatted = v.subscriptionExpiresAt
          ? new Date(v.subscriptionExpiresAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : '--';

        return `
        <tr>
          <td>
            <div class="stall-name-col">${escapeHtml(v.businessName)}</div>
            <div class="stall-sub-text">ID: ${escapeHtml(v.id)}</div>
          </td>
          <td>
            <div style="font-weight: 700; color: #1E293B;">${escapeHtml(v.ownerName || '--')}</div>
            <div class="stall-sub-text">📞 ${escapeHtml(v.phone)}</div>
          </td>
          <td>
            <div style="font-weight: 600;">${escapeHtml(v.city || 'Hyderabad')}</div>
            <div class="stall-sub-text" style="text-transform: capitalize;">${escapeHtml(v.edition || 'cloud')} Edition</div>
          </td>
          <td>${getStatusBadge(v)}</td>
          <td>
            <div style="font-weight: 700;">${expiryFormatted}</div>
          </td>
          <td>
            <div style="font-weight: 800; color: #0284C7;">${formatRupees(v.lifetimeSalesPaise)}</div>
            <div class="stall-sub-text">${v.totalOrders || 0} orders</div>
          </td>
          <td>
            <div class="action-btn-group">
              <button class="btn-action-sm btn-edit-stall" data-id="${v.id}" title="Edit Details & Password">⚙ Edit</button>
              <button class="btn-action-sm btn-action-menu" data-id="${v.id}" data-name="${escapeHtml(v.businessName)}" title="Manage Menu Items">🍽 Menu</button>
              <button class="btn-action-sm btn-extend-sub" data-id="${v.id}" title="+30 Days Subscription">+30D</button>
            </div>
          </td>
        </tr>
      `;
      })
      .join('');

    // Attach row events
    document.querySelectorAll('.btn-edit-stall').forEach((btn) => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
    document.querySelectorAll('.btn-action-menu').forEach((btn) => {
      btn.addEventListener('click', () => openMenuModal(btn.dataset.id, btn.dataset.name));
    });
    document.querySelectorAll('.btn-extend-sub').forEach((btn) => {
      btn.addEventListener('click', () => quickExtendSubscription(btn.dataset.id));
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, (tag) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  // Filter & Search Handlers
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      renderTable();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = (e.target.value || '').trim();
    renderTable();
  });

  // Modal Closures
  document.querySelectorAll('.btn-modal-close').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.close;
      const el = document.getElementById(targetId);
      if (el) el.classList.remove('active');
    });
  });

  // Add Restaurant Modal
  btnOpenAddStall.addEventListener('click', () => {
    formAddStall.reset();
    modalAddStall.classList.add('active');
  });

  formAddStall.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      businessName: document.getElementById('add-stall-name').value.trim(),
      ownerName: document.getElementById('add-owner-name').value.trim(),
      phone: document.getElementById('add-phone').value.trim(),
      password: document.getElementById('add-password').value,
      quickPin: document.getElementById('add-pin').value.trim(),
      city: document.getElementById('add-city').value.trim(),
      edition: document.getElementById('add-edition').value,
      subscriptionDays: parseInt(document.getElementById('add-sub-days').value, 10),
    };

    try {
      const res = await apiFetch('/api/v1/admin/vendors', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res && res.ok) {
        alert('✅ Restaurant onboarded successfully!');
        modalAddStall.classList.remove('active');
        await loadOverview();
        await loadVendors();
      } else {
        const err = await res.json();
        alert(err.detail || err.message || 'Failed to create restaurant');
      }
    } catch {
      alert('Network error connecting to server');
    }
  });

  // Edit Stall Modal
  function openEditModal(vendorId) {
    const v = allVendors.find((item) => item.id === vendorId);
    if (!v) return;

    document.getElementById('edit-vendor-id').value = v.id;
    document.getElementById('edit-stall-name').value = v.businessName || '';
    document.getElementById('edit-owner-name').value = v.ownerName || '';
    document.getElementById('edit-phone').value = v.phone || '';
    document.getElementById('edit-city').value = v.city || 'Hyderabad';
    document.getElementById('edit-edition').value = v.edition || 'cloud';

    if (v.subscriptionExpiresAt) {
      const dt = new Date(v.subscriptionExpiresAt).toISOString().split('T')[0];
      document.getElementById('edit-expiry-date').value = dt;
    } else {
      document.getElementById('edit-expiry-date').value = '';
    }

    document.getElementById('edit-new-password').value = '';
    document.getElementById('edit-new-pin').value = '';

    modalEditStall.classList.add('active');
  }

  formEditStall.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vendorId = document.getElementById('edit-vendor-id').value;
    const payload = {
      businessName: document.getElementById('edit-stall-name').value.trim(),
      ownerName: document.getElementById('edit-owner-name').value.trim(),
      phone: document.getElementById('edit-phone').value.trim(),
      city: document.getElementById('edit-city').value.trim(),
      edition: document.getElementById('edit-edition').value,
    };

    const expiryVal = document.getElementById('edit-expiry-date').value;
    if (expiryVal) {
      payload.subscriptionExpiresAt = new Date(expiryVal + 'T23:59:59Z').toISOString();
      payload.subscriptionStatus = new Date(payload.subscriptionExpiresAt).getTime() > Date.now() ? 'active' : 'expired';
    }

    const newPwd = document.getElementById('edit-new-password').value;
    if (newPwd) payload.password = newPwd;

    const newPin = document.getElementById('edit-new-pin').value.trim();
    if (newPin) payload.quickPin = newPin;

    try {
      const res = await apiFetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res && res.ok) {
        alert('✅ Restaurant details and credentials updated!');
        modalEditStall.classList.remove('active');
        await loadOverview();
        await loadVendors();
      } else {
        const err = await res.json();
        alert(err.detail || err.message || 'Failed to update restaurant');
      }
    } catch {
      alert('Network error connecting to server');
    }
  });

  // Quick 1-Click +30 Days Renewal
  async function quickExtendSubscription(vendorId) {
    const v = allVendors.find((item) => item.id === vendorId);
    if (!v) return;

    const curExpiry = v.subscriptionExpiresAt ? new Date(v.subscriptionExpiresAt).getTime() : Date.now();
    const baseTime = Math.max(Date.now(), curExpiry);
    const newExpiry = new Date(baseTime + 30 * 24 * 3600 * 1000).toISOString();

    if (!confirm(`Extend subscription for "${v.businessName}" by 30 days?`)) return;

    try {
      const res = await apiFetch(`/api/v1/admin/vendors/${vendorId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          subscriptionStatus: 'active',
          subscriptionExpiresAt: newExpiry,
        }),
      });
      if (res && res.ok) {
        await loadOverview();
        await loadVendors();
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Menu Management Modal
  async function openMenuModal(vendorId, stallName) {
    activeVendorForMenu = vendorId;
    document.getElementById('menu-modal-stall-name').textContent = `${stallName} — Menu Dishes`;
    modalMenuManager.classList.add('active');
    await loadMenuDishes();
  }

  async function loadMenuDishes() {
    const listEl = document.getElementById('dish-items-list');
    listEl.innerHTML = `<div style="text-align: center; color: #94A3B8; padding: 20px;">Loading menu dishes...</div>`;

    try {
      const res = await apiFetch(`/api/v1/admin/vendors/${activeVendorForMenu}/menu`);
      if (!res || !res.ok) return;
      const json = await res.json();
      const dishes = json.data || [];

      if (dishes.length === 0) {
        listEl.innerHTML = `<div style="text-align: center; color: #94A3B8; padding: 20px;">No dishes in menu yet. Use form above to add dishes.</div>`;
        return;
      }

      listEl.innerHTML = dishes
        .map((d) => `
        <div style="display: flex; align-items: center; justify-content: space-between; background: #FFFFFF; border: 1.5px solid var(--admin-border); border-radius: 8px; padding: 10px 14px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">${escapeHtml(d.emoji_icon || '🍽️')}</span>
            <div>
              <div style="font-weight: 700; font-size: 13px; color: var(--admin-navy);">${escapeHtml(d.name)}</div>
              <div style="font-size: 11px; color: #64748B;">Category: ${escapeHtml(d.category || 'Main')} &bull; Status: ${d.is_available ? '<span style="color:#16A34A;font-weight:700;">In Stock</span>' : '<span style="color:#DC2626;font-weight:700;">Sold Out</span>'}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <strong style="color: #0284C7; font-size: 14px;">₹${(Number(d.price_paise) / 100).toFixed(0)}</strong>
            <button class="btn-action-sm btn-toggle-dish" data-id="${d.id}" data-avail="${d.is_available}">
              ${d.is_available ? 'Mark Out' : 'Mark In'}
            </button>
          </div>
        </div>
      `)
        .join('');

      document.querySelectorAll('.btn-toggle-dish').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const itemId = btn.dataset.id;
          const currentAvail = btn.dataset.avail === 'true';
          await apiFetch(`/api/v1/admin/vendors/${activeVendorForMenu}/menu/${itemId}`, {
            method: 'PATCH',
            body: JSON.stringify({ isAvailable: !currentAvail }),
          });
          await loadMenuDishes();
        });
      });
    } catch (err) {
      console.error(err);
    }
  }

  formAddDish.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeVendorForMenu) return;

    const name = document.getElementById('dish-name').value.trim();
    const priceRupees = parseFloat(document.getElementById('dish-price').value);
    const category = document.getElementById('dish-category').value.trim();

    if (!name || isNaN(priceRupees) || priceRupees <= 0) {
      alert('Please enter valid dish name and price');
      return;
    }

    try {
      const res = await apiFetch(`/api/v1/admin/vendors/${activeVendorForMenu}/menu`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          pricePaise: Math.round(priceRupees * 100),
          category: category || 'Main',
          emojiIcon: '🍽️',
        }),
      });

      if (res && res.ok) {
        formAddDish.reset();
        await loadMenuDishes();
      } else {
        const err = await res.json();
        alert(err.detail || err.message || 'Failed to add dish');
      }
    } catch {
      alert('Network error connecting to server');
    }
  });

  // Sign Out Handler
  btnSignout.addEventListener('click', () => {
    if (confirm('Sign out of Super Admin Console?')) {
      localStorage.removeItem('frose_auth_token');
      localStorage.removeItem('frose_current_vendor');
      localStorage.removeItem('frose_user_role');
      window.location.replace('/login');
    }
  });

  // Initial Boot
  loadOverview();
  loadVendors();
})();
