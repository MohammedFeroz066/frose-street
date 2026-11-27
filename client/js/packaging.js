/**
 * FROSE Street — Packaging & Serving Portal Logic (Phase 15)
 * Two-Lane Workflow: "Ready for Pickup" (Lane 1) & "Waiting for Kitchen" (Lane 2).
 * Knuckle-friendly MARK DELIVERED actions, real-time lane promotions, pickup bell chime,
 * payment verification badges (PAID vs COLLECT CASH), and strict financial blindness.
 */

(function () {
  'use strict';

  function tr(key, vars, fallback) {
    if (window.FroseI18n && typeof window.FroseI18n.t === 'function') {
      return window.FroseI18n.t(key, vars);
    }
    return fallback || key;
  }

  // --- STATE ---
  let readyOrders = [];
  let waitingOrders = [];
  let deliveredCount = 0;
  let soundEnabled = localStorage.getItem('frose_packaging_sound') !== 'false';
  let wsConnection = null;
  let reconnectTimer = null;
  let ageTickerTimer = null;

  // DOM Elements
  const readyGrid = document.getElementById('packaging-ready-grid');
  const waitingGrid = document.getElementById('packaging-waiting-grid');
  const readyEmptyMsg = document.getElementById('ready-empty-msg');
  const waitingEmptyMsg = document.getElementById('waiting-empty-msg');
  const globalEmptyState = document.getElementById('packaging-global-empty');
  const readyCountPill = document.getElementById('ready-count-pill');
  const waitingCountPill = document.getElementById('waiting-count-pill');
  const deliveredCountPill = document.getElementById('delivered-count-pill');
  const readyLaneCount = document.getElementById('ready-lane-count');
  const waitingLaneCount = document.getElementById('waiting-lane-count');
  const reconnectBanner = document.getElementById('reconnect-banner');
  const btnRetry = document.getElementById('btn-banner-retry');
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const iconSoundOn = document.getElementById('icon-sound-on');
  const iconSoundOff = document.getElementById('icon-sound-off');
  const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
  const btnPackTheme = document.getElementById('btn-pack-theme');
  const packThemeIcon = document.getElementById('pack-theme-icon');
  const stallNameEl = document.getElementById('packaging-stall-name');
  const toastEl = document.getElementById('packaging-toast');
  const toastText = document.getElementById('toast-text');

  // Station Switch Sheet
  const btnOpenStation = document.getElementById('btn-open-station');
  const btnCloseStation = document.getElementById('btn-close-station');
  const btnStationBack = document.getElementById('btn-station-back');
  const btnStationLogout = document.getElementById('btn-station-logout');
  const stationStallName = document.getElementById('station-stall-name');

  // --- 1. WEB AUDIO SYNTHESIZER: PICKUP BELL CHIME ---
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  /**
   * Harmonious pickup chime (523Hz C5 -> 784Hz G5) alerting packer that dish is ready
   */
  function playPickupBell() {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      // Bell 1: 523.25 Hz (C5)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.5);

      // Bell 2: 783.99 Hz (G5) major fifth strike
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(783.99, now + 0.14);
      gain2.gain.setValueAtTime(0.4, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.8);

      if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
    } catch (_) {}
  }

  function playDeliveredBlip() {
    try {
      initAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now); // A5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch (_) {}
  }

  // --- 2. QR SCAN AUTO-AUTHENTICATION ---
  async function checkUrlPairing() {
    const urlParams = new URLSearchParams(window.location.search);
    const pairToken = urlParams.get('pair_token');

    if (pairToken) {
      try {
        showToast('Pairing with stall counter...');
        const fn = window.froseApiFetch || fetch;
        const res = await fn('/api/v1/devices/pair', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
          body: JSON.stringify({
            pairingToken: pairToken,
            deviceName: 'Packaging Station Phone (' + (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Tablet') + ')'
          })
        });
        const data = await res.json();
        if (res.ok && data.device) {
          localStorage.setItem('frose_session_active', '1');
          if (data.device && data.device.businessName) {
            localStorage.setItem('frose_stall_name', data.device.businessName);
          }
          showToast(`✅ Paired as ${data.device?.role || 'Packer'}!`);
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        } else {
          showToast('⚠️ Pairing token expired. Enter PIN.');
        }
      } catch (err) {
        console.warn('Pairing error:', err);
      }
    }
  }

  // --- 3. FORMATTING HELPERS ---
  function getOrderAge(createdAt) {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function createPaymentBadgeNode(order) {
    const { el } = window.FroseSafeDom;
    const isPaid = order.paymentStatus === 'completed' || (order.paymentMethod && order.paymentMethod !== 'pending');
    const method = (order.paymentMethod || 'CASH').toUpperCase();

    if (isPaid) {
      return el('span', { class: 'pack-pay-badge pay-paid' }, `✅ PAID (${method})`);
    }
    return el('span', { class: 'pack-pay-badge pay-collect' }, '⚠️ COLLECT CASH');
  }

  // --- 4. RENDER LANES ---
  function renderLanes() {
    const { el, svgEl, clear } = window.FroseSafeDom;
    // 1. Update Header Counters
    if (readyCountPill) readyCountPill.textContent = readyOrders.length.toString();
    if (waitingCountPill) waitingCountPill.textContent = waitingOrders.length.toString();
    if (deliveredCountPill) deliveredCountPill.textContent = deliveredCount.toString();
    if (readyLaneCount) readyLaneCount.textContent = `${readyOrders.length} Orders`;
    if (waitingLaneCount) waitingLaneCount.textContent = `${waitingOrders.length} Orders`;

    // 2. Global Empty State
    if (readyOrders.length === 0 && waitingOrders.length === 0) {
      if (globalEmptyState) globalEmptyState.style.display = 'flex';
      if (readyEmptyMsg) readyEmptyMsg.style.display = 'none';
      if (waitingEmptyMsg) waitingEmptyMsg.style.display = 'none';
      if (readyGrid) clear(readyGrid);
      if (waitingGrid) clear(waitingGrid);
      return;
    }

    if (globalEmptyState) globalEmptyState.style.display = 'none';

    // 3. Render Lane 1: Ready for Pickup
    if (readyGrid) {
      clear(readyGrid);
      if (readyOrders.length === 0) {
        if (readyEmptyMsg) readyEmptyMsg.style.display = 'flex';
      } else {
        if (readyEmptyMsg) readyEmptyMsg.style.display = 'none';
        readyOrders.forEach((order) => {
          const notesLower = (order.notes || '').toLowerCase();
          const orderTypeNorm = String(order.orderType || order.order_type || '').toLowerCase();
          const isTakeaway = orderTypeNorm === 'parcel' || orderTypeNorm === 'takeaway' || orderTypeNorm === 'counter' || notesLower.includes('pack') || notesLower.includes('takeaway') || notesLower.includes('parcel');
          const itemNodes = (order.items || []).map((it) =>
            el('div', { class: 'pack-item-row' }, [
              el('span', { class: 'pack-item-qty' }, `${it.quantity}x`),
              el('span', { class: 'pack-item-name' }, it.itemName || 'Dish'),
              it.notes ? el('span', { class: 'pack-item-note' }, `(${it.notes})`) : null,
            ])
          );

          readyGrid.appendChild(
            el('div', { class: 'packaging-card card-ready', id: `ready-card-${order.id}`, 'data-id': order.id }, [
              el('div', { class: 'pack-card-header' }, [
                el('div', { class: 'kds-token-box' }, [
                  el('span', { class: 'kds-token-prefix' }, 'TOKEN'),
                  el('span', { class: 'kds-token-num' }, `#${order.tokenNo}`),
                ]),
                el('div', { class: 'kds-header-tags' }, [
                  el('span', { class: `kds-tag ${isTakeaway ? 'tag-takeaway' : 'tag-dinein'}` },
                    isTakeaway ? '📦 PARCEL' : '🍽️ DINE-IN'
                  ),
                  order.editedAt ? el('span', { class: 'kds-tag kds-tag-edited' }, 'EDITED') : null,
                  createPaymentBadgeNode(order),
                ]),
              ]),
              el('div', { class: 'pack-card-body' }, [
                el('div', { class: 'pack-item-list' }, itemNodes),
                order.notes ? el('div', { class: 'kds-order-note-box' }, [el('span', {}, order.notes)]) : null,
              ]),
              el('div', { class: 'pack-card-footer' }, [
                el('button', {
                  class: 'btn-mark-delivered',
                  'data-order-id': order.id,
                  'data-token': order.tokenNo,
                  on: {
                    click: (e) => {
                      e.stopPropagation();
                      handleMarkDelivered(order.id, String(order.tokenNo));
                    },
                  },
                }, [
                  svgEl('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 3 }, [
                    svgEl('polyline', { points: '20 6 9 17 4 12' }),
                  ]),
                  el('span', {}, tr('pack.handed_over', null, 'Handed Over')),
                ]),
              ]),
            ])
          );
        });
      }
    }

    // 4. Render Lane 2: Waiting for Kitchen
    if (waitingGrid) {
      clear(waitingGrid);
      if (waitingOrders.length === 0) {
        if (waitingEmptyMsg) waitingEmptyMsg.style.display = 'flex';
      } else {
        if (waitingEmptyMsg) waitingEmptyMsg.style.display = 'none';
        waitingOrders.forEach((order) => {
          const notesLower = (order.notes || '').toLowerCase();
          const orderTypeNorm = String(order.orderType || order.order_type || '').toLowerCase();
          const isTakeaway = orderTypeNorm === 'parcel' || orderTypeNorm === 'takeaway' || orderTypeNorm === 'counter' || notesLower.includes('pack') || notesLower.includes('takeaway') || notesLower.includes('parcel');
          const age = getOrderAge(order.createdAt);
          const itemNodes = (order.items || []).map((it) =>
            el('div', { class: 'pack-item-row' }, [
              el('span', { class: 'pack-item-qty qty-waiting' }, `${it.quantity}x`),
              el('span', { class: 'pack-item-name' }, it.itemName || 'Dish'),
            ])
          );

          waitingGrid.appendChild(
            el('div', { class: 'packaging-card card-waiting', id: `waiting-card-${order.id}`, 'data-id': order.id }, [
              el('div', { class: 'pack-card-header' }, [
                el('div', { class: 'kds-token-box' }, [
                  el('span', { class: 'kds-token-prefix' }, 'TOKEN'),
                  el('span', { class: 'kds-token-num text-muted' }, `#${order.tokenNo}`),
                ]),
                el('div', { class: 'kds-header-tags' }, [
                  el('span', { class: `kds-tag ${isTakeaway ? 'tag-takeaway' : 'tag-dinein'}` },
                    isTakeaway ? '📦 PARCEL' : '🍽️ DINE-IN'
                  ),
                  order.editedAt ? el('span', { class: 'kds-tag kds-tag-edited' }, 'EDITED') : null,
                  el('span', { class: 'kds-tag tag-cooking-status' }, `🍳 Cooking in Kitchen (${age})`),
                ]),
              ]),
              el('div', { class: 'pack-card-body' }, [
                el('div', { class: 'pack-item-list' }, itemNodes),
              ]),
            ])
          );
        });
      }
    }
  }

  // --- 5. ACTION: MARK DELIVERED ---
  async function handleMarkDelivered(orderId, tokenNo) {
    const cardEl = document.getElementById(`ready-card-${orderId}`);
    if (cardEl) {
      cardEl.classList.add('slide-out');
    }

    playDeliveredBlip();
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

    // Optimistically remove from readyOrders
    readyOrders = readyOrders.filter((o) => o.id !== orderId);
    deliveredCount++;
    showToast(tr('pack.toast_served', { token: tokenNo }, `✅ Order #${tokenNo} Delivered & Served!`));

    setTimeout(() => {
      renderLanes();
    }, 280);

    // Call API: update to 'served'
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-FROSE-CSRF': '1'
        },
        body: JSON.stringify({ status: 'served' })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('Mark delivered error:', errData);
      }
    } catch (err) {
      console.warn('Network error marking delivered:', err);
    }
  }

  // --- 6. REAL-TIME PROMOTION (WAITING -> READY) ---
  function promoteOrderToReady(orderId) {
    const foundIdx = waitingOrders.findIndex((o) => o.id === orderId);
    if (foundIdx !== -1) {
      const promoted = waitingOrders.splice(foundIdx, 1)[0];
      promoted.orderStatus = 'ready';
      readyOrders.unshift(promoted);
      renderLanes();
      playPickupBell();
      showToast(tr('pack.toast_ready', { token: promoted.tokenNo }, `🔔 Token #${promoted.tokenNo} is READY for serving!`));
      // Auto-scroll to ready lane
      const readySec = document.getElementById('packaging-ready-section');
      if (readySec) readySec.scrollIntoView({ behavior: 'smooth' });
    } else {
      // Re-fetch to ensure sync
      fetchLiveOrders();
    }
  }

  // --- 7. FETCH LIVE QUEUES ---

  async function fetchLiveOrders() {
    // 1. Instant local queue sync
    try {
      const localQueue = localStorage.getItem('frose_live_orders_queue');
      if (localQueue) {
        const parsed = JSON.parse(localQueue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          waitingOrders = parsed.filter(o => o.status === 'pending' || o.status === 'in_prep');
          readyOrders = parsed.filter(o => o.status === 'ready');
          renderLanes();
          hideReconnectBanner();
        }
      }
    } catch (_) {}

    // 2. Fetch from backend API
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn('/api/v1/orders/live', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data.packagingQueue && Array.isArray(data.packagingQueue)) {
          readyOrders = data.packagingQueue;
        }
        if (data.kitchenQueue && Array.isArray(data.kitchenQueue)) {
          waitingOrders = data.kitchenQueue;
        }
        renderLanes();
        hideReconnectBanner();
      } else {
        renderLanes();
        if (isSoloCounterDevice()) hideReconnectBanner();
      }
    } catch (err) {
      console.warn('Fetch note (operating in local counter mode):', err);
      renderLanes();
      if (!isSoloCounterDevice()) {
        showReconnectBanner();
      } else {
        hideReconnectBanner();
      }
    }
  }

  // --- 8. WEBSOCKET SYNC & RECONNECT ---
  let heartbeatInterval = null;

  function initWebSocket() {
    if (reconnectTimer) clearTimeout(reconnectTimer);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      wsConnection = new WebSocket(wsUrl);

      wsConnection.onopen = () => {
        console.log('⚡ Packaging WebSocket Connected');
        hideReconnectBanner();
        fetchLiveOrders();

        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
            wsConnection.send(JSON.stringify({ event: 'ping' }));
          }
        }, 25000);
      };

      wsConnection.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'order:new' && msg.data) {
            if (!waitingOrders.some((o) => o.id === msg.data.id) && !readyOrders.some((o) => o.id === msg.data.id)) {
              waitingOrders.unshift(msg.data);
              renderLanes();
            }
          } else if (msg.event === 'order:updated' && msg.data) {
            handleOrderUpdated(msg.data);
          } else if (msg.event === 'order:status_changed' && msg.data) {
            const { id, newStatus } = msg.data;
            if (newStatus === 'ready') {
              promoteOrderToReady(id);
            } else if (newStatus === 'served' || newStatus === 'cancelled') {
              readyOrders = readyOrders.filter((o) => o.id !== id);
              waitingOrders = waitingOrders.filter((o) => o.id !== id);
              renderLanes();
            }
          }
        } catch (_) {}
      };

      wsConnection.onclose = () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        if (!isSoloCounterDevice()) {
          showReconnectBanner();
        }
        scheduleReconnect();
      };

      wsConnection.onerror = () => {
        if (!isSoloCounterDevice()) {
          showReconnectBanner();
        }
      };
    } catch (err) {
      if (!isSoloCounterDevice()) {
        showReconnectBanner();
      }
      scheduleReconnect();
    }
  }

  // Cross-Tab Local P2P Channel for Solo Stall Counters
  if (typeof BroadcastChannel !== 'undefined') {
    const orderChannel = new BroadcastChannel('frose_orders');
    orderChannel.onmessage = (event) => {
      const msg = event.data;
      if (msg && msg.event === 'order:new' && msg.data) {
        if (!waitingOrders.some((o) => o.id === msg.data.id) && !readyOrders.some((o) => o.id === msg.data.id)) {
          waitingOrders.unshift(msg.data);
          renderLanes();
        }
      } else if (msg && msg.event === 'order:updated' && msg.data) {
        handleOrderUpdated(msg.data);
      } else if (msg && msg.event === 'order:status_changed' && msg.data) {
        const { id, newStatus } = msg.data;
        if (newStatus === 'ready') {
          promoteOrderToReady(id);
        } else if (newStatus === 'served' || newStatus === 'cancelled') {
          readyOrders = readyOrders.filter((o) => o.id !== id);
          waitingOrders = waitingOrders.filter((o) => o.id !== id);
          renderLanes();
        }
      }
    };
  }

  function handleOrderUpdated(updatedOrder) {
    if (!updatedOrder || !updatedOrder.id) return;
    let updated = false;
    const rIdx = readyOrders.findIndex((o) => o.id === updatedOrder.id);
    if (rIdx !== -1) {
      readyOrders[rIdx] = { ...readyOrders[rIdx], ...updatedOrder };
      updated = true;
    }
    const wIdx = waitingOrders.findIndex((o) => o.id === updatedOrder.id);
    if (wIdx !== -1) {
      waitingOrders[wIdx] = { ...waitingOrders[wIdx], ...updatedOrder };
      updated = true;
    }
    if (updated) {
      renderLanes();
      showToast(`✏️ Order #${updatedOrder.tokenNo || ''} Updated`);
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log('Reconnecting Packaging WebSocket...');
      initWebSocket();
    }, 3000);
  }

  function isSoloCounterDevice() {
    return !!localStorage.getItem('frose_current_vendor') || !localStorage.getItem('frose_is_slave_screen');
  }

  function showReconnectBanner() {
    if (isSoloCounterDevice()) {
      if (reconnectBanner) reconnectBanner.style.display = 'none';
      return;
    }
    if (reconnectBanner) reconnectBanner.style.display = 'block';
  }

  function hideReconnectBanner() {
    if (reconnectBanner) reconnectBanner.style.display = 'none';
  }

  // --- 9. TOAST NOTIFICATION ---
  let toastTimer = null;
  function showToast(text) {
    if (!toastEl || !toastText) return;
    toastText.textContent = text;
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.style.display = 'none';
    }, 2500);
  }

  // --- 10. STATION SWITCH SHEET ---
  function openStationSheet() {
    if (stationStallName) {
      stationStallName.textContent = localStorage.getItem('frose_stall_name') || 'FROSE Street Stall';
    }
    if (window.FroseUI && typeof window.FroseUI.openSheet === 'function') {
      window.FroseUI.openSheet('station-switch-sheet');
    } else {
      const el = document.getElementById('station-switch-sheet');
      if (el) el.classList.add('active');
    }
  }

  function closeStationSheet() {
    if (window.FroseUI && typeof window.FroseUI.closeSheet === 'function') {
      window.FroseUI.closeSheet('station-switch-sheet');
    } else {
      const el = document.getElementById('station-switch-sheet');
      if (el) el.classList.remove('active');
    }
  }

  // --- 11. INITIALIZATION ---
  function init() {
    const storedStall = localStorage.getItem('frose_stall_name');
    if (storedStall && stallNameEl) stallNameEl.textContent = storedStall;

    if (btnPackTheme && window.FroseTheme) {
      const syncPackThemeIcon = (theme) => {
        if (packThemeIcon) {
          packThemeIcon.textContent = theme === 'dark' ? '🌙' : (theme === 'sunlight' ? '☀️' : '🌤️');
        }
      };
      syncPackThemeIcon(window.FroseTheme.getTheme());
      btnPackTheme.addEventListener('click', () => {
        const next = window.FroseTheme.cycleTheme();
        syncPackThemeIcon(next);
        showToast(`Theme: ${next}`);
      });
    }

    // Sound toggle
    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('frose_packaging_sound', soundEnabled ? 'true' : 'false');
        if (iconSoundOn && iconSoundOff) {
          iconSoundOn.style.display = soundEnabled ? 'block' : 'none';
          iconSoundOff.style.display = soundEnabled ? 'none' : 'block';
        }
        showToast(soundEnabled ? '🔔 Pickup Bell Enabled' : '🔕 Pickup Bell Muted');
        if (soundEnabled) playPickupBell();
      });
    }

    // Fullscreen toggle
    if (btnToggleFullscreen) {
      btnToggleFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
    }

    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        initWebSocket();
        fetchLiveOrders();
      });
    }

    // Station switch handlers
    if (btnOpenStation) btnOpenStation.addEventListener('click', openStationSheet);
    if (btnCloseStation) btnCloseStation.addEventListener('click', closeStationSheet);
    if (btnStationBack) btnStationBack.addEventListener('click', closeStationSheet);
    if (btnStationLogout) {
      btnStationLogout.addEventListener('click', () => {
        if (window.FroseIdbStore && typeof window.FroseIdbStore.safeLogout === 'function') {
          window.FroseIdbStore.safeLogout({ redirectTo: '/login.html' });
        } else {
          localStorage.removeItem('frose_session_active');
          window.location.href = '/login.html';
        }
      });
    }

    // Render lanes immediately so global empty state is visible on boot
    renderLanes();

    // Check QR pairing
    checkUrlPairing();

    if (!localStorage.getItem('frose_session_active')) {
      window.location.replace('/login');
      return;
    }
    fetchLiveOrders();
    initWebSocket();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  window.addEventListener('frose:language-changed', () => {
    renderLanes();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export for test harness
  window.__FROSE_PACKAGING__ = {
    getReadyOrders: () => readyOrders,
    getWaitingOrders: () => waitingOrders,
    setQueues: (ready, waiting) => {
      readyOrders = ready;
      waitingOrders = waiting;
      renderLanes();
    },
    handleMarkDelivered,
    promoteOrderToReady,
    playPickupBell,
    soundEnabled: () => soundEnabled,
  };

})();
