# FROSE Street — Phase 3 Walkthrough: Database Schema & Migrations

## 1. Objective
Establish the relational database schema, Kysely type definitions, connection pool singleton, and programmatic migration runner for **FROSE Street**. Ensure 100% adherence to FROSE financial rules: all monetary values are strictly typed and stored as `BIGINT` integer paise (`paise`), with zero floating-point operations.

---

## 2. Previous vs New State

| Aspect | Previous State | New State |
| :--- | :--- | :--- |
| **Database Schema** | None | 7 production migrations covering 8 core domain tables |
| **Financial Integrity** | Conceptual | Strictly enforced `BIGINT` integer paise across all money columns |
| **Kysely Types** | None | Full `Database` interface in `server/src/db/types.ts` |
| **Migrator Engine** | None | Programmatic runner with `migrateToLatest()` and `migrateDown()` |
| **CLI Runner** | None | `pnpm run migrate:latest` and `pnpm run migrate:down` scripts |
| **Unit Test Suite** | 18 tests | 25 tests across scaffolding, infrastructure, and migrations (100% PASS) |

---

## 3. The 8 Core Tables & Monetary Columns

| Table | Primary Columns | Monetary Columns (All BIGINT) | Relationships |
| :--- | :--- | :--- | :--- |
| **vendors** | `id`, `phone`, `business_name`, `edition`, `subscription_status`, `daily_token_counter` | — | Root tenant entity |
| **staff** | `id`, `vendor_id`, `name`, `role` (`owner`/`cashier`/`cook`/`packer`) | — | `vendor_id` $\rightarrow$ `vendors.id` (CASCADE) |
| **menu_items** | `id`, `vendor_id`, `name`, `category`, `emoji_icon`, `display_order`, `is_available` | `price_paise` (BIGINT) | `vendor_id` $\rightarrow$ `vendors.id` (CASCADE) |
| **orders** | `id`, `vendor_id`, `token_number`, `status`, `payment_method`, `payment_status` | `total_paise` (BIGINT) | `vendor_id` $\rightarrow$ `vendors.id`, `created_by_staff_id` $\rightarrow$ `staff.id` |
| **order_items** | `id`, `order_id`, `menu_item_id`, `item_name`, `quantity` | `unit_price_paise`, `line_total_paise` (BIGINT) | `order_id` $\rightarrow$ `orders.id` (CASCADE), `menu_item_id` $\rightarrow$ `menu_items.id` |
| **daily_summaries** | `id`, `vendor_id`, `summary_date`, `total_orders`, `top_selling_item` | `total_sales_paise`, `cash_sales_paise`, `upi_sales_paise`, `total_expenses_paise`, `net_paise` (BIGINT) | `vendor_id` $\rightarrow$ `vendors.id` (CASCADE) |
| **expenses** | `id`, `vendor_id`, `description`, `expense_date` | `amount_paise` (BIGINT) | `vendor_id` $\rightarrow$ `vendors.id` (CASCADE) |
| **subscriptions** | `id`, `vendor_id`, `plan`, `period_start`, `period_end`, `status` | `amount_paise` (BIGINT) | `vendor_id` $\rightarrow$ `vendors.id` (CASCADE) |

---

## 4. Verification Commands & Genuine Execution Output

### A. TypeScript Type Check
Command:
```bash
pnpm typecheck
```
Output:
```
$ tsc --noEmit
Exit Code: 0 (Zero errors)
```

### B. Unit Test Suite (Phases 1, 2, and 3)
Command:
```bash
pnpm test
```
Output:
```
 RUN  v1.6.1 C:/Projects/frose-street

 ✓ tests/unit/infrastructure.test.ts (9 tests) 34ms
 ✓ tests/unit/database-migrations.test.ts (7 tests) 34ms
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 1: Migration Files & Compilation > should have all 7 migration files on disk
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 1: Migration Files & Compilation > each migration must export both up() and down() functions
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 2: Strict Integer Paise (BIGINT) Verification > all monetary columns in migrations must use bigint (no floats, no numbers)
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 2: Strict Integer Paise (BIGINT) Verification > no migration may contain float, decimal, or double precision columns for money
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 3: Migration Provider & Ordering > should register all 7 migrations in correct sequential order
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 4: Foreign Key Relationships & Indexes > dependent tables must reference vendors.id with cascade delete
   ✓ Phase 3 Acceptance: Database Schema & Migrations > TEST 4: Foreign Key Relationships & Indexes > indexes must be defined for high-traffic query patterns
 ✓ tests/unit/scaffolding.test.ts (9 tests) 158ms

 Test Files  3 passed (3)
      Tests  25 passed (25)
   Duration  3.25s
```

---

## 5. Security & Inviolable Financial Protections
* **Zero Floating-Point Representation:** 100% of money columns (`price_paise`, `total_paise`, `line_total_paise`, `total_sales_paise`, `cash_sales_paise`, `upi_sales_paise`, `total_expenses_paise`, `net_paise`, `amount_paise`) are strictly typed as `bigint`.
* **Atomic Sequential Tokens:** The `vendors.daily_token_counter` tracks sequential token issuance per business day.
* **Cascade Isolation:** All dependent records are linked to `vendors.id` with referential integrity.

---

## 6. Verdict
**PASS** — Phase 3 acceptance criteria are 100% satisfied. Ready to proceed to **Phase 4: Fastify Server Core & Health Check**.
