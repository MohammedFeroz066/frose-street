(function () {
  if (!history.state) {
    history.replaceState({ view: 'billing', root: true }, '', '');
  }

  window.addEventListener('popstate', () => {
    const cartDrawer = document.getElementById('checkout-drawer');
    if (cartDrawer && cartDrawer.classList.contains('active')) {
      cartDrawer.classList.remove('active');
      return;
    }

    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length > 0) {
      activeModals.forEach(m => m.classList.remove('active'));
      return;
    }

    window.location.href = '/';
  });
})();
