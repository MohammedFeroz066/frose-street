/**
 * FROSE Street — 60-Second Vendor Onboarding & Registration Logic
 * Handles 3-step wizard, preset selection, live billing preview,
 * input validation, and API submission.
 */

(function () {
  'use strict';

  // Available Street Menu Presets with dish items
  const MENU_PRESETS = {
    momos_chinese: {
      name: 'Momos & Chinese',
      emoji: '🥟',
      items: [
        { name: 'Veg Steamed Momos', priceRupees: 60, emoji: '🥟', category: 'Momos' },
        { name: 'Paneer Fried Momos', priceRupees: 80, emoji: '🥟', category: 'Momos' },
        { name: 'Chicken Steamed Momos', priceRupees: 90, emoji: '🥟', category: 'Momos' },
        { name: 'Veg Hakka Noodles', priceRupees: 80, emoji: '🍜', category: 'Chinese' },
        { name: 'Veg Manchurian Dry', priceRupees: 90, emoji: '🍲', category: 'Chinese' },
        { name: 'Chilli Chicken Dry', priceRupees: 120, emoji: '🍗', category: 'Chinese' },
      ],
    },
    chai_nashta: {
      name: 'Chai & Nashta',
      emoji: '☕',
      items: [
        { name: 'Special Masala Chai', priceRupees: 15, emoji: '☕', category: 'Tea' },
        { name: 'Hyderabadi Irani Chai', priceRupees: 20, emoji: '☕', category: 'Tea' },
        { name: 'Hot Aloo Samosa (2 pcs)', priceRupees: 25, emoji: '🥟', category: 'Snacks' },
        { name: 'Bun Maska Butter', priceRupees: 35, emoji: '🍞', category: 'Bakery' },
        { name: 'Osmania Biscuits (4 pcs)', priceRupees: 20, emoji: '🍪', category: 'Bakery' },
        { name: 'Kanda Poha Plate', priceRupees: 30, emoji: '🥣', category: 'Snacks' },
      ],
    },
    chaat_panipuri: {
      name: 'Chaat & Pani Puri',
      emoji: '🥘',
      items: [
        { name: 'Pani Puri (6 pcs)', priceRupees: 30, emoji: '🥘', category: 'Pani Puri' },
        { name: 'Mumbai Sev Puri', priceRupees: 40, emoji: '🍛', category: 'Chaat' },
        { name: 'Royal Dahi Puri', priceRupees: 50, emoji: '🍧', category: 'Chaat' },
        { name: 'Crispy Papdi Chaat', priceRupees: 45, emoji: '🥗', category: 'Chaat' },
        { name: 'Hot Aloo Tikki Chaat', priceRupees: 50, emoji: '🍲', category: 'Chaat' },
        { name: 'Sukha Bhel Puri', priceRupees: 35, emoji: '🍿', category: 'Chaat' },
      ],
    },
    shawarma_rolls: {
      name: 'Shawarma & Rolls',
      emoji: '🌯',
      items: [
        { name: 'Rumali Chicken Shawarma', priceRupees: 90, emoji: '🌯', category: 'Shawarma' },
        { name: 'Special Jumbo Shawarma', priceRupees: 130, emoji: '🌯', category: 'Shawarma' },
        { name: 'Paneer Tikka Roll', priceRupees: 80, emoji: '🌯', category: 'Rolls' },
        { name: 'Double Egg Roll', priceRupees: 65, emoji: '🍳', category: 'Rolls' },
        { name: 'Salted French Fries', priceRupees: 60, emoji: '🍟', category: 'Sides' },
      ],
    },
    south_indian_tiffin: {
      name: 'South Indian Tiffin',
      emoji: '🥞',
      items: [
        { name: 'Steamed Idli Sambar (2)', priceRupees: 40, emoji: '⚪', category: 'Tiffin' },
        { name: 'Crispy Medu Vada (2)', priceRupees: 45, emoji: '🍩', category: 'Tiffin' },
        { name: 'Masala Butter Dosa', priceRupees: 65, emoji: '🥞', category: 'Dosa' },
        { name: 'Ghee Roast Plain Dosa', priceRupees: 50, emoji: '🥞', category: 'Dosa' },
        { name: 'Onion Tomato Uttapam', priceRupees: 60, emoji: '🍕', category: 'Tiffin' },
        { name: 'Filter Degree Coffee', priceRupees: 25, emoji: '☕', category: 'Beverage' },
      ],
    },
    burgers_fries: {
      name: 'Burgers & Fries',
      emoji: '🍔',
      items: [
        { name: 'Crispy Veg Patty Burger', priceRupees: 55, emoji: '🍔', category: 'Burgers' },
        { name: 'Double Cheese Chicken Burger', priceRupees: 95, emoji: '🍔', category: 'Burgers' },
        { name: 'Peri Peri French Fries', priceRupees: 70, emoji: '🍟', category: 'Sides' },
        { name: 'Paneer Crisp Wrap', priceRupees: 80, emoji: '🌯', category: 'Wraps' },
        { name: 'Chilled Thums Up 250ml', priceRupees: 20, emoji: '🥤', category: 'Drinks' },
      ],
    },
  };

  // State Management
  let currentStep = 1;
  let selectedPresetKey = 'momos_chinese';
  let selectedEdition = 'cloud';

  // DOM Elements
  const stepSection1 = document.getElementById('step-section-1');
  const stepSection2 = document.getElementById('step-section-2');
  const stepSection3 = document.getElementById('step-section-3');

  const stepPill1 = document.getElementById('step-pill-1');
  const stepPill2 = document.getElementById('step-pill-2');
  const stepPill3 = document.getElementById('step-pill-3');

  const line12 = document.getElementById('line-1-2');
  const line23 = document.getElementById('line-2-3');

  const stallNameInput = document.getElementById('stall-name');
  const phoneInput = document.getElementById('phone-number');
  const businessTypeSelect = document.getElementById('business-type');
  const cityInput = document.getElementById('city-name');
  const upiIdInput = document.getElementById('upi-id');
  const quickPinInput = document.getElementById('quick-pin');
  const passwordInput = document.getElementById('account-password');

  const btnGotoStep2 = document.getElementById('btn-goto-step-2');
  const btnBackToStep1 = document.getElementById('btn-back-to-step-1');
  const btnGotoStep3 = document.getElementById('btn-goto-step-3');
  const btnBackToStep2 = document.getElementById('btn-back-to-step-2');
  const btnRegisterSubmit = document.getElementById('btn-register-submit');

  const presetsGrid = document.getElementById('presets-grid');
  const presetItemsPreview = document.getElementById('preset-items-preview');
  const previewItemCount = document.getElementById('preview-item-count');

  const editionCardCloud = document.getElementById('edition-card-cloud');
  const editionCardLocal = document.getElementById('edition-card-local');
  const alertBox = document.getElementById('onboarding-alert');

  // Render Preset Live Preview
  function renderPresetPreview(presetKey) {
    const preset = MENU_PRESETS[presetKey];
    if (!preset || !presetItemsPreview) return;

    previewItemCount.textContent = `${preset.items.length} Pre-Configured Dishes`;
    const { el, clear } = window.FroseSafeDom;
    clear(presetItemsPreview);
    preset.items.forEach((item) => {
      presetItemsPreview.appendChild(
        el('div', { class: 'preview-item-card' }, [
          el('div', { class: 'preview-item-emoji' }, item.emoji),
          el('div', { class: 'preview-item-info' }, [
            el('div', { class: 'preview-item-name' }, item.name),
            el('div', { class: 'preview-item-cat' }, item.category),
          ]),
          el('div', { class: 'preview-item-price' }, `₹${item.priceRupees}`),
        ])
      );
    });
  }

  // Stepper Transition
  function goToStep(step) {
    currentStep = step;

    // Reset visibility
    stepSection1.classList.remove('active');
    stepSection2.classList.remove('active');
    stepSection3.classList.remove('active');

    stepPill1.classList.remove('active', 'completed');
    stepPill2.classList.remove('active', 'completed');
    stepPill3.classList.remove('active', 'completed');

    line12.classList.remove('active');
    line23.classList.remove('active');

    if (step === 1) {
      stepSection1.classList.add('active');
      stepPill1.classList.add('active');
    } else if (step === 2) {
      stepSection2.classList.add('active');
      stepPill1.classList.add('completed');
      stepPill2.classList.add('active');
      line12.classList.add('active');
      renderPresetPreview(selectedPresetKey);
    } else if (step === 3) {
      stepSection3.classList.add('active');
      stepPill1.classList.add('completed');
      stepPill2.classList.add('completed');
      stepPill3.classList.add('active');
      line12.classList.add('active');
      line23.classList.add('active');
      if (quickPinInput) quickPinInput.focus();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Show Alert Banner
  function showAlert(message, type = 'error') {
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `onboarding-alert ${type}`;
    alertBox.style.display = 'block';
  }

  function hideAlert() {
    if (!alertBox) return;
    alertBox.style.display = 'none';
  }

  // Step 1 Validation
  function validateStep1() {
    hideAlert();
    const stallName = (stallNameInput.value || '').trim();
    const phone = (phoneInput.value || '').replace(/\D/g, '');
    const upiId = (upiIdInput.value || '').trim();

    if (!stallName) {
      showAlert('Please enter your stall or business name.');
      stallNameInput.focus();
      return false;
    }

    if (phone.length !== 10) {
      showAlert('Please enter a valid 10-digit mobile number.');
      phoneInput.focus();
      return false;
    }

    if (!upiId) {
      showAlert('Please enter your UPI VPA (e.g. mystall@upi) for dynamic customer QR.');
      upiIdInput.focus();
      return false;
    }

    return true;
  }

  // Step 3 Validation
  function validateStep3() {
    hideAlert();
    const password = (passwordInput ? passwordInput.value : '');
    if (password.length < 10) {
      showAlert('Please enter a master password or passphrase of at least 10 characters.');
      if (passwordInput) passwordInput.focus();
      return false;
    }

    const pin = (quickPinInput.value || '').trim();

    if (!/^\d{4}$/.test(pin)) {
      showAlert('Please enter an exact 4-digit numeric PIN for terminal unlock.');
      quickPinInput.focus();
      return false;
    }

    return true;
  }

  // Wire Event Listeners
  if (btnGotoStep2) {
    btnGotoStep2.addEventListener('click', () => {
      if (validateStep1()) {
        goToStep(2);
      }
    });
  }

  if (btnBackToStep1) {
    btnBackToStep1.addEventListener('click', () => {
      goToStep(1);
    });
  }

  if (btnGotoStep3) {
    btnGotoStep3.addEventListener('click', () => {
      goToStep(3);
    });
  }

  if (btnBackToStep2) {
    btnBackToStep2.addEventListener('click', () => {
      goToStep(2);
    });
  }

  // Preset Card Clicks
  if (presetsGrid) {
    presetsGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.preset-choice-card');
      if (!card) return;

      document.querySelectorAll('.preset-choice-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPresetKey = card.getAttribute('data-preset');
      renderPresetPreview(selectedPresetKey);
    });
  }

  // Edition Card Clicks
  if (editionCardCloud && editionCardLocal) {
    editionCardCloud.addEventListener('click', () => {
      editionCardCloud.classList.add('selected');
      editionCardLocal.classList.remove('selected');
      selectedEdition = 'cloud';
    });

    editionCardLocal.addEventListener('click', () => {
      editionCardLocal.classList.add('selected');
      editionCardCloud.classList.remove('selected');
      selectedEdition = 'local';
    });
  }

  // Auto-format phone input (digits only)
  if (phoneInput) {
    phoneInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    });
  }

  // Auto-format PIN input (digits only)
  if (quickPinInput) {
    quickPinInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    });
  }

  // Submission Handler
  if (btnRegisterSubmit) {
    btnRegisterSubmit.addEventListener('click', async () => {
      if (!validateStep1()) {
        goToStep(1);
        return;
      }
      if (!validateStep3()) {
        return;
      }

      const stallName = stallNameInput.value.trim();
      const phone = phoneInput.value.replace(/\D/g, '');
      const businessType = businessTypeSelect.value;
      const city = cityInput.value.trim() || 'Hyderabad';
      const upiId = upiIdInput.value.trim();
      const quickPin = quickPinInput.value.trim();

      const { el, svgEl, clear } = window.FroseSafeDom;
      const restoreSubmitButton = () => {
        btnRegisterSubmit.disabled = false;
        clear(btnRegisterSubmit);
        btnRegisterSubmit.appendChild(
          svgEl('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }, [
            svgEl('polyline', { points: '20 6 9 17 4 12' }),
          ])
        );
        btnRegisterSubmit.appendChild(el('span', {}, 'Activate Stall & Launch Billing Counter'));
      };

      btnRegisterSubmit.disabled = true;
      clear(btnRegisterSubmit);
      btnRegisterSubmit.appendChild(el('span', { class: 'spinner-icon' }));
      btnRegisterSubmit.appendChild(el('span', {}, 'Configuring Stall in 60s...'));
      hideAlert();

      try {
        const fn = window.froseApiFetch || fetch;
        const response = await fn('/api/v1/auth/register-stall', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-FROSE-CSRF': '1',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            businessName: stallName,
            phone,
            password: (passwordInput ? passwordInput.value : '').trim(),
            businessType,
            city,
            upiId,
            quickPin,
            presetKey: selectedPresetKey,
            edition: selectedEdition,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          const errMsg = data?.error?.message || data?.message || 'Registration failed. Please check inputs.';
          showAlert(errMsg, 'error');
          restoreSubmitButton();
          return;
        }

        // Store active stall info & enforce vendor-scoped IndexedDB isolation (wipe any prior tenant)
        try {
          if (window.FroseIdbStore && data.vendor && data.vendor.id) {
            const prevVendorId = await window.FroseIdbStore.getActiveVendorId();
            if (prevVendorId && prevVendorId !== data.vendor.id) {
              window.FroseIdbStore.clearSessionStorageKeys();
            }
            await window.FroseIdbStore.ensureVendorScope(data.vendor.id);
            await window.FroseIdbStore.setMeta('vendor_profile', { vendor_id: data.vendor.id, value: data.vendor });
          }
          localStorage.removeItem('frose_vendors_directory');
          localStorage.removeItem('frose_dishes_active');
          localStorage.removeItem('frose_cats_active');
          localStorage.removeItem('frose_live_orders_queue');
          localStorage.setItem('frose_current_vendor', JSON.stringify(data.vendor));
          localStorage.setItem('frose_stall_name', data.vendor.businessName);
          localStorage.setItem('frose_stall_phone', data.vendor.phone);
          localStorage.setItem('frose_session_active', '1');
        } catch {
          // LocalStorage fallback
        }

        showAlert(`🎉 Welcome, ${data.vendor.businessName}! Seeded ${data.seededItemsCount || 6} menu items. Launching billing...`, 'success');

        // Redirect to Billing Portal
        setTimeout(() => {
          window.location.href = '/billing';
        }, 1200);

      } catch (err) {
        console.error('Registration network error:', err);
        showAlert('Network communication error. Please verify server connection.', 'error');
        restoreSubmitButton();
      }
    });
  }

  // Initialize preview on page load
  renderPresetPreview(selectedPresetKey);

})();
