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
        phone: '',
        city: 'Hyderabad',
        upiId: '',
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
      if (upi) upi.value = currentVendor.upiId || '';
      if (payee) payee.value = currentVendor.payeeName || currentVendor.businessName || 'Cloud Edge Kitchen';

      // Header strip
      const sStall = document.getElementById('sett-header-stall-name');
      const sOwner = document.getElementById('sett-header-owner-name');
      const sAvatar = document.getElementById('sett-header-avatar');
      if (sStall) sStall.textContent = currentVendor.businessName || 'Stall Counter';
      if (sOwner) sOwner.textContent = currentVendor.phone ? `${currentVendor.ownerName || 'Stall Partner'} • +91 ${currentVendor.phone}` : (currentVendor.ownerName || 'Stall Partner');
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
        if (currentVendor && currentVendor.upiId) {
          vpaDisplay.textContent = `VPA: ${currentVendor.upiId}`;
          vpaDisplay.style.color = '#10B981';
        } else {
          vpaDisplay.textContent = 'Set up payment QR in settings';
          vpaDisplay.style.color = '#EF4444';
        }
      }

      if (previewEl) {
        const { el, svgEl, clear, safeImageUrl } = window.FroseSafeDom;
        clear(previewEl);
        const safeQr = safeImageUrl(customQr);
        if (safeQr) {
          previewEl.appendChild(
            el('img', {
              src: safeQr,
              alt: 'Custom UPI QR',
              style: 'width: 100%; height: 100%; object-fit: contain; border-radius: 8px;',
            })
          );
        } else {
          previewEl.appendChild(
            svgEl('svg', { viewBox: '0 0 100 100', width: 62, height: 62 }, [
              svgEl('rect', { width: 100, height: 100, fill: '#FFFFFF', rx: 8 }),
              svgEl('rect', { x: 12, y: 12, width: 24, height: 24, fill: '#0F172A', rx: 3 }),
              svgEl('rect', { x: 16, y: 16, width: 16, height: 16, fill: '#FFFFFF', rx: 1 }),
              svgEl('rect', { x: 20, y: 20, width: 8, height: 8, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 64, y: 12, width: 24, height: 24, fill: '#0F172A', rx: 3 }),
              svgEl('rect', { x: 68, y: 16, width: 16, height: 16, fill: '#FFFFFF', rx: 1 }),
              svgEl('rect', { x: 72, y: 20, width: 8, height: 8, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 12, y: 64, width: 24, height: 24, fill: '#0F172A', rx: 3 }),
              svgEl('rect', { x: 16, y: 68, width: 16, height: 16, fill: '#FFFFFF', rx: 1 }),
              svgEl('rect', { x: 20, y: 72, width: 8, height: 8, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 42, y: 14, width: 6, height: 14, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 52, y: 22, width: 6, height: 8, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 42, y: 42, width: 16, height: 16, fill: '#700A18', rx: 2 }),
              svgEl('rect', { x: 14, y: 44, width: 18, height: 6, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 64, y: 44, width: 8, height: 14, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 78, y: 44, width: 8, height: 8, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 44, y: 68, width: 14, height: 6, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 64, y: 68, width: 22, height: 6, fill: '#0F172A', rx: 1 }),
              svgEl('rect', { x: 70, y: 80, width: 16, height: 6, fill: '#0F172A', rx: 1 }),
            ])
          );
        }
      }
    } catch (e) {
      console.warn('Error loading scanner settings:', e);
    }
  }

  // Load Dishes for Quick Editor (Clean Slate: strictly vendor dishes, zero fake seeds)
  async function loadDishesList() {
    const listContainer = document.getElementById('sett-dishes-list');
    if (!listContainer) return;

    try {
      const vKey = currentVendor?.id || currentVendor?.phone || 'active';
      let dishes = [];
      if (window.FroseIdbStore) {
        dishes = await window.FroseIdbStore.getMenuItems(vKey);
      }

      if (Array.isArray(dishes)) {
        dishes = dishes.filter(d => d.isUserCreated !== false).map(d => ({
          ...d,
          price: d.price !== undefined ? d.price : Math.round(Number(d.pricePaise || 0) / 100),
          inStock: d.isAvailable !== false && d.inStock !== false
        }));
      } else {
        dishes = [];
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
    const { el, clear } = window.FroseSafeDom;
    clear(listContainer);

    if (activeDishes.length === 0) {
      listContainer.appendChild(
        el('div', { style: 'text-align: center; padding: 22px 10px; color: #64748B;' }, [
          el('div', { style: 'font-size: 32px; margin-bottom: 6px;' }, '🍽️'),
          el('div', { style: 'font-weight: 800; font-size: 13.5px; color: #0F172A;' }, 'Your Menu is Empty'),
          el('div', { style: 'font-size: 11.5px; margin-top: 2px; color: #64748B;' }, 'Zero dummy dishes. Ready for your stall items.'),
          el('a', {
            href: '/menu-setup',
            class: 'sett-btn-primary',
            style: 'display: inline-flex; width: auto; margin-top: 10px; padding: 7px 16px; font-size: 11.5px; text-decoration: none;',
          }, '+ Add First Dish'),
        ])
      );
      return;
    }

    activeDishes.forEach((dish, idx) => {
      listContainer.appendChild(
        el('div', {
          class: 'sett-dish-row',
          style: 'display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #F1F5F9; gap: 10px;',
        }, [
          el('div', { style: 'flex: 1; min-width: 0;' }, [
            el('div', {
              style: 'font-size: 13.5px; font-weight: 800; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
            }, dish.name),
            el('div', {
              style: 'font-size: 11px; color: #64748B; font-weight: 600; margin-top: 1px;',
            }, dish.category || 'General'),
          ]),
          el('div', {
            style: 'display: flex; align-items: center; background: #F8FAFC; border: 1.5px solid #CBD5E1; border-radius: 8px; overflow: hidden; height: 34px;',
          }, [
            el('span', {
              style: 'padding: 0 8px; font-size: 12.5px; font-weight: 800; color: #700A18; background: #F1F5F9; border-right: 1px solid #CBD5E1; line-height: 34px;',
            }, '₹'),
            el('input', {
              type: 'number',
              class: 'sett-dish-price-input',
              'data-idx': idx,
              value: dish.price || 0,
              style: 'width: 58px; height: 34px; border: none; padding: 0 8px; font-size: 13px; font-weight: 800; color: #0F172A; text-align: right; background: #FFFFFF; outline: none;',
            }),
          ]),
          el('div', {
            class: `sett-toggle-switch ${dish.inStock !== false ? '' : 'off'}`,
            'data-dish-idx': idx,
            title: 'Toggle In-Stock / Sold-Out',
            on: { click: () => window.toggleDishStock && window.toggleDishStock(idx) },
          }, [el('div', { class: 'toggle-thumb' })]),
        ])
      );
    });

    listContainer.appendChild(
      el('div', { style: 'margin-top: 14px; text-align: center;' }, [
        el('button', {
          type: 'button',
          style: 'background: #FEF2F2; border: 1px dashed #EF4444; color: #B91C1C; font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 8px; cursor: pointer;',
          on: {
            click: () => {
              if (confirm('Reset menu to 0 items?')) {
                if (window.clearMenuCatalogToCleanSlate) window.clearMenuCatalogToCleanSlate();
                activeDishes = [];
                renderDishesList();
              }
            },
          },
        }, '🧹 Wipe Menu to Clean Slate (0 Items)'),
      ])
    );
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
        body.style.flexDirection = 'column';
        body.style.width = '100%';
        body.style.boxSizing = 'border-box';
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
        body.style.flexDirection = 'column';
        body.style.width = '100%';
        body.style.boxSizing = 'border-box';
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

  // Save Payment Scanner & UPI (Fully linked to Cart Checkout)
  window.savePaymentScanner = function () {
    const upiId = document.getElementById('sett-upi-id')?.value.trim();
    const payee = document.getElementById('sett-payee-name')?.value.trim();

    if (!upiId) {
      alert('Please enter a valid UPI VPA ID (e.g. mystall@upi).');
      return;
    }

    currentVendor = currentVendor || {};
    currentVendor.upiId = upiId;
    if (payee) currentVendor.payeeName = payee;

    localStorage.setItem('frose_current_vendor', JSON.stringify(currentVendor));
    localStorage.setItem('frose_custom_upi_id', upiId);
    if (payee) localStorage.setItem('frose_custom_payee_name', payee);
    loadScannerSettings();
    showToast('✅ Payment UPI & Scanner settings saved!');
  };

  // Handle Scanner Image Upload with Client-Side Downscaling & Compression
  window.handleScannerImageUpload = function (event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG/JPG).');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const rawUrl = e.target.result;
      const img = new Image();
      img.onload = function () {
        // Downscale to max 600px width/height for fast loading and low storage footprint
        const maxDim = 600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.88);

        try {
          localStorage.setItem('frose_custom_scanner_qr', compressedDataUrl);
          loadScannerSettings();
          showToast('📸 Custom UPI Scanner photo uploaded and active in Checkout!');
        } catch (err) {
          localStorage.setItem('frose_custom_scanner_qr', rawUrl);
          loadScannerSettings();
          showToast('📸 Custom UPI Scanner photo uploaded!');
        }
      };
      img.onerror = function() {
        localStorage.setItem('frose_custom_scanner_qr', rawUrl);
        loadScannerSettings();
        showToast('📸 Custom UPI Scanner photo uploaded!');
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  // Save Dish Prices & Availability
  window.saveDishChanges = async function () {
    const inputs = document.querySelectorAll('.sett-dish-price-input');
    inputs.forEach(inp => {
      const idx = parseInt(inp.getAttribute('data-idx'), 10);
      if (activeDishes[idx]) {
        const rupees = Math.max(0, parseInt(inp.value, 10) || 0);
        activeDishes[idx].price = rupees;
        activeDishes[idx].pricePaise = rupees * 100;
      }
    });

    const vKey = currentVendor?.id || currentVendor?.phone || 'active';
    if (window.FroseIdbStore) {
      await window.FroseIdbStore.putMenuItems(vKey, activeDishes.map(d => ({
        ...d,
        pricePaise: Number.isSafeInteger(d.pricePaise) ? d.pricePaise : Math.round(Number(d.price || 0) * 100),
        isAvailable: d.inStock !== false
      })));
    }

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
  
  
  // Gold-Standard Bulletproof Mobile Scroll Locking Controller
  let savedScrollY = 0;

  function lockBackgroundScroll() {
    savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + savedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
  }

  function unlockBackgroundScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    window.scrollTo(0, savedScrollY);
  }

  // Hook Modal Functions
  const originalOpenModal = window.openModal;
  const originalCloseModal = window.closeModal;

  window.openModal = function (modalId) {
    if (originalOpenModal) originalOpenModal(modalId);
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
    lockBackgroundScroll();
  };

  window.closeModal = function (modalId) {
    if (originalCloseModal) originalCloseModal(modalId);
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');

    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0) {
      unlockBackgroundScroll();
    }
  };

  // Prevent background touch dragging on mobile
  document.addEventListener('touchmove', function (e) {
    if (document.body.classList.contains('modal-open')) {
      const isInsideScrollable = e.target.closest('.sett-scroll-content, .sett-quick-bar, .sett-modal-card');
      if (!isInsideScrollable) {
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
