# Walkthrough: Hard Clean Slate 0-Dishes Enforcement, PWA Network-First Service Worker, and Cart Scanner Sync

## 1. Objective
Ensure that on mobile PWA and counter devices:
1. The menu starts 100% clean with **0 dishes** (zero dummy/pre-seeded items like Dosa, Idli, Chole Bhature, etc.) and displays the clean empty state with the prominent **`➕ Add Dish`** button.
2. Only dishes explicitly created by the vendor in the UI (`isUserCreated === true`) are permitted and rendered.
3. Added an explicit 1-tap **`🧹 Wipe Menu to Clean Slate (0 Items)`** button in Settings under Menu Dishes for instant vendor control.
4. Converted Service Worker navigation caching from Stale-While-Revalidate to **Network-First** with cache fallback, bumped PWA cache version to `v30`, and bumped asset versions to `v6.0.0` so mobile devices on 5G/cellular always fetch the fresh HTML and scripts.
5. Custom payment scanner uploaded in Settings links seamlessly to the Cart Checkout UPI modal.

---

## 2. Changes Summary

| File | Change |
|---|---|
| `client/sw.js` | Bumped CACHE_NAME to `frose-street-v9-production-v30-clean-slate`. Changed navigation route to Network-First with cache fallback. |
| `client/billing.html` | Updated `<head>` inline script with `frose_clean_slate_2026_v12` hard purge of `frose_dishes*`, `frose_cats*`, and `frose_custom_menu_catalog`. Proactively calls `navigator.serviceWorker.getRegistrations().then(r => r.update())`. Bumped asset versions to `v6.0.0`. |
| `client/index.html` | Bumped asset versions to `v6.0.0`. |
| `client/js/billing.js` | Enforced strict `isUserCustomDish` requiring `item.isUserCreated === true`. Attached `isUserCreated: true` on `submitAddDish` and `submitEditDish`. Exposed global `window.clearMenuCatalogToCleanSlate()`. |
| `client/js/settings-component.js` | Filtered quick dishes editor to strictly require `d.isUserCreated === true`. Added 1-tap `🧹 Wipe Menu to Clean Slate (0 Items)` button in dishes accordion. |

---

## 3. Verification Commands & Evidence

```bash
# 1. Strict TypeScript Check
pnpm exec tsc --noEmit
# Exit code 0 (PASS)

# 2. Automated Mobile Playwright Verification
node scripts/verify-cart-scanner-and-clean-menu.mjs
# Exit code 0 (PASS - 5/5 assertions passed)

# 3. Complete Vitest Suite
pnpm test
# 23 passed (23), 272 passed (272)
```

---

## 4. Verdict
**PASS** — Menu starts with 0 items, legacy seeds are completely blocked, and PWA fetches latest assets over network.
