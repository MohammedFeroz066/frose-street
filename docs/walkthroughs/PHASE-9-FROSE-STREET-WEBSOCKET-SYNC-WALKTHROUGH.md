# Phase 9 Walkthrough: WebSocket Real-Time Synchronization Engine

## 1. Objective
Establish sub-500ms real-time communication across all connected devices in a street food stall:
- **Billing Counter $\rightarrow$ Kitchen Display (`/kitchen`)**: When the cashier punches an order, `order:new` instantly flashes on the cook's phone with audio chime.
- **Kitchen Display $\rightarrow$ Packaging & Serving (`/packaging`)**: When the cook taps `✅ MARK READY`, `order:status_changed` moves the dish immediately into the helper's Ready Lane.
- **Packaging $\rightarrow$ Billing & Archive**: When the helper taps `✅ MARK DELIVERED`, the card archives across all stall screens.
- **Stock Sync**: When an item runs out and is 86'd (`menu:availability_changed`), the cashier's punching grid immediately disables the item card.
- **Multi-Stall Isolation**: Sockets are strictly sandboxed per `vendor_id` — Stall A never receives Stall B's events.

---

## 2. Architecture & Design Decisions
1. **Lightweight WebSocket Hub**:
   - In-memory client connection registry per vendor: `Map<vendorId, Set<ConnectedClient>>`.
   - Uses native Node WebSocket interfaces (`WebSocketLike`) with zero extra npm packages.
2. **Dual Authentication Transport**:
   - Accepts session JWT via URL query parameter (`/ws?token=...`), `frose_street_token` HttpOnly cookie, or `Authorization: Bearer <token>` header.
   - Rejects unauthenticated connections immediately with close code `4001 Unauthorized`.
3. **Automatic Event Integration in Domain Services**:
   - `OrderService.createOrder` broadcasts `order:new`.
   - `OrderService.updateOrderStatus` broadcasts `order:status_changed`.
   - `MenuService.toggleAvailability` broadcasts `menu:availability_changed`.
4. **Heartbeat Keep-Alive**:
   - Handled via `ping` / `pong` frames to ensure persistent socket connectivity across flaky mobile 4G/5G connections on the street.

---

## 3. Endpoints Implemented
| Method | Endpoint | Protocol | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ws/ws` | `ws://` / `wss://` | Real-time bi-directional WebSocket channel |
| `GET` | `/api/v1/ws/stats` | `HTTP` (`requireAuth`) | Active connected screens counter for the stall |

---

## 4. Real-Time Event Protocol
| Event | Direction | Trigger | Payload |
| :--- | :--- | :--- | :--- |
| `connected` | Server $\rightarrow$ Client | Socket connect | `{ vendorId, role, deviceId, message }` |
| `order:new` | Server $\rightarrow$ Kitchen/Cashier | Cashier punches order | Full order details with token, items, notes |
| `order:status_changed` | Server $\rightarrow$ Packaging/Cashier | Cook marks ready / Packer marks served | `{ id, tokenNo, previousStatus, newStatus }` |
| `menu:availability_changed` | Server $\rightarrow$ Cashier | Dish out of stock toggle | `{ id, name, isAvailable, statusText }` |
| `ping` / `pong` | Bi-directional | Network keep-alive | `{ time: timestamp }` |

---

## 5. Verification Commands & Results
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. In-memory Unit Test Suite
pnpm test
# Result: 9 test files passed, 121/121 tests passed (8 tests in websocket-sync.test.ts)
```

---

## 6. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | Registers socket and sends `connected` welcome frame | ✅ PASS |
| TEST 1.2 | Multi-stall isolation: Stall 1 events never leak to Stall 2 | ✅ PASS |
| TEST 1.3 | Role-based filtering: restricts broadcast delivery by role | ✅ PASS |
| TEST 2.1 | Socket close cleans up client from stall registry | ✅ PASS |
| TEST 3.1 | `OrderService.createOrder` broadcasts `order:new` in real time | ✅ PASS |
| TEST 3.2 | `OrderService.updateOrderStatus` broadcasts `order:status_changed` | ✅ PASS |
| TEST 3.3 | `MenuService.toggleAvailability` broadcasts `menu:availability_changed` | ✅ PASS |
| TEST 4.1 | `GET /api/v1/ws/stats` returns active connected screens count | ✅ PASS |
