# FROSE Street — Unified Settings (Design 3: Vertical Accordion Drawer) Walkthrough

## 1. Objective & Scope
Replace the legacy minimal settings modal with the user-selected and approved **Design 3: Vertical Accordion Drawer (Square POS Style)**. The new settings drawer unifies all counter subsystems:
1. **Stall Profile & Identity**: Business name, owner name, registered mobile, and physical stall address/landmark with instant saving.
2. **Payment Scanner & BharatQR Management**: Custom counter scanner photo upload (FileReader to `frose_custom_scanner_qr`), live preview card, UPI VPA ID (`@ybl`, `@icici`, `@okaxis`), payee display name, and Soundbox voice chime toggle.
3. **Menu Dishes & Instant Stock**: Quick pricing inputs with `₹` indicator, live In-Stock / Sold-Out toggles, and direct links to Menu Studio.
4. **Billing POS & Thermal Printer**: GST tax calculation (0% Exempt / 5% / 18%), default payment mode (Cash, UPI Intent, Split), 58mm vs 80mm Bluetooth thermal printer roll width, and test print slip button.
5. **Kitchen KDS & Audio Lanes**: KOT order chime sound selection (High Bell Ding, Soft Tone, Mute) and cook prep delay warning threshold.
6. **Packaging Station & Token Settings**: Token number reset mode (Daily reset from #1 vs continuous), and WhatsApp e-bill dispatch.
7. **Offline Database & Cloud Sync**: Local storage status (IndexedDB), and manual "Sync Now" trigger.

---

## 2. Changed Files
* `client/js/settings-component.js`: Core ES module managing accordion state, profile persistence, scanner file uploading, dish price updates, and subsystem preferences.
* `client/css/style.css`: Clean, responsive Design 3 accordion styling, sticky header, pill navigation, and tactile switches.
* `client/billing.html`: Embedded Design 3 Accordion modal and linked `settings-component.js`.
* `client/index.html`: Embedded Design 3 Accordion modal and linked `settings-component.js`.
* `client/sw.js`: Bumped Service Worker cache version to `frose-street-v10-settings-accordion` and precached `/js/settings-component.js`.

---

## 3. Verification & Evidence
* **Automated Playwright Test**:
  * Modal Visibility: `true`
  * Business Name Binding: `Cloud Edge Kitchen`
  * UPI ID Binding: `9642230688@ybl`
  * Accordion Items Count: `7`
  * Dish Rows Rendered: `3`
  * Screenshots Captured:
    * `01_live_settings_modal_design_3.png`
    * `02_live_settings_dishes_accordion.png`

---

## 4. Verdict
**PASS** — All acceptance criteria met with zero console syntax errors, smooth accordion expand/collapse, and full offline caching via Service Worker v10.
