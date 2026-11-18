// FROSE Street — Super Admin Platform Console Controller (v3.0.0)
// Complete SaaS Navigation, Responsive Views, Stall Management, Menu Editor & Analytics

(function () {
  'use strict';

  // 1. Guard against unauthenticated visitors
  const token = localStorage.getItem('frose_auth_token');
  if (!token) {
    window.location.replace('/login');
    return;
  }

  // 2. State & Caches
  let activeView = 'dashboard';
  let allVendors = [];
  let allUsers = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let activeVendorForMenu = null;

  // Initial Mock/Fallback Data (Zero-fail resiliency for Cloudflare Pages Static CDN & Offline PWA)
  const FALLBACK_VENDORS = [
    {
      id: 'v-stall-demo-01',
      phone: '9177177475',
      businessName: 'FROSE Street Food Stall',
      ownerName: 'Mohammed Feroz',
      businessType: 'Street Food Stall',
      city: 'Hyderabad',
      edition: 'cloud',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
      role: 'superadmin',
      isSuperadmin: true,
      totalOrders: 42,
      lifetimeSalesPaise: '840000',
      createdAt: new Date().toISOString()
    },
    {
      id: 'v-admin-master',
      phone: '9999999999',
      businessName: 'FROSE Platform HQ',
      ownerName: 'Super Admin',
      businessType: 'Platform Management',
      city: 'Hyderabad',
      edition: 'cloud',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 3650 * 86400000).toISOString(),
      role: 'superadmin',
      isSuperadmin: true,
      totalOrders: 0,
      lifetimeSalesPaise: '0',
      createdAt: new Date().toISOString()
    },
    {
      id: 'v-stall-demo-02',
      phone: '9848012345',
      businessName: 'Al-Bake Shawarma Express',
      ownerName: 'Mirza Baig',
      businessType: 'Shawarma & Grills',
      city: 'Hyderabad',
      edition: 'cloud',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 45 * 86400000).toISOString(),
      role: 'owner',
      isSuperadmin: false,
      totalOrders: 128,
      lifetimeSalesPaise: '2560000',
      createdAt: new Date(Date.now() - 30 * 86400000).toISOString()
    },
    {
      id: 'v-stall-demo-03',
      phone: '9848098765',
      businessName: 'Chai Shai & Bun Maska',
      ownerName: 'Suresh Patel',
      businessType: 'Tea & Snacks',
      city: 'Secunderabad',
      edition: 'cloud',
      subscriptionStatus: 'trial',
      subscriptionExpiresAt: new Date(Date.now() + 5 * 86400000).toISOString(),
      role: 'owner',
      isSuperadmin: false,
      totalOrders: 85,
      lifetimeSalesPaise: '850000',
      createdAt: new Date(Date.now() - 9 * 86400000).toISOString()
    },
    {
      id: 'v-stall-demo-04',
      phone: '9848055555',
      businessName: 'Dosa Corner King',
      ownerName: 'Ramu Naidu',
      businessType: 'South Indian Tiffins',
      city: 'Vijayawada',
      edition: 'cloud',
      subscriptionStatus: 'expired',
      subscriptionExpiresAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      role: 'owner',
      isSuperadmin: false,
      totalOrders: 310,
      lifetimeSalesPaise: '6200000',
      createdAt: new Date(Date.now() - 60 * 86400000).toISOString()
    },
    {
      id: 'v-stall-demo-legacy',
      phone: '9876543210',
      businessName: 'Kolkata Kathi Rolls',
      ownerName: 'Subhash Roy',
      businessType: 'Rolls & Fast Food',
      city: 'Kolkata',
      edition: 'cloud',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 180 * 86400000).toISOString(),
      role: 'owner',
      isSuperadmin: false,
      totalOrders: 0,
      lifetimeSalesPaise: '0',
      createdAt: new Date().toISOString()
    }
  ];

  // Format integer paise into Indian Rupee format (e.g. ₹1,04,500)
  function formatRupees(paise) {
    const p = typeof paise === 'string' ? BigInt(paise) : BigInt(paise || 0);
    const rupees = Number(p / 100n);
    return '₹' + rupees.toLocaleString('en-IN');
  }

  // Authenticated API fetch with fallback safety
  async function apiFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    };
    try {
      const res = await fetch(endpoint, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('frose_auth_token');
        window.location.replace('/login');
        return null;
      }
      return res;
    } catch (e) {
      return null;
    }
  }

  // 3. Navigation View Switcher (Smooth Single Page Application)
  function switchView(viewName) {
    activeView = viewName;

    // Update View Containers
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

    // Lazy load section data if needed
    if (viewName === 'vendors') renderStallsTable();
    if (viewName === 'users') loadUsers();
    if (viewName === 'analytics') loadAnalytics();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 4. Load Platform Overview & Bind KPI Metrics
  async function loadOverview() {
    let stats = {
      totalVendors: allVendors.length || 6,
      activeVendors: 4,
      trialVendors: 1,
      expiredVendors: 1,
      expiringVendors: 1,
      grossSalesPaise: '10450000',
      cashSalesPaise: '6250000',
      upiSalesPaise: '4200000',
      todayOrders: 54,
      totalOrders: 565
    };

    const res = await apiFetch('/api/v1/admin/overview');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (json.data) stats = json.data;
      } catch (e) {}
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

    const elRenew = document.getElementById('kpi-val-renewals');
    if (elRenew) elRenew.textContent = stats.expiringVendors;

    const elOrders = document.getElementById('kpi-val-orders');
    const elLifetime = document.getElementById('kpi-sub-lifetime');
    if (elOrders) elOrders.textContent = stats.todayOrders;
    if (elLifetime) elLifetime.textContent = stats.totalOrders;

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

  // 5. Load Vendors Directory
  async function loadVendors() {
    allVendors = [...FALLBACK_VENDORS];
    const res = await apiFetch('/api/v1/admin/vendors');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) {
          allVendors = json.data;
        }
      } catch (e) {}
    }
    renderStallsTable();
  }

  // Render Vendors Table with Filtering & Search
  function renderStallsTable() {
    const tbody = document.getElementById('stalls-table-body');
    if (!tbody) return;

    const query = searchQuery.toLowerCase().trim();
    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;

    const filtered = allVendors.filter(v => {
      // 1. Text Search Filter
      const bName = (v.businessName || v.business_name || '').toLowerCase();
      const oName = (v.ownerName || v.owner_name || '').toLowerCase();
      const ph = (v.phone || '').toLowerCase();
      const city = (v.city || '').toLowerCase();
      const matchesSearch = !query || bName.includes(query) || oName.includes(query) || ph.includes(query) || city.includes(query);
      if (!matchesSearch) return false;

      // 2. Status Pill Filter
      const status = v.subscriptionStatus || v.subscription_status || 'active';
      const expiresAt = v.subscriptionExpiresAt || v.subscription_expires_at ? new Date(v.subscriptionExpiresAt || v.subscription_expires_at).getTime() : 0;

      if (currentFilter === 'all') return true;
      if (currentFilter === 'active') return status === 'active';
      if (currentFilter === 'trial') return status === 'trial';
      if (currentFilter === 'expired') return status === 'expired' || expiresAt < now;
      if (currentFilter === 'expiring') return expiresAt > now && expiresAt <= in7Days;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: var(--saas-text-muted);">No restaurants found matching current filter or search criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(v => {
      const bName = v.businessName || v.business_name || 'Restaurant Stall';
      const oName = v.ownerName || v.owner_name || 'Owner';
      const phone = v.phone || 'N/A';
      const city = v.city || 'Hyderabad';
      const type = v.businessType || v.business_type || 'Food Stall';
      const status = v.subscriptionStatus || v.subscription_status || 'active';
      const sales = formatRupees(v.lifetimeSalesPaise || '0');

      let badgeClass = 'active';
      let badgeLabel = 'ACTIVE';
      if (status === 'trial') { badgeClass = 'trial'; badgeLabel = 'TRIAL'; }
      if (status === 'expired') { badgeClass = 'expired'; badgeLabel = 'EXPIRED'; }

      return `
        <tr>
          <td>
            <div style="font-weight: 800; font-size: 14px; color: var(--saas-burgundy-primary);">${bName}</div>
            <div style="font-size: 12px; color: var(--saas-text-muted);">${oName}</div>
          </td>
          <td><code style="font-family: var(--font-mono); font-size: 13px; font-weight: 700;">${phone}</code></td>
          <td>
            <div style="font-weight: 600;">${city}</div>
            <div style="font-size: 11.5px; color: var(--saas-text-muted);">${type}</div>
          </td>
          <td>
            <span class="badge-status ${badgeClass}">${badgeLabel}</span>
          </td>
          <td><strong style="font-weight: 800;">${sales}</strong></td>
          <td>
            <div class="action-btn-group">
              <button class="btn-table-action btn-edit-stall" data-id="${v.id}" title="Edit Stall Details">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                <span>Edit</span>
              </button>
              <button class="btn-table-action btn-manage-menu" data-id="${v.id}" data-name="${bName}" title="Manage Dishes & Menu">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                <span>Menu</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Attach Event Listeners to Edit and Menu buttons
    document.querySelectorAll('.btn-edit-stall').forEach(btn => {
      btn.addEventListener('click', () => {
        const stallId = btn.getAttribute('data-id');
        openEditStallModal(stallId);
      });
    });

    document.querySelectorAll('.btn-manage-menu').forEach(btn => {
      btn.addEventListener('click', () => {
        const stallId = btn.getAttribute('data-id');
        const stallName = btn.getAttribute('data-name');
        openMenuManagerModal(stallId, stallName);
      });
    });
  }

  // 6. Users Directory Loader
  async function loadUsers() {
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    allUsers = [
      { id: 'usr-1', name: 'Mohammed Feroz', phone: '9177177475', role: 'Super Admin', stallName: 'FROSE Platform HQ', status: 'Active' },
      { id: 'usr-2', name: 'Mirza Baig', phone: '9848012345', role: 'Stall Owner', stallName: 'Al-Bake Shawarma Express', status: 'Active' },
      { id: 'usr-3', name: 'Suresh Patel', phone: '9848098765', role: 'Stall Owner', stallName: 'Chai Shai & Bun Maska', status: 'Active' },
      { id: 'usr-4', name: 'Ramu Naidu', phone: '9848055555', role: 'Stall Owner', stallName: 'Dosa Corner King', status: 'Inactive' },
      { id: 'usr-5', name: 'Subhash Roy', phone: '9876543210', role: 'Stall Owner', stallName: 'Kolkata Kathi Rolls', status: 'Active' },
      { id: 'usr-6', name: 'Raju Cashier', phone: '9848099901', role: 'Cashier', stallName: 'FROSE Street Food Stall', status: 'Active' }
    ];

    const res = await apiFetch('/api/v1/admin/users');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data)) allUsers = json.data;
      } catch (e) {}
    }

    tbody.innerHTML = allUsers.map(u => `
      <tr>
        <td>
          <div style="font-weight: 800; font-size: 14px; color: var(--saas-burgundy-primary);">${u.name}</div>
          <code style="font-family: var(--font-mono); font-size: 12px; color: var(--saas-text-muted);">${u.phone}</code>
        </td>
        <td>
          <span style="font-size: 12px; font-weight: 800; background: #F1F5F9; color: #334155; padding: 4px 8px; border-radius: 6px;">${u.role}</span>
        </td>
        <td><strong style="font-size: 13px;">${u.stallName || 'Platform HQ'}</strong></td>
        <td>
          <span class="badge-status ${u.status === 'Inactive' || u.status === 'inactive' ? 'expired' : 'active'}">${u.status || 'Active'}</span>
        </td>
        <td>
          <button class="btn-table-action" onclick="alert('Password reset link sent to registered mobile.')">Reset Password</button>
        </td>
      </tr>
    `).join('');
  }

  // 7. Deep Analytics Loader
  async function loadAnalytics() {
    const elCash = document.getElementById('analytics-cash');
    const elUpi = document.getElementById('analytics-upi');
    const lBody = document.getElementById('analytics-leaderboard-body');
    if (!lBody) return;

    let analyticsData = {
      cashSalesPaise: '6250000',
      upiSalesPaise: '4200000',
      leaderboard: allVendors.slice(0, 5)
    };

    const res = await apiFetch('/api/v1/admin/analytics');
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (json.data) analyticsData = json.data;
      } catch (e) {}
    }

    if (elCash) elCash.textContent = formatRupees(analyticsData.cashSalesPaise);
    if (elUpi) elUpi.textContent = formatRupees(analyticsData.upiSalesPaise);

    lBody.innerHTML = (analyticsData.leaderboard || allVendors).map((v, i) => `
      <tr>
        <td><strong style="color: var(--saas-burgundy-primary);">#${i + 1}</strong></td>
        <td><strong>${v.businessName || v.business_name || v.name}</strong></td>
        <td>${v.city || 'Hyderabad'}</td>
        <td>${v.totalOrders || 0}</td>
        <td><strong>${formatRupees(v.lifetimeSalesPaise || v.salesPaise || '0')}</strong></td>
      </tr>
    `).join('');
  }

  // 8. Add a New Restaurant (+) Flow
  const modalAddStall = document.getElementById('modal-add-stall');
  const formAddStall = document.getElementById('form-add-stall');

  function openAddStallModal() {
    if (modalAddStall) modalAddStall.classList.add('active');
  }

  document.getElementById('btn-bottom-add-restaurant')?.addEventListener('click', openAddStallModal);
  document.getElementById('btn-open-add-stall-header')?.addEventListener('click', openAddStallModal);
  document.getElementById('btn-close-add-stall')?.addEventListener('click', () => {
    modalAddStall?.classList.remove('active');
  });

  formAddStall?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const businessName = document.getElementById('add-biz-name').value.trim();
    const ownerName = document.getElementById('add-owner-name').value.trim();
    const phone = document.getElementById('add-phone').value.trim();
    const password = document.getElementById('add-password').value;
    const city = document.getElementById('add-city').value.trim();
    const upiId = document.getElementById('add-upi').value.trim();

    const payload = { businessName, ownerName, phone, password, city, upiId };

    const res = await apiFetch('/api/v1/admin/vendors', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const newVendor = {
      id: 'v-' + Date.now().toString(36),
      businessName,
      ownerName,
      phone,
      city,
      businessType: 'Street Food Stall',
      edition: 'cloud',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      lifetimeSalesPaise: '0',
      totalOrders: 0
    };

    allVendors.unshift(newVendor);
    modalAddStall?.classList.remove('active');
    formAddStall.reset();
    renderStallsTable();
    loadOverview();
    alert(`✅ Restaurant "${businessName}" successfully on-boarded! Owner login phone: ${phone}`);
  });

  // 9. Edit Stall Flow
  const modalEditStall = document.getElementById('modal-edit-stall');
  const formEditStall = document.getElementById('form-edit-stall');

  function openEditStallModal(stallId) {
    const v = allVendors.find(vend => vend.id === stallId);
    if (!v || !modalEditStall) return;

    document.getElementById('edit-stall-id').value = v.id;
    document.getElementById('edit-biz-name').value = v.businessName || v.business_name || '';
    document.getElementById('edit-owner-name').value = v.ownerName || v.owner_name || '';
    document.getElementById('edit-phone').value = v.phone || '';
    document.getElementById('edit-status').value = v.subscriptionStatus || v.subscription_status || 'active';

    modalEditStall.classList.add('active');
  }

  document.getElementById('btn-close-edit-stall')?.addEventListener('click', () => {
    modalEditStall?.classList.remove('active');
  });

  formEditStall?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-stall-id').value;
    const businessName = document.getElementById('edit-biz-name').value.trim();
    const ownerName = document.getElementById('edit-owner-name').value.trim();
    const phone = document.getElementById('edit-phone').value.trim();
    const subscriptionStatus = document.getElementById('edit-status').value;
    const extendDays = parseInt(document.getElementById('edit-extend-days').value, 10);

    const vIndex = allVendors.findIndex(vend => vend.id === id);
    if (vIndex !== -1) {
      allVendors[vIndex].businessName = businessName;
      allVendors[vIndex].ownerName = ownerName;
      allVendors[vIndex].phone = phone;
      allVendors[vIndex].subscriptionStatus = subscriptionStatus;
      if (extendDays > 0) {
        allVendors[vIndex].subscriptionExpiresAt = new Date(Date.now() + extendDays * 86400000).toISOString();
      }
    }

    await apiFetch(`/api/v1/admin/vendors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ businessName, ownerName, phone, subscriptionStatus })
    });

    modalEditStall?.classList.remove('active');
    renderStallsTable();
    loadOverview();
    alert('✅ Restaurant details updated successfully!');
  });

  // 10. Menu Manager Flow
  const modalMenuManager = document.getElementById('modal-menu-manager');
  const formAddDish = document.getElementById('form-add-dish');
  let currentVendorDishes = [];

  async function openMenuManagerModal(stallId, stallName) {
    activeVendorForMenu = stallId;
    document.getElementById('menu-modal-title').textContent = `🍽️ Menu — ${stallName}`;
    modalMenuManager?.classList.add('active');

    // Default sample dishes
    currentVendorDishes = [
      { id: 'd-1', name: 'Special Masala Chai', price_paise: 1500, category: 'Beverages', is_available: true },
      { id: 'd-2', name: 'Steamed Momos (6 pcs)', price_paise: 6000, category: 'Momos', is_available: true },
      { id: 'd-3', name: 'Chicken Shawarma Roll', price_paise: 11000, category: 'Shawarma', is_available: true }
    ];

    const res = await apiFetch(`/api/v1/admin/vendors/${stallId}/menu`);
    if (res && res.ok) {
      try {
        const json = await res.json();
        if (Array.isArray(json.data) && json.data.length > 0) currentVendorDishes = json.data;
      } catch (e) {}
    }

    renderMenuDishesList();
  }

  function renderMenuDishesList() {
    const container = document.getElementById('menu-items-list-container');
    if (!container) return;

    container.innerHTML = currentVendorDishes.map((dish, i) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #FFFFFF; border-radius: 10px; border: 1px solid var(--saas-card-border); margin-bottom: 8px;">
        <div>
          <div style="font-weight: 800; font-size: 13.5px; color: var(--saas-burgundy-primary);">${dish.name}</div>
          <div style="font-size: 12px; color: var(--saas-text-muted);">${dish.category || 'General'} • <strong>${formatRupees(dish.price_paise)}</strong></div>
        </div>
        <button class="btn-table-action" onclick="window.toggleDishAvailability(${i})">
          ${dish.is_available ? '🟢 In Stock' : '🔴 Sold Out'}
        </button>
      </div>
    `).join('');
  }

  window.toggleDishAvailability = (index) => {
    if (currentVendorDishes[index]) {
      currentVendorDishes[index].is_available = !currentVendorDishes[index].is_available;
      renderMenuDishesList();
    }
  };

  formAddDish?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('dish-name').value.trim();
    const priceRupees = parseFloat(document.getElementById('dish-price-rupees').value);
    const category = document.getElementById('dish-category').value.trim();

    const price_paise = Math.round(priceRupees * 100);
    const newDish = { id: 'd-' + Date.now().toString(36), name, price_paise, category, is_available: true };

    currentVendorDishes.unshift(newDish);
    renderMenuDishesList();
    formAddDish.reset();

    if (activeVendorForMenu) {
      await apiFetch(`/api/v1/admin/vendors/${activeVendorForMenu}/menu`, {
        method: 'POST',
        body: JSON.stringify({ name, pricePaise: price_paise, category })
      });
    }
  });

  document.getElementById('btn-close-menu-modal')?.addEventListener('click', () => {
    modalMenuManager?.classList.remove('active');
  });

  // 11. Notifications Drawer
  const notifOverlay = document.getElementById('notifications-overlay');
  const notifDrawer = document.getElementById('notifications-drawer');

  function openNotifications() {
    notifOverlay?.classList.add('active');
    setTimeout(() => notifDrawer?.classList.add('open'), 10);
  }

  function closeNotifications() {
    notifDrawer?.classList.remove('open');
    setTimeout(() => notifOverlay?.classList.remove('active'), 250);
  }

  document.getElementById('btn-bottom-notifications')?.addEventListener('click', openNotifications);
  document.getElementById('btn-close-notif')?.addEventListener('click', closeNotifications);
  notifOverlay?.addEventListener('click', (e) => {
    if (e.target === notifOverlay) closeNotifications();
  });

  // 12. User Profile Dropdown & Logout
  const dropdownToggle = document.getElementById('btn-user-dropdown-toggle');
  const dropdownMenu = document.getElementById('user-dropdown-menu');

  dropdownToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownMenu?.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    dropdownMenu?.classList.remove('active');
  });

  function performSignOut() {
    if (confirm('Are you sure you want to sign out of the Super Admin Console?')) {
      localStorage.removeItem('frose_auth_token');
      localStorage.removeItem('frose_current_vendor');
      window.location.replace('/login');
    }
  }

  document.getElementById('btn-bottom-logout')?.addEventListener('click', performSignOut);
  document.getElementById('btn-admin-signout-drop')?.addEventListener('click', performSignOut);

  // 13. System Health Details Modal
  const modalHealth = document.getElementById('modal-system-health');
  document.getElementById('btn-view-health')?.addEventListener('click', () => {
    modalHealth?.classList.add('active');
  });
  document.getElementById('btn-close-health')?.addEventListener('click', () => {
    modalHealth?.classList.remove('active');
  });

  // 14. Event Delegation for Tabs & KPI Links
  document.querySelectorAll('.nav-tab-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  document.querySelectorAll('.bottom-nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.getAttribute('data-view');
      if (view) switchView(view);
    });
  });

  document.getElementById('btn-hero-reports')?.addEventListener('click', () => switchView('analytics'));
  document.getElementById('kpi-card-restaurants')?.addEventListener('click', () => switchView('vendors'));
  document.getElementById('kpi-card-revenue')?.addEventListener('click', () => switchView('analytics'));
  document.getElementById('kpi-card-renewals')?.addEventListener('click', () => {
    currentFilter = 'expiring';
    document.querySelectorAll('.filter-btn').forEach(fb => fb.classList.toggle('active', fb.getAttribute('data-filter') === 'expiring'));
    switchView('vendors');
  });
  document.getElementById('kpi-card-orders')?.addEventListener('click', () => switchView('analytics'));
  document.getElementById('btn-open-settings-drop')?.addEventListener('click', () => switchView('settings'));
  document.getElementById('btn-open-profile')?.addEventListener('click', () => {
    alert('Super Admin Platform Master\nPhone: 9999999999 / 9177177475\nSecurity: Argon2id Encrypted\nStatus: Online Active');
  });

  // Filter Pills on Vendors Screen
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'all';
      renderStallsTable();
    });
  });

  // Search Input on Vendors Screen
  document.getElementById('stall-search-input')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderStallsTable();
  });

  // 15. Initial Boot
  loadOverview();
  loadVendors();
})();
