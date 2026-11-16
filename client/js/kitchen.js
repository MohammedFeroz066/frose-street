/**
 * FROSE Street — Kitchen Display Portal (KDS) Logic (Phase 14)
 * Real-time order queue, knuckle-friendly MARK READY actions, card age tracking,
 * zero-dependency Web Audio bell chime, and Wake Lock screen keep-awake.
 * STRICT DOMAIN CONSTRAINT: Zero prices, zero financial totals (100% financially blind).
 */

(function () {
  'use strict';

  // --- STATE ---
  let kitchenOrders = [];
  let completedCount = 0;
  let soundEnabled = localStorage.getItem('frose_kds_sound') !== 'false';
  let wsConnection = null;
  let reconnectTimer = null;
  let wakeLockSentinel = null;
  let ageTickerTimer = null;

  // DOM Elements
  const queueContainer = document.getElementById('kds-order-queue');
  const emptyState = document.getElementById('kds-empty-state');
  const pendingCountPill = document.getElementById('pending-count-pill');
  const doneCountPill = document.getElementById('done-count-pill');
  const wakelockPill = document.getElementById('wakelock-pill');
  const reconnectBanner = document.getElementById('reconnect-banner');
  const btnRetry = document.getElementById('btn-banner-retry');
  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const iconSoundOn = document.getElementById('icon-sound-on');
  const iconSoundOff = document.getElementById('icon-sound-off');
  const btnToggleFullscreen = document.getElementById('btn-toggle-fullscreen');
  const stallNameEl = document.getElementById('kds-stall-name');
  const toastEl = document.getElementById('kds-toast');
  const toastText = document.getElementById('toast-text');

  // PIN Modal Elements
  const pinModal = document.getElementById('pin-modal');
  const btnOpenPin = document.getElementById('btn-open-pin');
  const btnClosePin = document.getElementById('btn-close-pin');
  const btnClearPin = document.getElementById('btn-clear-pin');
  const btnBackspace = document.getElementById('btn-backspace');
  const btnBiometric = document.getElementById('btn-biometric');
  const numpadKeys = document.querySelectorAll('.numpad-key[data-val]');
  let enteredPin = '';

  // --- 1. WEB AUDIO SYNTHESIZER: ACOUSTIC KITCHEN BELL ---
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  /**
   * Loud, bright dual-tone bell chime (1046Hz C6 -> 1318Hz E6) that cuts through fryer & street noise
   */
  function playKitchenBell() {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      // Note 1: 1046.5 Hz (C6)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0.4, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Note 2: 1318.5 Hz (E6) bell strike
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1318.5, now + 0.12);
      gain2.gain.setValueAtTime(0.5, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.7);

      // Haptic bump
      if (navigator.vibrate) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch (e) {
      console.warn('Web Audio warning:', e);
    }
  }

  /**
   * Order Ready action confirmation blip
   */
  function playReadyBlip() {
    try {
      initAudio();
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch (_) {}
  }

  // --- 2. SCREEN KEEP-AWAKE (WAKE LOCK API) ---
  async function requestScreenWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        if (wakelockPill) {
          wakelockPill.classList.add('active');
          wakelockPill.setAttribute('title', 'Screen Keep-Awake is Active');
        }
        wakeLockSentinel.addEventListener('release', () => {
          if (wakelockPill) wakelockPill.classList.remove('active');
        });
      } catch (err) {
        console.warn('Wake Lock request rejected:', err);
      }
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (wakeLockSentinel !== null && document.visibilityState === 'visible') {
      await requestScreenWakeLock();
    }
  });

  // --- 3. QR SCAN AUTO-AUTHENTICATION ---
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
            deviceName: 'Cook Kitchen Phone (' + (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Tablet') + ')'
          })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          localStorage.setItem('frose_auth_token', data.token);
          if (data.device && data.device.businessName) {
            localStorage.setItem('frose_stall_name', data.device.businessName);
          }
          showToast(`✅ Paired as ${data.device?.role || 'Cook'}!`);
          // Clean URL without reloading
          const cleanUrl = window.location.protocol + '//' + window.location.host + window.location.pathname;
          window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
        } else {
          showToast('⚠️ Pairing token expired. Enter PIN.');
        }
      } catch (err) {
        console.warn('Pairing request error:', err);
      }
    }
  }

  // --- 4. FORMATTING & AGE CLASSIFICATION ---
  /**
   * Computes age in seconds and assigns color status:
   * RED (<3m), ORANGE (3-10m), BLACK/SLATE (10m+)
   */
  function getOrderAge(createdAt) {
    const createdTime = new Date(createdAt).getTime();
    const now = Date.now();
    const diffSec = Math.max(0, Math.floor((now - createdTime) / 1000));
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    const timeDisplay = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    let ageTier = 'age-fresh'; // RED (0-3m)
    let ageLabel = 'Fresh';
    if (mins >= 10) {
      ageTier = 'age-overdue'; // BLACK/DARK (10m+)
      ageLabel = '10m+ Alert';
    } else if (mins >= 3) {
      ageTier = 'age-cooking'; // ORANGE (3-10m)
      ageLabel = 'In Prep';
    }

    return { diffSec, mins, timeDisplay, ageTier, ageLabel };
  }

  // --- 5. RENDER ORDER QUEUE ---
  function renderQueue() {
    if (!queueContainer) return;

    if (kitchenOrders.length === 0) {
      queueContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      if (pendingCountPill) pendingCountPill.textContent = '0';
      if (doneCountPill) doneCountPill.textContent = completedCount.toString();
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (pendingCountPill) pendingCountPill.textContent = kitchenOrders.length.toString();
    if (doneCountPill) doneCountPill.textContent = completedCount.toString();

    // Render cards
    queueContainer.innerHTML = kitchenOrders.map((order) => {
      const { timeDisplay, ageTier, ageLabel } = getOrderAge(order.createdAt);
      const isTakeaway = (order.notes || '').toLowerCase().includes('pack') || (order.notes || '').toLowerCase().includes('takeaway');

      const itemsHtml = (order.items || []).map((item) => `
        <div class="kds-item-row">
          <span class="kds-item-qty">${item.quantity}x</span>
          <span class="kds-item-name">${escapeHtml(item.itemName || 'Dish')}</span>
          ${item.notes ? `<span class="kds-item-note">(${escapeHtml(item.notes)})</span>` : ''}
        </div>
      `).join('');

      return `
        <div class="kds-card ${ageTier}" id="card-${order.id}" data-id="${order.id}">
          <div class="kds-card-header">
            <div class="kds-token-box">
              <span class="kds-token-prefix">TOKEN</span>
              <span class="kds-token-num">#${order.tokenNo}</span>
            </div>
            <div class="kds-header-tags">
              <span class="kds-tag kds-tag-type ${isTakeaway ? 'tag-takeaway' : 'tag-dinein'}">
                ${isTakeaway ? '📦 TAKEAWAY' : '🍽️ DINE-IN'}
              </span>
              <span class="kds-tag kds-tag-timer" id="timer-${order.id}">${timeDisplay} (${ageLabel})</span>
            </div>
          </div>

          <div class="kds-card-body">
            <div class="kds-item-list">
              ${itemsHtml}
            </div>

            ${order.notes ? `
              <div class="kds-order-note-box">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>${escapeHtml(order.notes)}</span>
              </div>
            ` : ''}
          </div>

          <div class="kds-card-footer">
            <button class="btn-mark-ready" data-order-id="${order.id}" data-token="${order.tokenNo}">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>MARK ORDER READY</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach knuckle-friendly click handlers
    const readyButtons = queueContainer.querySelectorAll('.btn-mark-ready');
    readyButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const orderId = btn.getAttribute('data-order-id');
        const tokenNo = btn.getAttribute('data-token');
        handleMarkReady(orderId, tokenNo);
      });
    });
  }

  // --- 6. REAL-TIME SECOND TICKER FOR CARD AGES ---
  function startAgeTicker() {
    if (ageTickerTimer) clearInterval(ageTickerTimer);
    ageTickerTimer = setInterval(() => {
      if (kitchenOrders.length === 0) return;

      kitchenOrders.forEach((order) => {
        const cardEl = document.getElementById(`card-${order.id}`);
        const timerEl = document.getElementById(`timer-${order.id}`);
        if (!cardEl || !timerEl) return;

        const { timeDisplay, ageTier, ageLabel } = getOrderAge(order.createdAt);
        timerEl.textContent = `${timeDisplay} (${ageLabel})`;

        // Update class dynamically if transitioned
        if (!cardEl.classList.contains(ageTier)) {
          cardEl.classList.remove('age-fresh', 'age-cooking', 'age-overdue');
          cardEl.classList.add(ageTier);
        }
      });
    }, 1000);
  }

  // --- 7. ACTION: MARK ORDER READY ---
  async function handleMarkReady(orderId, tokenNo) {
    const cardEl = document.getElementById(`card-${orderId}`);
    if (cardEl) {
      // Trigger instant tactile slide-out
      cardEl.classList.add('slide-out');
    }

    playReadyBlip();
    if (navigator.vibrate) navigator.vibrate([40, 30, 40]);

    // Optimistically update local queue
    const removedOrder = kitchenOrders.find((o) => o.id === orderId);
    kitchenOrders = kitchenOrders.filter((o) => o.id !== orderId);
    completedCount++;

    showToast(`✅ Order #${tokenNo} Marked Ready!`);

    setTimeout(() => {
      renderQueue();
    }, 280);

    // Call API to advance status to 'ready'
    try {
      const token = localStorage.getItem('frose_auth_token') || '';
      const res = await fetch(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ status: 'ready' })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn('Status update API error:', errData);
      }
    } catch (err) {
      console.warn('Network error during status update:', err);
    }
  }

  // --- 8. FETCH LIVE QUEUE ---
  async function fetchLiveOrders() {
    try {
      const token = localStorage.getItem('frose_auth_token') || '';
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch('/api/v1/orders/live', { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.kitchenQueue && Array.isArray(data.kitchenQueue)) {
          kitchenOrders = data.kitchenQueue;
          renderQueue();
          hideReconnectBanner();
        }
      }
    } catch (err) {
      console.warn('Failed to fetch live orders:', err);
      showReconnectBanner();
    }
  }

  // --- 9. WEBSOCKET REAL-TIME SYNC & AUTO-RECONNECT ---
  function initWebSocket() {
    if (reconnectTimer) clearTimeout(reconnectTimer);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      wsConnection = new WebSocket(wsUrl);

      wsConnection.onopen = () => {
        console.log('⚡ KDS WebSocket Connected');
        hideReconnectBanner();
        fetchLiveOrders();
      };

      wsConnection.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'order:new' && msg.data) {
            handleNewIncomingOrder(msg.data);
          } else if (msg.event === 'order:status_changed' && msg.data) {
            handleRemoteStatusChange(msg.data);
          }
        } catch (_) {}
      };

      wsConnection.onclose = () => {
        console.warn('WebSocket closed, attempting reconnect...');
        showReconnectBanner();
        scheduleReconnect();
      };

      wsConnection.onerror = () => {
        showReconnectBanner();
      };
    } catch (err) {
      showReconnectBanner();
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log('Reconnecting KDS WebSocket...');
      initWebSocket();
    }, 3000);
  }

  function showReconnectBanner() {
    if (reconnectBanner) reconnectBanner.style.display = 'block';
  }

  function hideReconnectBanner() {
    if (reconnectBanner) reconnectBanner.style.display = 'none';
  }

  /**
   * Prepend new order ticket, trigger audio bell, and auto-scroll to top
   */
  function handleNewIncomingOrder(order) {
    if (!order || !order.id) return;

    // Check duplicate
    if (kitchenOrders.some((o) => o.id === order.id)) return;

    // Prepend to newest first
    kitchenOrders.unshift(order);
    renderQueue();
    playKitchenBell();

    // Auto-scroll to top so cook immediately views new ticket
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleRemoteStatusChange(data) {
    if (!data || !data.id) return;
    if (data.newStatus === 'ready' || data.newStatus === 'served' || data.newStatus === 'cancelled') {
      kitchenOrders = kitchenOrders.filter((o) => o.id !== data.id);
      renderQueue();
    }
  }

  // --- 10. TOAST NOTIFICATION ---
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

  // --- 11. PIN MODAL & AUTH ---
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
        if (i < enteredPin.length) {
          dot.classList.add('filled');
        } else {
          dot.classList.remove('filled');
        }
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
        showToast('✅ Counter Unlocked!');
        closePinModal();
        fetchLiveOrders();
      } else {
        showToast('❌ Invalid PIN');
        enteredPin = '';
        updatePinDots();
      }
    } catch (e) {
      showToast('❌ Auth error');
      enteredPin = '';
      updatePinDots();
    }
  }

  // --- 12. INITIALIZATION & EVENT BINDINGS ---
  function init() {
    // Check stall name
    const storedStall = localStorage.getItem('frose_stall_name');
    if (storedStall && stallNameEl) {
      stallNameEl.textContent = storedStall;
    }

    // Sound toggle
    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('frose_kds_sound', soundEnabled ? 'true' : 'false');
        if (iconSoundOn && iconSoundOff) {
          iconSoundOn.style.display = soundEnabled ? 'block' : 'none';
          iconSoundOff.style.display = soundEnabled ? 'none' : 'block';
        }
        showToast(soundEnabled ? '🔔 Kitchen Bell Enabled' : '🔕 Kitchen Bell Muted');
        if (soundEnabled) playKitchenBell();
      });
      if (iconSoundOn && iconSoundOff) {
        iconSoundOn.style.display = soundEnabled ? 'block' : 'none';
        iconSoundOff.style.display = soundEnabled ? 'none' : 'block';
      }
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

    // Retry button on banner
    if (btnRetry) {
      btnRetry.addEventListener('click', () => {
        initWebSocket();
        fetchLiveOrders();
      });
    }

    // PIN modal interactions
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

    // Check QR pairing
    checkUrlPairing();

    // Request wake lock
    requestScreenWakeLock();

    // Fetch initial queue and start ticker
    fetchLiveOrders();
    startAgeTicker();

    // Start WebSocket
    initWebSocket();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Self-start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export functions for test harnesses
  window.__FROSE_KDS__ = {
    getOrders: () => kitchenOrders,
    setOrders: (ords) => { kitchenOrders = ords; renderQueue(); },
    handleNewIncomingOrder,
    handleMarkReady,
    playKitchenBell,
    requestScreenWakeLock,
    getOrderAge,
    soundEnabled: () => soundEnabled,
  };

})();
