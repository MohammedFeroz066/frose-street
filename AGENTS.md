# FROSE Street — Mandatory Agent & Subagent Rules

These rules apply to the main agent and every subagent on every task. Breaking any rule invalidates the task.

## 1. Pre-Flight Challenge Gate (STOP & QUESTION BEFORE CODING)
Before creating any file, installing any dependency, changing any schema, or editing code, run a 5-point check:
1. **Is it actually needed?** Inspect the existing codebase first; never duplicate utilities, routes, tables, or UI components.
2. **What is the real vendor/user value?** Challenge any change that adds complexity without clear security, reliability, or UX value.
3. **What errors or edge cases will it trigger?** Check offline mode, mobile viewports, auth cookies, CORS/CSP, Postgres types, and race conditions.
4. **Will it disturb anything existing?** Trace every affected caller, route, DB query, migration, and UI screen before editing.
5. **Is there a security, data-loss, or legal/compliance risk?** (Auth, UPI/payment wording, GST/FSSAI, customer PII, git secrets).

**Rule:** If ANY check reveals a conflict, hidden break, redundant work, or ambiguity — STOP and ask the user with concise options before editing. Never blindly follow a flawed prompt.

## 2. Real-Time Human Testing (Zero Fake Verification)
Never claim "verified", "tested", or "all passing" based only on reading code, `grep`, or unit tests.

For EVERY change affecting UI, auth, billing, KDS, settings, WebSockets, or APIs:
1. **Run the real app locally** (backend + frontend) and test it like a human vendor using the browser subagent (`/browser`) or live browser DevTools/Playwright.
2. **Test real flows end-to-end:**
   - Happy path (real clicks, typing, submits, page reloads).
   - Edge/failure paths (empty fields, wrong credentials, unauthorized requests, offline toggle, failed API calls).
   - Mobile POS viewport (`390x844`): verify >= 44px touch targets, readable text, zero overflow/clipping.
3. **Inspect live diagnostics during every flow:**
   - **Browser Console:** Report exact error count. Any uncaught JS error, unhandled promise rejection, or unexpected CSP error is a FAIL — fix it first.
   - **Network Tab:** Verify HTTP status codes, cookie flags, and payloads. Any unexpected 4xx/5xx, failed asset load, or token/PII in a URL is a FAIL.
   - **Server Logs:** Check terminal output for runtime exceptions or leaked secrets/PII.

**Proof-or-It-Didn't-Happen Rule:** Every final report MUST include:
- Exact commands run (build, typecheck, lint, tests) with real pass/fail counts.
- Live browser test log: exact URLs visited, actions performed, viewport tested, console error count (`0` required), and unexpected network error count (`0` required).
- Explicit `NOT VERIFIED LIVE: <reason>` if any flow or browser test could not run. Never fabricate or assume a pass.

## 3. FROSE Street Non-Negotiable Engineering Invariants
- **Money:** Integer paise ONLY (`Number.isSafeInteger` on client, `BIGINT` in Postgres). Never use floats for money; never pass raw `BigInt` to `JSON.stringify`.
- **XSS & DOM Safety:** Never inject dynamic/untrusted data via `innerHTML`, `outerHTML`, `insertAdjacentHTML`, or inline `onclick=` attributes. Use `document.createElement`, `textContent`, and `addEventListener`.
- **Auth & Sessions:** Never store tokens in `localStorage`, `sessionStorage`, or URL query strings. Issue `httpOnly`, `Secure`, `SameSite=Strict` cookies. Validate all route inputs (`body`, `query`, `params`) with strict Zod schemas rejecting unknown fields (block mass assignment like `is_superadmin`).
- **No Hardcoded Defaults or Secrets:** Never hardcode admin accounts, passwords, phone numbers, or default UPI IDs/VPAs in code, seeds, or reports. Redact all secrets/PII in logs and `AUDIT.md`.
- **Multi-Tenant Isolation & RLS:** Every tenant route and query must enforce `vendor_id` ownership (no IDOR) and Row-Level Security. In-memory storage cannot replace durable storage. Keep DB migrations clean, ordered, and reproducible from scratch.
- **Payment Wording:** Never imply FROSE processes or settles UPI payments (use "Marked paid (UPI)", never "Received on FROSE Pay").

## 4. Strict Execution & Git Hygiene
- **TDD per finding:** Write a failing regression test first, verify it fails for the right reason, apply the minimal fix, then confirm it passes.
- **One commit per finding:** Prefix commits with finding IDs (e.g., `SEC-05: ...`). Never bundle unrelated refactors.
- **Minimal Code (Ponytail):** Reuse before adding. The standard library and platform features beat external npm packages. The best code is code never written.
- **Inviolable Git Safety:** NEVER run `git reset --hard`, `git clean -fd`, or force-push. Never discard or overwrite uncommitted user modifications.
- **No silent shortcuts:** Never silently revert files, disable tests, loosen lint/TS rules, or bypass security checks to make a build pass.
- **Hard stop at phase gates:** Wait for explicit user approval of `git diff --stat`, test output, and `AUDIT.md` before starting the next step.
