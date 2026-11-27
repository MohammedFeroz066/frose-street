(function () {
  window.__FROSE_CUSTOM_POPSTATE__ = true;

  if (!history.state || (!history.state.froseRoot && !history.state.froseTab && !history.state.froseOverlay)) {
    history.replaceState({ view: 'billing', froseRoot: true, froseTab: 'bill' }, '', '');
  }

  window.addEventListener('popstate', () => {
    if (window.FroseUI && typeof window.FroseUI.consumeSuppressedPopstate === 'function') {
      if (window.FroseUI.consumeSuppressedPopstate()) return;
    }

    if (window.FroseUI && typeof window.FroseUI.getOverlayStack === 'function') {
      if (window.FroseUI.getOverlayStack().length > 0) {
        window.FroseUI.closeTopOverlay({ fromPopstate: true });
        return;
      }
    }

    const openDrawers = document.querySelectorAll('.saas-drawer-backdrop.active');
    if (openDrawers.length > 0) {
      openDrawers[openDrawers.length - 1].classList.remove('active');
      document.body.classList.remove('saas-modal-open');
      document.documentElement.classList.remove('saas-modal-open');
      return;
    }

    const activeModals = document.querySelectorAll('.saas-sheet-backdrop.active, .modal-overlay.active');
    if (activeModals.length > 0) {
      activeModals[activeModals.length - 1].classList.remove('active');
      if (document.querySelectorAll('.saas-sheet-backdrop.active, .saas-drawer-backdrop.active, .modal-overlay.active').length === 0) {
        document.body.classList.remove('saas-modal-open');
        document.documentElement.classList.remove('saas-modal-open');
      }
      return;
    }

    const activePanel = document.querySelector('.saas-view-panel.active');
    const currentTab = activePanel ? activePanel.getAttribute('data-tab-panel') : 'bill';
    if (currentTab && currentTab !== 'bill' && typeof window.switchWorkspaceTab === 'function') {
      window.switchWorkspaceTab('bill', { fromPopstate: true });
    }
  });
})();
