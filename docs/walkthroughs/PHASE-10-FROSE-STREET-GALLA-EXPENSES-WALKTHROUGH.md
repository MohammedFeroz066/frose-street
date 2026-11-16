# Phase 10 Walkthrough: Daily Galla, Expenses, and Day-End Z-Report

## 1. Objective
Establish the financial core for street vendors, food stalls, and kiosks:
- **Daily Galla Cash Reconciliation**: Calculate cash collected vs cash paid out so the vendor knows down to the exact single paisa how much physical currency should be in the drawer (`cash_in_drawer_paise = cash_sales_paise - cash_expenses_paise`).
- **Petty Cash & Digital Expense Logging**: Track stall operating expenses (`-₹80 Milk`, `-₹300 Charcoal`, `-₹500 Momo wrappers`) with strict positive integer paise validation (zero floating-point math permitted).
- **Day-End Fiscal Z-Report**: Allow the stall owner to close the business day with a single tap, sealing the day's record into `daily_summaries` and generating instant formatted WhatsApp text with emojis.
- **Top Selling Dish Analytics**: Identify the highest selling menu item for the shift across completed orders.
- **Strict Financial Blindness & Role Isolation**: Cooks and packers are completely blind to financials (403 Forbidden). Cashiers can record expenses and view the live drawer balance, but only the stall Owner can seal the fiscal day.

---

## 2. Architecture & Design Decisions
1. **100% Integer Paise Financial Math**:
   - Every monetary transaction is strictly stored and aggregated as `bigint` / integer paise.
   - Floats like `45.50` or decimal inputs are rejected with `FLOATS_FORBIDDEN` error.
   - Rupee values (`/ 100`) are provided purely as derived display fields.
2. **Real-Time Live Aggregation Engine**:
   - `GallaService.getGallaSummary` calculates live metrics dynamically across all completed orders and recorded expenses for the target date.
   - Automatically excludes cancelled orders from sales totals while maintaining an explicit cancelled orders counter.
3. **Database Migration `010_update_expenses_table.ts`**:
   - Alters `expenses` table to add `category varchar(50) default 'general'` and `payment_method varchar(20) default 'cash'`.
   - Keeps backward compatibility with `006_create_expenses.ts` without data destruction.
4. **Day-End Z-Report Snapshot & WhatsApp Formatting**:
   - Saves final day metrics into `daily_summaries` table (upserting if re-closing).
   - Generates a ready-to-share WhatsApp summary string with stall name, sales breakdown, drawer cash, net profit, and top dish.
5. **WebSocket Financial Channel**:
   - Broadcasts `galla:expense_created`, `galla:expense_deleted`, and `galla:day_closed` via `WebSocketHub.broadcast`.
   - Filtered strictly to `['owner', 'cashier']` roles so kitchen and packing screens remain financially blind.

---

## 3. Endpoints Implemented
| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/galla/expenses` | `owner`, `cashier` | Logs petty cash or digital expense |
| `GET` | `/api/v1/galla/expenses` | `owner`, `cashier` | Lists expenses for a given date with totals |
| `DELETE` | `/api/v1/galla/expenses/:id` | `owner`, `cashier` | Deletes an expense and updates drawer total |
| `GET` | `/api/v1/galla/summary` | `owner`, `cashier` | Live cash vs UPI tally, drawer balance, net profit |
| `POST` | `/api/v1/galla/close-day` | `owner` | Seals fiscal day into `daily_summaries` & generates Z-report |
| `POST` | `/api/v1/galla/z-report` | `owner` | Alias for `/close-day` |
| `GET` | `/api/v1/galla/z-reports` | `owner` | Historical past Z-reports from `daily_summaries` |
| `GET` | `/api/v1/galla/history` | `owner` | Alias for `/z-reports` |

---

## 4. Galla Math & Formulas
```text
Total Sales (Paise)     = Cash Sales (Paise) + UPI Sales (Paise)
Total Expenses (Paise)  = Cash Expenses (Paise) + UPI Expenses (Paise)
Cash In Galla (Paise)   = Cash Sales (Paise) - Cash Expenses (Paise)
Net Profit (Paise)      = Total Sales (Paise) - Total Expenses (Paise)
```

### WhatsApp Z-Report Sample Output:
```text
🧾 *FROSE Street — Day-End Z-Report*
🏪 *Tibetan Momo & Chai Point*
📅 Date: 2026-11-16
───────────────────────────────
💰 *Total Sales:* ₹400.00 (1 orders)
   💵 Cash: ₹400.00
   📱 UPI:  ₹0.00
📉 *Expenses:*   ₹50.00
───────────────────────────────
💵 *Cash in Galla:* ₹350.00
✨ *Net Profit:*    ₹350.00
🏆 *Top Dish:*      Crispy Kurkure Momo
❌ *Cancelled:*     0
───────────────────────────────
⚡ *FROSE Street Micro-POS* (street.frostech.com)
```

---

## 5. Verification Commands & Results
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. In-memory Unit Test Suite
pnpm test
# Result: 10 test files passed, 133/133 tests passed (12 tests in galla-expenses.test.ts)
```

---

## 6. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | Strictly rejects floating point numbers (`45.50`) with `FLOATS_FORBIDDEN` | ✅ PASS |
| TEST 1.2 | Rejects zero or negative amounts with `INVALID_EXPENSE_AMOUNT` | ✅ PASS |
| TEST 1.3 | Rejects missing/empty description with `INVALID_DESCRIPTION` | ✅ PASS |
| TEST 1.4 | Accepts valid integer paise (`8000` paise = ₹80.00) with category & payment method | ✅ PASS |
| TEST 2.1 | Creates multiple expenses and calculates total expenses in paise and rupees | ✅ PASS |
| TEST 3.1 | Deletes an expense and dynamically recalculates total expenses | ✅ PASS |
| TEST 4.1 | Computes Cash vs UPI breakdown, drawer balance, and net profit down to the single paisa | ✅ PASS |
| TEST 4.2 | Correctly excludes cancelled orders from sales totals while counting them | ✅ PASS |
| TEST 5.1 | Accurately identifies top selling menu item for the shift across completed orders | ✅ PASS |
| TEST 6.1 | Owner seals fiscal day into `daily_summaries` and generates WhatsApp Z-report text | ✅ PASS |
| TEST 6.2 | Retrieves historical Z-reports for stall | ✅ PASS |
| TEST 7.1 | Cooks and packers receive 403 Forbidden (strict financial blindness) | ✅ PASS |
| TEST 7.2 | Cashiers can log expenses & view galla summary, but cannot close fiscal day (403) | ✅ PASS |
| TEST 8.1 | Broadcasts real-time events to owner/cashier terminals while excluding cooks/packers | ✅ PASS |
