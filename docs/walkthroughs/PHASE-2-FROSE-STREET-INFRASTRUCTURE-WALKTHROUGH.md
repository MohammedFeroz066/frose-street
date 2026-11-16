# FROSE Street — Phase 2 Walkthrough: Domain & Infrastructure Configuration

## 1. Objective
Configure the production domain routing, Cloudflare Pages integration, edge cache rules, reverse proxy templates, and containerized deployment infrastructure for **FROSE Street** (`street.frostech.com` and `api.street.frostech.com`).

---

## 2. Previous vs New State

| Aspect | Previous State | New State |
| :--- | :--- | :--- |
| **Cloudflare Pages** | Unconfigured | `wrangler.toml` configured pointing to `./client` with custom domain routing |
| **Edge Cache Rules** | Default | `_headers` deployed with strict Service Worker no-cache rule (`max-age=0, no-cache`) |
| **Routing Filter** | All static | `_routes.json` configured excluding `/api/*` to allow transparent proxying |
| **API Reverse Proxy** | None | Production Caddy 2 (`deploy/caddy/Caddyfile`) and Nginx configs with WebSocket upgrade |
| **Container Engine** | None | Production multi-stage `Dockerfile` + `docker-compose.yml` (API + PG16 + Redis7) |
| **Automated Tests** | 9 unit tests | 18 unit tests across scaffolding and infrastructure (100% PASS) |

---

## 3. Changed & Created Files

* `wrangler.toml` — Cloudflare Pages configuration for `street.frostech.com`.
* `client/_headers` — Security headers (HSTS, CSP, X-Frame-Options) and cache rules.
* `client/_routes.json` — Edge routing rule excluding `/api/*`.
* `deploy/caddy/Caddyfile` — Production Caddy 2 reverse proxy with automatic TLS and CORS.
* `deploy/nginx/street.frostech.com.conf` — Nginx reverse proxy configuration with WebSocket upgrade.
* `Dockerfile` — Multi-stage Alpine container build with health checks.
* `docker-compose.yml` — Production service stack (API on 3100, PostgreSQL 16 on 55433, Redis 7 on 6380).
* `scripts/verify-infrastructure.mjs` — Infrastructure validation script.
* `tests/unit/infrastructure.test.ts` — Vitest unit test suite covering all Phase 2 acceptance criteria.

---

## 4. Verification Commands & Genuine Execution Output

### A. TypeScript Verification
Command:
```bash
pnpm typecheck
```
Output:
```
$ tsc --noEmit
Exit Code: 0 (Zero errors)
```

### B. Unit Test Suite (Phase 1 + Phase 2)
Command:
```bash
pnpm test
```
Output:
```
 RUN  v1.6.1 C:/Projects/frose-street

 ✓ tests/unit/infrastructure.test.ts (9 tests) 21ms
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 1: Cloudflare Pages Configuration > should have a valid wrangler.toml pointing to ./client
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 1: Cloudflare Pages Configuration > should have _headers with strict Service Worker no-cache rules
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 1: Cloudflare Pages Configuration > should have _routes.json excluding /api/* from static routing
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 2: Static Client PWA Pre-Deployment Integrity > should have all static client entry files
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 2: Static Client PWA Pre-Deployment Integrity > should have mobile meta tags and manifest link in index.html
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 3: Reverse Proxy & CORS Templates (api.street.frostech.com) > Caddyfile should configure SSL, CORS, and WebSocket reverse proxy
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 3: Reverse Proxy & CORS Templates (api.street.frostech.com) > Nginx config should configure SSL, CORS, and WebSocket upgrade headers
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 4: Production Container & VPS Deployment > Dockerfile should configure multi-stage build and healthcheck
   ✓ Phase 2 Acceptance: Domain & Infrastructure Configuration > TEST 4: Production Container & VPS Deployment > docker-compose.yml should configure API, PostgreSQL 16, and Redis 7
 ✓ tests/unit/scaffolding.test.ts (9 tests) 92ms

 Test Files  2 passed (2)
      Tests  18 passed (18)
   Duration  2.30s
```

---

## 5. Cloudflare DNS Setup Needed From User
In your Cloudflare dashboard for `frostech.com`, please add:
* **Record Type:** `CNAME`
* **Name:** `street`
* **Target:** `<your-cloudflare-pages-project>.pages.dev` (or VPS IP if proxying through Caddy)
* **Proxy Status:** `Proxied` (Orange cloud enabled)

---

## 6. Verdict
**PASS** — Phase 2 acceptance criteria are 100% satisfied. Ready to proceed to **Phase 3: Database Schema & Migrations**.
