# Phase 11 Walkthrough: PWA Shell, Formal Two-Color Light Design System & Landing Hub

## 1. Objective
Transform `street.frostech.com` into an ultra-clean, formal enterprise micro-POS landing hub adhering to the approved **Two-Color Corporate Design System** (Executive Navy `#0F172A` + Saffron Amber `#D97706` on Pure White `#FFFFFF` and Soft Slate `#F8FAFC`).

Features Delivered:
- **PWA Application Shell**: Web App Manifest (`manifest.json`) and Service Worker (`sw.js`) with cache-first static strategy and offline resilience.
- **The 3 Giant Formal Portal Buttons**:
  1. `🧾 1. BILLING COUNTER` (`/billing`) — Saffron `PORTAL 01` badge, Executive Navy outline, 84px touch target.
  2. `📦 2. PACKAGING & SERVING` (`/packaging`) — Helper Ready Lane & plate delivery.
  3. `🍳 3. KITCHEN DISPLAY` (`/kitchen`) — Cook Screen with live FIFO order queue.
- **Helper Device Quick Pairing Banner**: 1-tap modal opening single-use QR / token pairing interface.
- **Real-Time Daily Galla Glance Drawer**: Live cards reporting Total Sales, Cash in Drawer, and UPI revenue.
- **Fast Stall Sign-in (Quick PIN Modal)**: On-screen 72px tactile numpad for 1-second keyboard-free PIN authentication.

---

## 2. Design System Tokens & Color Specifications
| Token | Hex Code | Semantic Role |
| :--- | :--- | :--- |
| **Executive Navy** | `#0F172A` | Primary 1 — Typography, primary borders, logo, active card highlights |
| **Saffron Amber** | `#D97706` | Primary 2 — Action highlights, active portal pill, tender cues |
| **Pure White** | `#FFFFFF` | Canvas Surface — Card surfaces, modal surfaces, tactile numpad buttons |
| **Soft Slate** | `#F8FAFC` | Base Canvas — Non-glare bright page backdrop |

---

## 3. Files Implemented & Modified
- `client/index.html`: Fully upgraded formal landing hub with the 3 portal buttons, pairing banner, Galla drawer, and Quick PIN numpad modal.
- `client/css/style.css`: Two-color formal design tokens, 84px button touch targets, elevation shadows, responsive mobile-first max-w-lg container.
- `client/js/app.js`: Service worker registration, network status monitoring, PIN numpad interaction, pairing modal trigger, and live Galla summary loader.
- `client/manifest.json`: PWA manifest with formal light theme (`#F8FAFC`) and background (`#FFFFFF`), `icon-192.png`, and `icon-512.png`.
- `client/sw.js`: Service worker pre-caching static assets with offline navigation fallback.
- `client/icons/`: High-resolution `icon-192.png` and `icon-512.png` matching formal branding.
- `tests/unit/pwa-shell.test.ts`: 16 comprehensive unit tests covering PWA manifest, service worker, CSS tokens, touch targets, and Fastify static serving.

---

## 4. Verification Commands & Execution Output
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. Vitest Unit Test Suite
pnpm test
# Result: 11 test files passed, 149/149 tests passed (16 tests in pwa-shell.test.ts)
```

---

## 5. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | Valid PWA manifest with `standalone` display and correct start URL | ✅ PASS |
| TEST 1.2 | Manifest utilizes formal light theme (`#FFFFFF` background, `#F8FAFC` theme) | ✅ PASS |
| TEST 1.3 | Declares 192x192 and 512x512 icons present in `client/icons` | ✅ PASS |
| TEST 2.1 | Service Worker pre-caches HTML, CSS, JS, manifest, and icons | ✅ PASS |
| TEST 2.2 | Service Worker bypasses cache for dynamic `/api/`, `/health`, and `/ws` | ✅ PASS |
| TEST 3.1 | `style.css` defines Executive Navy (`#0F172A`) and Saffron Amber (`#D97706`) | ✅ PASS |
| TEST 3.2 | Portal buttons enforce mandatory 80px+ vertical touch targets (`min-height: 84px`) | ✅ PASS |
| TEST 3.3 | Keypad defines tactile 64px–72px dimensions for zero-keyboard entry | ✅ PASS |
| TEST 4.1 | `index.html` renders all 3 primary portal buttons (`btn-billing`, `btn-packaging`, `btn-kitchen`) | ✅ PASS |
| TEST 4.2 | `index.html` includes the daily Galla summary glance strip | ✅ PASS |
| TEST 4.3 | `index.html` contains Quick PIN numpad modal with 10 numeric keys and biometrics | ✅ PASS |
| TEST 4.4 | `index.html` contains helper QR pairing modal trigger | ✅ PASS |
| TEST 5.1 | Fastify serves `/` returning the formal light HTML with 200 OK | ✅ PASS |
| TEST 5.2 | Fastify serves `/manifest.json` with correct JSON content-type | ✅ PASS |
| TEST 5.3 | Fastify serves `/css/style.css` and `/js/app.js` | ✅ PASS |
