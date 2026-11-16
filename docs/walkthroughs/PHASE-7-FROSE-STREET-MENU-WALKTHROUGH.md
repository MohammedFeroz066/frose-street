# Phase 7 Walkthrough: Menu Management Backend

## 1. Objective
Implement ultra-fast, high-tempo menu management tailored for street food vendors with 6 to 25 items:
- **Strict Integer Paise Enforcement**: 100% BigInt/integer paise pricing (`price_paise`) — zero floating-point math, zero rounding errors.
- **Tactile Touch Attributes**: Every dish includes an emoji (`emoji_icon`, e.g., `🥟`, `☕`, `🌯`) and color card indicator (`color_hex`) for sub-second recognition on the cashier punching grid.
- **1-Tap Availability Toggling**: Immediate out-of-stock / in-stock flip (`PATCH /api/v1/menu/:id/toggle-available`), accessible to Cashier and Cook alike when ingredients run out.
- **82-Item Street Food Presets**: Instant 1-tap onboarding catalog across 6 major Indian street stall categories (`chai_nashta`, `momos_chinese`, `chaat_panipuri`, `south_indian`, `rolls_shawarma`, `beverages_juice`).
- **Display Ordering & Soft Deletion**: Auto-incrementing and custom `display_order`, with non-destructive soft-deletion (`is_active = false`).

---

## 2. Architecture & Design Decisions
1. **Financial Integrity**:
   - Validation rejects any decimal or non-integer `pricePaise` inputs (e.g., `50.5` $\rightarrow$ 400 `INVALID_PRICE_PAISE`).
   - Prices stored as `BIGINT` in PostgreSQL (`menu_items.price_paise`).
   - API outputs both integer `pricePaise` and derived `priceRupees` (`pricePaise / 100`) for seamless UI rendering.
2. **Speed & Ergonomics**:
   - `display_order` determines the exact position on the 4-column cashier grid.
   - 1-tap availability toggle operates with zero friction and returns human-readable status text (`"In Stock"` vs `"Out of Stock"`).
3. **Role-Based Permissions**:
   - `GET /api/v1/menu`: Any authenticated stall staff (Owner, Cashier, Cook, Packer).
   - `PATCH /api/v1/menu/:id/toggle-available`: Owner, Cashier, and Cook (cooks need immediate control over 86'd items).
   - `POST`, `PUT`, `DELETE`: Strictly restricted to Owner and Cashier.

---

## 3. Endpoints Implemented
| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/menu` | `requireAuth` | List active menu items (supports `?availableOnly=true`) |
| `GET` | `/api/v1/menu/presets` | Public / Auth | View 6 standard street food preset categories |
| `POST` | `/api/v1/menu/presets/seed` | `requireAuth` + `requireRole('owner', 'cashier')` | 1-Tap populate stall with preset dishes |
| `POST` | `/api/v1/menu` | `requireAuth` + `requireRole('owner', 'cashier')` | Create custom menu item with integer paise |
| `PUT` | `/api/v1/menu/:id` | `requireAuth` + `requireRole('owner', 'cashier')` | Update dish details / price |
| `PATCH` | `/api/v1/menu/:id/toggle-available` | `requireAuth` + `requireRole('owner', 'cashier', 'cook')` | 1-Tap toggle in-stock / out-of-stock |
| `DELETE` | `/api/v1/menu/:id` | `requireAuth` + `requireRole('owner', 'cashier')` | Soft-delete dish (`is_active = false`) |

---

## 4. Street Preset Catalog
| Preset Key | Name | Sample Items |
| :--- | :--- | :--- |
| `chai_nashta` | Chai, Samosa & Nashta Corner | ☕ Masala Chai (₹15), 🥟 Samosa (₹15), 🍞 Bun Maska (₹35) |
| `momos_chinese` | Momos & Street Chinese Counter | 🥟 Steamed Momo (₹60), 🥟 Fried Momo (₹70), 🍜 Hakka Noodles (₹80) |
| `chaat_panipuri` | Pani Puri & Chaat Cart | 🥣 Pani Puri 6 Pcs (₹30), 🍘 Sev Puri (₹40), 🥗 Papdi Chaat (₹50) |
| `south_indian` | South Indian Tiffin & Coffee | ⚪ Idli 2 Pcs (₹30), 🥞 Masala Dosa (₹60), ☕ Filter Coffee (₹20) |
| `rolls_shawarma` | Kathi Rolls & Shawarma Joint | 🌯 Veg Roll (₹60), 🌯 Double Egg Chicken Roll (₹110), 🥙 Shawarma (₹90) |
| `beverages_juice`| Fresh Juice, Shakes & Lassi | 🥤 Sugarcane Juice (₹30), 🍊 Mosambi (₹50), 🥭 Mango Shake (₹60) |

---

## 5. Verification Commands & Results
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. In-memory Unit Test Suite
pnpm test
# Result: 7 test files passed, 96/96 tests passed (21 tests in menu.test.ts)
```

---

## 6. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | Rejects negative price with 400 INVALID_PRICE_PAISE | ✅ PASS |
| TEST 1.2 | Rejects zero price with 400 INVALID_PRICE_PAISE | ✅ PASS |
| TEST 1.3 | Rejects floating-point decimals with 400 INVALID_PRICE_PAISE | ✅ PASS |
| TEST 1.4 | Rejects string price with 400 INVALID_PRICE_PAISE | ✅ PASS |
| TEST 1.5 | Creates item with integer paise and provides priceRupees | ✅ PASS |
| TEST 2.1 | Auto-increments display order for successive items | ✅ PASS |
| TEST 2.2 | Preserves custom display order when explicitly provided | ✅ PASS |
| TEST 3.1 | 1-Tap toggle availability flips true $\leftrightarrow$ false | ✅ PASS |
| TEST 3.2 | `?availableOnly=true` filters out out-of-stock items | ✅ PASS |
| TEST 4.1 | Returns catalog of 6 street food presets | ✅ PASS |
| TEST 4.2 | Seeds preset items with exact paise pricing | ✅ PASS |
| TEST 4.3 | Rejects invalid preset category with 400 | ✅ PASS |
| TEST 5.1 | `GET /presets` returns catalog without auth | ✅ PASS |
| TEST 5.2 | `POST /presets/seed` seeds items for stall | ✅ PASS |
| TEST 5.3 | `POST /` adds custom dish with emoji & color | ✅ PASS |
| TEST 5.4 | `PUT /:id` updates dish name and price | ✅ PASS |
| TEST 5.5 | `PATCH /:id/toggle-available` permits cook to mark out of stock | ✅ PASS |
| TEST 5.6 | `POST /` forbids cook or packer from creating items (403) | ✅ PASS |
| TEST 5.7 | `DELETE /:id` soft-deletes item | ✅ PASS |
| TEST 5.8 | `GET /` returns active items excluding deleted | ✅ PASS |
| TEST 5.9 | `GET /` rejects unauthenticated call with 401 | ✅ PASS |
