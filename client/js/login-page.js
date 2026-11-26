(function () {
  const alertBox = document.getElementById('login-alert');
  const formPwd = document.getElementById('form-pwd-login');
  const phoneInput = document.getElementById('login-phone');
  const pwdInput = document.getElementById('login-password');
  const btnSubmit = document.getElementById('btn-submit-pwd');
  const toggleEyeBtn = document.getElementById('btn-toggle-password');
  const iconEyeShow = document.getElementById('icon-eye-show');
  const iconEyeHide = document.getElementById('icon-eye-hide');

  let countdownTimer = null;

  if (toggleEyeBtn && pwdInput && iconEyeShow && iconEyeHide) {
    toggleEyeBtn.addEventListener('click', () => {
      if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        iconEyeShow.style.display = 'none';
        iconEyeHide.style.display = 'block';
      } else {
        pwdInput.type = 'password';
        iconEyeShow.style.display = 'block';
        iconEyeHide.style.display = 'none';
      }
    });
  }

  function showAlert(msg, type = 'error') {
    if (!alertBox) return;
    alertBox.textContent = msg;
    alertBox.className = 'alert-banner ' + type;
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.className = 'alert-banner';
  }

  function startLockoutCountdown(seconds) {
    let remaining = seconds;
    if (phoneInput) phoneInput.disabled = true;
    if (pwdInput) pwdInput.disabled = true;
    if (btnSubmit) btnSubmit.disabled = true;

    function renderCountdown() {
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const fmt = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
      showAlert('⏳ Too many failed attempts. Account locked. Try again in ' + fmt, 'error');
    }

    if (countdownTimer) clearInterval(countdownTimer);
    renderCountdown();

    countdownTimer = setInterval(() => {
      remaining--;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        if (phoneInput) phoneInput.disabled = false;
        if (pwdInput) pwdInput.disabled = false;
        if (btnSubmit) btnSubmit.disabled = false;
        showAlert('🔓 Lockout expired. You may now enter your credentials.', 'success');
      } else {
        renderCountdown();
      }
    }, 1000);
  }

  async function handleAuthSuccess(data) {
    localStorage.removeItem('frose_auth_token');
    localStorage.removeItem('frose_vendors_directory');
    localStorage.removeItem('frose_dishes_active');
    localStorage.removeItem('frose_cats_active');
    localStorage.removeItem('frose_live_orders_queue');
    localStorage.setItem('frose_session_active', '1');
    if (data.vendor) {
      localStorage.setItem('frose_current_vendor', JSON.stringify(data.vendor));
      if (data.vendor.businessName) localStorage.setItem('frose_stall_name', data.vendor.businessName);
      if (data.vendor.phone) localStorage.setItem('frose_stall_phone', data.vendor.phone);
      if (data.vendor.upiId) localStorage.setItem('frose_vendor_vpa', data.vendor.upiId);
      if (window.FroseIdbStore && data.vendor.id) {
        try {
          await window.FroseIdbStore.ensureVendorScope(data.vendor.id);
          await window.FroseIdbStore.setMeta('vendor_profile', { vendor_id: data.vendor.id, value: data.vendor });
        } catch (_) {}
      }
    }
    var isSuper = data.isSuperadmin || data.role === 'superadmin' || (data.vendor && (data.vendor.role === 'superadmin' || data.vendor.isSuperadmin));
    if (isSuper) {
      showAlert('✅ Super Admin authenticated! Opening platform console...', 'success');
      setTimeout(() => {
        window.location.href = '/admin';
      }, 500);
      return;
    }

    var isFirstLogin = !localStorage.getItem('frose_first_login_done');
    if (isFirstLogin) {
      showAlert('✅ Welcome Stall Client! Opening menu setup...', 'success');
      setTimeout(() => {
        window.location.href = '/billing?setup=1';
      }, 800);
    } else {
      showAlert('✅ Login successful! Opening dashboard...', 'success');
      setTimeout(() => {
        window.location.href = '/';
      }, 800);
    }
  }

  if (formPwd) {
    formPwd.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideAlert();
      const phone = phoneInput.value.trim().replace(/\D/g, '').slice(-10);
      const password = pwdInput.value;

      if (!phone || phone.length !== 10) {
        showAlert('Please enter a valid 10-digit mobile number');
        return;
      }

      let res = null;
      let data = null;

      try {
        const fn = window.froseApiFetch || fetch;
        res = await fn('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
          credentials: 'same-origin',
          body: JSON.stringify({ phone, password })
        });
        if (res && res.status !== 405) {
          try {
            data = await res.json();
          } catch (e) {
            data = null;
          }
        }
      } catch (netErr) {
        res = null;
        data = null;
      }

      if (res && data) {
        if (res.ok && data.status === 'success') {
          handleAuthSuccess(data);
        } else if (res.status === 429 || data.code === 'ACCOUNT_LOCKED') {
          startLockoutCountdown(data.retryAfter || 60);
        } else if (res.status === 404 || data.code === 'ACCOUNT_NOT_FOUND') {
          showAlert('❌ Account does not exist with this mobile number');
        } else {
          const msg = data.detail || data.message || 'Password incorrect. Please check and try again';
          showAlert('❌ ' + msg);
        }
        return;
      }

      showAlert('❌ Unable to reach FROSE server. Please check your connection and try again.');
    });
  }

  (function checkDeepLinkParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const stallParam = params.get('stall') || params.get('phone');
      const pwdParam = params.get('pwd') || params.get('password');
      const auto = params.get('autologin');

      if (stallParam && phoneInput) {
        phoneInput.value = stallParam.replace(/\D/g, '').slice(-10);
      }
      if (pwdParam && pwdInput) {
        pwdInput.value = pwdParam;
      }
      if (auto === '1' && phoneInput && pwdInput && phoneInput.value && pwdInput.value) {
        setTimeout(() => {
          if (formPwd) {
            formPwd.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
          }
        }, 300);
      }
    } catch (e) {}
  })();
})();
