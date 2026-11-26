# FROSE STREET — COMPREHENSIVE SECURITY, ARCHITECTURE & UX AUDIT (PHASE 0)

> **Audit Date:** 2026-11-25  
> **Auditors:** Senior Security Engineer, Full-Stack Architect & UX Lead  
> **Repository:** `frose-street` (Fastify 4, TypeScript 5, Vanilla JS PWA, PostgreSQL 16)  
> **Branch:** `audit/security-architecture-ux-phase0`  
> **Rule Enforcement:** Zero code changes before Phase 0 approval. Integer paise only.

---

## 1. CODEBASE VS. MANUAL GAP ANALYSIS & REALITY CHECK

A forensic comparison between the claimed manual specification and the real repository revealed critical operational, architectural, and security mismatches:

| Component | Manual Specification Claim | Codebase Reality | Severity |
| :--- | :--- | :--- | :--- |
| **Database & RLS** | "PostgreSQL 16 with 74 active tables and mandatory Row-Level Security (`004_rls_policies.sql`)." | **No RLS exists.** Only 10 tables exist (`001_create_vendors` to `010_update_expenses_table`). Zero tables have `ENABLE ROW LEVEL SECURITY` or `FORCE ROW LEVEL SECURITY`. Default dev mode runs in-memory DB (`USE_MEMORY_DB=true`). | **CRITICAL** |
| **Authentication Flow** | "4-digit quick PIN authentication (Argon2id/Scrypt hashed)." | Quick PIN is an insecure bypass: `AuthService.registerVendor` falls back to `frose-pin-${quickPin}` or literal string `'frose-street-default-2026'` (`server/src/modules/auth/auth.service.ts:49`). PIN is usable for initial authentication rather than purely local terminal lock. | **CRITICAL** |
| **Super Admin Privilege** | "Strict RBAC permissions, tenant/branch isolation." | Hardcoded backdoor: Any login with phone `9999999999` is automatically granted `superadmin` role (`server/src/modules/auth/auth.routes.ts:167`). Super admin default password `Feroz@123` is hardcoded in memory DB (`server/src/db/memory-db.ts:20`). | **CRITICAL** |
| **JWT Storage** | "Session validation, cryptographic hardening." | JWTs are returned in plaintext response bodies and saved to browser `localStorage` under `frose_auth_token`, exposed to all 59 DOM XSS injection points. | **CRITICAL** |
| **Security Headers** | "Formal enterprise POS security controls." | Fastify Helmet is **not installed or registered**. No Content Security Policy (CSP), no `X-Content-Type-Options: nosniff`, no `X-Frame-Options: DENY`. | **HIGH** |
| **CORS Policy** | "Strict tenant and origin isolation." | Broken regex/substring check: `origin.includes('street.frostech.com') || origin.includes('localhost')` allows attacker domains like `https://street.frostech.com.attacker.com` or `https://attackerlocalhost.com`. | **HIGH** |
| **WebSocket Security** | "Bidirectional real-time sync with 25s heartbeat." | WebSocket accepts JWT in URL query parameter (`?token=...`), leaking tokens in logs/browser history. No `Origin` verification on HTTP upgrade (vulnerable to CSWSH). Sockets without auth remain open indefinitely. | **HIGH** |
| **DOM Rendering & XSS** | "Zero-framework overhead, 120fps fluid responsiveness." | 59 raw `innerHTML` sinks interpolate unescaped dish names, category names, vendor names, and custom base64 URLs directly into DOM. | **HIGH** |
| **Input Validation** | "Input validation on Fastify monolith." | Zero Fastify JSON Schema or Zod schemas on route handlers. Route bodies are cast directly via `request.body as any`. | **HIGH** |
| **Offline Hotspot Mesh** | "100% zero-internet SoftAP mesh over `http://192.168.43.1:3100`." | Modern browsers restrict Service Workers and Web Bluetooth to **Secure Contexts (`https://` or `localhost`)**. Running plain HTTP over `192.168.43.1` causes PWA and Bluetooth thermal printing to fail on standard mobile Chrome/Safari without HTTPS/wrapper. | **HIGH** |
| **Payment Wording** | "Received on FROSE Pay" voice confirmation. | Creates false impression that FROSE is an authorized payment aggregator/processor, introducing regulatory exposure under RBI/NPCI guidelines. | **MEDIUM** |

---

## 2. COMPREHENSIVE CODEBASE GREP INVENTORY

### Section A: Storage Audit (`localStorage`, `sessionStorage`, `IndexedDB`)
*Total Storage Invocations: 195 calls across 19 files.*

| Key Name | Storage Type | Data Stored | Contains PII? | Reference Locations |
| :--- | :--- | :--- | :--- | :--- |
| `frose_auth_token` | `localStorage` | Raw JWT bearer token | **YES (Session Hijack)** | `client/billing.html:11`, `client/login.html:335`, `client/admin.html:29`, `client/js/billing.js:82` |
| `frose_current_vendor` | `localStorage` | Full vendor profile (ID, phone, business name, owner name, UPI VPA) | **YES (PII)** | `client/js/billing.js:18`, `client/js/settings-component.js:24`, `client/admin.html:3182` |
| `frose_stall_phone` | `localStorage` | 10-digit registered counter phone number | **YES (PII)** | `client/js/billing.js:19, 763`, `client/js/register.js:368` |
| `frose_stall_name` | `localStorage` | Registered business trade name | **YES (PII)** | `client/js/billing.js:761`, `client/js/kitchen.js:579`, `client/js/packaging.js:574` |
| `frose_vendor_vpa` | `localStorage` | UPI VPA payment handle (e.g. `9642230688@ybl`) | **YES (Financial PII)** | `client/login.html:278` |
| `frose_custom_upi_id` | `localStorage` | Active checkout payment VPA ID | **YES (Financial PII)** | `client/js/billing.js:488`, `client/js/settings-component.js:302` |
| `frose_custom_payee_name`| `localStorage` | Bank account display name for UPI | **YES (PII)** | `client/js/settings-component.js:303` |
| `frose_custom_scanner_qr`| `localStorage` | Uncompressed/compressed Base64 image data URI of stall QR | **YES (Exhausts quota)** | `client/js/billing.js:486`, `client/js/settings-component.js:73, 352` |
| `frose_live_orders_queue`| `localStorage` | JSON array of active orders, items, customer names, notes | **YES (Customer PII)** | `client/js/billing.js:583`, `client/js/kitchen.js:387`, `client/js/packaging.js:370` |
| `frose_vendors_directory`| `localStorage` | Array of all onboarded restaurant stalls (cached in admin) | **YES (Multi-Tenant PII)**| `client/admin.html:1918, 2038` |
| `frose_dishes_<vendorId>`| `localStorage` | Full menu catalog for stall | No | `client/js/billing.js:67, 95, 137, 214`, `client/js/settings-component.js:123` |
| `frose_cats_<vendorId>`  | `localStorage` | List of category names | No | `client/js/billing.js:70, 87, 655` |
| `frose_current_token`    | `localStorage` | Incremental daily token number | No | `client/js/billing.js:545` |
| `frose_license_token`    | `localStorage` | Offline license validation string | No | `client/js/storage-adapter.js:550` |
| `frose_network_mode`     | `localStorage` | User connection mode preference (`cloud`, `local`, `auto`) | No | `client/js/storage-adapter.js:458` |
| `frose_counter_preferences`| `localStorage` | Tax rate, thermal printer width, audio volume settings | No | `client/js/settings-component.js:195, 393` |
| `frose_clean_slate_2026_v99_permanent_empty` | `localStorage` | Migration sentinel string | No | `client/billing.html:17`, `client/js/billing.js:28` |

---

### Section B: DOM Injection Sinks (`innerHTML`, `outerHTML`, etc.)
*Total Sinks: 59 instances. Representative High-Risk Sinks:*

1. **`client/js/billing.js:268`**:
   ```javascript
   grid.innerHTML = filtered.map(item => `
     <div class="pos-dish-card" data-id="${item.id}">
       <img class="dish-photo-img" src="${item.image}" alt="${item.name}">
       <div class="dish-title">${item.name}</div>
   `).join('');
   ```
   *Risk:* `item.name` and `item.image` are rendered directly into HTML without escaping. An attacker creating a dish titled `<img src=x onerror=alert(document.cookie)>` achieves persistent stored XSS across all counter staff.

2. **`client/js/kitchen.js:228` & `client/js/packaging.js:200`**:
   ```javascript
   queueContainer.innerHTML = kitchenOrders.map((order) => `
     <div class="kot-card">...<span>${order.customerName || 'Walk-in'}</span>...</div>
   `).join('');
   ```
   *Risk:* `order.customerName` and item notes injected directly. An order placed via customer portal or external API with script payloads executes in the kitchen display.

3. **`client/admin.html:2206` & `client/js/admin.js:222`**:
   ```javascript
   tbody.innerHTML = filtered.map(v => `
     <tr><td>${v.business_name}</td><td>${v.owner_name}</td><td>${v.phone}</td></tr>
   `).join('');
   ```
   *Risk:* Super Admin console renders unescaped vendor business names and owner names. A malicious vendor registering a stall name with XSS payloads can compromise the Super Admin session.

4. **`client/js/settings-component.js:83`**:
   ```javascript
   previewEl.innerHTML = `<img src="${customQr}" alt="Custom UPI QR" ... />`;
   ```
   *Risk:* `customQr` is an unverified data/javascript URI loaded directly from `localStorage`.

---

### Section C: Network Calls & WebSocket Connections
*Total Network / WS Invocations: 154.*

- **Client Fetch Endpoints:**
  - `POST /api/v1/auth/login` (`client/login.html:329`)
  - `POST /api/v1/auth/register-stall` (`client/js/register.js:347`)
  - `GET /api/v1/menu` (`client/js/billing.js:124`)
  - `POST /api/v1/orders` (`client/js/billing.js:589`)
  - `GET /api/v1/orders/live` (`client/js/kitchen.js:336`, `client/js/packaging.js:329`)
  - `PATCH /api/v1/orders/:id/status` (`client/js/kitchen.js:358`, `client/js/packaging.js:349`)
  - `GET /api/v1/admin/overview` (`client/js/admin.js:106`)
  - `GET /api/v1/admin/vendors` (`client/js/admin.js:180`)
  - `POST /api/v1/admin/vendors` (`client/js/admin.js:560`)
  - `PATCH /api/v1/admin/vendors/:id` (`client/js/admin.js:812`)
- **WebSocket Calls:**
  - `new WebSocket(wsUrl)` (`client/js/kitchen.js:421`, `client/js/packaging.js:421`)
  - `wsUrl = (proto === 'https:' ? 'wss://' : 'ws://') + host + '/ws?token=' + encodeURIComponent(token);` -> Leaks bearer token in request query string.
  - Periodic ping: `socket.send(JSON.stringify({ event: 'ping' }))` every 25s.

---

### Section D: Sensitive Data Exposure & Logging Audit
- **`server/src/db/memory-db.ts:20`**:
  `// Seed Super Admin master account (Phone: 9999999999 / Password: Feroz@123)`
  Cleartext credential in source code.
- **`server/src/modules/auth/auth.routes.ts:167`**:
  `const isSuperadmin = ... || vendor.phone === '9999999999';`
  Hardcoded privilege assignment based purely on a phone string.
- **`client/billing.html:1244` / `client/js/settings-component.js:29`**:
  `phone: '9642230688', upiId: '9642230688@ybl'`
  Personal phone number and UPI ID embedded directly in default client state.
- **`server/src/modules/websocket/websocket.routes.ts:13`**:
  Extracts JWT from `req.query.token`. Query parameters are routinely recorded in HTTP reverse-proxy logs (Caddy, Nginx, Cloudflare), leaking active user sessions to disk.

---

## 3. ARCHITECTURAL & SUBSYSTEM SECURITY AUDIT

### 3.1 Authentication & Credential Storage
- **Password Hashing:** Uses `scrypt` via Node `crypto.scrypt` with salt (`server/src/utils/crypto.ts`). While Scrypt is acceptable, Argon2id is the modern industry standard for password hashing.
- **Quick PIN Hazard:** 4-digit PIN is hashed using scrypt, but `AuthService.registerVendor` treats the PIN as an authentication credential rather than a local terminal unlock, creating a default password `frose-pin-${quickPin}`.
- **Lockout Mechanism:** `LoginSecurityService` (`server/src/modules/auth/login-security.service.ts`) tracks failed attempts purely in an in-memory `Map`. When running in multi-process/cluster or serverless mode, or upon server restart, all lockout state is wiped. There is zero IP-based rate limiting on login routes.

### 3.2 JWT Token Lifecycle & Storage
- **Generation:** Uses `@fastify/jwt` (which depends on vulnerable `fast-jwt <= 6.1.0` affected by GHSA-mvf2-f6gm-w987 algorithm confusion and GHSA-rp9m-7r4c-75qg cache collision).
- **Storage:** Frontend code actively reads `localStorage.getItem('frose_auth_token')`. Although `setAuthCookie` sets `frose_street_token` as HttpOnly, the client ignores the cookie and sends the bearer token in headers and query params.
- **Revocation:** There is no token blacklist, database jti tracking, or refresh token rotation mechanism. A stolen JWT remains valid for 30 full days (`JWT_EXPIRES_IN=30d`).

### 3.3 CORS, Security Headers & Network Hygiene
- **CORS:** Implemented via loose substring matching:
  ```typescript
  origin.includes('street.frostech.com') || origin.includes('localhost')
  ```
  An attacker hosting `evil-street.frostech.com.attack.io` passes the CORS check and can perform authenticated cross-origin requests.
- **Security Headers:** `@fastify/helmet` is completely missing. Browsers receive no CSP header, allowing inline scripts, arbitrary external fonts/images, and open WebSocket connections.

### 3.4 Multi-Tenant Isolation & PostgreSQL Row-Level Security (RLS)
- **RLS Status: MISSING.** None of the 10 migrations execute `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.
- **Query Scoping:** Isolation depends entirely on the developer appending `.where('vendor_id', '=', vendorId)` in Kysely query builders.
- **Table Ownership:** The database user configured in `DATABASE_URL` is `postgres` (superuser), which bypasses RLS by default unless `FORCE ROW LEVEL SECURITY` is explicitly declared.

### 3.5 WebSocket Upgrade & Cross-Site WebSocket Hijacking (CSWSH)
- The WebSocket upgrade handler (`server/src/modules/websocket/websocket.routes.ts`) does not inspect the `Origin` header.
- A malicious website open in the cashier's browser can connect to `ws://localhost:3100/ws` or `wss://street.frostech.com/ws`, extract live KOT orders, and inject rogue state updates.

### 3.6 File & Image Uploads
- Stall scanner images and dish photos are handled entirely on the client side via `FileReader.readAsDataURL` and stored directly into `localStorage`.
- There is no server-side validation of magic bytes, no image re-encoding on a secure backend, and no EXIF data scrubbing (exposing vendor GPS coordinates if taken with smartphone cameras).

### 3.7 Dependency Vulnerabilities (`pnpm audit`)
- Audit identified **37 vulnerabilities** (6 Critical, 14 High, 15 Moderate, 2 Low).
- **Critical CVEs:**
  - `fast-jwt <= 6.1.0` (GHSA-mvf2-f6gm-w987, GHSA-rp9m-7r4c-75qg): Algorithm confusion via whitespace-prefixed keys; cache collision returning claims from different tokens.
  - `vite <= 6.4.3`: Cross-origin script execution.
  - `fastify <= 5.7.2`: Unbounded memory allocation DoS.

---

## 4. VULNERABILITY RANKING MATRIX

| ID | Finding Title | Severity | File & Line | Proposed Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Hardcoded Super Admin Backdoor** | **CRITICAL** | `server/src/modules/auth/auth.routes.ts:167` | Remove phone check `vendor.phone === '9999999999'`. Require explicit database flag `is_superadmin = true` and dedicated admin auth. |
| **SEC-02** | **Critical CVEs in `fast-jwt` Dependency** | **CRITICAL** | `package.json:21` (`@fastify/jwt`) | Upgrade `@fastify/jwt` to `>=9.0.0` or replace with Node native `crypto.createHmac` / `jose` with strict algorithm verification. |
| **SEC-03** | **Default Fallback Passwords on PIN Registration** | **CRITICAL** | `server/src/modules/auth/auth.service.ts:49` | Disallow empty password on stall registration. PIN must be strictly a local device lock, not an account credential. |
| **SEC-04** | **Database Row-Level Security (RLS) Missing** | **CRITICAL** | `server/src/db/migrations/*` | Add migration enabling `FORCE ROW LEVEL SECURITY` on all tenant tables; set `app_user` non-owner role; execute `SET LOCAL app.current_tenant_id` per transaction. |
| **SEC-05** | **JWT Bearer Token Exposed in LocalStorage** | **HIGH** | `client/login.html:335`, `client/billing.html:11` | Migrate to `HttpOnly`, `Secure`, `SameSite=Strict` cookies with short-lived in-memory access tokens and server-rotated refresh tokens. |
| **SEC-06** | **Permissive CORS via Substring Matching** | **HIGH** | `server/src/app.ts:56-62` | Replace `.includes(...)` with exact origin whitelist (`config.CORS_ORIGIN.split(',')`) and strict hostname checks. |
| **SEC-07** | **Cross-Site WebSocket Hijacking (CSWSH) & Token Leak** | **HIGH** | `server/src/modules/websocket/websocket.routes.ts:13-22` | Authenticate WebSocket on upgrade using HttpOnly cookies; strictly validate `Origin` header; reject unauthenticated sockets immediately. |
| **SEC-08** | **59 Stored/DOM XSS Injections via `innerHTML`** | **HIGH** | `client/js/billing.js:268`, `client/js/kitchen.js:228`, `client/admin.html:2206` | Replace all `innerHTML` assignments with safe DOM construction (`document.createElement`, `textContent`) or sanitize with DOMPurify. |
| **SEC-09** | **Missing Helmet, CSP and Security Headers** | **HIGH** | `server/src/app.ts:32` | Register `@fastify/helmet` with strict Content Security Policy (`default-src 'self'`, no `'unsafe-inline'`, restricted `connect-src`). |
| **SEC-10** | **Unvalidated Route Payloads (No Schema Enforcement)**| **HIGH** | `server/src/modules/*/*.routes.ts` | Enforce Zod or Fastify JSON Schema validation on every route body, query, and parameter. |
| **SEC-11** | **Exhaustion of LocalStorage via Base64 Image Uploads** | **MEDIUM** | `client/js/settings-component.js:352` | Migrate images to IndexedDB (Dexie) or backend storage; validate image headers and strip EXIF metadata. |
| **SEC-12** | **Insecure Hotspot Mesh over Plain HTTP** | **MEDIUM** | `client/js/storage-adapter.js:480` | Document and implement secure context strategy: PWA/Bluetooth requires HTTPS or an installed Capacitor/Cordova wrapper on `192.168.43.1`. |
| **SEC-13** | **Regulatory Payment Wording ("FROSE Pay")** | **MEDIUM** | `client/js/billing.js:341`, soundbox announcements | Rename "Received on FROSE Pay" to "Marked paid (UPI)" to comply with RBI/NPCI intermediary guidelines. |
| **SEC-14** | **Hardcoded Personal Phone Numbers & Cleartext Secrets** | **LOW** | `server/src/db/memory-db.ts:20`, `client/js/settings-component.js:29` | Purge personal phone numbers and cleartext passwords; load test credentials strictly from environment variables. |

---

## 5. PHASE-BY-PHASE ACTION PLAN

### Phase 1: Security Fixes (Immediate Hardening)
1. **Auth & Credentials:**
   - Enforce mandatory strong password on registration.
   - Restrict 4-digit PIN exclusively to local terminal screen unlocking.
   - Remove the `9999999999` superadmin backdoor; implement dedicated admin credentials and audit logging.
   - Implement per-IP and per-account progressive rate limiting and lockout.
2. **Session & Tokens:**
   - Upgrade JWT dependencies to patch critical CVEs.
   - Move JWT out of `localStorage` into `HttpOnly`, `Secure`, `SameSite=Strict` cookies.
   - Implement refresh token rotation and server-side revocation ledger.
3. **HTTP & Headers:**
   - Register `@fastify/helmet` with strict CSP (no `'unsafe-inline'`).
   - Fix CORS with exact origin validation.
   - Add Zod schemas to all Fastify routes.
4. **WebSocket:**
   - Enforce strict `Origin` validation on upgrade.
   - Extract auth from HttpOnly cookie (terminate token in URL query parameter).
   - Terminate unauthenticated connections immediately.
5. **DOM Sanitization:**
   - Refactor all 59 `innerHTML` sinks to `textContent` / DOM creation helpers.

### Phase 2: Data + Offline Reliability
1. Migrate dishes, active orders, and scanner QR from `localStorage` to IndexedDB via Dexie.
2. Build an offline sync outbox with UUID v4 order IDs, idempotency keys, and exponential retry backoff.
3. Replace the sentinel purge key with versioned schema migrations.
4. Enforce integer `Number` paise on client and `BIGINT` in PostgreSQL.
5. Implement IST-synchronized daily token counter authority.
6. Address SoftAP secure context: provide Capacitor/Cordova architecture or local self-signed HTTPS guidance for PWA & Web Bluetooth support.

### Phase 3: Payments Compliance & Billing Correctness
1. Rename all soundbox and UI strings from "Received on FROSE Pay" to "Marked paid (UPI)".
2. Implement tax/rounding unit test suite for integer paise (GST inclusive/exclusive, discount allocation).
3. Add GSTIN, HSN/SAC, CGST/SGST split, sequential invoice numbers, and FSSAI number configuration.

### Phase 4: UX & Mobile POS Polish
1. Enforce minimum 44px touch targets on all stepper buttons and controls.
2. Standardize UI controls to 14px minimum font size with high-contrast sunlight visibility.
3. Add order cancel/void/refund states, item variants/notes, and Z-report daily closeouts.
4. Add multi-language i18n support (English, Hindi, Telugu, Tamil).

### Phase 5: Quality, Tests & Compliance
1. Implement Playwright E2E tests for offline billing, reconnect sync, token deduplication, and cross-tenant isolation.
2. Add automated cross-tenant RLS leak tests.
3. Add Privacy Policy, Terms of Service, and DPDP Act 2023 compliant data deletion endpoints.
4. Update `FROSE_STREET_MANUAL.md` to reflect real, hardened architecture.

---

## 6. VERIFICATION STATUS & CONCLUSION
- **Phase 0 Baseline:** Initial audit captured on `audit/security-architecture-ux-phase0` (zero app edits during Phase 0).
- **Active Branch:** `phase1/security-hardening`

### Step 1B Hardening Status (COMPLETE — Awaiting Step 1C Sign-Off)
All Step 1B server and client auth/session/crypto remediation commits are complete and verified cleanly (all credentials, phone numbers, and UPI VPAs redacted):

#### Patch 1B-1 (Server Auth, Cookie Hardening, CSRF, `jose` HS256 & Ed25519)
- `5bd7b4c` — `SEC-14-CLEANUP`: Purged remaining hardcoded VPA, password, and license secret fallbacks.
- `0d5596a` — `SEC-05-CSRF-FIX`: Enforced exact hostname `localhost` / `127.0.0.1` origin validation and rejected wildcard `*` CORS in production.
- `7b6b827` — `SEC-05-COOKIE-HARDEN`: Enforced `__Host-` prefixed HttpOnly `SameSite=Strict` cookies in production, dropped legacy cookies, and stopped leaking access/refresh tokens in JSON payloads.
- `da69fcf` — `SEC-02-WIRE-JOSE`: Wired Ed25519 (`EdDSA`) offline subscription licenses, retired legacy `@fastify/jwt` / `jwt.ts` from auth and devices, and enforced strict auth Zod schemas (`is_superadmin` stripped/rejected).
- `98d7647` — `SEC-05-COOKIE-HARDEN`: Updated login-security and superadmin unit tests for cookie-only sessions.

#### Patch 1B-2 (Client Cookie/CSRF Consolidation & Browser Ed25519 Verification)
- `3161994` — `SEC-14-CF-DELETE`: Deleted Cloudflare Pages mock catch-all auth handlers (`functions/api/[[path]].js`, `client/functions/api/[[path]].js`) and client fallback auth code in `login.html`.
- `05540e6` — `SEC-05-CLIENT-AUTH`: Added classic-script-safe `client/js/api-client.js` with `credentials: 'same-origin'`, `X-FROSE-CSRF: 1` on mutating requests, single-flight `401 -> POST /api/v1/auth/refresh -> retry` coalescing, `/login.html` redirect + session clear on refresh failure; wired across `admin.html`, `admin.js`, `menu-setup.html`, `app.js`, `billing.js`, `register.js`, `storage-adapter.js`, `login.html`, `kitchen.js`, `packaging.js`, and `index.html`; removed client HTTP `Authorization: Bearer` headers, hardcoded admin form default credentials, and disabled `/api/v1/auth/pin-login` calls.
- `52e7585` — `SEC-02-BROWSER-ED25519`: Upgraded `LicenseManager` in `client/js/storage-adapter.js` to verify Ed25519 (`EdDSA`) offline license JWTs using WebCrypto `crypto.subtle` (`importKey('spki', ...)` + `verify('Ed25519', ...)`) with `GET /api/v1/subscriptions/public-key`, failing closed on tampered/unsigned/`alg !== 'EdDSA'`/expired tokens or unavailable `crypto.subtle`.

- **Next Permitted Step:** Stopped for Project Head sign-off before starting **Step 1C** (`@fastify/helmet`, CORS rewrite, route-wide Zod schemas, WebSocket `?token=` removal).
