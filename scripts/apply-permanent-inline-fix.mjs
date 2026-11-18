import fs from 'node:fs';
import path from 'node:path';

const adminHtmlPath = path.resolve('client/admin.html');
const adminJsPath = path.resolve('client/js/admin.js');

let html = fs.readFileSync(adminHtmlPath, 'utf8');
let js = fs.readFileSync(adminJsPath, 'utf8');

// 1. In HTML <head>, add no-cache meta tags and immediate cache-purge
const cacheMeta = `  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
  <meta http-equiv="Pragma" content="no-cache">
  <meta http-equiv="Expires" content="0">
  <script>
    // Immediate self-healing cache purge for Super Admin console
    if ('caches' in window) {
      caches.keys().then(function(names) {
        names.forEach(function(name) {
          if (name.indexOf('v9') !== -1 || name.indexOf('admin') !== -1) {
            caches.delete(name);
          }
        });
      });
    }
  </script>`;

if (!html.includes('http-equiv="Cache-Control"')) {
  html = html.replace('<title>Super Admin Console — FROSE Street</title>', '<title>Super Admin Console — FROSE Street</title>\n' + cacheMeta);
}

// 2. Add inline onclick handlers on top tabs
html = html.replace(
  '<button class="nav-tab-pill active" data-view="dashboard">',
  '<button class="nav-tab-pill active" data-view="dashboard" onclick="window.switchView(\'dashboard\')">'
);
html = html.replace(
  '<button class="nav-tab-pill" data-view="vendors">',
  '<button class="nav-tab-pill" data-view="vendors" onclick="window.switchView(\'vendors\')">'
);
html = html.replace(
  '<button class="nav-tab-pill" data-view="users">',
  '<button class="nav-tab-pill" data-view="users" onclick="window.switchView(\'users\')">'
);
html = html.replace(
  '<button class="nav-tab-pill" data-view="settings">',
  '<button class="nav-tab-pill" data-view="settings" onclick="window.switchView(\'settings\')">'
);

// 3. Add inline onclick handlers on bottom dock
html = html.replace(
  '<button class="bottom-nav-item active" data-view="dashboard" id="btn-bottom-home">',
  '<button class="bottom-nav-item active" data-view="dashboard" id="btn-bottom-home" onclick="window.switchView(\'dashboard\')">'
);
html = html.replace(
  '<button class="bottom-nav-item" data-view="analytics" id="btn-bottom-analytics">',
  '<button class="bottom-nav-item" data-view="analytics" id="btn-bottom-analytics" onclick="window.switchView(\'analytics\')">'
);
html = html.replace(
  '<button class="bottom-nav-add-btn" id="btn-bottom-add-restaurant" title="Add a New Restaurant">',
  '<button class="bottom-nav-add-btn" id="btn-bottom-add-restaurant" title="Add a New Restaurant" onclick="window.openModal(\'modal-add-stall\')">'
);
html = html.replace(
  '<button class="bottom-nav-item" id="btn-bottom-notifications">',
  '<button class="bottom-nav-item" id="btn-bottom-notifications" onclick="window.toggleNotifications()">'
);
html = html.replace(
  '<button class="bottom-nav-item" id="btn-bottom-logout">',
  '<button class="bottom-nav-item" id="btn-bottom-logout" onclick="window.adminLogout()">'
);

// 4. Add inline onclick on Top Add Stall button and Drawer Close
html = html.replace(
  '<button class="btn-top-add-action" id="btn-top-add-stall">',
  '<button class="btn-top-add-action" id="btn-top-add-stall" onclick="window.openModal(\'modal-add-stall\')">'
);
html = html.replace(
  '<button class="btn-close-modal" id="btn-close-notifications">×</button>',
  '<button class="btn-close-modal" id="btn-close-notifications" onclick="window.toggleNotifications()">×</button>'
);

// 5. Add inline onclick on modals
html = html.replace(
  '<button class="btn-close-modal" id="btn-close-add-modal">×</button>',
  '<button class="btn-close-modal" id="btn-close-add-modal" onclick="window.closeModal(\'modal-add-stall\')">×</button>'
);
html = html.replace(
  '<button class="btn-close-modal" id="btn-close-edit-modal">×</button>',
  '<button class="btn-close-modal" id="btn-close-edit-modal" onclick="window.closeModal(\'modal-edit-stall\')">×</button>'
);
html = html.replace(
  '<button class="btn-close-modal" id="btn-close-menu-modal">×</button>',
  '<button class="btn-close-modal" id="btn-close-menu-modal" onclick="window.closeModal(\'modal-menu-manager\')">×</button>'
);
html = html.replace(
  '<button class="btn-close-modal" id="btn-close-health-modal">×</button>',
  '<button class="btn-close-modal" id="btn-close-health-modal" onclick="window.closeModal(\'modal-system-health\')">×</button>'
);
html = html.replace(
  '<button class="btn-close-modal" id="btn-close-receipt-modal">×</button>',
  '<button class="btn-close-modal" id="btn-close-receipt-modal" onclick="window.closeModal(\'modal-payment-receipt\')">×</button>'
);

// 6. Add inline onclick on KPI cards, Hero Reports, Health Ribbon, User Dropdown
html = html.replace(
  '<div class="hero-action-btn" id="btn-hero-reports">',
  '<div class="hero-action-btn" id="btn-hero-reports" onclick="window.switchView(\'analytics\')">'
);
html = html.replace(
  '<div class="kpi-card" id="card-kpi-restaurants">',
  '<div class="kpi-card" id="card-kpi-restaurants" onclick="window.switchView(\'vendors\')">'
);
html = html.replace(
  '<div class="kpi-card" id="card-kpi-revenue">',
  '<div class="kpi-card" id="card-kpi-revenue" onclick="window.switchView(\'analytics\')">'
);
html = html.replace(
  '<div class="kpi-card" id="card-kpi-renewals">',
  '<div class="kpi-card" id="card-kpi-renewals" onclick="window.filterExpiringAndSwitch()">'
);
html = html.replace(
  '<div class="kpi-card" id="card-kpi-orders">',
  '<div class="kpi-card" id="card-kpi-orders" onclick="window.switchView(\'analytics\')">'
);
html = html.replace(
  '<button class="btn-status-details" id="btn-view-health">',
  '<button class="btn-status-details" id="btn-view-health" onclick="window.openModal(\'modal-system-health\')">'
);
html = html.replace(
  '<div class="header-user-badge" id="btn-admin-profile">',
  '<div class="header-user-badge" id="btn-admin-profile" onclick="window.toggleUserDropdown(event)">'
);
html = html.replace(
  '<div class="dropdown-item" id="btn-menu-profile">👤 Platform Profile</div>',
  '<div class="dropdown-item" id="btn-menu-profile" onclick="window.switchView(\'settings\')">👤 Platform Profile</div>'
);
html = html.replace(
  '<div class="dropdown-item" id="btn-menu-system">🛡️ System Status</div>',
  '<div class="dropdown-item" id="btn-menu-system" onclick="window.openModal(\'modal-system-health\')">🛡️ System Status</div>'
);
html = html.replace(
  '<div class="dropdown-item" id="btn-menu-logout" style="color: var(--saas-crimson);">🚪 Sign Out</div>',
  '<div class="dropdown-item" id="btn-menu-logout" onclick="window.adminLogout()" style="color: var(--saas-crimson);">🚪 Sign Out</div>'
);

// 7. Make sure all window functions are exported in JS
const windowExports = `
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
  window.adminLogout = function() {
    if (confirm('Sign out of Super Admin Console?')) {
      localStorage.removeItem('frose_auth_token');
      window.location.replace('/login');
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
  window.filterStalls = function(f) {
    currentFilter = f;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    document.querySelector(\`.filter-pill[data-filter="\${f}"]\`)?.classList.add('active');
    renderStallsTable();
  };
  window.sendWhatsAppNotification = sendWhatsAppNotification;
  window.openReceiptModal = openReceiptModal;
  window.openEditModal = openEditModal;
  window.openMenuModal = openMenuModal;
`;

if (!js.includes('window.switchView = switchView;')) {
  // Insert before end of IIFE in admin.js
  js = js.replace('  // Dual-State Initialization', windowExports + '\n  // Dual-State Initialization');
  fs.writeFileSync(adminJsPath, js, 'utf8');
  console.log('Updated client/js/admin.js with global window exports');
}

// 8. Embed the entire JS controller INLINE directly inside client/admin.html before </body>
const inlineScriptBlock = `  <script>
${js}
  </script>
  <script src="/js/admin.js?v=3.1.0"></script>`;

// Replace existing script tag in admin.html with inline script block
html = html.replace(/<script src="\/js\/admin\.js[^"]*"><\/script>/, inlineScriptBlock);

fs.writeFileSync(adminHtmlPath, html, 'utf8');
console.log('Successfully updated client/admin.html with inline script & onclick handlers');
