# FROSE STREET — PHASE 6 SUBPHASE 4: FIRST-TIME CLIENT ONBOARDING, CATEGORY BUILDER, DUAL-MODE IMAGE PICKER & MENU POS WALKTHROUGH

## 1. Executive Summary
- **Objective:** Establish a Google-grade, end-to-end operational onboarding and menu customization experience for newly provisioned restaurant stalls. Enables stall owners to log in, view the 4-card dashboard (Billing, Delivery, Packing, Dine In), experience automatic first-time onboarding detection on empty menus, add custom category sections completely from scratch (e.g. Tea, Snacks, Momos with ZERO pre-seeded or fake restaurant categories), add dishes with dual-mode image uploads (Live Camera Capture or Gallery Picker) and integer-paise pricing, and operate an ultra-smooth mobile POS with in-card steppers and floating cart pill.
- **Result:** 100% verified via automated Playwright mobile test suite ($390 \times 844$), TypeScript compiler (`tsc --noEmit`), and Vitest test suite (272/272 passing).
- **Target Branch:** `feat/client-menu-onboarding-and-pos`
- **Base Commit:** `9ad7b05`
- **Verdict:** **PASS**

---

## 2. Before vs. After Behavior Matrix

| Dimension | Previous Baseline | New Verified Behavior |
| :--- | :--- | :--- |
| **Initial Categories on New Stall** | Hardcoded restaurant categories (`Starters`, `Main Course`, `Breads`, `Rice`, `Desserts`, `Drinks`) pre-populated everywhere. | **Zero Pre-Filled Categories (Pure Clean Slate):** New stalls start with 0 categories. The client defines their own categories completely from scratch (e.g. `Tea`, `Snacks`, `Momos`). |
| **First-Time Stall Onboarding** | Navigating to `/billing` loaded hardcoded fallback dishes with unsplash links, giving new stall owners no guided setup. | **Dynamic First-Time Detection:** New stalls with 0 dishes see the First-Time Onboarding Hero Card: *"Welcome to Your Billing Counter!"* with a 1-tap redirect button to `/menu-setup`. Left sidebar displays `No Categories` with `+ Add Category`. |
| **Category Section Creation** | Categories were static and hardcoded in HTML. Vendors could not add custom sections. | **Interactive Category Sections Builder:** Vendors can create custom sections (e.g., "Tea", "Snacks", "Momos") via `+ Add Section`. Categories dynamically persist and appear in the left POS sidebar. |
| **Dish Image Uploading** | Static dropdown with external stock URLs. No camera or device integration. | **Dual-Mode Image Upload:** Stall owners can either: 1) **📸 Click Image** (direct camera capture on mobile via `capture="environment"`), or 2) **🖼️ Choose from Gallery** (local photos or 1-tap selection from the 10 verified active high-definition food images `/images/dishes/*.webp`). |
| **Dish Pricing & Validation** | Price inputs could accept arbitrary floating numbers. | **Strict Integer Paise Storage:** Prices entered in ₹ are strictly converted to integer paise (`Math.round(price * 100)`) and stored as `BigInt`, eliminating decimal rounding bugs. |
| **Dish Card & In-Card Steppers** | Basic `+` button without live in-card stepper or synchronized cart pill. | **Pixel-Perfect Image 5 Parity:** 2-column square layout, floating price badge (`₹20.0`, `₹30.0`, `₹80.0`), floating action button that morphs into a burgundy quantity stepper pill (`-`, count, `+`), and floating cart pill (`🛒 [Count] • ₹[Total] | Order ->`). |
| **Order Dispatch & Token Flash** | Generic cart checkout. | **Streamlined Order Dispatch:** Tapping the floating cart pill opens the Checkout Drawer modal. Selecting Cash/UPI issues an immediate Order Token Flash (`TOKEN #N`, `₹Total Paid`). |

---

## 3. Changed Files & Scope

1. `server/src/db/types.ts`: Added `image_url?: string | null;` to `MenuItemsTable`.
2. `server/src/modules/menu/menu.service.ts`: Added `imageUrl` to `CreateMenuItemInput` and `UpdateMenuItemInput`, and mapped `image_url` across `getMenuItems`, `createMenuItem`, and `updateMenuItem`.
3. `server/src/modules/menu/menu.routes.ts`: Forwarded `imageUrl` from request body into `createMenuItem` and `updateMenuItem`.
4. `server/src/app.ts`: Registered `/menu-setup` route alias serving `client/menu-setup.html`.
5. `client/menu-setup.html`:
   - Dedicated full-page Menu & Category Setup view (top-to-bottom layout, zero horizontal overflow).
   - Clean slate: 0 default categories.
   - Category Sections Builder (left panel): dynamically adds vendor-defined categories (`Tea`, `Snacks`, `Momos`).
   - Dish Creation Form with dynamic category dropdown (populated only with vendor's categories).
   - Dual-mode image picker (camera capture or gallery modal).
   - Integer paise price input in ₹.
   - Live dishes directory table with delete/edit controls.
   - Sticky bottom button: `🚀 Launch Billing Counter with Menu →`.
6. `client/billing.html`:
   - Removed all static hardcoded restaurant categories (`Starters`, `Main Course`, etc.).
   - Added First-Time Stall Onboarding Hero Banner (`#onboarding-menu-banner`).
   - Updated category sidebar to dynamically render vendor's custom categories or `No Categories` prompt with `+ Add Category`.
   - Modals dynamically populated from vendor's custom categories.
7. `client/js/billing.js`:
   - Updated `loadCatalog()` to dynamically load vendor dishes and custom categories from backend API / local cache.
   - Added first-time onboarding detection (when `menuCatalog.length === 0`).
   - Dynamic category matching and rendering based strictly on vendor-defined categories.
   - Removed all hardcoded fallback menus and starter pack buttons.
8. `client/index.html`:
   - Updated "Inventory" nav tab pill and Settings modal menu link to route to `/menu-setup`.
9. `scripts/verify-client-onboarding-and-menu-pos.mjs`:
   - Automated end-to-end Playwright mobile verification test suite covering all 10 workflow stages with snack shop example (Tea, Snacks, Momos).

---

## 4. Visual Evidence & Screenshots

All screenshots captured at mobile viewport ($390 \times 844$):

1. **Client Dashboard with 4 Options:**
   `docs/walkthroughs/screenshots/menu-onboarding/01_client_dashboard_4_options_390x844.png`
   Shows Billing (Quick POS), Delivery (Hubs & Couriers), Packing (Prep & Dispatch), and Dine In (Tables & Seatings).
2. **First-Time Billing Onboarding Prompt:**
   `docs/walkthroughs/screenshots/menu-onboarding/02_first_time_billing_onboarding_prompt_390x844.png`
   Shows onboarding prompt on empty stall with button *"⚙️ Create Your First Category & Items →"* and clean left sidebar with `No Categories` + `+ Add Category`.
3. **Dedicated Menu Setup Page with Custom Categories & Items:**
   `docs/walkthroughs/screenshots/menu-onboarding/03_menu_setup_page_with_items_390x844.png`
   Shows client-created categories (`Tea`, `Snacks`, `Momos`), dish creation form with camera/gallery image picker, price input in ₹, and configured dishes directory.
4. **Billing & Menu POS with Client Categories & Dishes:**
   `docs/walkthroughs/screenshots/menu-onboarding/04_billing_menu_pos_with_new_dishes_390x844.png`
   Shows custom categories (`Tea`, `Snacks`, `Momos`) in left sidebar and dishes in 2-column grid with floating price badges (`₹20.0`, `₹30.0`, `₹80.0`).
5. **In-Card Stepper & Floating Bottom Cart Pill:**
   `docs/walkthroughs/screenshots/menu-onboarding/05_billing_pos_in_card_stepper_and_cart_390x844.png`
   Shows in-card stepper pill (`[-] [1] [+]`) and floating bottom cart pill (`🛒 3 • ₹80.0 | Order ->`).
6. **Order Token Flash Confirmation:**
   `docs/walkthroughs/screenshots/menu-onboarding/06_order_token_flash_confirmation_390x844.png`
   Shows Order Dispatched confirmation modal with `TOKEN #2` and amount paid.

---

## 5. Verification Commands & Test Results
- **TypeScript Compilation:** `pnpm exec tsc --noEmit` -> **0 errors**
- **Unit Test Suite:** `pnpm vitest run` -> **23/23 test suites passed, 272/272 tests passed**
- **Mobile Playwright E2E:** `node scripts/verify-client-onboarding-and-menu-pos.mjs` -> **100% Passed across all 10 stages**
