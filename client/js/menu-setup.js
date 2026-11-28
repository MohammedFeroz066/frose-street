(function () {
      const CURRENT_VENDOR = JSON.parse(localStorage.getItem('frose_current_vendor') || '{}');
      function getVendorKey() {
        return CURRENT_VENDOR.id || CURRENT_VENDOR.phone || localStorage.getItem('frose_stall_phone') || 'primary_vendor';
      }

      // The 10 Active Premium Food Images (Strictly operating with verified photos)
      const ACTIVE_FOOD_IMAGES = [
        { name: 'Chicken Biryani Full', url: '/images/dishes/chicken-biryani-full.webp' },
        { name: 'Chicken Handi Pot', url: '/images/dishes/chicken-handi-biryani.webp' },
        { name: 'Mini Chicken Biryani', url: '/images/dishes/mini-chicken-biryani.webp' },
        { name: 'Chicken Family Pack (6)', url: '/images/dishes/chicken-family-pack-6-pcs.webp' },
        { name: 'Chicken Jumbo Pack (8)', url: '/images/dishes/chicken-jumbo-pack-8-pcs.webp' },
        { name: 'Mutton Biryani Full', url: '/images/dishes/mutton-biryani-full.webp' },
        { name: 'Mutton Handi Pot', url: '/images/dishes/mutton-handi-biryani.webp' },
        { name: 'Mini Mutton Biryani', url: '/images/dishes/mini-mutton-biryani.webp' },
        { name: 'Double Gosh Mutton', url: '/images/dishes/mutton-biryani-double-gosh.webp' },
        { name: 'Mutton Family Pack', url: '/images/dishes/mutton-family-pack.webp' }
      ];

      // In-Memory & LocalStorage State (Clean Slate: strictly vendor-defined categories)
      let vendorCategories = [];
      let vendorDishes = [];

      // History / Popstate controller (delegates to FroseNav when available)
      if (!window.FroseNav) {
        window.addEventListener('popstate', () => {
          const modal = document.getElementById('gallery-modal');
          if (modal && modal.classList.contains('active')) {
            modal.classList.remove('active');
            return;
          }
          window.location.replace('/billing');
        });
      }

      function notifySetup(msg, variant) {
        if (window.FroseUI && typeof window.FroseUI.showToast === 'function') {
          window.FroseUI.showToast(msg, variant || 'success');
        }
      }

      function syncSetupThemeIcon(theme) {
        const iconEl = document.getElementById('setup-theme-icon');
        if (iconEl && window.FroseUI && typeof window.FroseUI.renderThemeIcon === 'function') {
          window.FroseUI.renderThemeIcon(iconEl, theme);
        }
      }

      // Initialization
      async function init() {
        if (window.FroseTheme) {
          syncSetupThemeIcon(window.FroseTheme.getTheme());
          window.FroseTheme.subscribe(syncSetupThemeIcon);
          const themeBtn = document.getElementById('btn-setup-theme');
          if (themeBtn) {
            themeBtn.addEventListener('click', () => window.FroseTheme.cycleTheme());
          }
        }
        if (CURRENT_VENDOR.businessName) {
          const el = document.getElementById('setup-stall-title');
          if (el) el.textContent = CURRENT_VENDOR.businessName + ' • Stall Menu';
        }

        loadSavedCategories();
        renderGalleryPresets();
        await fetchDishes();
      }

      async function loadSavedCategories() {
        try {
          if (window.FroseIdbStore) {
            const catMeta = await window.FroseIdbStore.getMeta('categories');
            if (catMeta && Array.isArray(catMeta.value) && (!catMeta.vendor_id || catMeta.vendor_id === getVendorKey())) {
              vendorCategories = catMeta.value;
            } else {
              vendorCategories = [];
            }
          } else {
            vendorCategories = [];
          }
        } catch (e) {
          vendorCategories = [];
        }
        renderCategories();
      }

      async function saveCategories() {
        try {
          if (window.FroseIdbStore) {
            await window.FroseIdbStore.setMeta('categories', {
              vendor_id: getVendorKey(),
              value: vendorCategories,
            });
          }
        } catch (e) {}
        renderCategories();
      }

      function renderCategories() {
        const container = document.getElementById('categories-badges-container');
        const select = document.getElementById('select-dish-category');
        const countLabel = document.getElementById('category-count-label');
        if (countLabel) countLabel.textContent = `${vendorCategories.length} Categories`;

        if (container) {
          const { el, svgEl, clear } = window.FroseSafeDom;
          clear(container);
          if (vendorCategories.length === 0) {
            container.appendChild(
              el('div', {
                style: 'grid-column: 1 / -1; padding: 14px 12px; background: var(--bg-subtle); border: 1.5px dashed var(--border-strong); border-radius: var(--radius-md); text-align: center; color: var(--text-secondary); font-size: 12.5px; font-weight: 700;',
              }, [
                'No categories yet. Type a category name above (e.g. ',
                el('strong', {}, 'Tea'), ', ', el('strong', {}, 'Snacks'), ', ', el('strong', {}, 'Momos'),
                ') and tap "+ Add Section".',
              ])
            );
          } else {
            vendorCategories.forEach(cat => {
              const count = vendorDishes.filter(d => (d.category || '').toLowerCase() === cat.toLowerCase()).length;
              const delSvg = svgEl('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }, [
                svgEl('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
                svgEl('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
              ]);
              container.appendChild(
                el('div', { class: 'category-badge-chip' }, [
                  el('span', {}, cat),
                  el('span', { class: 'chip-count' }, String(count)),
                  el('button', {
                    type: 'button',
                    class: 'btn-chip-delete',
                    title: 'Delete Section',
                    'aria-label': 'Delete Section ' + cat,
                    on: { click: () => window.deleteCategorySection(cat) },
                  }, [delSvg]),
                ])
              );
            });
          }
        }

        if (select) {
          const { el, clear } = window.FroseSafeDom;
          clear(select);
          if (vendorCategories.length === 0) {
            select.appendChild(el('option', { value: '', disabled: true, selected: true }, 'Please add a category section above first'));
          } else {
            vendorCategories.forEach(cat => {
              select.appendChild(el('option', { value: cat }, cat));
            });
          }
        }
      }

      window.addCategorySection = function () {
        const input = document.getElementById('input-category-name');
        const name = input?.value.trim();
        if (!name) return;

        if (!vendorCategories.some(c => c.toLowerCase() === name.toLowerCase())) {
          vendorCategories.push(name);
          saveCategories();
        }
        if (input) input.value = '';
      };

      window.deleteCategorySection = function (name) {
        vendorCategories = vendorCategories.filter(c => c !== name);
        saveCategories();
      };

      async function fetchDishes() {
        const vKey = getVendorKey();
        if (window.FroseIdbStore && vKey && vKey !== 'primary_vendor') {
          await window.FroseIdbStore.ensureVendorScope(vKey);
        }
        try {
          const fn = window.froseApiFetch || fetch;
          const res = await fn('/api/v1/menu', {
            credentials: 'same-origin'
          });
          if (res.ok) {
            const data = await res.json();
            vendorDishes = data.items || [];
            if (window.FroseIdbStore) {
              await window.FroseIdbStore.putMenuItems(vKey, vendorDishes);
            }
          } else if (window.FroseIdbStore) {
            vendorDishes = await window.FroseIdbStore.getMenuItems(vKey);
          }
        } catch (e) {
          if (window.FroseIdbStore) {
            vendorDishes = await window.FroseIdbStore.getMenuItems(vKey);
          }
        }

        renderDishes();
        renderCategories();
      }

      function renderDishes() {
        const container = document.getElementById('items-list-container');
        const countLabel = document.getElementById('dish-count-label');
        const bottomCount = document.getElementById('bottom-launch-dish-count');

        if (countLabel) countLabel.textContent = `${vendorDishes.length} Dishes`;
        if (bottomCount) bottomCount.textContent = `${vendorDishes.length} Items`;

        if (!container) return;
        const { el, svgEl, clear, safeImageUrl } = window.FroseSafeDom;
        clear(container);

        if (vendorDishes.length === 0) {
          container.appendChild(
            el('div', { style: 'text-align: center; padding: 24px; color: var(--text-muted); font-size: 12.5px;' }, [
              el('strong', {}, 'No dishes added yet!'),
              el('br'),
              'Fill out the form above to add your first menu item.',
            ])
          );
          return;
        }

        vendorDishes.forEach(d => {
          const price = d.priceRupees || (d.pricePaise ? d.pricePaise / 100 : 0);
          const photo = safeImageUrl(d.imageUrl) || '/images/dishes/chicken-biryani-full.webp';
          const trashSvg = svgEl('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
            svgEl('polyline', { points: '3 6 5 6 21 6' }),
            svgEl('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }),
          ]);
          container.appendChild(
            el('div', { class: 'item-row-card' }, [
              el('div', { class: 'item-row-left' }, [
                el('img', {
                  src: photo,
                  class: 'item-thumb-img',
                  alt: d.name,
                  on: { error: (e) => { e.target.src = '/images/dishes/chicken-biryani-full.webp'; } },
                }),
                el('div', { class: 'item-meta' }, [
                  el('div', { class: 'item-meta-name' }, d.name),
                  el('div', { class: 'item-meta-category' }, d.category || 'General'),
                ]),
              ]),
              el('div', { class: 'item-row-right' }, [
                el('div', { class: 'item-price-tag' }, `₹${price}`),
                el('button', {
                  type: 'button',
                  class: 'btn-item-delete',
                  title: 'Delete Item',
                  'aria-label': 'Delete ' + d.name,
                  on: { click: () => window.deleteDish(d.id) },
                }, [trashSvg]),
              ]),
            ])
          );
        });
      }

      window.triggerCameraUpload = function () {
        const cameraInput = document.getElementById('camera-file-input');
        if (cameraInput) cameraInput.click();
      };

      window.openGalleryModal = function () {
        if (window.FroseUI && typeof window.FroseUI.openSheet === 'function') {
          window.FroseUI.openSheet('gallery-modal');
          return;
        }
        const modal = document.getElementById('gallery-modal');
        if (modal) modal.classList.add('active');
      };

      window.closeGalleryModal = function () {
        if (window.FroseUI && typeof window.FroseUI.closeSheet === 'function') {
          window.FroseUI.closeSheet('gallery-modal');
          return;
        }
        const modal = document.getElementById('gallery-modal');
        if (modal) modal.classList.remove('active');
      };

      function renderGalleryPresets() {
        const grid = document.getElementById('gallery-preset-grid');
        if (!grid) return;
        const { el, clear, safeImageUrl } = window.FroseSafeDom;
        clear(grid);
        ACTIVE_FOOD_IMAGES.forEach((img) => {
          const safeUrl = safeImageUrl(img.url);
          if (!safeUrl) return;
          grid.appendChild(
            el('div', {
              class: 'preset-item-card',
              on: { click: () => window.selectPresetImage(safeUrl) },
            }, [
              el('img', { src: safeUrl, alt: img.name }),
              el('div', { class: 'preset-item-label' }, img.name),
            ])
          );
        });
      }

      window.selectPresetImage = function (url) {
        document.querySelectorAll('.preset-item-card').forEach(c => c.classList.remove('selected'));
        const target = Array.from(document.querySelectorAll('.preset-item-card')).find(c => c.querySelector('img')?.getAttribute('src') === url);
        if (target) target.classList.add('selected');

        const previewImg = document.getElementById('image-preview-element');
        const placeholder = document.getElementById('image-preview-placeholder');
        const inputUrl = document.getElementById('input-selected-image-url');

        if (previewImg && placeholder && inputUrl) {
          previewImg.src = url;
          previewImg.style.display = 'block';
          placeholder.style.display = 'none';
          inputUrl.value = url;
        }

        window.closeGalleryModal();
      };

      window.handleDeviceFileUpload = function (event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (e) {
          const img = new Image();
          img.onload = function () {
            const canvas = document.createElement('canvas');
            const maxDim = 500;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const compressedUrl = canvas.toDataURL('image/jpeg', 0.82);
            window.selectPresetImage(compressedUrl);
          };
          img.src = e.target?.result;
        };
        reader.readAsDataURL(file);
      };

      window.submitAddDish = async function (event) {
        event.preventDefault();
        const name = document.getElementById('input-dish-name')?.value.trim();
        const category = document.getElementById('select-dish-category')?.value;
        const priceNum = parseFloat(document.getElementById('input-dish-price')?.value || '0');
        const rawPhotoUrl = document.getElementById('input-selected-image-url')?.value;
        const safePhoto = rawPhotoUrl ? window.FroseSafeDom.safeImageUrl(rawPhotoUrl) : '/images/dishes/chicken-biryani-full.webp';
        if (rawPhotoUrl && !safePhoto) {
          notifySetup('Invalid or unsafe image URL rejected.', 'danger');
          return;
        }
        const photoUrl = safePhoto;

        if (!name || priceNum <= 0) {
          notifySetup('Please enter a valid dish name and price.', 'warning');
          return;
        }

        // Strictly convert rupees to integer paise
        const pricePaise = Math.round(priceNum * 100);

        const newDish = {
          name,
          category,
          pricePaise,
          imageUrl: photoUrl,
          isAvailable: true
        };

        try {
          const fn = window.froseApiFetch || fetch;
          const res = await fn('/api/v1/menu', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'X-FROSE-CSRF': '1'
            },
            body: JSON.stringify(newDish)
          });

          if (res.ok) {
            const data = await res.json();
            vendorDishes.unshift(data.item);
          } else {
            // Fallback for standalone preview
            vendorDishes.unshift({
              id: 'dish-' + Date.now(),
              name,
              category,
              pricePaise,
              priceRupees: priceNum,
              imageUrl: photoUrl,
              isAvailable: true
            });
          }
        } catch (e) {
          vendorDishes.unshift({
            id: 'dish-' + Date.now(),
            name,
            category,
            pricePaise,
            priceRupees: priceNum,
            imageUrl: photoUrl,
            isAvailable: true
          });
        }

        // Cache update in IndexedDB
        try {
          if (window.FroseIdbStore) {
            await window.FroseIdbStore.putMenuItems(getVendorKey(), vendorDishes);
          }
        } catch (e) {}

        // Reset form
        document.getElementById('input-dish-name').value = '';
        document.getElementById('input-dish-price').value = '';
        const prevImg = document.getElementById('image-preview-element');
        const prevPlaceholder = document.getElementById('image-preview-placeholder');
        const prevInput = document.getElementById('input-selected-image-url');
        if (prevImg) { prevImg.removeAttribute('src'); prevImg.style.display = 'none'; }
        if (prevPlaceholder) { prevPlaceholder.style.display = 'flex'; }
        if (prevInput) { prevInput.value = ''; }

        renderDishes();
        renderCategories();
        notifySetup(`"${name}" added to menu!`, 'success');
      };

      window.deleteDish = async function (id) {
        const confirmed = window.FroseUI && typeof window.FroseUI.confirmModal === 'function'
          ? await window.FroseUI.confirmModal({
              title: 'Delete Dish?',
              message: 'Are you sure you want to delete this dish from your menu?',
              confirmLabel: 'Delete',
              danger: true,
            })
          : false;
        if (!confirmed) return;
        try {
          const fn = window.froseApiFetch || fetch;
          await fn(`/api/v1/menu/${id}`, {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: { 'X-FROSE-CSRF': '1' }
          });
        } catch (e) {}

        vendorDishes = vendorDishes.filter(d => d.id !== id);
        try {
          if (window.FroseIdbStore) {
            await window.FroseIdbStore.putMenuItems(getVendorKey(), vendorDishes);
          }
        } catch (e) {}

        renderDishes();
        renderCategories();
      };

      document.addEventListener('DOMContentLoaded', init);
    })();
