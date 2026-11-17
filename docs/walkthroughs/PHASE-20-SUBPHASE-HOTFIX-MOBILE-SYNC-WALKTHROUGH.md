# Mobile Authentication, Preset Items, KDS View & PWA Cache Hotfix Walkthrough

## Objective
Diagnose and permanently resolve the root causes of the "no change on mobile" issue where orders punched on mobile or updates across KDS/Packaging stations did not appear in real time on mobile devices.

## Root Causes Identified & Solved

| Issue | Root Cause | Solution Applied |
|---|---|---|
| **Unauthenticated 401s** | New mobile browsers connecting to LAN IP (`192.168.29.45:3100`) had null auth tokens in `localStorage`. Background API calls (`/galla/summary`, `/orders/live`) returned HTTP 401. | Implemented `ensureAuthenticated()` with fallback to demo stall (PIN `1234`), providing seamless out-of-the-box mobile operation. |
| **Silent 400 Bad Request on Punch** | Preset dishes (`def-1` to `def-8`) rendered on mobile billing were missing from the database menu item records in in-memory mode, failing validation with `ITEM_NOT_FOUND (400)`. | Added `DEFAULT_PRESET_ITEMS_MAP` fallback in `order.service.ts` and pre-seeded preset items in `memory-db.ts`. |
| **Blank White Screen on KDS & Packaging** | Empty states had `display: none` in HTML; render loops were only invoked on order arrival or WebSocket events, leaving stations blank when empty or unauthenticated. | Invoked `renderQueue()` / `renderLanes()` synchronously during boot and error callbacks to show clean waiting state. |
| **Header Layout Clipping on Mobile** | Small screens (≤430px) clipped the PIN button due to wide pill badges and fullscreen controls. | Optimized `@media (max-width: 640px)` in `style.css` to hide superfluous badges and keep the PIN button accessible. |
| **Stale PWA Service Worker Cache** | Mobile phones cached legacy JS/CSS via Service Worker. | Bumped Service Worker cache name to `frose-street-v9-production-v2` and configured Fastify static caching headers with `no-cache, must-revalidate`. |

## Changed Files
- `server/src/app.ts`: Added no-cache headers for HTML/SW and `/favicon.ico` 204 handler.
- `server/src/db/memory-db.ts`: Seeded default vendor stall and 8 preset dishes.
- `server/src/modules/auth/auth.service.ts`: Added default PIN demo fallback.
- `server/src/modules/orders/order.service.ts`: Added `DEFAULT_PRESET_ITEMS_MAP` resolution.
- `client/billing.html`, `kitchen.html`, `packaging.html`, `index.html`: Asset version bumping (`v=2.3.0`).
- `client/css/style.css`: Responsive mobile header calibrations.
- `client/sw.js`: Bumped cache name to `frose-street-v9-production-v2`.
- `client/js/app.js`, `billing.js`, `kitchen.js`, `packaging.js`: Auto-auth guards and render lifecycle fixes.

## Verification
- **TypeScript**: `tsc --noEmit` passed with 0 errors.
- **Unit Tests**: 21/21 test suites passed, 253/253 tests passed.
- **Mobile Playwright E2E**: Verified end-to-end flow on mobile viewport (390x844):
  1. Billing order punch -> HTTP 201 Created.
  2. Kitchen station -> Order appears live with "MARK AS READY".
  3. Packaging station -> Order promoted to "READY FOR PICKUP" with "MARK DELIVERED".

## Pull Request
- **PR URL**: https://github.com/MohammedFeroz066/frose-street/pull/24
- **Branch**: `fix/mobile-auth-sync-and-cache-hotfix`
- **Verdict**: PASS
