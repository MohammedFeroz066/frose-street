(function () {
  document.addEventListener('click', function (e) {
    const target = e.target && e.target.closest ? e.target.closest('[data-click],[data-click-target]') : null;
    if (!target) return;

    const triggerId = target.getAttribute('data-click-target');
    if (triggerId) {
      const el = document.getElementById(triggerId);
      if (el) el.click();
      return;
    }

    const fnName = target.getAttribute('data-click');
    if (!fnName) return;

    if (fnName === 'logoutFallback') {
      if (typeof window.handleLogout === 'function') {
        window.handleLogout();
      } else if (window.FroseIdbStore && typeof window.FroseIdbStore.safeLogout === 'function') {
        window.FroseIdbStore.safeLogout({ redirectTo: '/login.html' });
      } else {
        localStorage.removeItem('frose_session_active');
        localStorage.removeItem('frose_vendors_directory');
        localStorage.removeItem('frose_current_vendor');
        window.location.href = '/login.html';
      }
      return;
    }

    const fn = window[fnName];
    if (typeof fn !== 'function') return;

    if (target.hasAttribute('data-arg-num')) {
      fn(Number(target.getAttribute('data-arg-num')), e, target);
    } else if (target.hasAttribute('data-arg')) {
      fn(target.getAttribute('data-arg'), target, e);
    } else if (target.hasAttribute('data-pass-event')) {
      fn(e, target);
    } else {
      fn(target, e);
    }
  });

  document.addEventListener('change', function (e) {
    const target = e.target;
    if (!target || !target.getAttribute) return;

    const valFn = target.getAttribute('data-change-value');
    if (valFn && typeof window[valFn] === 'function') {
      window[valFn](target.value, e);
      return;
    }

    const fnName = target.getAttribute('data-change');
    if (fnName && typeof window[fnName] === 'function') {
      window[fnName](e);
    }
  });

  document.addEventListener('submit', function (e) {
    const form = e.target;
    if (!form || !form.getAttribute) return;
    const fnName = form.getAttribute('data-submit');
    if (fnName && typeof window[fnName] === 'function') {
      window[fnName](e);
    }
  });
})();
