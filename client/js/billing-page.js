(function () {
  if (!history.state) {
    history.replaceState({ view: 'billing', root: true }, '', '');
  }

  window.addEventListener('popstate', () => {
    const openDrawers = document.querySelectorAll('.saas-drawer-backdrop.active');
    if (openDrawers.length > 0) {
      openDrawers.forEach((d) => d.classList.remove('active'));
      return;
    }

    const activeModals = document.querySelectorAll('.saas-sheet-backdrop.active, .modal-overlay.active');
    if (activeModals.length > 0) {
      activeModals.forEach((m) => m.classList.remove('active'));
      document.body.classList.remove('saas-modal-open');
      document.documentElement.classList.remove('saas-modal-open');
      return;
    }

    window.location.href = '/';
  });
})();
