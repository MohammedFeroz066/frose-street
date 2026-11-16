# Phase 14 Walkthrough: Frontend — Kitchen Display Portal (KDS)

## Objective
Deliver the real-time, knuckle-friendly **Kitchen Display Portal (KDS)** for **FROSE Street** (`street.frosetech.com/kitchen`), providing street food cooks with clear, prioritized FIFO order cards, dynamic age color tracking (<3m Red, 3–10m Orange, 10m+ Slate Black), acoustic kitchen bell audio feedback, screen keep-awake (Wake Lock API), and seamless order advancement via `PATCH /api/v1/orders/:id/status`.

---

## What Changed
1. **Kitchen Portal Shell (`client/kitchen.html`)**:
   - High-contrast white canvas (`#FFFFFF`) with Executive Navy (`#0F172A`) and Warm Saffron Amber (`#D97706`) accents.
   - Live Cooking (`#pending-count-pill`) and Ready (`#done-count-pill`) header tallies.
   - Screen Keep-Awake indicator pill (`#wakelock-pill`) and Audio Mute toggle (`#btn-toggle-sound`).
   - Sticky Reconnection Alert banner (`#reconnect-banner`) with manual retry button.
   - Responsive order queue container (`#kds-order-queue`).
2. **KDS Application Engine (`client/js/kitchen.js`)**:
   - Web Audio API dual-tone acoustic kitchen chime (`1046Hz` C6 -> `1318Hz` E6).
   - Second-ticker age progression:
     - **0–3 mins (Fresh)**: Red left border (`#EF4444`) with red timer tag.
     - **3–10 mins (In Prep)**: Orange left border (`#F59E0B`) with amber timer tag.
     - **10+ mins (Overdue)**: Black/Dark Slate border (`#0F172A`) with high-contrast alert badge.
   - Knuckle-friendly `MARK ORDER READY` action button (`min-height: 74px`).
   - Screen Wake Lock API (`navigator.wakeLock.request('screen')`) with auto-reacquire on visibility change.
   - QR scan auto-pairing via `?pair_token=...` parameter redemption.
   - Strict financial blindness: Zero prices, zero currency symbols (`₹`), zero tender details.
3. **Responsive Stylesheet (`client/css/style.css`)**:
   - KDS layout styles for Mobile (1-column), Tablet (2-column), and Desktop (3-column).
   - Slide-out animation on order completion (`transform: translateX(115%)`).
4. **Service Worker Update (`client/sw.js`)**:
   - Cache bumped to `frose-street-v6-kitchen-portal`.
   - Pre-caching `/kitchen.html` and `/js/kitchen.js`.
5. **Server Routing Content Negotiation (`server/src/app.ts`)**:
   - Serves `client/kitchen.html` on browser requests while preserving JSON status for testing.
6. **Acceptance Test Suite (`tests/unit/kitchen-portal.test.ts`)**:
   - 12 comprehensive unit tests covering all 10 acceptance criteria.

---

## Verification Evidence

### 1. Test Execution
```bash
pnpm test
```
**Results:** **177 passed across 14 test suites (0 failed, 0 skipped)**.

```bash
pnpm typecheck
```
**Results:** **0 errors**.

### 2. Multi-Ratio Visual Evidence
- **Mobile Viewport (390 × 844)**: `docs/walkthroughs/screenshots/phase-14/frose_kds_mobile_390x844.png`
- **Mobile Reconnecting State (390 × 844)**: `docs/walkthroughs/screenshots/phase-14/frose_kds_mobile_reconnect_390x844.png`
- **Tablet Viewport (820 × 1180)**: `docs/walkthroughs/screenshots/phase-14/frose_kds_tablet_820x1180.png`
- **Desktop Viewport (1440 × 900)**: `docs/walkthroughs/screenshots/phase-14/frose_kds_desktop_1440x900.png`

---

## Database & Security Impact
- **Database Schema**: Zero schema migrations required. Uses existing `orders` and `order_items` tables.
- **Financial Blindness**: Kitchen cooks cannot inspect prices, payments, or sales summaries.
- **Access Control**: Scoped device tokens (`cook` role) can advance order status to `ready` but cannot cancel orders or access Galla expenses.

---

## Verdict
**PASS**
