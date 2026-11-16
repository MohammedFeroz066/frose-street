# Phase 8 Walkthrough: Order & Atomic Token Engine

## 1. Objective
Build the order and sequential token numbering engine for street food vendors:
- **Atomic Daily Token Generation**: Orders receive sequential tokens (`#1`, `#2`, `#3`... up to `#300+`) resetting automatically at midnight with zero duplicates or concurrency gaps.
- **100% Integer Paise Math**: Line totals and cart totals strictly computed as integer paise (`bigint`/`number`).
- **Item Integrity & Out-of-Stock Check**: Rejects orders containing items marked unavailable (`is_available = false`).
- **Order Lifecycle State Machine**: Enforces valid progression: `pending` $\rightarrow$ `preparing` $\rightarrow$ `ready` $\rightarrow$ `served` (with `cancelled` restricted to Cashier/Owner).
- **Live Queue Separation**: Divides active orders into `kitchenQueue` (orders being cooked) and `packagingQueue` (orders ready for plate handover).

---

## 2. Architecture & Design Decisions
1. **Concurrency-Safe Token Counter**:
   - `vendors.daily_token_counter` and `vendors.token_reset_date` track the stall's counter state.
   - When a new order arrives, if `token_reset_date !== today`, the counter atomically resets to `1`. Otherwise, increments by `+1`.
2. **Strict Financial Integrity**:
   - Item prices: `unit_price_paise: bigint`
   - Line total: `unit_price_paise * quantity = line_total_paise: bigint`
   - Total sum: $\sum(\text{line\_total\_paise}) = \text{total\_paise: bigint}$
   - Derived `totalRupees` and `priceRupees` returned for fast UI rendering.
3. **Queue Segmentation for Multi-Phone Stalls**:
   - `/kitchen` listens to `kitchenQueue` (`pending` & `preparing` status).
   - `/packaging` listens to `packagingQueue` (`ready` status).
   - Cooks tap `ready` $\rightarrow$ order seamlessly leaves kitchen queue and enters packaging queue.
   - Packers tap `served` $\rightarrow$ order completes and archives to history.

---

## 3. Endpoints Implemented
| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/orders` | `requireAuth` + `requireRole('owner', 'cashier')` | Punch new order with atomic daily token |
| `GET` | `/api/v1/orders/live` | `requireAuth` | Active queue for kitchen KDS & packaging |
| `GET` | `/api/v1/orders/:id` | `requireAuth` | Order details with item breakdown |
| `PATCH` | `/api/v1/orders/:id/status` | `requireAuth` | Advance lifecycle (`preparing` $\rightarrow$ `ready` $\rightarrow$ `served`) |
| `GET` | `/api/v1/orders/history` | `requireAuth` | Paginated daily order history |

---

## 4. Verification Commands & Results
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. In-memory Unit Test Suite
pnpm test
# Result: 8 test files passed, 113/113 tests passed (17 tests in order-engine.test.ts)
```

---

## 5. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | 1st order gets Token #1, followed sequentially by #2 and #3 | ✅ PASS |
| TEST 1.2 | Midnight date rollover resets counter to #1 for new day | ✅ PASS |
| TEST 2.1 | Line items and cart total calculated in exact integer paise | ✅ PASS |
| TEST 2.2 | Rejects empty items array with 400 EMPTY_ORDER | ✅ PASS |
| TEST 2.3 | Rejects non-positive quantity with 400 INVALID_QUANTITY | ✅ PASS |
| TEST 3.1 | Rejects out-of-stock items with 400 ITEM_OUT_OF_STOCK | ✅ PASS |
| TEST 4.1 | State machine transitions preparing $\rightarrow$ ready $\rightarrow$ served | ✅ PASS |
| TEST 4.2 | Rejects illegal jump (preparing $\rightarrow$ served) with 400 | ✅ PASS |
| TEST 4.3 | Cook/Packer forbidden from cancelling order (403) | ✅ PASS |
| TEST 5.1 | `POST /` creates order and assigns Token #1 | ✅ PASS |
| TEST 5.2 | `GET /live` returns order in kitchenQueue | ✅ PASS |
| TEST 5.3 | `PATCH /:id/status` cook marks ready | ✅ PASS |
| TEST 5.4 | `GET /live` order moves to packagingQueue | ✅ PASS |
| TEST 5.5 | `PATCH /:id/status` packer marks served | ✅ PASS |
| TEST 5.6 | `GET /:id` retrieves full order breakdown | ✅ PASS |
| TEST 5.7 | `GET /history` returns order history | ✅ PASS |
| TEST 5.8 | `POST /` rejects unauthenticated call with 401 | ✅ PASS |
