/**
 * FROSE Street — Kitchen Display Portal (KDS) Logic (Phase 14)
 * Real-time order queue, knuckle-friendly MARK READY actions, card age tracking,
 * zero-dependency Web Audio bell chime, and Wake Lock screen keep-awake.
 * STRICT DOMAIN CONSTRAINT: Zero prices, zero financial totals (100% financially blind).
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
  const btnKdsTheme = document.getElementById('btn-kds-theme');
  const kdsThemeIcon = document.getElementById('kds-theme-icon');
  const stallNameEl = document.getElementById('kds-stall-name');
  const toastEl = document.getElementById('kds-toast');
  const toastText = document.getElementById('toast-text');

  // Station Switch Sheet Elements
  const btnOpenStation = document.getElementById('btn-open-station');
  const btnCloseStation = document.getElementById('btn-close-station');
  const btnStationBack = document.getElementById('btn-station-back');
  const btnStationLogout = document.getElementById('btn-station-logout');
  const stationStallName = document.getElementById('station-stall-name');

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
        const fn = window.froseApiFetch || fetch;
        const res = await fn('/api/v1/devices/pair', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
          body: JSON.stringify({
            pairingToken: pairToken,
            deviceName: 'Cook Kitchen Phone (' + (navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Tablet') + ')'
          })
        });
        const data = await res.json();
        if (res.ok && data.device) {
          localStorage.setItem('frose_session_active', '1');
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

    let ageTier = 'age-fresh';
    let ageLabel = 'Fresh';
    let timerClass = 'kds-timer-emerald';
    if (mins >= 10) {
      ageTier = 'age-overdue';
      ageLabel = '10m+ Alert';
      timerClass = 'kds-timer-rose';
    } else if (mins >= 5) {
      ageTier = 'age-cooking';
      ageLabel = 'In Prep';
      timerClass = 'kds-timer-amber';
    } else if (mins >= 3) {
      ageTier = 'age-cooking';
      ageLabel = 'In Prep';
    }

    return { diffSec, mins, timeDisplay, ageTier, ageLabel, timerClass };
  }

  // --- 5. RENDER ORDER QUEUE ---
  function renderQueue() {
    if (!queueContainer) return;
    const { el, svgEl, clear } = window.FroseSafeDom;

    clear(queueContainer);

    if (kitchenOrders.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      if (pendingCountPill) pendingCountPill.textContent = '0';
      if (doneCountPill) doneCountPill.textContent = completedCount.toString();
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    if (pendingCountPill) pendingCountPill.textContent = kitchenOrders.length.toString();
    if (doneCountPill) doneCountPill.textContent = completedCount.toString();

    kitchenOrders.forEach((order) => {
      const { timeDisplay, ageTier, ageLabel, timerClass } = getOrderAge(order.createdAt);
      const notesLower = (order.notes || '').toLowerCase();
      const orderTypeNorm = String(order.orderType || order.order_type || '').toLowerCase();
      const isTakeaway = orderTypeNorm === 'parcel' || orderTypeNorm === 'takeaway' || orderTypeNorm === 'counter' || notesLower.includes('pack') || notesLower.includes('takeaway') || notesLower.includes('parcel');

      const itemRows = (order.items || []).map((item) =>
        el('div', { class: 'kds-item-row' }, [
          el('span', { class: 'kds-item-qty' }, `${item.quantity}x`),
          el('span', { class: 'kds-item-name' }, item.itemName || 'Dish'),
          item.notes ? el('span', { class: 'kds-item-note' }, `(${item.notes})`) : null,
        ])
      );

      const noteBox = order.notes
        ? el('div', { class: 'kds-order-note-box' }, [
            svgEl('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }, [
              svgEl('circle', { cx: 12, cy: 12, r: 10 }),
              svgEl('line', { x1: 12, y1: 8, x2: 12, y2: 12 }),
              svgEl('line', { x1: 12, y1: 16, x2: 12.01, y2: 16 }),
            ]),
            el('span', {}, order.notes),
          ])
        : null;

      const footerButtons = [];
      if (order.orderStatus === 'pending') {
        footerButtons.push(
          el('button', {
            type: 'button',
            class: 'saas-btn saas-btn-secondary saas-btn-full',
            style: 'margin-bottom: 8px;',
            on: {
              click: (e) => {
                e.stopPropagation();
                handleStartCooking(order.id, String(order.tokenNo));
              },
            },
          }, [tr('kds.start_cooking', null, '🔥 Start Cooking')])
        );
      }

      footerButtons.push(
        el('button', {
          class: 'btn-mark-ready',
          'data-order-id': order.id,
          'data-token': order.tokenNo,
          on: {
            click: (e) => {
              e.stopPropagation();
              handleMarkReady(order.id, String(order.tokenNo));
            },
          },
        }, [
          svgEl('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 3 }, [
            svgEl('polyline', { points: '20 6 9 17 4 12' }),
          ]),
          el('span', {}, tr('kds.mark_ready', null, 'Mark Ready')),
        ])
      );

      const card = el('div', { class: `kds-card ${ageTier}`, id: `card-${order.id}`, 'data-id': order.id }, [
        el('div', { class: 'kds-card-header' }, [
          el('div', { class: 'kds-token-box' }, [
            el('span', { class: 'kds-token-prefix' }, 'TOKEN'),
            el('span', { class: 'kds-token-num' }, `#${order.tokenNo}`),
          ]),
          el('div', { class: 'kds-header-tags' }, [
            el('span', { class: `kds-tag kds-tag-type ${isTakeaway ? 'tag-takeaway' : 'tag-dinein'}` },
              isTakeaway ? tr('kds.parcel', null, '📦 PARCEL') : tr('kds.dine_in', null, '🍽️ DINE-IN')
            ),
            order.editedAt ? el('span', { class: 'kds-tag kds-tag-edited' }, tr('kds.edited', null, 'EDITED')) : null,
            el('span', { class: `kds-tag kds-tag-timer ${timerClass}`, id: `timer-${order.id}` }, `${timeDisplay} (${ageLabel})`),
          ]),
        ]),
        el('div', { class: 'kds-card-body' }, [
          el('div', { class: 'kds-item-list' }, itemRows),
          noteBox,
        ]),
        el('div', { class: 'kds-card-footer' }, footerButtons),
      ]);

      queueContainer.appendChild(card);
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

        const { timeDisplay, ageTier, ageLabel, timerClass } = getOrderAge(order.createdAt);
        timerEl.textContent = `${timeDisplay} (${ageLabel})`;

        if (!timerEl.classList.contains(timerClass)) {
          timerEl.classList.remove('kds-timer-emerald', 'kds-timer-amber', 'kds-timer-rose');
          timerEl.classList.add(timerClass);
        }

        // Update class dynamically if transitioned
        if (!cardEl.classList.contains(ageTier)) {
          cardEl.classList.remove('age-fresh', 'age-cooking', 'age-overdue');
          cardEl.classList.add(ageTier);
        }
      });
    }, 1000);
  }

  async function handleStartCooking(orderId, tokenNo) {
    const existing = kitchenOrders.find((o) => o.id === orderId);
    if (existing) {
      existing.orderStatus = 'preparing';
      renderQueue();
    }
    showToast(tr('kds.toast_cooking', { token: tokenNo }, `🔥 Cooking Token #${tokenNo}`));
    try {
      const fn = window.froseApiFetch || fetch;
      await fn(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-FROSE-CSRF': '1' },
        body: JSON.stringify({ status: 'preparing' })
      });
    } catch (_) {}
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

    showToast(tr('kds.toast_ready', { token: tokenNo }, `✅ Order #${tokenNo} Marked Ready!`));

    setTimeout(() => {
      renderQueue();
    }, 280);

    // Call API to advance status to 'ready'
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn(`/api/v1/orders/${orderId}/status`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-FROSE-CSRF': '1'
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
    // 1. Instant local queue sync (zero network delay)
    try {
      const localQueue = localStorage.getItem('frose_live_orders_queue');
      if (localQueue) {
        const parsed = JSON.parse(localQueue);
        if (Array.isArray(parsed) && parsed.length > 0) {
          kitchenOrders = parsed.filter(o => o.status === 'pending' || o.status === 'in_prep');
          renderQueue();
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
        if (data.kitchenQueue && Array.isArray(data.kitchenQueue)) {
          kitchenOrders = data.kitchenQueue;
          renderQueue();
          hideReconnectBanner();
          try {
            localStorage.setItem('frose_live_orders_queue', JSON.stringify(kitchenOrders));
          } catch (_) {}
        }
      } else {
        renderQueue();
        if (isSoloCounterDevice()) hideReconnectBanner();
      }
    } catch (err) {
      console.warn('Fetch note (operating in local counter mode):', err);
      renderQueue();
      if (!isSoloCounterDevice()) {
        showReconnectBanner();
      } else {
        hideReconnectBanner();
      }
    }
  }

  // --- 9. WEBSOCKET REAL-TIME SYNC & AUTO-RECONNECT ---
  let heartbeatInterval = null;

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
            handleNewIncomingOrder(msg.data);
          } else if (msg.event === 'order:updated' && msg.data) {
            handleOrderUpdated(msg.data);
          } else if (msg.event === 'order:status_changed' && msg.data) {
            handleRemoteStatusChange(msg.data);
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
        handleNewIncomingOrder(msg.data);
      } else if (msg && msg.event === 'order:updated' && msg.data) {
        handleOrderUpdated(msg.data);
      } else if (msg && msg.event === 'order:status_changed' && msg.data) {
        handleRemoteStatusChange(msg.data);
      }
    };
  }

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      console.log('Reconnecting KDS WebSocket...');
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

  function handleOrderUpdated(updatedOrder) {
    if (!updatedOrder || !updatedOrder.id) return;
    const idx = kitchenOrders.findIndex((o) => o.id === updatedOrder.id);
    if (idx !== -1) {
      kitchenOrders[idx] = { ...kitchenOrders[idx], ...updatedOrder };
      renderQueue();
      showToast(`✏️ Order #${updatedOrder.tokenNo || ''} Updated`);
    } else if (updatedOrder.orderStatus === 'pending' || updatedOrder.orderStatus === 'preparing') {
      kitchenOrders.unshift(updatedOrder);
      renderQueue();
      playKitchenBell();
    }
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

  // --- 11. STATION SWITCH SHEET ---
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

  // --- 12. INITIALIZATION & EVENT BINDINGS ---
  function init() {
    // Check stall name
    const storedStall = localStorage.getItem('frose_stall_name');
    if (storedStall && stallNameEl) {
      stallNameEl.textContent = storedStall;
    }

    // Sound toggle
    if (btnKdsTheme && window.FroseTheme) {
      const syncKdsThemeIcon = (theme) => {
        if (kdsThemeIcon) {
          kdsThemeIcon.textContent = theme === 'dark' ? '🌙' : (theme === 'sunlight' ? '☀️' : '🌤️');
        }
      };
      syncKdsThemeIcon(window.FroseTheme.getTheme());
      btnKdsTheme.addEventListener('click', () => {
        const next = window.FroseTheme.cycleTheme();
        syncKdsThemeIcon(next);
        showToast(`Theme: ${next}`);
      });
    }

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

    // Station switch sheet interactions
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

    // Render initial queue immediately so empty state displays on load
    renderQueue();

    // Check QR pairing
    checkUrlPairing();

    // Request wake lock
    requestScreenWakeLock();

    if (!localStorage.getItem('frose_session_active')) {
      window.location.replace('/login');
      return;
    }
    fetchLiveOrders();
    initWebSocket();

    startAgeTicker();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Self-start
  window.addEventListener('frose:language-changed', () => {
    renderQueue();
  });

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
