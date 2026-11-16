# Phase 6 Walkthrough: Device Pairing — QR-Based Kitchen/Packer Connection

## 1. Objective
Enable street food stalls with 2–3 staff members (Cashier, Cook, Packer) to securely connect helper screens without sharing the owner's master login credentials or mobile number:
- **Cashier Terminal as Coordinator**: The Cashier or Owner generates a single-use 5-minute pairing QR code for the target role (`cook`, `packer`, `cashier`).
- **1-Scan Helper Connect**: Kitchen display or packaging phone scans the QR code (`POST /api/v1/devices/pair`), instantly acquiring a scoped role session token and auto-redirecting to their respective portal (`/kitchen` or `/packaging`).
- **Single-Use Replay Protection**: Each pairing token contains a unique cryptographic `jti` and expires after 300 seconds; duplicate redemption attempts are rejected with `409 Conflict`.
- **Cashier Device Management**: Active devices can be monitored (`GET /api/v1/devices`) and remotely disconnected at any moment (`DELETE /api/v1/devices/:id`).

---

## 2. Architecture & Design Decisions
1. **Zero Helper Credentials**: Kitchen cooks and packaging helpers never receive passwords or master phone access. Their device authorization is strictly bound to their hardware/browser session via scoped JWT and stored in `devices`.
2. **Ephemeral QR Token**:
   - Payload: `{ v: vendorId, r: role, n: deviceName, exp: timestamp, jti: uuid }`
   - Signed with HMAC-SHA256 using `JWT_SECRET`.
   - Rendered on-the-fly as Base64 PNG data URI via `QRCode.toDataURL(...)`.
3. **Scoped Device JWT**:
   - Issued with `role: 'cook'` or `role: 'packer'` and `deviceId: device.id`.
   - Protected against privilege escalation: `requireRole('owner', 'cashier')` prevents cooks or packers from generating tokens or disconnecting devices.
4. **Instant Revocation**:
   - Owner or cashier can revoke any connected device in one tap, setting `is_active: false`.

---

## 3. Endpoints Implemented
| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/devices/pairing-token` | `requireAuth` + `requireRole('owner', 'cashier')` | Generate 5-min single-use QR pairing token |
| `POST` | `/api/v1/devices/pair` | Public (Token-authenticated) | Helper scans QR code & pairs device |
| `GET` | `/api/v1/devices` | `requireAuth` | List all active connected stall devices |
| `DELETE` | `/api/v1/devices/:id` | `requireAuth` + `requireRole('owner', 'cashier')` | Revoke / disconnect helper device |

---

## 4. Database Schema Changes (`009_create_devices.ts`)
Created `devices` table:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE`
- `device_name VARCHAR(100) NOT NULL DEFAULT 'Counter Device'`
- `role VARCHAR(20) NOT NULL` (`cook` | `packer` | `cashier`)
- `token_hash VARCHAR(255) NOT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `last_seen_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Index `idx_devices_vendor_active` on `(vendor_id, is_active)`.

---

## 5. Verification Commands & Results
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. In-memory Unit Test Suite
pnpm test
# Result: 6 test files passed, 75/75 tests passed (13 tests in device-pairing.test.ts)
```

---

## 6. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | Generates 5-minute pairing token and QR code PNG data URL for `cook` | ✅ PASS |
| TEST 1.2 | Generates pairing token and default device name for `packer` | ✅ PASS |
| TEST 1.3 | Rejects pairing generation with invalid role | ✅ PASS |
| TEST 2.1 | Rejects malformed pairing token with 400 | ✅ PASS |
| TEST 2.2 | Rejects tampered signature with 401 Unauthorized | ✅ PASS |
| TEST 2.3 | Rejects expired pairing token with 400 TOKEN_EXPIRED | ✅ PASS |
| TEST 2.4 | Rejects replay of same QR code token with 409 Conflict | ✅ PASS |
| TEST 3.1 | `POST /pairing-token` generates QR code for cashier | ✅ PASS |
| TEST 3.2 | `POST /pairing-token` rejects non-cashier/owner caller with 403 | ✅ PASS |
| TEST 3.3 | `POST /pair` helper pairs and receives scoped JWT & portalUrl | ✅ PASS |
| TEST 3.4 | `GET /` lists all active connected devices for stall | ✅ PASS |
| TEST 3.5 | `DELETE /:id` revokes paired device | ✅ PASS |
| TEST 3.6 | `DELETE /:id` rejects non-existent device with 404 | ✅ PASS |
