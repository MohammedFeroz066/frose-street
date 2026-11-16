# FROSE Street — Phase 4 Walkthrough: Fastify Server Core & Middleware

## 1. Objective
Build the production application server core for **FROSE Street**, implementing RFC 7807 structured JSON error handling, rate limiting middleware (100 req/min per IP), request duration timing (`X-Response-Time`), WebSocket server registration, and graceful shutdown handlers.

---

## 2. Previous vs New State

| Aspect | Previous State | New State |
| :--- | :--- | :--- |
| **Error Format** | Raw Fastify JSON errors | RFC 7807 Problem Details (`type`, `title`, `status`, `detail`, `code`, `timestamp`) |
| **Error Handling** | Default | Custom `AppError` class with factory methods for 400, 401, 403, 404, 409, 429, 500 |
| **Rate Limiting** | None | `@fastify/rate-limit` active (100 req/min with structured 429 payload) |
| **Request Timing** | None | `X-Response-Time` header automatically calculated and injected on every response |
| **Server Lifecycle** | Basic process exit | Clean `SIGTERM`/`SIGINT` graceful shutdown closing HTTP, WebSockets, and database pools |
| **Unit Test Suite** | 25 tests | 33 tests across 4 test suites (100% PASS) |

---

## 3. Changed & Created Files

* `package.json` — Added `@fastify/rate-limit`.
* `server/src/errors/app-error.ts` — RFC 7807 `AppError` class with status codes and problem details serialisation.
* `server/src/middleware/error-handler.ts` — Global `errorHandler` and `notFoundHandler` mapping errors to RFC 7807 JSON.
* `server/src/app.ts` — Fastify application factory integrating Rate Limiter, Timing Hook, WebSockets, and CORS.
* `server/src/index.ts` — Process lifecycle and graceful shutdown handling (`SIGINT`, `SIGTERM`).
* `tests/unit/server-core.test.ts` — Vitest unit test suite covering all Phase 4 acceptance criteria.

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

### B. Unit Test Suite (Phases 1 through 4)
Command:
```bash
pnpm test
```
Output:
```
 RUN  v1.6.1 C:/Projects/frose-street

 ✓ tests/unit/infrastructure.test.ts (9 tests) 54ms
 ✓ tests/unit/database-migrations.test.ts (7 tests) 61ms
 ✓ tests/unit/server-core.test.ts (8 tests) 250ms
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 1: Server Health & Metadata > GET /health returns 200 with ok status, uptime, version, and portals
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 2: RFC 7807 Structured Error Handling > invalid route returns 404 with RFC 7807 problem details JSON
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 2: RFC 7807 Structured Error Handling > custom AppError returns corresponding status and RFC 7807 JSON
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 2: RFC 7807 Structured Error Handling > unhandled error returns 500 RFC 7807 problem details
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 3: CORS Headers & Security > responds with CORS headers for allowed origin
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 4: Timing & Middleware Headers > sets X-Response-Time header on responses
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 5: Rate Limiting (429 Too Many Requests) > exceeding rate limit returns 429 Too Many Requests with RFC 7807 JSON
   ✓ Phase 4 Acceptance: Fastify Server Core, Health & Middleware > TEST 6: Graceful Shutdown > app closes cleanly without dangling handles
 ✓ tests/unit/scaffolding.test.ts (9 tests) 89ms

 Test Files  4 passed (4)
      Tests  33 passed (33)
   Duration  4.56s
```

---

## 5. Security & Traffic Protection
* **RFC 7807 Standard:** All error responses avoid leaking internal stack traces in production.
* **Denial-of-Service Defense:** IP rate limiting triggers 429 responses after 100 requests in 1 minute.
* **Strict Origin CORS:** Requests from `https://street.frostech.com` receive verified credentials headers.

---

## 6. Verdict
**PASS** — Phase 4 acceptance criteria are 100% satisfied. Ready to proceed to **Phase 5: Authentication — OTP Login & JWT**.
