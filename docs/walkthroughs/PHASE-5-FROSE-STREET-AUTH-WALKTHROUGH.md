# Phase 5 Walkthrough: Authentication — Phone, Password, Biometrics & PIN

## 1. Objective
Implement ultra-fast, zero-SMS-cost authentication for FROSE Street food vendors and street stalls:
- Primary initial login with **Phone Number + Password** (10-digit mobile number, salted scrypt password hashing).
- Once logged in, vendors can configure **4-digit Quick PIN** for rapid terminal unlocking on greasy/busy counter tablets.
- Support **WebAuthn Biometric Passkeys (Fingerprint / Face ID)** for instant 1-tap stall authentication without typing.
- Stateless, timing-safe HS256 JWT tokens issued via secure HttpOnly cookies (`frose_street_token`) and Bearer headers.
- Full role-based route protection middleware (`requireAuth`, `requireRole`).

---

## 2. Architecture & Design Decisions
1. **Zero SMS Cost**: Replaced volatile SMS OTPs with Phone + Password. Saves ₹0.15–₹0.25 per OTP and avoids carrier delivery timeouts on congested street mobile networks.
2. **Cryptographic Security**: Node.js native `crypto.scrypt` with $N=16384$, $r=8$, $p=1$, 16-byte random salts, and `crypto.timingSafeEqual` prevents timing attacks and rainbow tables.
3. **Stateless JWT**: Zero-dependency HS256 JWT implementation using Node's standard `node:crypto` HMAC SHA-256. Dual transport support via HttpOnly cookie (`frose_street_token`) and `Authorization: Bearer <token>`.
4. **4-Digit Quick PIN**: Salted scrypt hashed PIN (`pin_<digits>`) enables instant stall unlocking during busy rush hours without re-entering long passwords.
5. **WebAuthn Biometrics**: Store hardware credential IDs and public keys in `biometric_credentials` table with cascading vendor relationships.

---

## 3. Endpoints Implemented
| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register new vendor stall (phone, password, businessName) |
| `POST` | `/api/v1/auth/login` | Public | Authenticate vendor with phone & password |
| `POST` | `/api/v1/auth/setup-pin` | `requireAuth` | Configure 4-digit quick PIN |
| `POST` | `/api/v1/auth/verify-pin` | Public/Auth | Verify 4-digit quick PIN to unlock session |
| `POST` | `/api/v1/auth/biometric/register` | `requireAuth` | Register WebAuthn passkey (Fingerprint/Face ID) |
| `POST` | `/api/v1/auth/biometric/verify` | Public | Authenticate vendor via biometric credential |
| `GET` | `/api/v1/auth/me` | `requireAuth` | Return active vendor profile and role |
| `POST` | `/api/v1/auth/logout` | Public | Clear session cookie |

---

## 4. Database Schema Changes (`008_add_auth_credentials.ts`)
- Added `password_hash VARCHAR(255)` and `quick_pin_hash VARCHAR(255)` to `vendors` table.
- Added `password_hash VARCHAR(255)` and `quick_pin_hash VARCHAR(255)` to `staff` table.
- Created `biometric_credentials` table:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE`
  - `credential_id VARCHAR(255) NOT NULL UNIQUE`
  - `public_key TEXT NOT NULL`
  - `counter INTEGER NOT NULL DEFAULT 0`
  - `device_name VARCHAR(100) DEFAULT 'Mobile Device'`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - Index `idx_biometric_vendor_id` on `vendor_id`.

---

## 5. Verification Commands & Results
```bash
# 1. TypeScript compilation check
pnpm typecheck
# Result: tsc --noEmit exited 0 with no errors

# 2. In-memory Unit Test Suite
pnpm test
# Result: 5 test files passed, 62/62 tests passed (29 tests in auth.test.ts)
```

---

## 6. Acceptance Matrix
| Test Case | Description | Result |
| :--- | :--- | :--- |
| TEST 1.1 | `hashPassword` produces valid scrypt format with 16-byte salt | ✅ PASS |
| TEST 1.2 | `verifyPassword` validates correct password and rejects wrong | ✅ PASS |
| TEST 1.3 | `hashPin` & `verifyPin` validates 4-digit PIN | ✅ PASS |
| TEST 1.4 | `generateSecureToken` produces random hex strings | ✅ PASS |
| TEST 2.1 | `signJwt` produces valid base64url HS256 JWT | ✅ PASS |
| TEST 2.2 | `verifyJwt` validates valid token | ✅ PASS |
| TEST 2.3 | `verifyJwt` throws on tampered signature | ✅ PASS |
| TEST 2.4 | `verifyJwt` throws on expired token | ✅ PASS |
| TEST 2.5 | `verifyJwt` throws on malformed token | ✅ PASS |
| TEST 3.1 | `requireAuth` rejects unauthenticated call with 401 | ✅ PASS |
| TEST 3.2 | `requireAuth` accepts Bearer token from header | ✅ PASS |
| TEST 3.3 | `requireRole` enforces RBAC (owner/cashier) | ✅ PASS |
| TEST 4.1 | Rejects invalid phone numbers (< 10 digits) | ✅ PASS |
| TEST 4.2 | Rejects weak passwords (< 6 chars) | ✅ PASS |
| TEST 4.3 | Rejects missing business name | ✅ PASS |
| TEST 4.4 | Rejects invalid PIN formats | ✅ PASS |
| TEST 5.1 | `POST /register` creates vendor, staff, returns 201 + cookie | ✅ PASS |
| TEST 5.2 | `POST /register` rejects duplicate phone with 409 Conflict | ✅ PASS |
| TEST 5.3 | `POST /login` with correct password returns 200 + cookie | ✅ PASS |
| TEST 5.4 | `POST /login` with wrong password returns 401 | ✅ PASS |
| TEST 5.5 | `POST /setup-pin` sets 4-digit PIN | ✅ PASS |
| TEST 5.6 | `POST /verify-pin` unlocks session with 200 | ✅ PASS |
| TEST 5.7 | `POST /verify-pin` with wrong PIN returns 401 | ✅ PASS |
| TEST 5.8 | `POST /biometric/register` registers passkey | ✅ PASS |
| TEST 5.9 | `POST /biometric/verify` authenticates passkey | ✅ PASS |
| TEST 5.10 | `POST /biometric/verify` rejects unknown passkey with 401 | ✅ PASS |
| TEST 5.11 | `GET /me` returns authenticated vendor profile | ✅ PASS |
| TEST 5.12 | `GET /me` rejects unauthenticated call with 401 | ✅ PASS |
| TEST 5.13 | `POST /logout` clears session cookie | ✅ PASS |
