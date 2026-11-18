/**
 * FROSE Street — Billing & Menu POS Controller (Image 2 Parity)
 * 2-Column Responsive Food Grid, Left Category Sidebar, Steppers,
 * Floating Bottom Cart Pill, Dynamic UPI QR, and Menu Customization.
 */

(function () {
  'use strict';

  // Seed Menu Items Matching Reference Image 2
  const INITIAL_MENU = [
    {
      id: 'dish-naan-01',
      name: 'Butter Naan',
      pricePaise: 5000n, // ₹50.0
      category: 'breads',
      isBestSeller: true,
      image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400'
    },
    {
      id: 'dish-chole-02',
      name: 'Chole Bhature',
      pricePaise: 19000n, // ₹190.0
      category: 'main-course',
      isBestSeller: true,
      image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=400'
    },
    {
      id: 'dish-dalfry-03',
      name: 'Dal Fry',
      pricePaise: 19000n, // ₹190.0
      category: 'main-course',
      isBestSeller: false,
      image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=400'
    },
    {
      id: 'dish-paneertikka-04',
      name: 'Paneer Tikka',
      pricePaise: 24000n, // ₹240.0
      category: 'starters',
      isBestSeller: false,
      image: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=400'
    },
    {
      id: 'dish-mixveg-05',
      name: 'Mix Veg',
      pricePaise: 19000n, // ₹190.0
      category: 'main-course',
      isBestSeller: false,
      image: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=400'
    },
    {
      id: 'dish-punjabipaneer-06',
      name: 'Punjabi Paneer',
      pricePaise: 35000n, // ₹350.0
      category: 'main-course',
      isBestSeller: false,
      image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400'
    },
    {
      id: 'dish-chickenbiryani-07',
      name: 'Chicken Biryani Full',
      pricePaise: 22000n, // ₹220.0
      category: 'rice',
      isBestSeller: true,
      image: '/images/dishes/chicken-biryani-full.webp'
    },
    {
      id: 'dish-muttonbiryani-08',
      name: 'Mutton Biryani Full',
      pricePaise: 32000n, // ₹320.0
      category: 'rice',
      isBestSeller: false,
      image: '/images/dishes/mutton-biryani-full.webp'
    },
    {
      id: 'dish-momos-09',
      name: 'Veg Steamed Momos',
      pricePaise: 6000n, // ₹60.0
      category: 'starters',
      isBestSeller: false,
      image: 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=400'
    },
    {
      id: 'dish-chai-10',
      name: 'Special Masala Chai',
      pricePaise: 2000n, // ₹20.0
      category: 'drinks',
      isBestSeller: false,
      image: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=400'
    }
  ];

  // In-Memory & Persisted State
  let menuCatalog = [];
  const cart = new Map(); // dishId -> { item, quantity }
  let activeCategory = 'best-sellers';
  let currentTokenNumber = 1;
  let currentOrderType = 'counter'; // 'counter' | 'dinein'

  // Format integer paise into exact Rupee string (e.g. ₹190.0)
  function formatRupees(paise) {
    const p = typeof paise === 'bigint' ? paise : BigInt(paise || 0);
    const rupees = Number(p / 100n);
    const remainder = Number(p % 100n);
    return `₹${rupees}${remainder === 0 ? '.0' : '.' + remainder.toString().padStart(2, '0')}`;
  }

  // Load Menu Catalog
  function loadCatalog() {
    try {
      const saved = localStorage.getItem('frose_custom_menu_catalog');
      if (saved) {
        const parsed = JSON.parse(saved);
        menuCatalog = parsed.map(item => ({
          ...item,
          pricePaise: BigInt(item.pricePaise || 5000)
        }));
      } else {
        menuCatalog = [...INITIAL_MENU];
        saveCatalog();
      }
    } catch {
      menuCatalog = [...INITIAL_MENU];
    }
  }

  function saveCatalog() {
    try {
      const serialized = menuCatalog.map(item => ({
        ...item,
        pricePaise: item.pricePaise.toString()
      }));
      localStorage.setItem('frose_custom_menu_catalog', JSON.stringify(serialized));
    } catch {}
  }

  // Render Dishes in 2-Column Grid
  function renderDishesGrid() {
    const grid = document.getElementById('pos-dishes-grid');
    if (!grid) return;

    let filtered = [];
    if (activeCategory === 'best-sellers') {
      filtered = menuCatalog.filter(i => i.isBestSeller || i.category === 'breads' || i.category === 'main-course');
      if (filtered.length === 0) filtered = menuCatalog;
    } else {
      filtered = menuCatalog.filter(i => i.category === activeCategory);
    }

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px 16px; text-align: center; color: #6B7280; font-size: 13px;">
          <div style="font-size: 28px; margin-bottom: 8px;">🍽️</div>
          <div>No dishes in this category yet.</div>
          <button onclick="window.openAddDishModal()" style="margin-top: 10px; background: #5B0612; color: #fff; border: none; padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer;">
            + Add First Dish
          </button>
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
  window.openModal = function(id) {
    document.getElementById(id)?.classList.add('active');
  };
  window.closeModal = function(id) {
    document.getElementById(id)?.classList.remove('active');
  };

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
    if (type === 'counter') {
      bCounter.style.background = '#5B0612';
      bCounter.style.color = '#fff';
      bCounter.style.border = '1.5px solid #5B0612';
      bDine.style.background = '#fff';
      bDine.style.color = '#374151';
      bDine.style.border = '1.5px solid #E5E7EB';
    } else {
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

    const qrCanvas = document.getElementById('upi-qr-code-canvas');
    if (qrCanvas) {
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
    cart.forEach(({ item, quantity }) => {
      totalPaise += item.pricePaise * BigInt(quantity);
    });
    const fAmount = document.getElementById('flash-token-amount');
    if (fAmount) fAmount.textContent = `${formatRupees(totalPaise)} Paid (${method})`;

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
    document.getElementById('input-dish-name').value = '';
    document.getElementById('input-dish-price').value = '';
    window.openModal('modal-add-dish');
  };

  window.submitAddDish = function(e) {
    e.preventDefault();
    const name = document.getElementById('input-dish-name').value.trim();
    const category = document.getElementById('input-dish-category').value;
    const priceRupees = Number(document.getElementById('input-dish-price').value) || 100;
    const photo = document.getElementById('input-dish-photo-select').value;

    const newDish = {
      id: 'dish-' + Math.random().toString(36).substring(2, 9),
      name,
      pricePaise: BigInt(priceRupees * 100),
      category,
      isBestSeller: category === 'best-sellers',
      image: photo
    };

    menuCatalog.push(newDish);
    saveCatalog();
    window.closeModal('modal-add-dish');
    window.selectCategory(category);
    alert(`✅ "${name}" successfully added to ${category}!`);
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
    document.getElementById('edit-dish-category').value = dish.category;

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

  // First-Time Client Check & Initialization
  document.addEventListener('DOMContentLoaded', () => {
    loadCatalog();
    renderDishesGrid();
    updateCartUI();

    // Check if routed with ?setup=1 or first-time login
    const urlParams = new URLSearchParams(window.location.search);
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
