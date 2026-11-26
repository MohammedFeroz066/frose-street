/**
 * FROSE Street — Unified Profile & Settings Hub (Phase 4: UX-05)
 * Renders cleanly into #settings-panel-root (in /billing unified workspace)
 * and keeps compatibility with #settings-modal on legacy hubs.
 */
(function () {
  'use strict';

  var currentVendor = null;
  var pairedDevices = [];
  var GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  var FSSAI_REGEX = /^\d{14}$/;

  function toast(msg, variant) {
    if (window.FroseUI && typeof window.FroseUI.showToast === 'function') {
      window.FroseUI.showToast(msg, variant || 'success');
    }
  }

  function loadVendorFromStorage() {
    try {
      var raw = localStorage.getItem('frose_current_vendor');
      currentVendor = raw ? JSON.parse(raw) : {
        id: 'v-stall-default',
        businessName: 'FROSE Street Stall',
        ownerName: 'Stall Owner',
        phone: '',
        upiId: '',
        payeeName: 'FROSE Street Stall',
        taxMode: 'unregistered',
        gstin: '',
        fssaiNumber: '',
        gstRateBps: 0,
        stallAddress: '',
      };
    } catch (_) {
      currentVendor = {};
    }
  }

  async function hydrateVendorProfileFromServer() {
    try {
      if (!localStorage.getItem('frose_session_active')) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      var fn = window.froseApiFetch || fetch;
      var res = await fn('/api/v1/auth/me', { credentials: 'same-origin' });
      if (res && res.ok) {
        var profile = await res.json();
        if (profile && profile.id) {
          currentVendor = Object.assign({}, currentVendor || {}, profile);
          localStorage.setItem('frose_current_vendor', JSON.stringify(currentVendor));
          if (window.FroseIdbStore && typeof window.FroseIdbStore.setMeta === 'function') {
            await window.FroseIdbStore.setMeta('vendor_profile', {
              vendor_id: currentVendor.id,
              value: currentVendor,
            });
          }
        }
      }
      var devRes = await fn('/api/v1/devices', { credentials: 'same-origin' });
      if (devRes && devRes.ok) {
        var devJson = await devRes.json();
        if (Array.isArray(devJson.devices)) pairedDevices = devJson.devices;
      }
    } catch (_) {}
  }

  function syncTaxModeFields() {
    var modeEl = document.getElementById('sett-tax-mode');
    var rateEl = document.getElementById('sett-gst-rate-bps');
    var gstinEl = document.getElementById('sett-gstin');
    if (!modeEl) return;
    var mode = modeEl.value || 'unregistered';
    if (rateEl) {
      if (mode !== 'regular') {
        rateEl.value = '0';
        rateEl.disabled = true;
      } else {
        rateEl.disabled = false;
        if (rateEl.value === '0') {
          rateEl.value = currentVendor && currentVendor.gstRateBps ? String(currentVendor.gstRateBps) : '500';
        }
      }
    }
    if (gstinEl) {
      gstinEl.required = mode === 'composition' || mode === 'regular';
    }
  }

  window.onTaxModeChange = syncTaxModeFields;

  async function renderSettingsHub() {
    var root = document.getElementById('settings-panel-root');
    if (!root || !window.FroseSafeDom) return;
    var el = window.FroseSafeDom.el;
    var svgEl = window.FroseSafeDom.svgEl;
    var clear = window.FroseSafeDom.clear;
    var safeImageUrl = window.FroseSafeDom.safeImageUrl;
    clear(root);

    var v = currentVendor || {};
    var customQr = localStorage.getItem('frose_custom_scanner_qr');
    var safeQr = safeImageUrl(customQr);
    var activeTheme = window.FroseTheme ? window.FroseTheme.getTheme() : 'light';

    var pendingCount = 0;
    if (window.FroseIdbStore && typeof window.FroseIdbStore.getUnsyncedOutboxCount === 'function') {
      try {
        pendingCount = await window.FroseIdbStore.getUnsyncedOutboxCount(v.id);
      } catch (_) {}
    }

    var persisted = false;
    if (navigator.storage && typeof navigator.storage.persisted === 'function') {
      try { persisted = await navigator.storage.persisted(); } catch (_) {}
    }

    root.appendChild(
      el('div', { style: 'margin-bottom: 14px;' }, [
        el('h2', { style: 'margin: 0; font-size: 20px; font-weight: 900;' }, 'Settings & Stall Profile'),
        el('div', { style: 'font-size: 12.5px; color: var(--text-muted);' }, (v.businessName || 'Stall Counter') + (v.phone ? ' · +91 ' + v.phone : '')),
      ])
    );

    var stack = el('div', { class: 'pos-list-stack' });

    // 1. Stall Profile + 2. Tax & Compliance
    stack.appendChild(
      el('section', { class: 'saas-card', style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        el('h3', { style: 'margin: 0; font-size: 16px; font-weight: 800;' }, '1. Stall Profile & Tax Compliance'),
        el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;' }, [
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-business-name' }, 'Stall Business Name *'),
            el('input', { type: 'text', id: 'sett-business-name', class: 'saas-input', value: v.businessName || '' }),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-owner-name' }, 'Owner Name'),
            el('input', { type: 'text', id: 'sett-owner-name', class: 'saas-input', value: v.ownerName || '' }),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-phone' }, 'Registered Mobile'),
            el('input', { type: 'text', id: 'sett-phone', class: 'saas-input', value: v.phone ? '+91 ' + v.phone : '', readonly: true }),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-address' }, 'Stall Address (Prints on Receipt)'),
            el('input', { type: 'text', id: 'sett-address', class: 'saas-input', maxlength: 240, value: v.stallAddress || v.address || v.city || '' }),
          ]),
        ]),
        el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;' }, [
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-tax-mode' }, 'GST Registration Mode'),
            el('select', {
              id: 'sett-tax-mode',
              class: 'saas-select',
              value: v.taxMode || 'unregistered',
              on: { change: syncTaxModeFields },
            }, [
              el('option', { value: 'unregistered', selected: (v.taxMode || 'unregistered') === 'unregistered' }, 'Unregistered (Cash Memo)'),
              el('option', { value: 'composition', selected: v.taxMode === 'composition' }, 'GST Composition (Bill of Supply)'),
              el('option', { value: 'regular', selected: v.taxMode === 'regular' }, 'Regular GST (Tax Invoice)'),
            ]),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-gstin' }, '15-Char GSTIN'),
            el('input', { type: 'text', id: 'sett-gstin', class: 'saas-input', maxlength: 15, value: v.gstin || '', placeholder: 'e.g. 36AABCU9603R1ZM' }),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-gst-rate-bps' }, 'GST Rate Slab'),
            el('select', { id: 'sett-gst-rate-bps', class: 'saas-select' }, [
              el('option', { value: '500', selected: Number(v.gstRateBps ?? 500) === 500 }, '5% GST (2.5% + 2.5%)'),
              el('option', { value: '0', selected: Number(v.gstRateBps) === 0 }, '0% Exempt'),
              el('option', { value: '1200', selected: Number(v.gstRateBps) === 1200 }, '12% GST (6% + 6%)'),
              el('option', { value: '1800', selected: Number(v.gstRateBps) === 1800 }, '18% GST (9% + 9%)'),
            ]),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-fssai-number' }, '14-Digit FSSAI Number'),
            el('input', { type: 'text', id: 'sett-fssai-number', class: 'saas-input', maxlength: 14, inputmode: 'numeric', value: v.fssaiNumber || '', placeholder: '14-digit FSSAI' }),
          ]),
        ]),
        el('button', {
          type: 'button',
          id: 'btn-save-stall-profile',
          class: 'saas-btn saas-btn-primary',
          on: { click: window.saveStallProfile },
        }, 'Save Profile & Tax Compliance'),
      ])
    );

    // 3. UPI Payment QR
    var qrPreviewNode = safeQr
      ? el('img', { src: safeQr, alt: 'Custom UPI QR', style: 'width: 72px; height: 72px; object-fit: contain; border-radius: 10px;' })
      : svgEl('svg', { viewBox: '0 0 64 64', width: 58, height: 58 }, [
          svgEl('rect', { width: 64, height: 64, fill: '#FFFFFF', rx: 8 }),
          svgEl('rect', { x: 8, y: 8, width: 16, height: 16, fill: '#0F172A', rx: 2 }),
          svgEl('rect', { x: 40, y: 8, width: 16, height: 16, fill: '#0F172A', rx: 2 }),
          svgEl('rect', { x: 8, y: 40, width: 16, height: 16, fill: '#0F172A', rx: 2 }),
          svgEl('rect', { x: 28, y: 28, width: 10, height: 10, fill: '#059669', rx: 2 }),
        ]);

    var fileInput = el('input', {
      type: 'file',
      id: 'sett-scanner-file',
      accept: 'image/*',
      style: 'display: none;',
      on: { change: window.handleScannerImageUpload },
    });

    stack.appendChild(
      el('section', { class: 'saas-card', style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        el('h3', { style: 'margin: 0; font-size: 16px; font-weight: 800;' }, '2. UPI Payment QR (Manual Soundbox/App Confirmation)'),
        el('div', { style: 'display: flex; align-items: center; gap: 14px; background: var(--bg-subtle); padding: 12px; border-radius: var(--radius-md);' }, [
          el('div', { id: 'sett-qr-preview-box', style: 'width: 72px; height: 72px; border-radius: 10px; background: #FFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0;' }, [qrPreviewNode]),
          el('div', { style: 'flex: 1; min-width: 0;' }, [
            el('div', { id: 'sett-qr-vpa-display', style: 'font-size: 13px; font-weight: 800;' }, v.upiId ? 'VPA: ' + v.upiId : 'Set up payment QR'),
            fileInput,
            el('button', {
              type: 'button',
              class: 'saas-btn saas-btn-secondary',
              style: 'margin-top: 6px; min-height: 44px;',
              on: { click: function () { fileInput.click(); } },
            }, 'Upload Counter QR Image'),
          ]),
        ]),
        el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;' }, [
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-upi-id' }, 'Counter UPI VPA *'),
            el('input', { type: 'text', id: 'sett-upi-id', class: 'saas-input', value: v.upiId || '', placeholder: 'e.g. stall@upi' }),
          ]),
          el('div', { class: 'saas-field' }, [
            el('label', { class: 'saas-label', for: 'sett-payee-name' }, 'Payee Name'),
            el('input', { type: 'text', id: 'sett-payee-name', class: 'saas-input', value: v.payeeName || v.businessName || '' }),
          ]),
        ]),
        el('button', {
          type: 'button',
          class: 'saas-btn saas-btn-primary',
          on: { click: window.savePaymentScanner },
        }, 'Save UPI QR Settings'),
      ])
    );

    // 4. Appearance & Theme
    var themeCards = [
      { id: 'light', label: 'Crisp Light', swatch: 'swatch-light' },
      { id: 'dark', label: 'Obsidian Dark', swatch: 'swatch-dark' },
      { id: 'sunlight', label: 'Sunlight Outdoor', swatch: 'swatch-sunlight' },
    ].map(function (t) {
      return el('button', {
        type: 'button',
        class: 'pos-theme-card' + (activeTheme === t.id ? ' active' : ''),
        'data-theme-choice': t.id,
        on: {
          click: function () {
            if (window.FroseTheme) window.FroseTheme.setTheme(t.id);
            renderSettingsHub();
            toast('Theme: ' + t.label, 'success');
          },
        },
      }, [
        el('span', { class: 'pos-theme-swatch ' + t.swatch }),
        el('span', {}, t.label),
      ]);
    });

    stack.appendChild(
      el('section', { class: 'saas-card', style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        el('h3', { style: 'margin: 0; font-size: 16px; font-weight: 800;' }, '3. Appearance & Theme'),
        el('div', { class: 'pos-theme-grid' }, themeCards),
      ])
    );

    // 5. Kitchen & Packaging Devices
    var devList = el('div', { class: 'pos-list-stack' });
    if (pairedDevices.length === 0) {
      devList.appendChild(el('div', { style: 'font-size: 13px; color: var(--text-muted);' }, 'No paired kitchen or packaging displays yet.'));
    } else {
      pairedDevices.forEach(function (d) {
        devList.appendChild(
          el('div', { class: 'pos-cart-row' }, [
            el('div', {}, [
              el('div', { style: 'font-size: 13.5px; font-weight: 800;' }, (d.deviceName || d.device_name || 'Display') + ' (' + String(d.role || '').toUpperCase() + ')'),
              el('div', { style: 'font-size: 11.5px; color: var(--text-muted);' }, d.isActive !== false ? 'Active' : 'Revoked'),
            ]),
            el('button', {
              type: 'button',
              class: 'saas-btn saas-btn-danger',
              style: 'min-height: 44px; padding: 0 12px;',
              on: { click: function () { revokePairedDevice(d.id); } },
            }, 'Revoke'),
          ])
        );
      });
    }

    stack.appendChild(
      el('section', { class: 'saas-card', style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        el('h3', { style: 'margin: 0; font-size: 16px; font-weight: 800;' }, '4. Kitchen & Packaging Displays'),
        el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
          el('button', {
            type: 'button',
            id: 'btn-pair-kitchen-qr',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function () { openPairingModal('cook'); } },
          }, '🍳 Pair Kitchen QR'),
          el('button', {
            type: 'button',
            id: 'btn-pair-packer-qr',
            class: 'saas-btn saas-btn-secondary',
            on: { click: function () { openPairingModal('packer'); } },
          }, '📦 Pair Packaging QR'),
        ]),
        devList,
      ])
    );

    // 6. Security & Staff PIN
    var pinInput = el('input', {
      type: 'password',
      id: 'sett-staff-pin',
      class: 'saas-input tabular-nums',
      maxlength: 4,
      inputmode: 'numeric',
      placeholder: '4-digit terminal lock PIN',
    });

    stack.appendChild(
      el('section', { class: 'saas-card', style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        el('h3', { style: 'margin: 0; font-size: 16px; font-weight: 800;' }, '5. Security & Terminal PIN'),
        el('div', { style: 'display: grid; grid-template-columns: 1fr auto; gap: 10px;' }, [
          pinInput,
          el('button', {
            type: 'button',
            id: 'btn-save-staff-pin',
            class: 'saas-btn saas-btn-slate',
            on: {
              click: async function () {
                var pin = (pinInput.value || '').trim();
                if (!/^\d{4}$/.test(pin)) {
                  toast('Enter a 4-digit numeric PIN', 'warning');
                  return;
                }
                try {
                  var fn = window.froseApiFetch || fetch;
                  var res = await fn('/api/v1/auth/setup-pin', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
                    body: JSON.stringify({ pin: pin }),
                  });
                  if (res && res.ok) {
                    pinInput.value = '';
                    toast('Terminal PIN updated', 'success');
                  } else {
                    toast('Could not update PIN', 'danger');
                  }
                } catch (_) {
                  toast('Network error updating PIN', 'danger');
                }
              },
            },
          }, 'Update PIN'),
        ]),
      ])
    );

    // 7. System, Offline Health & Safe Logout
    stack.appendChild(
      el('section', { class: 'saas-card', style: 'display: flex; flex-direction: column; gap: 12px;' }, [
        el('h3', { style: 'margin: 0; font-size: 16px; font-weight: 800;' }, '6. System & Offline Health'),
        el('div', { class: 'pos-summary-box' }, [
          el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Queued Offline Orders'), el('span', {}, String(pendingCount))]),
          el('div', { class: 'pos-summary-line' }, [el('span', {}, 'Persistent Storage'), el('span', {}, persisted ? 'Granted' : 'Standard')]),
          el('div', { class: 'pos-summary-line' }, [el('span', {}, 'App Cache Version'), el('span', {}, 'v54-phase4-ux')]),
        ]),
        el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 10px;' }, [
          el('button', {
            type: 'button',
            id: 'btn-settings-sync-now',
            class: 'saas-btn saas-btn-secondary',
            on: { click: window.forceCloudSync },
          }, '☁️ Sync Now'),
          el('button', {
            type: 'button',
            id: 'btn-settings-logout',
            class: 'saas-btn saas-btn-danger',
            on: { click: function () { if (window.handleLogout) window.handleLogout(); } },
          }, '🚪 Sign Out'),
        ]),
      ])
    );

    root.appendChild(stack);
    syncTaxModeFields();
  }

  async function openPairingModal(role) {
    var body = document.getElementById('device-pairing-sheet-body');
    if (!body || !window.FroseSafeDom) return;
    var el = window.FroseSafeDom.el;
    var clear = window.FroseSafeDom.clear;
    clear(body);
    body.appendChild(el('div', { class: 'saas-skeleton' }));
    if (window.FroseUI) window.FroseUI.openSheet('device-pairing-sheet');

    try {
      var fn = window.froseApiFetch || fetch;
      var res = await fn('/api/v1/devices/pairing-token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
        body: JSON.stringify({ role: role, deviceName: role === 'cook' ? 'Kitchen Display' : 'Packaging Board' }),
      });
      var data = await res.json().catch(function () { return {}; });
      clear(body);
      if (!res || !res.ok || !data.pairingToken) {
        body.appendChild(el('p', { style: 'color: var(--accent-rose);' }, data?.error?.message || 'Could not generate pairing QR'));
        return;
      }
      var targetPage = role === 'packer' ? '/packaging' : '/kitchen';
      var pairUrl = window.location.origin + targetPage + '?pair_token=' + encodeURIComponent(data.pairingToken);
      var qrDataUrl = window.FroseQrLocal ? window.FroseQrLocal.toDataUrl(pairUrl, 220) : '';
      var qrVisual = qrDataUrl
        ? el('img', { src: qrDataUrl, alt: 'Device Pairing QR', style: 'width: 190px; height: 190px; border-radius: 12px; background: #FFF; padding: 8px; image-rendering: pixelated;' })
        : (window.FroseQrLocal ? window.FroseQrLocal.toSvgElement(pairUrl, 190) : el('div', {}, 'QR ready'));

      body.appendChild(
        el('div', { style: 'text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center;' }, [
          el('div', { style: 'font-size: 13px; color: var(--text-muted);' }, 'Scan on your ' + (role === 'cook' ? 'Kitchen' : 'Packaging') + ' phone (valid 5 min):'),
          qrVisual,
          el('button', {
            type: 'button',
            class: 'saas-btn saas-btn-secondary saas-btn-block',
            on: {
              click: async function () {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  await navigator.clipboard.writeText(pairUrl);
                  toast('Pairing link copied', 'success');
                }
              },
            },
          }, '📋 Copy Pairing Link'),
        ])
      );
    } catch (_) {
      clear(body);
      body.appendChild(el('p', { style: 'color: var(--accent-rose);' }, 'Network error generating pairing QR'));
    }
  }

  async function revokePairedDevice(deviceId) {
    try {
      var fn = window.froseApiFetch || fetch;
      var res = await fn('/api/v1/devices/' + deviceId, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-FROSE-CSRF': '1' },
      });
      if (res && res.ok) {
        pairedDevices = pairedDevices.filter(function (d) { return d.id !== deviceId; });
        toast('Device revoked', 'success');
        renderSettingsHub();
      }
    } catch (_) {
      toast('Failed to revoke device', 'danger');
    }
  }

  window.saveStallProfile = async function () {
    var bName = document.getElementById('sett-business-name')?.value.trim();
    var oName = document.getElementById('sett-owner-name')?.value.trim();
    var addr = document.getElementById('sett-address')?.value.trim() || '';
    var taxMode = document.getElementById('sett-tax-mode')?.value || 'unregistered';
    var gstinRaw = document.getElementById('sett-gstin')?.value.trim().toUpperCase() || '';
    var fssaiRaw = document.getElementById('sett-fssai-number')?.value.trim() || '';
    var gstRateRaw = parseInt(document.getElementById('sett-gst-rate-bps')?.value || '0', 10);

    if (!bName) {
      toast('Business name is required', 'warning');
      return;
    }
    if ((taxMode === 'composition' || taxMode === 'regular') && !gstinRaw) {
      toast('15-char GSTIN required for Composition/Regular mode', 'warning');
      return;
    }
    if (gstinRaw && !GSTIN_REGEX.test(gstinRaw)) {
      toast('Invalid 15-character GSTIN format', 'danger');
      return;
    }
    if (fssaiRaw && !FSSAI_REGEX.test(fssaiRaw)) {
      toast('FSSAI number must be 14 digits', 'danger');
      return;
    }

    var effectiveGstRateBps = taxMode === 'regular' && [0, 500, 1200, 1800].includes(gstRateRaw) ? gstRateRaw : 0;
    var payload = {
      businessName: bName,
      ownerName: oName || undefined,
      stallAddress: addr || null,
      taxMode: taxMode,
      gstin: gstinRaw || null,
      fssaiNumber: fssaiRaw || null,
      gstRateBps: effectiveGstRateBps,
    };

    if (localStorage.getItem('frose_session_active') && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
      try {
        var fn = window.froseApiFetch || fetch;
        var res = await fn('/api/v1/auth/profile', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
          body: JSON.stringify(payload),
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok) {
          toast(data?.error?.message || data?.message || 'Failed to save profile', 'danger');
          return;
        }
        if (data && data.vendor) {
          currentVendor = Object.assign({}, currentVendor || {}, data.vendor);
        }
      } catch (_) {
        toast('Offline: saved locally', 'warning');
      }
    }

    currentVendor = currentVendor || {};
    currentVendor.businessName = bName;
    if (oName) currentVendor.ownerName = oName;
    currentVendor.address = addr;
    currentVendor.stallAddress = addr || null;
    currentVendor.taxMode = taxMode;
    currentVendor.gstin = gstinRaw || null;
    currentVendor.fssaiNumber = fssaiRaw || null;
    currentVendor.gstRateBps = effectiveGstRateBps;

    localStorage.setItem('frose_current_vendor', JSON.stringify(currentVendor));
    if (window.FroseIdbStore && currentVendor.id && typeof window.FroseIdbStore.setMeta === 'function') {
      try {
        await window.FroseIdbStore.setMeta('vendor_profile', {
          vendor_id: currentVendor.id,
          value: currentVendor,
        });
      } catch (_) {}
    }
    if (window.__FROSE_WORKSPACE__ && window.__FROSE_WORKSPACE__.refreshProfileUI) {
      window.__FROSE_WORKSPACE__.refreshProfileUI();
    }
    renderSettingsHub();
    toast('Stall profile & compliance saved', 'success');
  };

  window.savePaymentScanner = function () {
    var upiId = document.getElementById('sett-upi-id')?.value.trim();
    var payee = document.getElementById('sett-payee-name')?.value.trim();
    if (!upiId) {
      toast('Enter a valid UPI VPA ID', 'warning');
      return;
    }
    currentVendor = currentVendor || {};
    currentVendor.upiId = upiId;
    if (payee) currentVendor.payeeName = payee;
    localStorage.setItem('frose_current_vendor', JSON.stringify(currentVendor));
    localStorage.setItem('frose_custom_upi_id', upiId);
    if (payee) localStorage.setItem('frose_custom_payee_name', payee);
    renderSettingsHub();
    toast('UPI QR settings saved', 'success');
  };

  window.handleScannerImageUpload = function (event) {
    var file = event.target?.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      toast('Select a valid image file', 'warning');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      localStorage.setItem('frose_custom_scanner_qr', e.target.result);
      renderSettingsHub();
      toast('Custom UPI QR image saved', 'success');
    };
    reader.readAsDataURL(file);
  };

  window.forceCloudSync = async function () {
    var engine = window.__FROSE_SYNC_ENGINE__;
    if (engine && typeof engine.flushOutbox === 'function') {
      var res = await engine.flushOutbox({ force: true });
      var snap = await engine.getStatusSnapshot();
      toast('Sync: ' + res.synced + ' synced, ' + snap.pendingCount + ' pending', 'success');
      renderSettingsHub();
      return;
    }
    toast('Sync completed: 0 pending', 'success');
  };

  async function initSettings() {
    loadVendorFromStorage();
    await hydrateVendorProfileFromServer();
    await renderSettingsHub();
  }

  window.initSettingsModal = initSettings;
  window.__FROSE_SETTINGS_REFRESH__ = renderSettingsHub;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSettings);
  } else {
    initSettings();
  }
})();
