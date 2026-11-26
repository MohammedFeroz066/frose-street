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

- **Next Permitted Step:** Step 1B Closed & Approved (`12d18c4`).

### Step 1C Hardening Status (COMPLETE — Awaiting Step 1D Sign-Off)
All Step 1C HTTP, CORS, route validation, error sanitization, WebSocket cookie auth, and cross-tenant IDOR remediation commits are complete and verified cleanly (all secrets/PII redacted):

- `5ba8a87` — `SEC-09`: Registered `@fastify/helmet` (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, production `HSTS`) with strict `Content-Security-Policy-Report-Only` (`script-src 'self'`, `script-src-attr 'none'`, `object-src 'none'`, `frame-ancestors 'none'`). Updated `@fastify/rate-limit` `allowList` so static assets and HTML portal navigations are excluded from the 100 req/min API limit while all `/api/*` routes remain protected.
- `efc0005` — `SEC-06`: Replaced prefix/substring CORS checks with strict `URL`-parsed exact-origin allowlist (`isOriginAllowed`) using `CORS_ORIGIN`, permitting exact `http://localhost` / `http://127.0.0.1` only when `NODE_ENV !== 'production'`.
- `a3c60f6` — `SEC-10`: Enforced strict `.strict()` Zod validation (`body`, `query`, `params`) across `admin.routes.ts`, `menu.routes.ts`, `order.routes.ts`, `galla.routes.ts`, `payment.routes.ts`, `subscription.routes.ts`, and `device.routes.ts` (with `.passthrough()` + structural checks on Razorpay/Cashfree webhook stubs); removed route `as any` input casts; hardened `error-handler.ts` so `NODE_ENV === 'production'` sanitizes unexpected 500s (no stack traces, SQL errors, or file paths) and handles malformed JSON payloads cleanly with 400.
- `9a2bd31` — `SEC-07`: Rewrote `websocket.routes.ts` to authenticate strictly from HttpOnly session cookies via `session-cookies.ts` + `jwt-jose.ts` (zero production imports of legacy `jwt.ts`), reject `?token=` query authentication, validate exact `Origin` on upgrade, enforce `<= 5s` handshake timeout, and isolate connections strictly by verified `vendorId`. Removed `?token=` from `client/js/kitchen.js` and `client/js/packaging.js`.
- `916f091` — `SEC-IDOR`: Closed unauthenticated DB fallback and missing `superadmin` guard on `/api/v1/subscriptions/status`, `/api/v1/subscriptions/renew`, and `/api/v1/subscriptions/admin/vendors`; added defensive `vendor_id` filter on post-update `MenuService.updateMenuItem` re-fetch; added cross-tenant & role-enforcement regression suite (`tests/unit/sec-idor.test.ts`).

- **Public/Offline Routes Audited & Retained (Rate-Limited + Validated):** `GET /health`, `POST /api/v1/auth/register`, `POST /api/v1/auth/register-stall`, `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `POST /api/v1/auth/pin-login` (403 disabled), `POST /api/v1/auth/verify-pin` (flagged for optional future `requireAuth`/screen-lock tightening), `POST /api/v1/auth/biometric/verify`, `GET /api/v1/menu/presets`, `POST /api/v1/payments/vpa-validate`, `POST /api/v1/payments/webhook/razorpay`, `POST /api/v1/payments/webhook/cashfree`, `GET /api/v1/subscriptions/public-key`, `POST /api/v1/subscriptions/verify-token`, `POST /api/v1/devices/pair`.
- **Next Permitted Step:** Step 1C Closed & Approved (`fb137da`).

### Step 1D Hardening Status (COMPLETE — Awaiting Step 1E Sign-Off)
All Step 1D XSS remediation, event delegation, inline script/handler extraction, and enforced strict CSP commits are complete and verified cleanly (all secrets/PII redacted):

- `086ebb3` — `SEC-06-VERIFY-PIN`: Required `requireAuth` on `POST /api/v1/auth/verify-pin` using `request.user!.sub` strictly (removed untrusted `body.vendorId`), and wired progressive lockout via `LoginSecurityService` (`429 ACCOUNT_LOCKED` on repeated failures).
- `7f5d674` — `SEC-08-XSS`: Created `client/js/safe-dom.js` (`el`, `svgEl`, `clear`, `safeImageUrl`) + `client/js/safe-dom.d.ts`, enforced `safeImageUrl` (rejecting `javascript:`, `data:text/html`, protocol-relative `//`, and untrusted schemes), and eliminated all `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` sinks across `client/` (`app.js`, `billing.js`, `kitchen.js`, `packaging.js`, `register.js`, `settings-component.js`, `admin.js`, `admin.html`, `menu-setup.html`), verified by `tests/unit/sec-08-xss.test.ts`.
- `ac4fc0d` — `SEC-09-CSP-EXTRACT`: Extracted all inline `<script>` blocks into external scripts (`session-guard.js`, `login-page.js`, `index-page.js`, `billing-page.js`, `menu-setup.js`, `admin-page.js`) and replaced all 131 inline `on*=` attributes with `addEventListener` and delegated `dom-events.js` listeners across `admin.html`, `billing.html`, `index.html`, `kitchen.html`, `login.html`, `menu-setup.html`, `packaging.html`, and `register.html`, verified by `tests/unit/sec-09-csp-extract.test.ts`.
- `753b15b` — `SEC-09-CSP-ENFORCE`: Flipped `@fastify/helmet` CSP in `server/src/app.ts` from `reportOnly: true` to enforced (`reportOnly: false`, `script-src 'self'`, `script-src-attr 'none'`, no `'unsafe-inline'` or `'unsafe-eval'`), verified by `tests/unit/sec-09-helmet-csp-ratelimit.test.ts` and live Playwright Chromium click-through under enforced CSP (0 CSP violations, 0 HTTP >=400 errors, `window.__xss === undefined` across all views).

- **Next Permitted Step:** Stopped for Project Head sign-off before starting **Step 1E**.

---

### Step 1E Hardening Status (COMPLETE — Phase 1 Security Hardening Complete)
All Step 1E PostgreSQL 16 Row-Level Security (RLS), least-privilege `app_user` isolation, transaction-local `SET LOCAL` tenant context, and admin PII cache removal commits are complete and verified cleanly against live PostgreSQL 16 (`USE_MEMORY_DB=false`, all secrets/PII redacted):

- `8308ee2` — `SEC-04-ADMIN-PII`: Removed `frose_vendors_directory`, `getDynamicVendors`, `saveVendorToDirectory`, and `CLOUD_BASELINE_VENDORS` from `client/js/admin-page.js`; `/admin.html` loads vendor data strictly in memory from `/api/v1/admin/*` and wipes any leftover `frose_vendors_directory` key on load and logout (`admin-page.js`, `api-client.js`, `billing.js`), verified by `tests/unit/sec-04-admin-pii.test.ts`.
- `2e7c25d` — `SEC-04-RLS-ROLES`: Registered `011_add_is_superadmin_to_vendors` and `012_create_auth_security_tables` in `server/src/db/migrator.ts`, added `013_align_runtime_schema.ts` and `014_rls_roles_and_policies.ts` creating non-superuser `app_user` (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`, zero table ownership, no access to `kysely_migration*`), enabling `ENABLE` + `FORCE ROW LEVEL SECURITY` on all 11 tenant-scoped tables, and adding 3 minimal `SECURITY DEFINER` auth-bootstrap lookup functions (`auth_lookup_vendor_by_phone`, `auth_lookup_refresh_token`, `auth_lookup_biometric_by_credential_id`); separated `DATABASE_URL` (`app_user`) and `DATABASE_MIGRATION_URL` (owner) in `.env.example` and `server/src/db/cli.ts`.
- `9f8ef74` — `SEC-04-RLS-TXN`: Added `server/src/db/rls-context.ts` (`withTenantContext`, `withSuperadminContext`, and auth-bootstrap lookup helpers) using transaction-local `set_config(..., true)` (equivalent to `SET LOCAL`), wired all tenant and superadmin routes/services (`menu`, `orders`, `galla`, `subscriptions`, `devices`, `auth`, `admin`, `scripts/create-admin.ts`), and added `verifyRuntimeDatabaseRole()` startup guard in `server/src/db/database.ts` / `index.ts` / `app.ts` rejecting `postgres`, `rolsuper = true`, or `rolbypassrls = true` in production.
- `bffcc6e` — `SEC-04-RLS-TESTS`: Added real PostgreSQL 16 integration test suite (`tests/integration/sec-04-rls-pg.test.ts`) running migrations `001`–`014` from scratch on `frose_street_test` and verifying as `app_user`: `rolsuper = false`, `rolbypassrls = false`, 0 owned tenant tables, `relrowsecurity = true` & `relforcerowsecurity = true`, 0 rows returned with unset tenant context, cross-tenant `SELECT`/`UPDATE`/`DELETE`/`INSERT` rejection, single-connection pool isolation, startup guard enforcement, and full HTTP API isolation.
- `6c57b4f` — `SEC-04-RLS-CLIENT-SYNC`: Wired `client/js/billing.js` catalog loading & order submission to `/api/v1/menu` and `/api/v1/orders` and cleared active session caches on registration/login/logout across `register.js`, `login-page.js`, and `dom-events.js`.

#### PostgreSQL 16 Table Classification & RLS Policy Matrix
| Table | Classification | `ENABLE RLS` | `FORCE RLS` | Policy / Auth-Bootstrap Mechanism |
| :--- | :--- | :---: | :---: | :--- |
| `vendors` | Tenant-scoped (`id uuid`) | Yes | Yes | `id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. Pre-auth phone lookup via `SECURITY DEFINER` `auth_lookup_vendor_by_phone(text)`. Registration generates UUID first and runs inside `withTenantContext(newVendorId)`. |
| `staff` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. |
| `menu_items` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. |
| `orders` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. |
| `order_items` | Tenant-scoped (via `orders.id`) | Yes | Yes | `EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid) OR current_setting('app.is_superadmin', true) = 'true'`. |
| `daily_summaries` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. |
| `expenses` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. |
| `subscriptions` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. |
| `devices` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. `POST /devices/pair` verifies HMAC token first, then enters `withTenantContext(payload.v)`. |
| `biometric_credentials` | Tenant-scoped (`vendor_id uuid`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid OR current_setting('app.is_superadmin', true) = 'true'`. Pre-auth lookup via `SECURITY DEFINER` `auth_lookup_biometric_by_credential_id(text)`. |
| `refresh_tokens` | Tenant-scoped (`vendor_id varchar(64)`) | Yes | Yes | `vendor_id = NULLIF(current_setting('app.current_tenant_id', true), '') OR current_setting('app.is_superadmin', true) = 'true'`. Pre-auth hash lookup via `SECURITY DEFINER` `auth_lookup_refresh_token(text)`, then rotation/revocation inside `withTenantContext(record.vendor_id)`. |
| `login_lockouts` | Global / Auth-bootstrap | No | No | Pre-auth account/IP brute-force lockout counters (`id`, `key_type`, `key_value`). No tenant business data or PII; `app_user` granted `SELECT, INSERT, UPDATE, DELETE`. |
| `kysely_migration` / `_lock` | Internal DDL metadata | No | No | Owned by migration owner role; zero grants to `app_user`. |

- **Phase 1 Status:** **COMPLETE** (Steps 1A–1E complete).
- **Pre-Pilot Hard Gate — Fastify 5 Upgrade (COMPLETE):**
  - Upgraded `fastify` (`4.29.1` -> `5.12.8`), `@fastify/cookie` (`9.4.0` -> `11.1.5`), `@fastify/cors` (`9.0.1` -> `11.4.3`), `@fastify/helmet` (`11.1.1` -> `13.2.0`), `@fastify/jwt` (`8.0.1` -> `10.2.9`), `@fastify/rate-limit` (`9.1.0` -> `11.3.0`), `@fastify/static` (`6.12.0` -> `10.1.12`), and `@fastify/websocket` (`8.3.1` -> `11.3.7`).
  - Updated `server/src/modules/websocket/websocket.routes.ts` (`handleWsConnection` signature `(socket: WebSocket, req: FastifyRequest)` removing `connection.socket`), `server/src/app.ts` (`@fastify/static` `setHeaders` using `res.header(...)`, and removed deprecated `disableRequestLogging`).
  - `pnpm audit --prod`: **0** advisories on `fastify` or any `@fastify/*` packages (3 pre-existing high advisories on `kysely` 0.27.3 noted).
  - Verified: `pnpm exec tsc --noEmit` (exit 0), `pnpm vitest run tests/unit` (47 files / 366 tests passed), `pnpm vitest run tests/integration/sec-04-rls-pg.test.ts` (1 file / 7 tests passed against PG16 `frose_street_test` as `app_user`), and live Playwright Chromium smoke test against PG16 `frose_street` (`app_user`, port `55433`): register -> `/menu-setup.html` -> `/billing.html` order -> `/kitchen.html` live WebSocket update -> `/admin.html` superadmin load (0 CSP violations, 0 HTTP >=400 errors, 0 server log errors).
- **Phase 2: Offline Safety (COMPLETE on `phase2/offline-safety` from `bd51640`):**
  - SoftAP LAN mode (`http://192.168.x.x`) deferred to v2; implementation covers Cloud + Offline-First PWA reliability with strict CSP compliance, integer paise only, and PostgreSQL 16 `app_user` RLS.
  - **`CHORE-DEPS-CLEANUP` (`a369030`):** Removed unused `@fastify/jwt`, upgraded `kysely` (`0.27.6` -> `0.28.20`), and removed raw `token` JSON return / `frose_device_token` `localStorage` persistence from `device.routes.ts`, `client/js/kitchen.js`, and `client/js/packaging.js` (HttpOnly cookie only). `pnpm audit --prod`: **0** advisories (`No known vulnerabilities found`).
  - **`OFF-01` (`eb44607`):** Added zero-dependency vendor-scoped IndexedDB module `client/js/idb-store.js` (+ `.d.ts`) with stores `menu_items`, `orders`, `sync_outbox`, `meta`, strict integer-paise checks, and atomic `recordOfflineOrderAtomic`; migrated `storage-adapter.js`, `billing.js`, `menu-setup.js`, `settings-component.js`, and all 8 HTML shells off `localStorage` data arrays.
  - **`OFF-02` (`336181b`):** Added Migration `015_add_client_order_id_to_orders.ts` (`client_order_id VARCHAR(64)`, `created_at_client TIMESTAMPTZ`, partial unique index `uq_orders_vendor_client_order_id ON orders (vendor_id, client_order_id) WHERE client_order_id IS NOT NULL`), strict Zod + `FOR UPDATE` row lock idempotency in `OrderService.createOrder`, `SyncEngine` FIFO outbox auto-flush with Ed25519 offline license gating (`LicenseManager`), and CSP-safe `#pos-sync-status-badge` in `billing.html`.
  - **`OFF-03` (`a83513e`, `1140633`):** Added `server/src/utils/ist-date.ts` (`getIstDateString`, `normalizeDateColumnString`) for `Asia/Kolkata` (`UTC+05:30`) midnight boundaries across orders, Galla, auth, admin, and subscriptions; atomic PG16 daily token counter (`CASE WHEN token_reset_date = $today::date THEN daily_token_counter + 1 ELSE 1 END`), offline `OFF-01`/`OFF-02` temporary tokens, and PG16 `DATE`/`BIGINT` string normalization in `SubscriptionService`.
  - **`OFF-04` (`c86a2ff`, `66ec239`):** Hardened `client/sw.js` (`frose-street-v9-production-v52-offline-safety`) with full static shell/JS/CSS/icon/manifest precaching, `/api/*` network-only (`503 OFFLINE`), 3s `AbortController` navigation/static network-first timeout, clean offline fallbacks for external stylesheets and `/favicon.ico`, and removal of abort-prone `@view-transition`.
  - **`OFF-05` (`fce2766`):** Added multi-tenant logout wipe (`clearSessionStorageKeys`, `getUnsyncedOutboxCount`, `safeLogout`) clearing all 4 IndexedDB stores and session keys while prompting before discarding unsynced offline orders (`billing.js`, `index-page.js`, `dom-events.js`, `api-client.js`, `admin-page.js`, `login-page.js`, `register.js`).
  - **Verification (`0db596a` + live run):**
    - `pnpm audit --prod`: `No known vulnerabilities found`.
    - `pnpm exec tsc --noEmit`: exit `0`.
    - `pnpm vitest run tests/unit`: **53 files / 383 tests passed**.
    - `pnpm vitest run --no-file-parallelism tests/integration/sec-04-rls-pg.test.ts tests/integration/off-02-idempotency-pg.test.ts`: **2 files / 9 tests passed** against PostgreSQL 16 as non-superuser `app_user` (`NOBYPASSRLS`).
    - Live Playwright Chromium (`390x844`) end-to-end against fastify dev server + PG16 `frose_street` (`app_user`, port `55433`): Vendor A (`972****731`) register -> `/menu-setup.html` dish creation -> `/billing.html` active SW + verified Ed25519 license (`active`, `15` days remaining, `9` cached items) -> `offline` reload + 2 offline Cash orders (`OFF-01`, `OFF-02`, badge `Offline — 2 pending`) + 2nd offline reload -> `online` auto-flush (`0` pending, `2` synced, badge `Online`) -> `/kitchen.html` (`2` live orders) -> duplicate `clientOrderId` POST idempotency (`2` history rows) -> logout wipe (`menu_items: 0, orders: 0, sync_outbox: 0, meta: 0`). Browser console errors: `0`, page errors: `0`, CSP violations: `0`, unexpected HTTP errors: `0`, server log errors (`level>=40`): `0`.
- **Phase 3: PWA Polish, India GST/FSSAI Compliance & Honest Billing (COMPLETE on `phase3/billing-india-basics` from `e0c5100` — Pilot Launch Gate Complete):**
  - **`PWA-HARDEN` (`bb6be3b`):** Added silent `navigator.storage?.persist?.()` (`requestPersistentStorage`) and monotonic `lastSeenAt` clock-rollback detection (`recordLastSeenAt`, `checkClockRollback`, failing closed with `CLOCK_ROLLBACK_DETECTED` if `Date.now() < lastSeenAt - 60000`) across `client/js/idb-store.js` and `client/js/storage-adapter.js` (`LicenseManager.verifyLicense`, `SyncEngine.verifyOfflineLicense`); updated `client/sw.js` (`frose-street-v9-production-v53-phase3-billing`, `SKIP_WAITING` message listener) and `client/js/billing.js` with CSP-safe **"New update ready — Tap to reload"** banner (`updatefound` / waiting worker).
  - **`IND-01` (`4e37f27`):** Added Migration `016_add_vendor_compliance_fields.ts` (`tax_mode` CHECK in `('unregistered', 'composition', 'regular')`, `gstin`, `fssai_number`, `gst_rate_bps`, `stall_address`) preserving `app_user` RLS policies and grants; added strict `.strict()` Zod validation (`UpdateVendorProfileSchema`) on `PATCH /api/v1/auth/profile` (uppercase-normalized 15-char GSTIN required for `'composition'`/`'regular'`, exact 14-digit FSSAI, integer slabs `0|500|1200|1800` forced to `0` when `taxMode !== 'regular'`); added compliance controls in Settings (`client/billing.html`, `client/index.html`, `client/js/settings-component.js`).
  - **`IND-02` (`a872314`):** Added Migration `017_add_order_tax_and_receipt_fields.ts` (`receipt_number` with unique partial index `uq_orders_vendor_receipt_number`, `subtotal_paise`, `cgst_paise`, `sgst_paise`, `tax_mode_snapshot`, `cancel_reason`); added pure integer-paise `calculateOrderTax` (`server/src/utils/tax-calculator.ts`, zero floats / zero 1-paise drift), atomic IST Financial Year receipt numbering (`getIndianFinancialYearCode` / `formatReceiptNumber` in `server/src/utils/ist-date.ts`), and mandatory `reason` (`min 3 chars`) when cancelling/voiding via `PATCH /api/v1/orders/:id/status`.
  - **`IND-03` (`62d4d89`):** Audited all `client/` text and enforced honest manual UPI confirmation (**"Customer Paid via UPI (Confirm on Soundbox/App)"** + explicit confirmation checkbox on `#upi-qr-modal` and `"Marked paid (UPI)"` labels); built CSP-safe `client/js/receipt-view.js` (`FroseReceiptView` via `FroseSafeDom`) + `#receipt-modal`, `#order-history-modal`, `#void-order-modal`, and `@media print` 58mm/80mm thermal layout in `client/billing.html` & `client/js/billing.js` with statutory headers (`CASH MEMO` / `BILL OF SUPPLY` + Composition declaration / `TAX INVOICE` + CGST & SGST), GSTIN, 14-digit FSSAI, FY Receipt No, IST timestamp, **Print Receipt**, and **Copy Bill Text (WhatsApp)**.
  - **Verification:**
    - `pnpm exec tsc --noEmit`: exit `0`.
    - `pnpm vitest run tests/unit`: **57 files / 397 tests passed**.
    - `pnpm vitest run --no-file-parallelism tests/integration/sec-04-rls-pg.test.ts tests/integration/off-02-idempotency-pg.test.ts tests/integration/ind-phase3-pg.test.ts`: **3 files / 10 tests passed** against PostgreSQL 16 as non-superuser `app_user` (`NOBYPASSRLS`).
    - Live Playwright Chromium (`390x844`) on Fastify 5 + PG16 `frose_street` (`app_user`, port `55433`): Register stall (`97****49`) -> Settings Regular GST (`36AABCU9603R1ZM`, `5%`, FSSAI `23626001000123`, stall address) + reload persistence -> Cash order (`FS-2627-0001`, `6000 + 150 CGST + 150 SGST = 6300` paise) & `TAX INVOICE` receipt -> switch to `composition` + UPI order with manual Soundbox/App confirmation (`FS-2627-0002`, `6000` paise, `0` tax) & `BILL OF SUPPLY` receipt -> void order `#2` (`"Customer changed mind"`) persisted in PG16. Console errors: `0`, page errors: `0`, CSP violations: `0`, unexpected HTTP >=400 errors: `0`, horizontal overflow: `0px`, server log errors (`level>=40`): `0`.
- **Next Permitted Step:** Phase 3 Closed & Merged to `master` (`2bcfc27`).
- **Phase 4: Production SaaS UI/UX Overhaul, Themes & Complete Daily Operations (COMPLETE on `phase4/saas-ui-ux-overhaul`):**
  - **Step 0 (`master` Sync & Gate Rule):** Fast-forward merged verified `2bcfc27` into `master` and pushed `origin/master` (`2bcfc279346549b6f163b991269ae9233c582d18`); recorded permanent `master` branch merge/push gate in `AGENTS.md` (`1208580`).
  - **`UX-01` (`036b8e5`):** Added idempotent Migration `018_phase4_orders_menu_enhancements.ts` (`orders.cash_paise`, `orders.upi_paise`, `orders.edited_at`, `orders.edit_note`, `'split'` payment method constraint, `menu_items.is_veg`, `menu_items.variants_json`) preserving `app_user` grants and `FORCE ROW LEVEL SECURITY`. Added `PUT /api/v1/orders/:id` (atomic item/note/payment edit, tax recalculation, `order:updated` WS broadcast), enhanced split Cash+UPI accounting in `OrderService` and `GallaService`, added IST filtered `GET /api/v1/orders/history` + filtered summary totals, and extended menu Zod `.strict()` schemas for `isVeg` and `variants`. Verified by `ux-01-orders-menu-enhancements.test.ts` and `ux-01-pg.test.ts`.
  - **`UX-02` (`26f4bb5`):** Created semantic design tokens & 3 instant themes (`light`, `dark`, `sunlight`) in `client/css/tokens.css`, responsive line-free SaaS component system in `client/css/ui-kit.css` (`48px` tap targets, `tabular-nums`, mobile 5-tab bottom bar + `>=1024px` sidebar rail, Dynamic Island cart, sheets, drawers, KPIs, switches, skeletons, toasts), zero-flash `client/js/theme.js`, and 100% CSP-safe `client/js/ui-components.js` (`FroseUI` using `FroseSafeDom`). Verified by `ux-02-design-system.test.ts`, `sec-08-xss.test.ts`, and `sec-09-csp-extract.test.ts`.
  - **`UX-03` (`9bcb507`):** Rebuilt `client/billing.html`, `client/css/workspace.css`, `client/js/billing.js`, and `client/js/billing-page.js` into a unified 5-tab Vendor SaaS Workspace (`Bill`, `Orders`, `Menu`, `Payments`, `Settings`), desktop split-pane live Cart, mobile Dynamic Island cart pill, Half/Full/Custom variant picker sheet, Dine-In/Parcel toggle, Cash quick-tender (`Exact`/`₹50`/`₹100`/`₹200`/`₹500` + Change Due), honest UPI QR (`"Customer Paid via UPI (Confirm on Soundbox/App)"` / `"Marked paid (UPI)"`), Split (Cash + UPI) calculator, and statutory receipt + WhatsApp bill copy, while preserving 100% of Phase 2 offline billing (`idb-store.js`, `SyncEngine`, Ed25519 + clock-rollback guard) and Phase 3 SW update banner (`client/sw.js`).
  - **`UX-04` (`4ce51c2`):** Built `client/js/orders-panel.js` (Active vs History IST presets & date range, payment/status filters, search, summary totals, Order Detail Drawer, Live Edit Order sheet calling `PUT /api/v1/orders/:id` + `order:updated` sync, statutory receipt & void flow) and `client/js/payments-panel.js` (4 Galla KPIs, Cash vs UPI split bar, filterable ledger, `+ Add Expense` sheet, `Close Day / Z-Report` cash variance drawer).
  - **`UX-05` (`55f08e2`):** Built `client/js/menu-panel.js` (instant search, category filter chips, `+ Category`, `+ Add Item` with `Veg/Non-Veg`, `Variants`, and safe-URL live image preview, optimistic Available/Sold-Out toggles) and grouped 6-card Settings Hub in `client/js/settings-component.js` (Stall Profile + GST/FSSAI compliance, UPI QR upload/preview, 3-card Theme switcher, Kitchen/Packaging QR Pairing modal + Revoke devices, 4-digit PIN setup, Offline/Sync health & Safe Logout), synced onto `/menu-setup.html`.
  - **`UX-06` (`1fc355b`):** Added `client/css/portals-saas.css` and upgraded `kitchen.html`/`kitchen.js` (default Obsidian Dark, `<5m`/`5-10m`/`>10m` SLA timer pills, `Start Cooking`, `PARCEL`/`EDITED` badges, live `order:updated`), `packaging.html`/`packaging.js` (`PARCEL`/`EDITED` badges, live `order:updated`), `login.html`, `register.html`, `admin.html`/`admin-page.js` (theme toggle, slide-over Vendor Inspector Drawer with `+30d` license renewal, zero `localStorage` vendor PII caching), `theme.d.ts`, `ui-components.d.ts`, and `client/sw.js` precache (`frose-street-v9-production-v54-phase4-ux`).
  - **Verification:**
    - `pnpm exec tsc --noEmit`: exit `0`.
    - `pnpm vitest run tests/unit`: **59 files / 405 tests passed**.
    - `pnpm vitest run --no-file-parallelism tests/integration/sec-04-rls-pg.test.ts tests/integration/off-02-idempotency-pg.test.ts tests/integration/ind-phase3-pg.test.ts tests/integration/ux-01-pg.test.ts`: **4 files / 11 tests passed** against PostgreSQL 16 as non-superuser `app_user` (`NOBYPASSRLS`).
    - Live Playwright Chromium verification on Fastify 5 + PG16 (`app_user`, port `55433`) across `390x844` mobile & `1280x800` desktop and all 3 themes (`light`, `dark`, `sunlight`): Vendor onboarding (`911****333`) -> theme cycling & persistence (`0px` overflow across all 3 themes on mobile & desktop) -> Menu Veg + Half/Full variants + optimistic Sold Out toggle -> Bill Full variant + Dynamic Island + Split Cash ₹50 + UPI ₹60 + Statutory Receipt modal -> Kitchen KDS (`/kitchen`) live ticket + Orders Tab Live Edit (`PUT /api/v1/orders/:id`) -> KDS live `order:updated` (`3x`, `EDITED` badge, `0px` overflow) -> Payments Tab KPIs (`₹390` Net Sales, `₹280` UPI, `₹200` Expense added live) -> Settings Profile/Composition/FSSAI & Kitchen QR Pairing modal -> Offline reload (`Offline — 0 pending`) & `OFF-01` Cash bill syncing back online -> Packaging (`/packaging`, `2` orders, `0px` overflow) -> Super Admin (`998****655`, `/admin` `1280x800`: KPI cards, search, slide-over Vendor Inspector Drawer, +30d license renewal, `frose_vendors_directory === null`). Console errors: `0`, page errors: `0`, CSP violations: `0`, unexpected HTTP >=400 responses: `0`, server log errors (`level>=40`): `0`.
  - **Phase 4 Visual & UX Polish Patch (`acad1e2`, `8a55eb6`, `b941b4d`, `20bb55d`):**
    - **`UX-FIX-01` (`acad1e2`, `20bb55d`):** Fixed KDS & Packaging dark/light/sunlight contrast via explicit semantic tokens in `client/css/portals-saas.css`; fixed `PARCEL` vs. `DINE-IN` end-to-end with Migration `019_add_order_type_to_orders.ts` (`orders.order_type`), `normalizeOrderType` in `order.service.ts`, strict Zod `orderType` in `order.routes.ts`, and `billing.js`/`storage-adapter.js`/`kitchen.js`/`packaging.js` sync (regression tested in `tests/unit/ux-fix-01-parcel-qr.test.ts`); replaced all `api.qrserver.com` calls with 100% local offline CSP-safe QR generator `client/js/qr-local.js` precached in `client/sw.js` (`frose-street-v9-production-v55-phase4-ux-polish`).
    - **`UX-FIX-02` (`8a55eb6`):** Styled `.saas-drawer-panel` with solid opaque `var(--bg-elevated)` surface & `44x44px` close button, normalized Postgres `DATE`/`TIMESTAMPTZ` expiry strings (`"No active expiry"` fallback) and non-zero plan pricing in `admin-page.js` & `admin.service.ts`, added row-click to open Vendor Inspector Drawer, and included `split` orders in `Platform Gross Volume` Cash/UPI breakdown.
    - **`UX-FIX-03` (`b941b4d`):** Auto-hid `#pos-floating-cart-pill` on empty cart and added `148px` mobile grid bottom padding when cart is non-empty; moved `.saas-toast-stack` to bottom (`84px` / `144px` above cart pill on mobile, `24px` bottom-right on desktop); refactored Menu Manager rows to 2-row `.pos-menu-row-card` with `>=44x44px` actions; fixed `1280x800` 4-column dish card inline stepper clipping & `390x844` header breathing room; enforced `>=44x44px` tap targets (`#btn-toggle-password`, `#btn-add-variant-row`, sheet `✕` buttons, `#split-upi-confirm-check` label), compact mobile Cash Checkout Sheet (`Change Due` + `Pay Cash` visible without scroll), and non-negative `#zreport-counted-cash` default in `payments-panel.js`.
    - **Polish Verification:** `pnpm exec tsc --noEmit` (exit `0`), `pnpm vitest run tests/unit` (**60 files / 408 tests passed**), sequential PG16 (`app_user`) integration tests (**4 files / 11 tests passed**), and live Playwright Chromium verification on Fastify 5 + PG16 (`app_user`, `390x844` & `1280x800`): **50/50 checks passed**, `0` console errors, `0` page errors, `0` CSP violations, `0` HTTP `>=400` errors, `0` broken images, `0px` horizontal overflow, `0` external `api.qrserver.com` calls.
- **Next Permitted Step:** **Phase 4 COMPLETE (Gate Stop).** Commit verified locally on `phase4/saas-ui-ux-overhaul`; awaiting explicit Project Head approval before merging/pushing to `master` or starting Phase 5.
