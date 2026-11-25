/**
 * FROSE Street — Packaging & Serving Portal Logic (Phase 15)
 * Two-Lane Workflow: "Ready for Pickup" (Lane 1) & "Waiting for Kitchen" (Lane 2).
 * Knuckle-friendly MARK DELIVERED actions, real-time lane promotions, pickup bell chime,
 * payment verification badges (PAID vs COLLECT CASH), and strict financial blindness.
 */

(function () {
  'use strict';

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
  const stallNameEl = document.getElementById('packaging-stall-name');
  const toastEl = document.getElementById('packaging-toast');
  const toastText = document.getElementById('toast-text');

  // PIN Modal
  const pinModal = document.getElementById('pin-modal');
  const btnOpenPin = document.getElementById('btn-open-pin');
  const btnClosePin = document.getElementById('btn-close-pin');
  const btnClearPin = document.getElementById('btn-clear-pin');
  const btnBackspace = document.getElementById('btn-backspace');
  const numpadKeys = document.querySelectorAll('.numpad-key[data-val]');
  let enteredPin = '';

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
        const res = await fetch('/api/v1/devices/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pairingToken: pairToken,
            deviceName: 'Packaging Station Phone (' + (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Tablet') + ')'
          })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          localStorage.setItem('frose_auth_token', data.token);
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

  function getPaymentBadgeHtml(order) {
    const isPaid = order.paymentStatus === 'completed' || (order.paymentMethod && order.paymentMethod !== 'pending');
    const method = (order.paymentMethod || 'CASH').toUpperCase();

    if (isPaid) {
      return `<span class="pack-pay-badge pay-paid">✅ PAID (${method})</span>`;
    }
    return `<span class="pack-pay-badge pay-collect">⚠️ COLLECT CASH</span>`;
  }

  // --- 4. RENDER LANES ---
  function renderLanes() {
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
      if (readyGrid) readyGrid.innerHTML = '';
      if (waitingGrid) waitingGrid.innerHTML = '';
      return;
    }

    if (globalEmptyState) globalEmptyState.style.display = 'none';

    // 3. Render Lane 1: Ready for Pickup
    if (readyGrid) {
      if (readyOrders.length === 0) {
        readyGrid.innerHTML = '';
        if (readyEmptyMsg) readyEmptyMsg.style.display = 'flex';
      } else {
        if (readyEmptyMsg) readyEmptyMsg.style.display = 'none';
        readyGrid.innerHTML = readyOrders.map((order) => {
          const isTakeaway = (order.notes || '').toLowerCase().includes('pack') || (order.notes || '').toLowerCase().includes('takeaway');
          const itemsHtml = (order.items || []).map((it) => `
            <div class="pack-item-row">
              <span class="pack-item-qty">${it.quantity}x</span>
              <span class="pack-item-name">${escapeHtml(it.itemName || 'Dish')}</span>
              ${it.notes ? `<span class="pack-item-note">(${escapeHtml(it.notes)})</span>` : ''}
            </div>
          `).join('');

          return `
            <div class="packaging-card card-ready" id="ready-card-${order.id}" data-id="${order.id}">
              <div class="pack-card-header">
                <div class="kds-token-box">
                  <span class="kds-token-prefix">TOKEN</span>
                  <span class="kds-token-num">#${order.tokenNo}</span>
                </div>
                <div class="kds-header-tags">
                  <span class="kds-tag ${isTakeaway ? 'tag-takeaway' : 'tag-dinein'}">
                    ${isTakeaway ? '📦 TAKEAWAY' : '🍽️ DINE-IN'}
                  </span>
                  ${getPaymentBadgeHtml(order)}
                </div>
              </div>

              <div class="pack-card-body">
                <div class="pack-item-list">
                  ${itemsHtml}
                </div>
                ${order.notes ? `
                  <div class="kds-order-note-box">
                    <span>${escapeHtml(order.notes)}</span>
                  </div>
                ` : ''}
              </div>

              <div class="pack-card-footer">
                <button class="btn-mark-delivered" data-order-id="${order.id}" data-token="${order.tokenNo}">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                  <span>MARK DELIVERED & SERVED</span>
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Attach Deliver Handlers
        const deliverBtns = readyGrid.querySelectorAll('.btn-mark-delivered');
        deliverBtns.forEach((btn) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const orderId = btn.getAttribute('data-order-id');
            const tokenNo = btn.getAttribute('data-token');
            handleMarkDelivered(orderId, tokenNo);
          });
        });
      }
    }

    // 4. Render Lane 2: Waiting for Kitchen
    if (waitingGrid) {
      if (waitingOrders.length === 0) {
        waitingGrid.innerHTML = '';
        if (waitingEmptyMsg) waitingEmptyMsg.style.display = 'flex';
      } else {
        if (waitingEmptyMsg) waitingEmptyMsg.style.display = 'none';
        waitingGrid.innerHTML = waitingOrders.map((order) => {
          const isTakeaway = (order.notes || '').toLowerCase().includes('pack') || (order.notes || '').toLowerCase().includes('takeaway');
          const age = getOrderAge(order.createdAt);
          const itemsHtml = (order.items || []).map((it) => `
            <div class="pack-item-row">
              <span class="pack-item-qty qty-waiting">${it.quantity}x</span>
              <span class="pack-item-name">${escapeHtml(it.itemName || 'Dish')}</span>
            </div>
          `).join('');

          return `
            <div class="packaging-card card-waiting" id="waiting-card-${order.id}" data-id="${order.id}">
              <div class="pack-card-header">
                <div class="kds-token-box">
                  <span class="kds-token-prefix">TOKEN</span>
                  <span class="kds-token-num text-muted">#${order.tokenNo}</span>
                </div>
                <div class="kds-header-tags">
                  <span class="kds-tag ${isTakeaway ? 'tag-takeaway' : 'tag-dinein'}">
                    ${isTakeaway ? '📦 TAKEAWAY' : '🍽️ DINE-IN'}
                  </span>
                  <span class="kds-tag tag-cooking-status">🍳 Cooking in Kitchen (${age})</span>
                </div>
              </div>

              <div class="pack-card-body">
                <div class="pack-item-list">
                  ${itemsHtml}
                </div>
              </div>
              <!-- Strictly NO Deliver button in waiting lane -->
            </div>
          `;
        }).join('');
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
    showToast(`✅ Order #${tokenNo} Delivered & Served!`);

    setTimeout(() => {
      renderLanes();
    }, 280);

    // Call API: update to 'served'
    try {
      const token = localStorage.getItem('frose_auth_token') || '';
      const res = await fetch(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
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
      showToast(`🔔 Token #${promoted.tokenNo} is READY for serving!`);
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
      const token = localStorage.getItem('frose_auth_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch('/api/v1/orders/live', { headers });
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

    const token = localStorage.getItem('frose_auth_token') || localStorage.getItem('frose_device_token') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`;

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

  // --- 10. PIN AUTH ---
  function openPinModal() {
    enteredPin = '';
    updatePinDots();
    if (pinModal) pinModal.classList.add('active');
  }

  function closePinModal() {
    enteredPin = '';
    updatePinDots();
    if (pinModal) pinModal.classList.remove('active');
  }

  function updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`dot-${i}`);
      if (dot) {
        if (i < enteredPin.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
      }
    }
  }

  async function submitPin() {
    try {
      const res = await fetch('/api/v1/auth/pin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: enteredPin })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('frose_auth_token', data.token);
        if (data.vendor && data.vendor.businessName) {
          localStorage.setItem('frose_stall_name', data.vendor.businessName);
          if (stallNameEl) stallNameEl.textContent = data.vendor.businessName;
        }
        showToast('✅ Station Unlocked!');
        closePinModal();
        fetchLiveOrders();
        initWebSocket();
      } else {
        showToast('❌ Invalid PIN');
        enteredPin = '';
        updatePinDots();
      }
    } catch (_) {
      showToast('❌ Auth error');
      enteredPin = '';
      updatePinDots();
    }
  }

  // --- 11. INITIALIZATION ---
  function init() {
    const storedStall = localStorage.getItem('frose_stall_name');
    if (storedStall && stallNameEl) stallNameEl.textContent = storedStall;

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

    // PIN handlers
    if (btnOpenPin) btnOpenPin.addEventListener('click', openPinModal);
    if (btnClosePin) btnClosePin.addEventListener('click', closePinModal);
    if (btnClearPin) btnClearPin.addEventListener('click', () => {
      enteredPin = '';
      updatePinDots();
    });
    if (btnBackspace) btnBackspace.addEventListener('click', () => {
      if (enteredPin.length > 0) {
        enteredPin = enteredPin.slice(0, -1);
        updatePinDots();
      }
    });

    numpadKeys.forEach((key) => {
      key.addEventListener('click', () => {
        if (enteredPin.length < 4) {
          enteredPin += key.getAttribute('data-val');
          updatePinDots();
          if (enteredPin.length === 4) {
            setTimeout(submitPin, 120);
          }
        }
      });
    });

    // Render lanes immediately so global empty state is visible on boot
    renderLanes();

    // Check QR pairing
    checkUrlPairing();

    if (!localStorage.getItem('frose_auth_token')) {
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
