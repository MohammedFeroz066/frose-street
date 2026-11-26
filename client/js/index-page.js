(function () {
  window.openModal = function (id) {
    document.getElementById(id)?.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  };
  window.closeModal = function (id) {
    document.getElementById(id)?.classList.remove('active');
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0) {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
  };
  window.switchTab = function (tab, targetEl) {
    document.querySelectorAll('.nav-tab-pill').forEach(btn => btn.classList.remove('active'));
    if (targetEl) targetEl.classList.add('active');
    if (tab === 'inventory') {
      window.location.href = '/menu-setup';
    }
  };
  window.handleLogout = async function () {
    if (window.FroseIdbStore && typeof window.FroseIdbStore.safeLogout === 'function') {
      await window.FroseIdbStore.safeLogout({ confirmMessage: 'Sign out of Stall Client session?' });
      return;
    }
    if (confirm('Sign out of Stall Client session?')) {
      try {
        const fn = window.froseApiFetch || fetch;
        await fn('/api/v1/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'X-FROSE-CSRF': '1' } });
      } catch (e) {}
      localStorage.removeItem('frose_session_active');
      window.location.href = '/login.html';
    }
  };
  window.toggleUserMenu = function () {
    if (confirm('Stall Client Account: Switch stall or sign out?')) {
      window.handleLogout();
    }
  };

  try {
    const vStr = localStorage.getItem('frose_current_vendor');
    if (vStr) {
      const v = JSON.parse(vStr);
      if (v.businessName) {
        const el = document.getElementById('stall-owner-name');
        if (el) el.textContent = v.businessName + '!';
        const sStall = document.getElementById('settings-client-stall');
        if (sStall) sStall.textContent = v.businessName;
      }
      if (v.ownerName) {
        const sOwner = document.getElementById('settings-client-owner');
        if (sOwner) sOwner.textContent = v.ownerName;
        const sAvatar = document.getElementById('settings-client-avatar');
        if (sAvatar) sAvatar.textContent = v.ownerName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      }
      if (v.phone) {
        const sPhone = document.getElementById('settings-client-phone');
        if (sPhone) sPhone.textContent = '+91 ' + v.phone;
      }
    }
  } catch (e) {}
})();
