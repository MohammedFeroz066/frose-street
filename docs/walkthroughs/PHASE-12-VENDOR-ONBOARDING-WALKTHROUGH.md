# Phase 12 Walkthrough — Vendor Registration, 60-Second Onboarding & Street Menu Seeding

**Document Version:** 1.0.0  
**Phase:** Phase 12 (Vendor Registration, Onboarding Wizard & Preset Seeding)  
**Task Branch:** `feature/phase-12-vendor-onboarding`  
**Base Commit:** `5a8b1b0` (PR #13 merge)  
**Target:** `master`  
**Verification Date:** November 16, 2026  
**Status:** PASS  

---

## 1. Objective & Scope
Phase 12 delivers the frontend vendor registration wizard, instant 60-second stall onboarding, and automatic street food menu preset seeding for FROSE Street (`street.frosetech.com`):
1. **Frontend 3-Step Onboarding Wizard** (`client/register.html`, `client/js/register.js`):
   - **Step 1: Stall & Owner Profile:** Stall name, 10-digit mobile number, stall category dropdown, city, and UPI VPA (for instant dynamic QR billing).
   - **Step 2: 1-Tap Street Menu Preset Seeding:** 6 pre-configured street food categories (`momos_chinese`, `chai_nashta`, `chaat_panipuri`, `shawarma_rolls`, `south_indian_tiffin`, `burgers_fries`) with real-time billing button preview showing emojis, category tags, and rupee prices.
   - **Step 3: Security & Counter Terminal Activation:** 4-digit quick staff PIN setup, deployment edition selection (Cloud ₹1,499/mo vs Local Offline ₹999/mo).
2. **Backend Onboarding API** (`POST /api/v1/auth/register-stall`):
   - Validates phone format and stall profile.
   - Creates vendor and primary owner staff accounts.
   - Hashes staff 4-digit PIN using scrypt.
   - Automatically populates `menu_items` with integer paise pricing (`bigint`) from selected preset.
   - Issues JWT token and sets 30-day `HttpOnly` session cookie (`frose_street_token`).
3. **PWA Integration & Design System Compliance**:
   - Adheres to the formal two-color SaaS design system: Executive Deep Navy (`#0F172A`) & Warm Saffron Amber (`#D97706`).
   - Network-first navigation routing via ServiceWorker cache `frose-street-v4-vendor-onboarding`.
   - Direct Fastify routes `/register` and `/login`.

---

## 2. Previous vs New Behavior

| Capability | Previous Behavior | Phase 12 New Behavior |
| :--- | :--- | :--- |
| **Vendor Onboarding** | Required manual API calls or SQL seeding | Automated 3-step 60-second wizard at `/register` |
| **Menu Setup** | Empty menu requiring manual dish entry | 1-tap street menu seeding across 6 categories |
| **Staff Counter Unlock** | Password-only authentication | 4-digit numeric PIN configured during onboarding |
| **UPI QR Readiness** | No UPI ID capture during registration | Dynamic UPI VPA captured upfront for zero-middleman payment QR |
| **Multi-Ratio Viewports** | Not calibrated for registration form | Perfectly calibrated for Mobile (390x844), Tablet (820x1180), Desktop (1440x900) |
| **Financial Calculations** | N/A | Strict `bigint` integer paise math throughout menu seeding |

---

## 3. Changed & Created Files

| File | Type | Description |
| :--- | :--- | :--- |
| `client/register.html` | Created | Responsive 3-step onboarding wizard HTML with geometric monogram brand |
| `client/js/register.js` | Created | Client-side stepper navigation, validation, preset previews, and API submission |
| `client/css/style.css` | Modified | Added onboarding stepper, form fields, preset cards, preview badges, and mobile overrides |
| `client/index.html` | Modified | Updated "Register Stall" navigation link to `/register.html` |
| `client/sw.js` | Modified | Bumped cache to `v4-vendor-onboarding`, precached register assets |
| `server/src/app.ts` | Modified | Added Fastify route handlers for `/register` and `/login` |
| `server/src/modules/auth/auth.routes.ts` | Modified | Added `POST /api/v1/auth/register-stall` endpoint |
| `server/src/modules/auth/auth.service.ts` | Modified | Added quick PIN hashing, password fallback, and automated menu preset seeding |
| `tests/unit/vendor-onboarding.test.ts` | Created | 7 unit tests verifying registration form, API endpoints, preset seeding, and PIN verification |
| `docs/walkthroughs/screenshots/phase-12/*` | Created | 7 multi-ratio screenshots across mobile, tablet, and desktop |

---

## 4. Verification Evidence & Test Results

### Targeted Acceptance Tests (`tests/unit/vendor-onboarding.test.ts`)
```
✓ tests/unit/vendor-onboarding.test.ts (7 tests)
  ✓ TEST 1: Registration Form & HTML UI Assets
    ✓ register.html must exist in client directory
    ✓ register.html must contain stall details, presets, and PIN inputs
    ✓ register.html must offer the street menu presets
    ✓ register.html must adhere to formal two-color design tokens (#0F172A & #D97706)
  ✓ TEST 2: Backend API Registration with Menu Preset Seeding
    ✓ POST /api/v1/auth/register-stall rejects invalid phone number
    ✓ POST /api/v1/auth/register-stall rejects missing stall name
    ✓ POST /api/v1/auth/register-stall registers vendor, sets quick PIN and seeds preset menu
```

### Full Repository Test Suite (`pnpm test`)
```
Test Files  12 passed (12)
     Tests  156 passed (156)
  Duration  24.98s
```

### TypeScript Static Typecheck (`pnpm typecheck`)
```
$ tsc --noEmit
Exit code: 0 (Zero type errors)
```

---

## 5. Visual Proof & Screenshots

The following screenshots were captured using headless browser verification across standard ratios:
- **Mobile (390x844)**:
  - Step 1 (Stall Profile): `docs/walkthroughs/screenshots/phase-12/frose_onboarding_mobile_step1_390x844.png`
  - Step 2 (Menu Presets): `docs/walkthroughs/screenshots/phase-12/frose_onboarding_mobile_step2_390x844.png`
  - Step 3 (PIN & Edition): `docs/walkthroughs/screenshots/phase-12/frose_onboarding_mobile_step3_390x844.png`
- **Tablet (820x1180)**:
  - Step 1: `docs/walkthroughs/screenshots/phase-12/frose_onboarding_tablet_step1_820x1180.png`
  - Step 2: `docs/walkthroughs/screenshots/phase-12/frose_onboarding_tablet_step2_820x1180.png`
- **Desktop (1440x900)**:
  - Step 1: `docs/walkthroughs/screenshots/phase-12/frose_onboarding_desktop_step1_1440x900.png`
  - Step 2: `docs/walkthroughs/screenshots/phase-12/frose_onboarding_desktop_step2_1440x900.png`

---

## 6. Database & Financial Impact
- **Database Schema**: Zero destructive migrations. Uses existing tables `vendors`, `staff`, and `menu_items`.
- **Financial Rule Adherence**: Non-negotiable integer paise (`bigint`) math enforced across all seeded preset dishes. Zero floating-point prices stored or calculated.

---

## 7. Known Issues & Limitations
- Standalone Hotspot P2P sync for offline mode activates after initial stall setup.
- WebAuthn biometric passkey registration remains available as an optional post-registration setup via Settings.

---

## 8. Explicit Verdict
**PASS** — All acceptance criteria met, 156/156 tests passing, zero TypeScript errors, formal two-color SaaS design verified across all device ratios.
