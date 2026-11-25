/**
 * FROSE Street — Billing & Menu POS Controller (Image 2 Parity)
 * 2-Column Responsive Food Grid, Left Category Sidebar, Steppers,
 * Floating Bottom Cart Pill, Dynamic UPI QR, and Menu Customization.
 */

(function () {
  'use strict';

  // In-Memory & Persisted State (Clean Slate: strictly vendor-defined categories and items)
  let menuCatalog = [];
  const cart = new Map(); // dishId -> { item, quantity }
  let activeCategory = '';
  let currentTokenNumber = 1;
  let currentOrderType = 'counter'; // 'counter' | 'dinein'

  function getVendorKey() {
    const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
    return v.id || v.phone || localStorage.getItem('frose_stall_phone') || 'primary_vendor';
  }

  // Format integer paise into exact Rupee string (e.g. ₹190.0)
  function formatRupees(paise) {
    const p = typeof paise === 'bigint' ? paise : BigInt(paise || 0);
    const rupees = Number(p / 100n);
    const remainder = Number(p % 100n);
    return `₹${rupees}${remainder === 0 ? '.0' : '.' + remainder.toString().padStart(2, '0')}`;
  }

        // Clean Slate Legacy Dummy Items Purge & Filter
  const PURGE_KEY = 'frose_clean_slate_2026_v99_permanent_empty';
  if (!localStorage.getItem(PURGE_KEY)) {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('frose_dishes') || k.startsWith('frose_cats') || k === 'frose_custom_menu_catalog')) {
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(PURGE_KEY, 'true');
  }

  const LEGACY_DUMMY_IDS = new Set([
    'dish-naan-01', 'dish-chole-02', 'dish-dalfry-03', 'dish-paneertikka-04',
    'dish-mixveg-05', 'dish-punjabipaneer-06', 'dish-chickenbiryani-07',
    'dish-muttonbiryani-08', 'dish-momos-09', 'dish-chai-10',
    'def-1', 'def-2', 'def-3', 'def-4', 'def-5', 'def-6', 'def-7', 'def-8',
    'd-1', 'd-2', 'd-3'
  ]);

  const LEGACY_DUMMY_NAMES = new Set([
    'butter naan', 'chole bhature', 'dal fry', 'paneer tikka', 'mix veg',
    'punjabi paneer', 'punjabi kadai', 'chicken biryani full', 'mutton biryani full',
    'chicken shawarma roll', 'paneer butter biryani', 'french fries masala',
    'dosa', 'idli', 'idly', 'plain dosa', 'masala dosa', 'kadai paneer'
  ]);

  function isUserCustomDish(item) {
    if (!item || !item.name) return false;
    // Strict requirement: Only dishes explicitly added by vendor in UI are allowed
    if (item.isUserCreated === true) return true;
    return false;
  }

  // Explicit helper to wipe menu to clean slate anytime
  window.clearMenuCatalogToCleanSlate = function() {
    const vKey = getVendorKey();
    localStorage.removeItem('frose_dishes_' + vKey);
    localStorage.removeItem('frose_dishes_active');
    localStorage.removeItem('frose_custom_menu_catalog');
    localStorage.removeItem('frose_cats_' + vKey);
    localStorage.removeItem('frose_cats_active');
    menuCatalog = [];
    cart.clear();
    renderDishesGrid();
    renderSidebarCategories([]);
    updateCartUI();
  };

  // Load Menu Catalog with instant live sync
  async function loadCatalog() {
    const vKey = getVendorKey();
    const token = localStorage.getItem('frose_auth_token');

    // 1. Load custom categories
    let cats = [];
    try {
      const savedCats = localStorage.getItem('frose_cats_' + vKey) || localStorage.getItem('frose_cats_active');
      if (savedCats) {
        cats = JSON.parse(savedCats);
      }
    } catch (e) {}

    // 2. Check vendor-specific dishes in local cache first (instant response, zero lag)
    try {
      const localDishes = localStorage.getItem('frose_dishes_' + vKey) || localStorage.getItem('frose_dishes_active');
      if (localDishes) {
        const parsed = JSON.parse(localDishes);
        if (Array.isArray(parsed)) {
          const userDishes = parsed.filter(isUserCustomDish);
          if (userDishes.length > 0) {
            menuCatalog = userDishes.map(item => ({
              ...item,
              image: item.imageUrl || item.image || '/images/dishes/chicken-biryani-full.webp',
              pricePaise: BigInt(item.pricePaise || 5000)
            }));
            if (cats.length === 0) {
              cats = Array.from(new Set(menuCatalog.map(d => d.category).filter(Boolean)));
            }
            renderSidebarCategories(cats);
            return;
          } else {
            // Local cache only contained legacy dummy dishes: purge them completely!
            localStorage.removeItem('frose_dishes_' + vKey);
            localStorage.removeItem('frose_dishes_active');
            localStorage.removeItem('frose_custom_menu_catalog');
          }
        }
      }
    } catch (e) {}

    // 3. Try fetching from backend API
    if (token) {
      try {
        const res = await fetch('/api/v1/menu', {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.items)) {
            const userDishes = data.items.filter(isUserCustomDish);
            if (userDishes.length > 0) {
              menuCatalog = userDishes.map(item => ({
                ...item,
                image: item.imageUrl || item.image || '/images/dishes/chicken-biryani-full.webp',
                pricePaise: BigInt(item.pricePaise || 5000)
              }));
              localStorage.setItem('frose_dishes_' + vKey, JSON.stringify(menuCatalog.map(d => ({ ...d, pricePaise: d.pricePaise.toString() }))));
              localStorage.setItem('frose_dishes_active', JSON.stringify(menuCatalog.map(d => ({ ...d, pricePaise: d.pricePaise.toString() }))));
              if (cats.length === 0) {
                cats = Array.from(new Set(menuCatalog.map(d => d.category).filter(Boolean)));
              }
              renderSidebarCategories(cats);
              return;
            }
          }
        }
      } catch (e) {}
    }

    // Clean slate: strictly 0 dishes so counter starts empty with + Add Dish
    menuCatalog = [];
    renderSidebarCategories(cats);
  }

  function renderSidebarCategories(customCats) {
    const sidebar = document.getElementById('pos-category-sidebar');
    if (!sidebar) return;

    let categories = [];
    if (Array.isArray(customCats) && customCats.length > 0) {
      categories = [...customCats];
    } else {
      const dishCats = Array.from(new Set(menuCatalog.map(d => d.category).filter(Boolean)));
      if (dishCats.length > 0) {
        categories = dishCats;
      }
    }

    if (categories.length === 0) {
      sidebar.innerHTML = `
        <div style="padding: 14px 4px; text-align: center; color: #8C1D2F; font-size: 11px; font-weight: 800; line-height: 1.3;">
          No Categories
        </div>
        <button type="button" class="btn-add-section" onclick="window.location.href='/menu-setup'" title="Add Custom Menu Section">
          <span>+ Add</span>
          <span>Category</span>
        </button>
      `;
      return;
    }

    // Synchronize activeCategory
    const validSlugs = categories.map(c => c.toLowerCase().replace(/\s+/g, '-'));
    if (!activeCategory || (!validSlugs.includes(activeCategory) && !categories.some(c => c.toLowerCase() === activeCategory))) {
      activeCategory = validSlugs[0];
    }

    const html = categories.map((cat) => {
      const slug = cat.toLowerCase().replace(/\s+/g, '-');
      const isActive = activeCategory === slug || activeCategory === cat.toLowerCase();
      return `
        <button type="button" class="category-sidebar-pill ${isActive ? 'active' : ''}" data-category="${slug}" onclick="window.selectCategory('${slug}')">
          ${cat.replace(' ', '<br>')}
        </button>
      `;
    }).join('') + `
      <button type="button" class="btn-add-section" onclick="window.location.href='/menu-setup'" title="Add Custom Menu Section">
        <span>+ Add</span>
        <span>Category</span>
      </button>
    `;

    sidebar.innerHTML = html;
  }

  function saveCatalog() {
    try {
      const vKey = getVendorKey();
      const serialized = menuCatalog.map(item => ({
        ...item,
        isUserCreated: true,
        pricePaise: item.pricePaise.toString()
      }));
      localStorage.setItem('frose_dishes_' + vKey, JSON.stringify(serialized));
      localStorage.setItem('frose_dishes_active', JSON.stringify(serialized));
      localStorage.setItem('frose_custom_menu_catalog', JSON.stringify(serialized));
    } catch {}
  }

  // Render Dishes in 2-Column Grid
  function renderDishesGrid() {
    const grid = document.getElementById('pos-dishes-grid');
    if (!grid) return;

    let filtered = menuCatalog.filter(i => {
      const catSlug = (i.category || '').toLowerCase().replace(/\s+/g, '-');
      return catSlug === activeCategory || (i.category || '').toLowerCase() === activeCategory;
    });

    if (filtered.length === 0 && menuCatalog.length > 0 && !activeCategory) {
      filtered = menuCatalog;
    }

    if (menuCatalog.length === 0) {
      grid.innerHTML = `
        <div class="pos-first-time-onboarding" id="onboarding-menu-banner" style="grid-column: 1 / -1; background: #FFFFFF; border: 2px dashed #700A18; border-radius: 20px; padding: 36px 18px; text-align: center; margin: 12px 6px; box-shadow: 0 4px 18px rgba(112, 10, 24, 0.06);">
          <div style="font-size: 46px; margin-bottom: 8px;">🍽️</div>
          <h3 style="margin: 0 0 6px 0; font-size: 17px; font-weight: 900; color: #5B0612;">Menu is Clean &amp; Empty</h3>
          <p style="margin: 0 0 18px 0; font-size: 12.5px; color: #64748B; line-height: 1.5; max-width: 320px; margin-left: auto; margin-right: auto;">
            Zero dummy dishes. Tap below to create your dishes, set prices in ₹, and start instant billing.
          </p>
          <div style="display: flex; flex-direction: column; gap: 10px; max-width: 260px; margin: 0 auto;">
            <button type="button" id="btn-onboarding-add-dish" onclick="window.openAddDishModal()" style="background: linear-gradient(135deg, #700A18 0%, #5B0612 100%); color: #FFF; border: none; padding: 13px 18px; border-radius: 12px; font-weight: 800; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(112, 10, 24, 0.28); cursor: pointer;">
              ➕ Add Dish
            </button>
            <a href="/menu-setup" id="btn-onboarding-create-menu" style="background: #F8FAFC; color: #334155; text-decoration: none; padding: 10px 14px; border-radius: 10px; font-weight: 700; font-size: 12px; border: 1.5px solid #CBD5E1; display: flex; align-items: center; justify-content: center; gap: 6px;">
              📋 Open Menu Studio →
            </a>
          </div>
        </div>
      `;
      return;
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px 16px; text-align: center; color: #6B7280; font-size: 13px;">
          <div style="font-size: 28px; margin-bottom: 8px;">🍽️</div>
          <div>No dishes in this category yet.</div>
          <a href="/menu-setup" style="display: inline-block; margin-top: 10px; background: #5B0612; color: #fff; text-decoration: none; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 800;">
            + Add Dish to This Section
          </a>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(item => {
      const inCart = cart.get(item.id);
      const qty = inCart ? inCart.quantity : 0;
      const priceText = formatRupees(item.pricePaise);

      return `
        <div class="pos-dish-card" data-id="${item.id}">
          <div class="dish-photo-container">
            <img class="dish-photo-img" src="${item.image || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'}" alt="${item.name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400'">
            
            <!-- Floating Price Tag (Bottom Left of Photo) -->
            <div class="dish-floating-price">${priceText}</div>

            <!-- Floating Action Button / Stepper (Bottom Right of Photo) -->
            <div class="dish-floating-action">
              ${qty === 0 ? `
                <button type="button" class="btn-dish-add-circle" onclick="window.addItemToCart('${item.id}', event)" title="Add to Order">
                  +
                </button>
              ` : `
                <div class="dish-stepper-pill">
                  <button type="button" class="btn-stepper-action" onclick="window.decrementCartItem('${item.id}', event)">-</button>
                  <span class="stepper-quantity-num">${qty}</span>
                  <button type="button" class="btn-stepper-action" onclick="window.addItemToCart('${item.id}', event)">+</button>
                </div>
              `}
            </div>
          </div>

          <div class="dish-info-row">
            <div class="dish-title" title="${item.name}">${item.name}</div>
            <button type="button" class="dish-edit-icon" onclick="window.openEditDishModal('${item.id}', event)" title="Edit Price / Details">
              ✏️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Update Floating Cart Pill & Totals
  function updateCartUI() {
    let totalItems = 0;
    let totalPaise = 0n;

    cart.forEach(({ item, quantity }) => {
      totalItems += quantity;
      totalPaise += item.pricePaise * BigInt(quantity);
    });

    const totalFormatted = formatRupees(totalPaise);

    // Floating Cart Pill
    const cartPill = document.getElementById('pos-floating-cart-pill');
    const pillStats = document.getElementById('cart-pill-stats');
    if (cartPill && pillStats) {
      if (totalItems > 0) {
        cartPill.style.display = 'flex';
        pillStats.textContent = `${totalItems} • ${totalFormatted}`;
      } else {
        cartPill.style.display = 'flex';
        pillStats.textContent = `0 • ₹0.0`;
      }
    }

    // Checkout Modal Displays
    const grandTotalEl = document.getElementById('checkout-grand-total');
    if (grandTotalEl) grandTotalEl.textContent = totalFormatted;

    const btnCashAmount = document.getElementById('btn-cash-amount');
    if (btnCashAmount) btnCashAmount.textContent = totalFormatted;

    const btnUpiAmount = document.getElementById('btn-upi-amount');
    if (btnUpiAmount) btnUpiAmount.textContent = totalFormatted;

    // Vitest Compatibility Element Sync
    const compatTotal = document.getElementById('cart-total-rupees');
    if (compatTotal) compatTotal.textContent = totalFormatted;

    renderDishesGrid();
  }

  // Cart Operations
  window.addItemToCart = function(dishId, e) {
    if (e) e.stopPropagation();
    const item = menuCatalog.find(i => i.id === dishId);
    if (!item) return;

    const existing = cart.get(dishId);
    if (existing) {
      existing.quantity += 1;
    } else {
      cart.set(dishId, { item, quantity: 1 });
    }
    updateCartUI();
  };

  window.decrementCartItem = function(dishId, e) {
    if (e) e.stopPropagation();
    const existing = cart.get(dishId);
    if (!existing) return;

    if (existing.quantity > 1) {
      existing.quantity -= 1;
    } else {
      cart.delete(dishId);
    }
    updateCartUI();
  };

  window.clearCurrentCart = function() {
    cart.clear();
    updateCartUI();
    window.closeModal('checkout-drawer-modal');
  };

  // Category Selector
  window.selectCategory = function(catKey) {
    activeCategory = catKey;
    document.querySelectorAll('.category-sidebar-pill').forEach(btn => {
      if (btn.getAttribute('data-category') === catKey) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    renderDishesGrid();
  };

  // Modal Controllers
  // Unified Modal Controller with Gold-Standard Mobile Scroll Lock
  let savedScrollY = 0;
  // openModal & closeModal defined above

  window.openCheckoutDrawer = function() {
    const list = document.getElementById('checkout-cart-items');
    if (!list) return;

    if (cart.size === 0) {
      list.innerHTML = `<div style="text-align: center; color: #6B7280; padding: 20px 0; font-size: 13px;">Your cart is currently empty. Add dishes to order.</div>`;
    } else {
      let html = '';
      cart.forEach(({ item, quantity }, id) => {
        const lineTotal = formatRupees(item.pricePaise * BigInt(quantity));
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #F9FAFB; border-radius: 10px; border: 1px solid #E5E7EB;">
            <div>
              <div style="font-size: 13px; font-weight: 800; color: #111827;">${item.name}</div>
              <div style="font-size: 11.5px; color: #6B7280;">${formatRupees(item.pricePaise)} each</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <button onclick="window.decrementCartItem('${id}'); window.openCheckoutDrawer();" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid #D1D5DB; background: #fff; cursor: pointer; font-weight: 800;">-</button>
              <span style="font-size: 13px; font-weight: 900; min-width: 16px; text-align: center;">${quantity}</span>
              <button onclick="window.addItemToCart('${id}'); window.openCheckoutDrawer();" style="width: 24px; height: 24px; border-radius: 50%; border: 1px solid #D1D5DB; background: #fff; cursor: pointer; font-weight: 800;">+</button>
              <span style="font-size: 13px; font-weight: 900; color: #5B0612; margin-left: 6px;">${lineTotal}</span>
            </div>
          </div>
        `;
      });
      list.innerHTML = html;
    }

    window.openModal('checkout-drawer-modal');
  };

  window.setOrderType = function(type) {
    currentOrderType = type;
    const bCounter = document.getElementById('btn-type-counter');
    const bDine = document.getElementById('btn-type-dinein');
    if (!bCounter || !bDine) return;
    if (type === 'counter') {
      bCounter.classList.add('active');
      bDine.classList.remove('active');
      bCounter.style.background = '#5B0612';
      bCounter.style.color = '#fff';
      bCounter.style.border = '1.5px solid #5B0612';
      bDine.style.background = '#fff';
      bDine.style.color = '#374151';
      bDine.style.border = '1.5px solid #E5E7EB';
    } else {
      bDine.classList.add('active');
      bCounter.classList.remove('active');
      bDine.style.background = '#5B0612';
      bDine.style.color = '#fff';
      bDine.style.border = '1.5px solid #5B0612';
      bCounter.style.background = '#fff';
      bCounter.style.color = '#374151';
      bCounter.style.border = '1.5px solid #E5E7EB';
    }
  };

  // Payment Execution (Cash & UPI)
  window.payCashOrder = function() {
    if (cart.size === 0) {
      alert('Cart is empty. Add dishes first!');
      return;
    }
    executeOrderSuccess('Cash');
  };

  window.payUpiOrder = function() {
    if (cart.size === 0) {
      alert('Cart is empty. Add dishes first!');
      return;
    }
    window.closeModal('checkout-drawer-modal');

    // Calculate total
    let totalPaise = 0n;
    cart.forEach(({ item, quantity }) => {
      totalPaise += item.pricePaise * BigInt(quantity);
    });
    const formatted = formatRupees(totalPaise);

    const upiAmountEl = document.getElementById('upi-qr-amount');
    if (upiAmountEl) upiAmountEl.textContent = formatted;

    // Link uploaded custom scanner QR, UPI ID, and Payee display name
    const customQr = localStorage.getItem('frose_custom_scanner_qr');
    const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
    const upiId = v.upiId || localStorage.getItem('frose_custom_upi_id') || '9642230688@ybl';
    const payeeName = v.businessName || v.payeeName || v.name || 'Cloud Edge Kitchen';

    const upiVpaEl = document.getElementById('upi-qr-vpa');
    if (upiVpaEl) {
      upiVpaEl.textContent = `${payeeName} • ${upiId}`;
    }

    const qrCanvas = document.getElementById('upi-qr-code-canvas');
    if (qrCanvas) {
      if (customQr) {
        // Render the stall's uploaded custom scanner QR code photo
        qrCanvas.innerHTML = `
          <div style="background: #FFFFFF; padding: 10px; border-radius: 14px; display: inline-block; box-shadow: 0 4px 14px rgba(0,0,0,0.06); border: 1.5px solid #E2E8F0;">
            <img src="${customQr}" alt="Counter UPI Scanner" id="cart-upi-scanner-img" style="max-width: 220px; max-height: 220px; width: 200px; height: 200px; object-fit: contain; border-radius: 8px; display: block; margin: 0 auto;" />
            <div style="margin-top: 6px; font-size: 11px; font-weight: 800; color: #059669; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span>✅ Counter Scanner Active</span>
            </div>
          </div>
        `;
      } else {
        // High-clarity fallback BharatQR
        qrCanvas.innerHTML = `
          <svg viewBox="0 0 160 160" width="160" height="160">
            <rect width="160" height="160" fill="#fff" rx="8"/>
            <rect x="20" y="20" width="40" height="40" fill="#111827"/>
            <rect x="26" y="26" width="28" height="28" fill="#fff"/>
            <rect x="32" y="32" width="16" height="16" fill="#111827"/>
            <rect x="100" y="20" width="40" height="40" fill="#111827"/>
            <rect x="106" y="26" width="28" height="28" fill="#fff"/>
            <rect x="112" y="32" width="16" height="16" fill="#111827"/>
            <rect x="20" y="100" width="40" height="40" fill="#111827"/>
            <rect x="26" y="106" width="28" height="28" fill="#fff"/>
            <rect x="32" y="112" width="16" height="16" fill="#111827"/>
            <rect x="70" y="30" width="15" height="15" fill="#111827"/>
            <rect x="75" y="60" width="20" height="20" fill="#111827"/>
            <rect x="105" y="75" width="25" height="15" fill="#111827"/>
            <rect x="65" y="105" width="30" height="25" fill="#111827"/>
          </svg>
        `;
      }
    }

    window.openModal('upi-qr-modal');
  };

  window.confirmUpiReceived = function() {
    window.closeModal('upi-qr-modal');
    executeOrderSuccess('UPI');
  };

  function executeOrderSuccess(method) {
    window.closeModal('checkout-drawer-modal');
    window.closeModal('upi-qr-modal');

    currentTokenNumber += 1;
    const tokenStr = `TOKEN #${currentTokenNumber}`;
    localStorage.setItem('frose_current_token', currentTokenNumber.toString());

    // Flash Token Modal
    const fToken = document.getElementById('flash-token-number');
    if (fToken) fToken.textContent = tokenStr;

    let totalPaise = 0n;
    const itemsList = [];
    cart.forEach(({ item, quantity }) => {
      totalPaise += item.pricePaise * BigInt(quantity);
      itemsList.push({
        id: item.id,
        name: item.name,
        quantity,
        pricePaise: item.pricePaise.toString()
      });
    });
    const fAmount = document.getElementById('flash-token-amount');
    if (fAmount) fAmount.textContent = `${formatRupees(totalPaise)} Paid (${method})`;

    // Local P2P Instant Sync to Kitchen & Packaging Stations
    const orderData = {
      id: 'ord-' + Date.now(),
      tokenNo: currentTokenNumber,
      tokenNumber: currentTokenNumber,
      orderType: currentOrderType, // 'counter' | 'dinein'
      items: itemsList,
      totalPaise: totalPaise.toString(),
      paymentMethod: method,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const orderChannel = new BroadcastChannel('frose_orders');
        orderChannel.postMessage({ event: 'order:new', data: orderData });
      }
      const existingQueue = JSON.parse(localStorage.getItem('frose_live_orders_queue') || '[]');
      existingQueue.unshift(orderData);
      localStorage.setItem('frose_live_orders_queue', JSON.stringify(existingQueue.slice(0, 50)));
    } catch (_) {}

    window.openModal('token-flash-modal');
    cart.clear();
    updateCartUI();

    // Auto-close after 3 seconds
    setTimeout(() => {
      window.closeModal('token-flash-modal');
    }, 3200);
  }

  // Section Management
  window.openAddSectionModal = function() {
    document.getElementById('input-new-section-name').value = '';
    window.openModal('modal-add-section');
  };

  window.submitAddSection = function(e) {
    e.preventDefault();
    const name = document.getElementById('input-new-section-name').value.trim();
    if (!name) return;

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const sidebar = document.getElementById('pos-category-sidebar');
    const addBtn = sidebar.querySelector('.btn-add-section');

    const newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'category-sidebar-pill';
    newBtn.setAttribute('data-category', slug);
    newBtn.textContent = name;
    newBtn.onclick = () => window.selectCategory(slug);

    sidebar.insertBefore(newBtn, addBtn);

    // Also add to category dropdowns in Add/Edit modals
    const optAdd = document.createElement('option');
    optAdd.value = slug;
    optAdd.textContent = name;
    document.getElementById('input-dish-category')?.appendChild(optAdd);

    const optEdit = document.createElement('option');
    optEdit.value = slug;
    optEdit.textContent = name;
    document.getElementById('edit-dish-category')?.appendChild(optEdit);

    window.closeModal('modal-add-section');
    window.selectCategory(slug);
  };

  // Dish Management (Add & Edit)
  window.openAddDishModal = function() {
    const nameEl = document.getElementById('input-dish-name');
    const priceEl = document.getElementById('input-dish-price');
    if (nameEl) nameEl.value = '';
    if (priceEl) priceEl.value = '';

    const vKey = getVendorKey();
    let cats = [];
    try {
      const savedCats = localStorage.getItem('frose_cats_' + vKey) || localStorage.getItem('frose_cats_active');
      if (savedCats) cats = JSON.parse(savedCats);
    } catch (e) {}

    const select = document.getElementById('input-dish-category');
    if (select) {
      if (!cats || cats.length === 0) {
        cats = ['Special Items'];
        localStorage.setItem('frose_cats_' + vKey, JSON.stringify(cats));
        localStorage.setItem('frose_cats_active', JSON.stringify(cats));
        renderSidebarCategories(cats);
      }
      select.innerHTML = cats.map(c => `<option value="${c.toLowerCase().replace(/\s+/g, '-')}">${c}</option>`).join('');
    }

    window.openModal('modal-add-dish');
  };

  window.submitAddDish = function(e) {
    e.preventDefault();
    const name = document.getElementById('input-dish-name').value.trim();
    const category = document.getElementById('input-dish-category').value;
    const priceRupees = Number(document.getElementById('input-dish-price').value) || 100;
    const photo = document.getElementById('input-dish-photo-select').value;

    const newDish = {
      id: 'dish-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
      name,
      pricePaise: BigInt(priceRupees * 100),
      category: category || 'special-items',
      isBestSeller: false,
      image: photo
    };

    menuCatalog.push(newDish);
    saveCatalog();
    renderDishesGrid();
    updateCartUI();
    window.closeModal('modal-add-dish');
    if (category) window.selectCategory(category);
  };

  let activeEditingDishId = null;
  window.openEditDishModal = function(dishId, e) {
    if (e) e.stopPropagation();
    const dish = menuCatalog.find(i => i.id === dishId);
    if (!dish) return;

    activeEditingDishId = dishId;
    document.getElementById('edit-dish-id').value = dish.id;
    document.getElementById('edit-dish-name').value = dish.name;
    document.getElementById('edit-dish-price').value = Number(dish.pricePaise / 100n);

    const vendor = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
    const vendorId = vendor.id || 'default';
    let cats = [];
    try {
      const savedCats = localStorage.getItem('frose_cats_' + vendorId);
      if (savedCats) cats = JSON.parse(savedCats);
    } catch (e) {}

    const select = document.getElementById('edit-dish-category');
    if (select) {
      if (cats.length === 0) {
        select.innerHTML = `<option value="${dish.category}">${dish.category}</option>`;
      } else {
        select.innerHTML = cats.map(c => `<option value="${c.toLowerCase().replace(/\s+/g, '-')}">${c}</option>`).join('');
      }
      select.value = (dish.category || '').toLowerCase().replace(/\s+/g, '-');
    }

    window.openModal('modal-edit-dish');
  };

  window.submitEditDish = function(e) {
    e.preventDefault();
    if (!activeEditingDishId) return;
    const dish = menuCatalog.find(i => i.id === activeEditingDishId);
    if (!dish) return;

    dish.name = document.getElementById('edit-dish-name').value.trim();
    const p = Number(document.getElementById('edit-dish-price').value) || 100;
    dish.pricePaise = BigInt(p * 100);
    dish.category = document.getElementById('edit-dish-category').value;

    saveCatalog();
    window.closeModal('modal-edit-dish');
    renderDishesGrid();
    updateCartUI();
    alert(`✅ Updated "${dish.name}" details and price!`);
  };

  window.deleteDish = function() {
    if (!activeEditingDishId) return;
    if (confirm('Delete this dish from your menu?')) {
      menuCatalog = menuCatalog.filter(i => i.id !== activeEditingDishId);
      cart.delete(activeEditingDishId);
      saveCatalog();
      window.closeModal('modal-edit-dish');
      renderDishesGrid();
      updateCartUI();
    }
  };

  async function refreshPOS() {
    await loadCatalog();
    renderDishesGrid();
    updateCartUI();
    populateProfileInfo();
  }

  function populateProfileInfo() {
    try {
      const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
      const name = v.businessName || localStorage.getItem('frose_stall_name') || 'Stall Client';
      const owner = v.ownerName || 'Stall Owner';
      const phone = v.phone || localStorage.getItem('frose_stall_phone') || '';
      
      const initials = (owner || name).split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'SC';

      const avatarBadges = document.querySelectorAll('.pos-avatar-badge, #settings-client-avatar');
      avatarBadges.forEach(el => el.textContent = initials);

      const labelBadges = document.querySelectorAll('.pos-avatar-label, #settings-client-stall');
      labelBadges.forEach(el => el.textContent = name);

      const ownerEl = document.getElementById('settings-client-owner');
      if (ownerEl) ownerEl.textContent = owner;

      const phoneEl = document.getElementById('settings-client-phone');
      if (phoneEl && phone) phoneEl.textContent = '+91 ' + phone;
    } catch (e) {}
  }

  window.openModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.add('active');
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  };

  window.closeModal = function (modalId) {
    const el = document.getElementById(modalId);
    if (el) el.classList.remove('active');
    const activeModals = document.querySelectorAll('.modal-overlay.active');
    if (activeModals.length === 0) {
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
  };

  window.handleLogout = function () {
    if (confirm('Sign out of Stall Account?')) {
      localStorage.removeItem('frose_auth_token');
      window.location.href = '/login';
    }
  };

  // Immediate event bindings for back navigation / tab focus sync
  window.addEventListener('pageshow', refreshPOS);
  window.addEventListener('focus', refreshPOS);
  window.addEventListener('storage', (e) => {
    if (e.key && (e.key.startsWith('frose_dishes') || e.key.startsWith('frose_cats'))) {
      refreshPOS();
    }
  });

  // First-Time Client Check & Initialization
  document.addEventListener('DOMContentLoaded', async () => {
    await refreshPOS();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('type') === 'dinein') {
      window.setOrderType('dinein');
    }

    // Check if routed with ?setup=1 or first-time login
// setup check uses existing urlParams
    if (urlParams.get('setup') === '1') {
      const banner = document.getElementById('management-toolbar');
      if (banner) {
        banner.style.background = '#FFF5F6';
        banner.style.borderColor = '#FECDD3';
      }
      localStorage.setItem('frose_first_login_done', 'true');
    }
  });

})();

  // Part 2: Remote Subscription Lockout Listener (Kill-Switch)
  function getVendorKeyHelper() {
    try {
      const v = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
      return (v.phone || localStorage.getItem('frose_stall_phone') || '').replace(/\D/g, '').slice(-10);
    } catch (e) {
      return '';
    }
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const subChannel = new BroadcastChannel('frose_telemetry');
    subChannel.onmessage = (event) => {
      const data = event.data;
      if (data && data.type === 'SUBSCRIPTION_CHANGE') {
        const vKey = getVendorKeyHelper();
        if (data.stallPhone === vKey) {
          if (data.lockout) {
            window.lockCounterDueToSubscription(data.amountDuePaise || '89900');
          } else {
            window.unlockCounterSubscription();
          }
        }
      }
    };
  }

  window.lockCounterDueToSubscription = function(amountPaise) {
    const modal = document.getElementById('modal-subscription-locked');
    if (!modal) return;
    const dueEl = document.getElementById('lock-amount-due');
    const p = typeof amountPaise === 'string' ? BigInt(amountPaise) : BigInt(amountPaise || 89900n);
    if (dueEl) dueEl.textContent = '₹' + Number(p / 100n).toLocaleString('en-IN');

    const qrImg = document.getElementById('lock-qr-code-img');
    if (qrImg) {
      const upiUri = `upi://pay?pa=frosehq@okaxis&pn=FROSE+Street&am=${Number(p / 100n)}&tn=Stall-Renewal`;
      qrImg.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=' + encodeURIComponent(upiUri);
    }
    modal.style.display = 'flex';
  };

  window.unlockCounterSubscription = function() {
    const modal = document.getElementById('modal-subscription-locked');
    if (modal) modal.style.display = 'none';
  };

  window.contactSuperAdminWhatsApp = function() {
    const msg = 'Hello Super Admin, I am at my counter and need to renew my FROSE Street subscription.';
    window.open('https://api.whatsapp.com/send?phone=919999999999&text=' + encodeURIComponent(msg), '_blank');
  };
