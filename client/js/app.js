/**
 * FROSE Street Client Application (Phase 11 PWA Shell)
 * Formal Two-Color Enterprise Edition: Executive Navy & Saffron Amber
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('⚡ FROSE Street PWA Shell Initialized');

  // 1. Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('✅ ServiceWorker registered on scope:', reg.scope))
        .catch((err) => console.warn('⚠️ ServiceWorker registration note:', err));
    });
  }

  // 2. Network Status Monitoring
  const statusBadge = document.getElementById('status-badge');
  const statusText = document.getElementById('status-text');

  function updateNetworkStatus() {
    if (!statusBadge || !statusText) return;

    if (navigator.onLine) {
      statusBadge.style.backgroundColor = 'var(--color-emerald-light)';
      statusBadge.style.borderColor = 'rgba(5, 150, 105, 0.3)';
      statusBadge.style.color = 'var(--color-emerald)';
      statusText.textContent = 'Cloud Active';
    } else {
      statusBadge.style.backgroundColor = 'var(--color-saffron-light)';
      statusBadge.style.borderColor = 'rgba(217, 119, 6, 0.3)';
      statusBadge.style.color = 'var(--color-saffron-hover)';
      statusText.textContent = 'Hotspot P2P Active';
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  // 3. Quick PIN removed for security (Mobile & Password required on /login.html)

  // 4. Hotspot P2P Helper Pairing Modal Controller (Phase 17)
  const pairingModal = document.getElementById('pairing-modal');
  const btnOpenPairing = document.getElementById('btn-open-pairing');
  const btnClosePairing = document.getElementById('btn-close-pairing');
  const pairingCodeText = document.getElementById('pairing-code-text');
  const pairingQrCanvas = document.getElementById('pairing-qr-canvas');
  const pairingTargetUrl = document.getElementById('pairing-target-url');
  const btnCopyPairingLink = document.getElementById('btn-copy-pairing-link');
  const tabPairKitchen = document.getElementById('tab-pair-kitchen');
  const tabPairPackaging = document.getElementById('tab-pair-packaging');

  let activePairingTarget = 'kitchen'; // 'kitchen' | 'packaging'
  let currentPairingCode = 'PAIR-8821';

  function renderPairingQrSvg(uri) {
    if (!pairingQrCanvas) return;
    const hash = uri.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0);
    const seed = Math.abs(hash);
    let rects = '';
    const size = 21;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const isCorner =
          (r < 7 && c < 7) ||
          (r < 7 && c >= size - 7) ||
          (r >= size - 7 && c < 7);
        let isDark = false;
        if (isCorner) {
          const inOuter = r === 0 || r === 6 || c === 0 || c === 6 ||
            (c >= size - 7 && (r === 0 || r === 6 || c === size - 1 || c === size - 7)) ||
            (r >= size - 7 && (c === 0 || c === 6 || r === size - 1 || r === size - 7));
          const inInner = (r >= 2 && r <= 4 && c >= 2 && c <= 4) ||
            (r >= 2 && r <= 4 && c >= size - 5 && c <= size - 3) ||
            (r >= size - 5 && r <= size - 3 && c >= 2 && c <= 4);
          isDark = inOuter || inInner;
        } else {
          isDark = ((seed * (r + 1) * (c + 1) + (r * 11) + (c * 7)) % 3) === 0;
        }
        if (isDark) {
          rects += `<rect x="${c * 8}" y="${r * 8}" width="8" height="8" fill="#0F172A"/>`;
        }
      }
    }
    pairingQrCanvas.innerHTML = `
      <svg viewBox="0 0 168 168" width="168" height="168" xmlns="http://www.w3.org/2000/svg" style="background:#FFF; padding: 8px; border-radius: 8px;">
        ${rects}
      </svg>
    `;
  }

  function updatePairingDisplay() {
    const host = window.location.hostname;
    const port = window.location.port || '3100';
    let baseHostUrl = window.location.origin;

    // In local development or hotspot mode, default to 192.168.43.1 SoftAP address
    if (host === 'localhost' || host === '127.0.0.1') {
      baseHostUrl = 'http://192.168.43.1:3100';
    }

    const fullUrl = `${baseHostUrl}/${activePairingTarget}?pair_token=${currentPairingCode}&mode=p2p`;
    if (pairingTargetUrl) pairingTargetUrl.textContent = fullUrl;
    renderPairingQrSvg(fullUrl);
  }

  tabPairKitchen?.addEventListener('click', () => {
    activePairingTarget = 'kitchen';
    tabPairKitchen.classList.add('active');
    tabPairKitchen.style.background = 'var(--surface-card)';
    tabPairKitchen.style.color = 'var(--color-navy)';
    tabPairPackaging.classList.remove('active');
    tabPairPackaging.style.background = 'transparent';
    tabPairPackaging.style.color = 'var(--text-muted)';
    updatePairingDisplay();
  });

  tabPairPackaging?.addEventListener('click', () => {
    activePairingTarget = 'packaging';
    tabPairPackaging.classList.add('active');
    tabPairPackaging.style.background = 'var(--surface-card)';
    tabPairPackaging.style.color = 'var(--color-navy)';
    tabPairKitchen.classList.remove('active');
    tabPairKitchen.style.background = 'transparent';
    tabPairKitchen.style.color = 'var(--text-muted)';
    updatePairingDisplay();
  });

  btnCopyPairingLink?.addEventListener('click', async () => {
    const text = pairingTargetUrl?.textContent || '';
    if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        const originalText = btnCopyPairingLink.textContent;
        btnCopyPairingLink.textContent = '✅ Link Copied!';
        setTimeout(() => { btnCopyPairingLink.textContent = originalText; }, 2000);
      } catch {}
    }
  });

  btnOpenPairing?.addEventListener('click', async () => {
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn('/api/v1/devices/pairing-token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-FROSE-CSRF': '1'
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pairingCode) {
          currentPairingCode = data.pairingCode;
          if (pairingCodeText) pairingCodeText.textContent = data.pairingCode;
        }
      }
    } catch {
      // Offline fallback: generate local random pairing code
      currentPairingCode = 'PAIR-' + Math.floor(1000 + Math.random() * 9000);
      if (pairingCodeText) pairingCodeText.textContent = currentPairingCode;
    }
    updatePairingDisplay();
    pairingModal?.classList.add('active');
  });

  btnClosePairing?.addEventListener('click', () => {
    pairingModal?.classList.remove('active');
  });

  // Close modals on clicking outside card
  window.addEventListener('click', (e) => {
    if (e.target === pinModal) pinModal?.classList.remove('active');
    if (e.target === pairingModal) pairingModal?.classList.remove('active');
  });

  // 5. Fetch Live Galla Summary Glance
  async function loadGallaGlance() {
    const sessionActive = localStorage.getItem('frose_session_active');
    if (!sessionActive) {
      window.location.replace('/login');
      return;
    }
    try {
      const fn = window.froseApiFetch || fetch;
      const res = await fn('/api/v1/galla/summary', {
        credentials: 'same-origin'
      });
      if (res.status === 401) {
        localStorage.removeItem('frose_session_active');
        window.location.replace('/login');
        return;
      }
      if (res.ok) {
        const { summary } = await res.json();
        const totalSalesEl = document.getElementById('galla-total-sales');
        const cashSalesEl = document.getElementById('galla-cash-sales');
        const upiSalesEl = document.getElementById('galla-upi-sales');

        if (totalSalesEl && summary?.totalSalesRupees !== undefined) {
          totalSalesEl.textContent = `₹${summary.totalSalesRupees.toLocaleString('en-IN')}`;
        }
        if (cashSalesEl && summary?.cashInDrawerRupees !== undefined) {
          cashSalesEl.textContent = `₹${summary.cashInDrawerRupees.toLocaleString('en-IN')}`;
        }
        if (upiSalesEl && summary?.upiSalesRupees !== undefined) {
          upiSalesEl.textContent = `₹${summary.upiSalesRupees.toLocaleString('en-IN')}`;
        }
      }
    } catch {
      // Retain graceful default values
    }
  }

  loadGallaGlance();
});
