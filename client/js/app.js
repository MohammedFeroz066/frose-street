/**
 * FROSE Street Client Application
 * Landing page controller, PWA registration, portal routing
 */

document.addEventListener('DOMContentLoaded', () => {
  console.log('⚡ FROSE Street initialized');

  // Register Service Worker for offline capability
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('✅ ServiceWorker registered:', reg.scope))
        .catch((err) => console.warn('⚠️ ServiceWorker registration failed:', err));
    });
  }

  // Network status monitoring
  function updateNetworkStatus() {
    const statusText = document.getElementById('status-text');
    if (!statusText) return;

    if (navigator.onLine) {
      statusText.textContent = 'Cloud Mode: Connected to street.frostech.com';
      statusText.style.color = '#94a3b8';
    } else {
      statusText.textContent = 'Offline Mode: Local Hotspot P2P active';
      statusText.style.color = '#fbbf24';
    }
  }

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();

  // Portal button click handlers
  const btnBilling = document.getElementById('btn-billing');
  const btnPackaging = document.getElementById('btn-packaging');
  const btnKitchen = document.getElementById('btn-kitchen');

  function handlePortalClick(e, portalName) {
    console.log(`Navigating to ${portalName} portal`);
    // Future auth check: if token not present, redirect to login
  }

  btnBilling?.addEventListener('click', (e) => handlePortalClick(e, 'billing'));
  btnPackaging?.addEventListener('click', (e) => handlePortalClick(e, 'packaging'));
  btnKitchen?.addEventListener('click', (e) => handlePortalClick(e, 'kitchen'));
});
