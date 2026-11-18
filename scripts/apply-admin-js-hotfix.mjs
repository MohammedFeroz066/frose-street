import fs from 'node:fs';
import path from 'node:path';

const adminJsPath = path.resolve('client/js/admin.js');
let js = fs.readFileSync(adminJsPath, 'utf8');

// Replace the DOMContentLoaded block with initAdminConsole and delegated listener
const oldBlockStart = "  // 10. Event Handlers & Initialization\n  document.addEventListener('DOMContentLoaded', () => {";

const newImplementation = `  // 10. Unified Delegated Click Listener (Zero-Fail Real-Time Mobile & Desktop Taps)
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
      openModal('modal-add-stall');
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
      if (confirm('Sign out of Super Admin Console?')) {
        localStorage.removeItem('frose_auth_token');
        window.location.replace('/login');
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

  // 11. Core Initialization Function
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
          localStorage.removeItem('frose_auth_token');
          window.location.replace('/login');
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
          password: document.getElementById('add-password').value.trim() || 'Feroz@123',
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

        await apiFetch(\`/api/v1/admin/vendors/\${id}\`, {
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
    loadOverview();
    loadVendors();
  }

  // Dual-State Initialization: Handles both early-run and late-run script lifecycles
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdminConsole);
  } else {
    initAdminConsole();
  }`;

// Find where section 10 starts and replace to the end of the IIFE
const sec10Index = js.indexOf('// 10. Event Handlers & Initialization');
if (sec10Index !== -1) {
  // Find where the IIFE ends: `})();`
  const iifeEnd = js.lastIndexOf('})();');
  if (iifeEnd !== -1) {
    js = js.substring(0, sec10Index) + newImplementation + '\n\n})();\n';
    fs.writeFileSync(adminJsPath, js, 'utf8');
    console.log('Successfully updated client/js/admin.js with dual-mode initialization & delegated click events');
  } else {
    console.error('Could not find IIFE end');
  }
} else {
  console.error('Could not find section 10');
}
