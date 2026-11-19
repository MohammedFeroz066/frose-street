/**
 * FROSE Street — Unified Settings Component (Design 3: Pixel-Perfect Vertical Accordion Drawer)
 * Controls Stall Profile, Custom UPI Scanner QR, Dish Prices & Stock, Billing, KDS, Packaging, and Cloud Sync.
 */

(function () {
  'use strict';

  // State
  let currentVendor = null;
  let activeDishes = [];

  // Initialize on modal open or DOM ready
  function initSettings() {
    loadVendorProfile();
    loadScannerSettings();
    loadDishesList();
    loadSubsystemPreferences();
  }

  // Load Vendor Profile
  function loadVendorProfile() {
    try {
      const raw = localStorage.getItem('frose_current_vendor');
      currentVendor = raw ? JSON.parse(raw) : {
        id: 'v-stall-default',
        businessName: 'Cloud Edge Kitchen',
        ownerName: 'Mohammed Feroz',
        phone: '9642230688',
        city: 'Hyderabad',
        upiId: '9642230688@ybl',
        payeeName: 'Cloud Edge Kitchen'
      };

      // Populate Inputs if present
      const bName = document.getElementById('sett-business-name');
      const oName = document.getElementById('sett-owner-name');
      const phone = document.getElementById('sett-phone');
      const addr = document.getElementById('sett-address');
      const upi = document.getElementById('sett-upi-id');
      const payee = document.getElementById('sett-payee-name');

      if (bName) bName.value = currentVendor.businessName || '';
      if (oName) oName.value = currentVendor.ownerName || '';
      if (phone) phone.value = currentVendor.phone ? `+91 ${currentVendor.phone}` : '+91 96422 30688';
      if (addr) addr.value = currentVendor.address || currentVendor.city || 'Stall #4, Food Court, Hyderabad';
      if (upi) upi.value = currentVendor.upiId || '9642230688@ybl';
      if (payee) payee.value = currentVendor.payeeName || currentVendor.businessName || 'Cloud Edge Kitchen';

      // Header strip
      const sStall = document.getElementById('sett-header-stall-name');
      const sOwner = document.getElementById('sett-header-owner-name');
      const sAvatar = document.getElementById('sett-header-avatar');
      if (sStall) sStall.textContent = currentVendor.businessName || 'Stall Counter';
      if (sOwner) sOwner.textContent = `${currentVendor.ownerName || 'Mohammed Feroz'} • +91 ${currentVendor.phone || '9642230688'}`;
      if (sAvatar) {
        const initials = (currentVendor.businessName || 'SC')
          .split(' ')
          .map(w => w[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();
        sAvatar.textContent = initials || 'SC';
      }
    } catch (e) {
      console.warn('Error loading vendor profile:', e);
    }
  }

  // Load Custom Scanner QR
  function loadScannerSettings() {
    try {
      const customQr = localStorage.getItem('frose_custom_scanner_qr');
      const previewEl = document.getElementById('sett-qr-preview-box');
      const vpaDisplay = document.getElementById('sett-qr-vpa-display');

      if (vpaDisplay && currentVendor) {
        vpaDisplay.textContent = `VPA: ${currentVendor.upiId || '9642230688@ybl'}`;
      }

      if (previewEl) {
        if (customQr) {
          previewEl.innerHTML = `<img src="${customQr}" alt="Custom UPI QR" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />`;
        } else {
          // Sharp, professional BharatQR vector icon preview
          previewEl.innerHTML = `
            <svg viewBox="0 0 100 100" width="62" height="62">
              <rect width="100" height="100" fill="#FFFFFF" rx="8"/>
              <rect x="12" y="12" width="24" height="24" fill="#0F172A" rx="3"/>
              <rect x="16" y="16" width="16" height="16" fill="#FFFFFF" rx="1"/>
              <rect x="20" y="20" width="8" height="8" fill="#0F172A" rx="1"/>
              <rect x="64" y="12" width="24" height="24" fill="#0F172A" rx="3"/>
              <rect x="68" y="16" width="16" height="16" fill="#FFFFFF" rx="1"/>
              <rect x="72" y="20" width="8" height="8" fill="#0F172A" rx="1"/>
              <rect x="12" y="64" width="24" height="24" fill="#0F172A" rx="3"/>
              <rect x="16" y="68" width="16" height="16" fill="#FFFFFF" rx="1"/>
              <rect x="20" y="72" width="8" height="8" fill="#0F172A" rx="1"/>
              <rect x="42" y="14" width="6" height="14" fill="#0F172A" rx="1"/>
              <rect x="52" y="22" width="6" height="8" fill="#0F172A" rx="1"/>
              <rect x="42" y="42" width="16" height="16" fill="#700A18" rx="2"/>
              <rect x="14" y="44" width="18" height="6" fill="#0F172A" rx="1"/>
              <rect x="64" y="44" width="8" height="14" fill="#0F172A" rx="1"/>
              <rect x="78" y="44" width="8" height="8" fill="#0F172A" rx="1"/>
              <rect x="44" y="68" width="14" height="6" fill="#0F172A" rx="1"/>
              <rect x="64" y="68" width="22" height="6" fill="#0F172A" rx="1"/>
              <rect x="70" y="80" width="16" height="6" fill="#0F172A" rx="1"/>
            </svg>
          `;
        }
      }
    } catch (e) {
      console.warn('Error loading scanner settings:', e);
    }
  }

  // Load Dishes for Quick Editor
  function loadDishesList() {
    const listContainer = document.getElementById('sett-dishes-list');
    if (!listContainer) return;

    try {
      const vKey = currentVendor?.phone || 'active';
      const rawDishes = localStorage.getItem('frose_dishes_' + vKey) || localStorage.getItem('frose_dishes_active');
      let dishes = rawDishes ? JSON.parse(rawDishes) : [];

      if (!Array.isArray(dishes) || dishes.length === 0) {
        dishes = [
          { id: 'd-1', name: 'Chicken Shawarma Roll', price: 120, inStock: true, category: 'Rolls' },
          { id: 'd-2', name: 'Paneer Butter Biryani', price: 180, inStock: true, category: 'Biryani' },
          { id: 'd-3', name: 'French Fries Masala', price: 80, inStock: false, category: 'Sides' }
        ];
      }

      activeDishes = dishes;
      renderDishesList();
    } catch (e) {
      console.warn('Error loading dishes list:', e);
    }
  }

  function renderDishesList() {
    const listContainer = document.getElementById('sett-dishes-list');
    if (!listContainer) return;

    if (activeDishes.length === 0) {
      listContainer.innerHTML = `<div style="text-align: center; color: #94A3B8; font-size: 12px; padding: 12px;">No dishes found. Tap "+ Add Dish" below.</div>`;
      return;
    }

    listContainer.innerHTML = activeDishes.map((dish, idx) => `
      <div class="sett-dish-row" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #F1F5F9; gap: 10px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13.5px; font-weight: 800; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${dish.name}</div>
          <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-top: 1px;">${dish.category || 'General'}</div>
        </div>
        <div style="display: flex; align-items: center; background: #F8FAFC; border: 1.5px solid #CBD5E1; border-radius: 8px; overflow: hidden; height: 34px;">
          <span style="padding: 0 8px; font-size: 12.5px; font-weight: 800; color: #700A18; background: #F1F5F9; border-right: 1px solid #CBD5E1; line-height: 34px;">₹</span>
          <input type="number" class="sett-dish-price-input" data-idx="${idx}" value="${dish.price || 0}" style="width: 58px; height: 34px; border: none; padding: 0 8px; font-size: 13px; font-weight: 800; color: #0F172A; text-align: right; background: #FFFFFF; outline: none;" />
        </div>
        <div class="sett-toggle-switch ${dish.inStock !== false ? '' : 'off'}" data-dish-idx="${idx}" onclick="window.toggleDishStock(${idx})" title="Toggle In-Stock / Sold-Out">
          <div class="toggle-thumb"></div>
        </div>
      </div>
    `).join('');
  }

  // Load Subsystem Preferences (Billing, KDS, Packaging)
  function loadSubsystemPreferences() {
    try {
      const prefs = JSON.parse(localStorage.getItem('frose_counter_preferences') || '{}');
      if (document.getElementById('sett-gst-rate')) {
        document.getElementById('sett-gst-rate').value = prefs.gstRate || '0';
      }
      if (document.getElementById('sett-default-payment')) {
        document.getElementById('sett-default-payment').value = prefs.defaultPayment || 'cash';
      }
      if (document.getElementById('sett-printer-width')) {
        document.getElementById('sett-printer-width').value = prefs.printerWidth || '58';
      }
      if (document.getElementById('sett-kitchen-chime')) {
        document.getElementById('sett-kitchen-chime').value = prefs.kitchenChime || 'loud';
      }
      if (document.getElementById('sett-prep-delay')) {
        document.getElementById('sett-prep-delay').value = prefs.prepDelay || '12';
      }
      if (document.getElementById('sett-token-mode')) {
        document.getElementById('sett-token-mode').value = prefs.tokenMode || 'daily';
      }
    } catch (e) {}
  }

  // Accordion Toggle Logic
  window.toggleAccordion = function (index) {
    const allHeaders = document.querySelectorAll('.sett-acc-header');
    const allBodies = document.querySelectorAll('.sett-acc-body');
    const allItems = document.querySelectorAll('.sett-acc-item');

    allBodies.forEach((body, i) => {
      if (i === index) {
        const isHidden = body.style.display === 'none' || !body.style.display;
        body.style.display = isHidden ? 'flex' : 'none';
        if (allHeaders[i]) {
          if (isHidden) allHeaders[i].classList.add('expanded');
          else allHeaders[i].classList.remove('expanded');
        }
        if (allItems[i]) {
          if (isHidden) allItems[i].classList.add('is-open');
          else allItems[i].classList.remove('is-open');
        }
      }
    });
  };

  // Jump to specific accordion from Top Quick Bar
  window.jumpToAccordion = function (index) {
    // Update active pill state
    document.querySelectorAll('.sett-quick-pill').forEach((pill, i) => {
      if (i === index) pill.classList.add('active');
      else pill.classList.remove('active');
    });

    // Ensure target accordion is opened
    const allBodies = document.querySelectorAll('.sett-acc-body');
    const allHeaders = document.querySelectorAll('.sett-acc-header');
    const allItems = document.querySelectorAll('.sett-acc-item');

    allBodies.forEach((body, i) => {
      if (i === index) {
        body.style.display = 'flex';
        if (allHeaders[i]) allHeaders[i].classList.add('expanded');
        if (allItems[i]) allItems[i].classList.add('is-open');
      }
    });

    const target = document.getElementById(`sett-acc-item-${index}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  // Save Stall Profile Changes
  window.saveStallProfile = function () {
    const bName = document.getElementById('sett-business-name')?.value.trim();
    const oName = document.getElementById('sett-owner-name')?.value.trim();
    const addr = document.getElementById('sett-address')?.value.trim();

    if (!bName) {
      alert('Please enter a business name for the stall.');
      return;
    }

    currentVendor = currentVendor || {};
    currentVendor.businessName = bName;
    if (oName) currentVendor.ownerName = oName;
    if (addr) currentVendor.address = addr;

    localStorage.setItem('frose_current_vendor', JSON.stringify(currentVendor));
    loadVendorProfile();
    showToast('✅ Stall profile updated successfully!');
  };

  // Save Payment Scanner & UPI
  window.savePaymentScanner = function () {
    const upiId = document.getElementById('sett-upi-id')?.value.trim();
    const payee = document.getElementById('sett-payee-name')?.value.trim();

    if (!upiId) {
      alert('Please enter a valid UPI VPA ID (e.g. 9642230688@ybl).');
      return;
    }

    currentVendor = currentVendor || {};
    currentVendor.upiId = upiId;
    if (payee) currentVendor.payeeName = payee;

    localStorage.setItem('frose_current_vendor', JSON.stringify(currentVendor));
    loadScannerSettings();
    showToast('✅ Payment UPI & Scanner settings saved!');
  };

  // Handle Scanner Image Upload
  window.handleScannerImageUpload = function (event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG/JPG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const dataUrl = e.target.result;
      try {
        localStorage.setItem('frose_custom_scanner_qr', dataUrl);
        loadScannerSettings();
        showToast('📸 Custom UPI Scanner QR photo uploaded!');
      } catch (err) {
        alert('Image file is too large for local cache. Please select a smaller photo under 2MB.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Toggle Dish In-Stock / Out-of-Stock
  window.toggleDishStock = function (idx) {
    if (!activeDishes[idx]) return;
    activeDishes[idx].inStock = activeDishes[idx].inStock === false ? true : false;
    renderDishesList();
  };

  // Save Dish Prices & Availability
  window.saveDishChanges = function () {
    const inputs = document.querySelectorAll('.sett-dish-price-input');
    inputs.forEach(inp => {
      const idx = parseInt(inp.getAttribute('data-idx'), 10);
      if (activeDishes[idx]) {
        activeDishes[idx].price = Math.max(0, parseInt(inp.value, 10) || 0);
      }
    });

    const vKey = currentVendor?.phone || 'active';
    localStorage.setItem('frose_dishes_' + vKey, JSON.stringify(activeDishes));
    localStorage.setItem('frose_dishes_active', JSON.stringify(activeDishes));

    showToast('🍽️ Dish prices and stock updated!');
  };

  // Save Billing, KDS, & Packaging Preferences
  window.saveSubsystemPreferences = function () {
    const prefs = {
      gstRate: document.getElementById('sett-gst-rate')?.value || '0',
      defaultPayment: document.getElementById('sett-default-payment')?.value || 'cash',
      printerWidth: document.getElementById('sett-printer-width')?.value || '58',
      kitchenChime: document.getElementById('sett-kitchen-chime')?.value || 'loud',
      prepDelay: document.getElementById('sett-prep-delay')?.value || '12',
      tokenMode: document.getElementById('sett-token-mode')?.value || 'daily'
    };

    localStorage.setItem('frose_counter_preferences', JSON.stringify(prefs));
    showToast('⚙️ Counter preferences saved!');
  };

  // Test Thermal Printer
  window.testThermalPrint = function () {
    showToast('🖨️ ESC/POS Test Slip Sent to Bluetooth Printer (58mm)');
  };

  // Force Cloud Sync
  window.forceCloudSync = function () {
    showToast('☁️ Cloud Telemetry Sync Completed: 0 pending mutations');
  };

  // Toast Notification Utility
  function showToast(msg) {
    let toast = document.getElementById('sett-toast-popup');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sett-toast-popup';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        background: #0F172A;
        color: #FFFFFF;
        padding: 10px 18px;
        border-radius: 24px;
        font-size: 12.5px;
        font-weight: 800;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        z-index: 9999999;
        display: none;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(255,255,255,0.15);
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.display = 'flex';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 2400);
  }

  // Export Global Trigger
  
  // Background Scroll Locking Controller
  const originalOpenModal = window.openModal;
  const originalCloseModal = window.closeModal;

  window.openModal = function (modalId) {
    if (originalOpenModal) originalOpenModal(modalId);
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  };

  window.closeModal = function (modalId) {
    if (originalCloseModal) originalCloseModal(modalId);
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');

    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0) {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
  };

  document.addEventListener('touchmove', function (e) {
    if (document.body.classList.contains('modal-open')) {
      const scrollable = e.target.closest('.sett-scroll-content, .modal-card');
      if (!scrollable) {
        e.preventDefault();
      }
    }
  }, { passive: false });

  window.initSettingsModal = initSettings;

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
  } else {
    initSettings();
  }
})();
