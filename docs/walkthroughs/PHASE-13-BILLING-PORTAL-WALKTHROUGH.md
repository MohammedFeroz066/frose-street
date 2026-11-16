# Phase 13 Walkthrough — Frontend: Billing Portal (Core Ordering Screen & Dynamic UPI QR)

**Document Version:** 1.0.0  
**Phase:** Phase 13 (Billing Portal, Order Punching & Dynamic UPI QR)  
**Task Branch:** `feature/phase-13-billing-portal`  
**Base Commit:** `b605ac6` (PR #14 merge)  
**Target:** `master`  
**Verification Date:** November 16, 2026  
**Status:** PASS  

---

## 1. Objective & Scope
Phase 13 delivers the ultra-fast 3-second street food billing counter at `/billing` (`client/billing.html`, `client/js/billing.js`) for FROSE Street (`street.frosetech.com`):
1. **Interactive 4-Column Responsive Billing Grid**:
   - 4-column layout on desktop/tablet, 2-column layout on mobile.
   - Knuckle-friendly touch buttons with min-height >= 60px (72px–76px).
   - Real-time item badges showing quantity in cart (`2x`).
   - Single tap increments quantity; long-press opens quantity picker modal (1–10).
2. **Order Summary Strip & Running Metric Badges**:
   - Scrollable summary of active cart items with line stepper (`+`, `-`) and quick removal.
   - Header running total (`₹135`) updating immediately on every tap.
   - Atomic next token number display (`Token #1`, `Token #2`).
3. **One-Tap Fast Payment Actions**:
   - **CASH Button (Green)**: Creates order via `POST /api/v1/orders`, marks paid via cash, increments daily token, flashes fullscreen token confirmation screen for 3 seconds, clears cart.
   - **UPI Button (Blue)**: Creates order, generates dynamic customer UPI QR (`upi://pay?pa=...&am=...`), opens high-contrast QR modal with exact rupee amount, confirms payment received, and flashes token screen.
   - **CLEAR Button (Grey)**: Resets cart with confirmation dialog.
4. **Instant Web Audio & Haptic Feedback**:
   - Zero-dependency Web Audio API synthesizer generates subtle click sounds on item taps and a celebratory 3-tone chord (C5-E5-G5) on order completion.
   - Haptic vibration via `navigator.vibrate(40)`.
5. **Settings Side Drawer**:
   - Shift Galla summary shortcut, packaging lane, KDS navigation, reset daily token counter, and switch stall link.
6. **Strict Non-Negotiable Financial Integrity**:
   - All financial math is strictly calculated in integer paise (`bigint`). Zero floating-point numbers.

---

## 2. Previous vs New Behavior

| Capability | Previous Behavior | Phase 13 New Behavior |
| :--- | :--- | :--- |
| **Billing Counter UI** | Endpoint returned static JSON `{ portal: 'billing' }` | Complete high-speed touch billing interface at `/billing` |
| **Order Cart** | None | Real-time in-memory cart with line total calculations and quantity pickers |
| **Payment Flow** | None | Instant 1-tap Cash checkout and Dynamic customer UPI QR generator |
| **Token Feedback** | None | Fullscreen animated Token Flash confirmation screen auto-dismissing in 3s |
| **Audio/Haptic** | None | Web Audio API synthesizer clicks & major triad chords + vibration |
| **Touch Targets** | Not specified | Strict >= 60px touch targets for greasy street vendor fingers |

---

## 3. Changed & Created Files

| File | Type | Description |
| :--- | :--- | :--- |
| `client/billing.html` | Created | Production Billing Counter HTML with grid, order dock, modals, and drawer |
| `client/js/billing.js` | Created | Cart management, Web Audio synthesizer, UPI QR generator, and API dispatch |
| `client/css/style.css` | Modified | Added billing grid, dock, action buttons, token flash modal, and mobile overrides |
| `client/sw.js` | Modified | Bumped cache to `v5-billing-portal`, precached billing assets |
| `server/src/app.ts` | Modified | Serves `billing.html` when requested via browser/HTML accept header |
| `tests/unit/billing-portal.test.ts` | Created | 9 unit tests verifying billing structure, 60px targets, and order punching |
| `docs/walkthroughs/screenshots/phase-13/*` | Created | 5 multi-ratio screenshots across mobile, tablet, desktop, UPI QR, and token flash |

---

## 4. Verification Evidence & Test Results

### Targeted Acceptance Tests (`tests/unit/billing-portal.test.ts`)
```
✓ tests/unit/billing-portal.test.ts (9 tests)
  ✓ TEST 1: Billing Page HTML & UI Structure
    ✓ billing.html must exist in client directory
    ✓ billing.html contains menu grid, cart summary, running total and token display
    ✓ billing.html contains CASH, UPI, and CLEAR cart action buttons
    ✓ billing.html contains full-screen Token Flash modal and Dynamic UPI QR modal
    ✓ billing.html links formal design stylesheet
  ✓ TEST 2: Touch Targets & 60px Tap Target Constraint
    ✓ CSS specifies minimum tap target height >= 60px for billing buttons
  ✓ TEST 3: Fastify Routing & Service Integration
    ✓ GET /billing returns billing HTML page with 200 OK
  ✓ TEST 4: Backend Order Dispatch with Atomic Token & Integer Paise Math
    ✓ POST /api/v1/orders punches order with CASH, assigns token #1, and calculates integer paise
    ✓ POST /api/v1/orders punches second order with UPI, increments token to #2
```

### Full Repository Test Suite (`pnpm test`)
```
Test Files  13 passed (13)
     Tests  165 passed (165)
  Duration  31.72s
```

### TypeScript Static Typecheck (`pnpm typecheck`)
```
$ tsc --noEmit
Exit code: 0 (Zero type errors)
```

---

## 5. Visual Proof & Screenshots

The following screenshots were captured using headless browser verification across standard ratios:
- **Mobile (390×844)**:
  - Active Cart: `docs/walkthroughs/screenshots/phase-13/frose_billing_mobile_390x844.png`
  - Dynamic UPI QR Modal: `docs/walkthroughs/screenshots/phase-13/frose_billing_mobile_upi_qr_390x844.png`
  - Token Confirmation Flash Screen: `docs/walkthroughs/screenshots/phase-13/frose_billing_token_flash_390x844.png`
- **Tablet (820×1180)**:
  - Responsive Grid & Order Strip: `docs/walkthroughs/screenshots/phase-13/frose_billing_tablet_820x1180.png`
- **Desktop (1440×900)**:
  - Full-Width 4-Column Grid: `docs/walkthroughs/screenshots/phase-13/frose_billing_desktop_1440x900.png`

---

## 6. Database & Financial Impact
- **Database Schema**: Zero destructive migrations. Uses existing tables `orders` and `order_items`.
- **Financial Rule Adherence**: Non-negotiable integer paise (`bigint`) math enforced across all line totals and order totals.

---

## 7. Known Issues & Limitations
- Standalone Hotspot P2P mesh sync activates once helper cook and packer phones connect to the local Wi-Fi hotspot.

---

## 8. Explicit Verdict
**PASS** — All acceptance criteria met, 165/165 tests passing, zero TypeScript errors, formal two-color SaaS design verified across all device ratios.
