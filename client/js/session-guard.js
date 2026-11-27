(function () {
  var path = window.location.pathname || '';
  var isAdmin = path.indexOf('/admin') !== -1;
  var isBilling = path.indexOf('/billing') !== -1;
  var isIndex = path === '/' || path.indexOf('/index') !== -1;

  if (isAdmin && 'caches' in window) {
    caches.keys().then(function (names) {
      names.forEach(function (name) {
        if (name.indexOf('v9') !== -1 || name.indexOf('admin') !== -1) {
          caches.delete(name);
        }
      });
    });
  }

  var session = localStorage.getItem('frose_session_active') || localStorage.getItem('frose_license_token');
  if (!session) {
    window.location.replace('/login');
    return;
  }

  if (isIndex) {
    try {
      var vendorStr = localStorage.getItem('frose_current_vendor');
      if (vendorStr) {
        var vendor = JSON.parse(vendorStr);
        if (vendor && (vendor.isSuperadmin || vendor.role === 'superadmin')) {
          window.location.replace('/admin');
        }
      }
    } catch (e) {}
  }

  if (isBilling) {
    var PURGE_KEY = 'frose_clean_slate_2026_v99_permanent_empty';
    if (!localStorage.getItem(PURGE_KEY)) {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && (k.indexOf('frose_dishes') === 0 || k.indexOf('frose_cats') === 0 || k === 'frose_custom_menu_catalog' || k.indexOf('frose_menu') === 0)) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(PURGE_KEY, 'true');
    }
  }
})();
