# Walkthrough: Login Security, Quick PIN Removal & Progressive Lockout

## 1. Objective
Harden authentication security on `street.frosetech.com`:
1. Remove 4-digit quick PIN completely from UI and portals to eliminate brute-force vulnerability.
2. Remove "New stall? Register Stall in 60s" from the login page, restricting stall creation exclusively to Super Admin.
3. Add a show/hide password eye icon on the login form to mask/unmask typed passwords.
4. Return precise error feedback:
   - Non-existent mobile: `"Account does not exist with this mobile number"` (HTTP 404).
   - Incorrect password: `"Password incorrect. Please check and try again"` with remaining attempts (HTTP 401).
5. Enforce stepped lockout for consecutive failed passwords:
   - 3 consecutive failures: 1-minute (60 seconds) lockout.
   - Live visual countdown timer on the UI with inputs and submit button disabled until 00:00.
   - Subsequent repeated failures scale progressively (300s / 900s).

---

## 2. Changes Made

### A. Backend Security Services
- **`server/src/modules/auth/login-security.service.ts`**:
  - Implemented `LoginSecurityService` with in-memory thread-safe tracking of consecutive failed attempts per phone number.
  - Stepped backoff: 3 fails $\rightarrow$ 60s, 4 fails $\rightarrow$ 300s (5m), 5+ fails $\rightarrow$ 900s (15m).
  - Provides `checkLock(phone)`, `recordFailedAttempt(phone)`, `recordSuccess(phone)`, and `resetForTesting()`.
- **`server/src/errors/app-error.ts`**:
  - Added optional `retryAfter?: number` property.
  - Updated `toProblemDetails()` and `AppError.rateLimited()` to serialize `retryAfter`.
- **`server/src/middleware/error-handler.ts`**:
  - Emits standard `retry-after: <seconds>` HTTP header when `error.retryAfter` is set on `AppError`.
- **`server/src/modules/auth/auth.service.ts`**:
  - Updated `loginWithPassword()` to:
    1. Check `LoginSecurityService.checkLock(phone)` before querying the database; returns 429 if locked.
    2. Validate phone existence: throws `AppError.notFound('Account does not exist with this mobile number', 'ACCOUNT_NOT_FOUND')` if not found.
    3. Verify password: on mismatch, records failed attempt. If threshold reached, throws 429 with lockout seconds; otherwise throws 401 with remaining attempts.
    4. Resets security counter upon successful authentication.

### B. Frontend UI & Experience
- **`client/login.html`**:
  - Completely refactored into a single focused Mobile & Password form.
  - Removed "4-Digit Quick PIN" tab and numpad keypad.
  - Removed "New stall? Register Stall in 60s" link.
  - Added `#btn-toggle-password` eye icon button toggling input type between `password` and `text`.
  - Added `startLockoutCountdown(seconds)`: disables `#login-phone`, `#login-password`, and `#btn-submit-pwd`, rendering a live 1-second countdown in the alert banner (`⏳ Too many failed attempts. Account locked. Try again in MM:SS`).
- **`client/index.html` & `client/js/app.js`**:
  - Removed `#btn-open-pin`, `#btn-footer-pin`, and `#pin-modal` overlay from DOM.
  - Removed numpad listeners and legacy PIN modal handlers from `app.js`.

---

## 3. Verification & Evidence

### Test Execution
- **TypeScript**: `pnpm exec tsc --noEmit` $\rightarrow$ **0 errors**.
- **Unit & Integration Tests**: `pnpm test` $\rightarrow$ **23 passed test files, 272 passed tests (100% pass rate)**.
- **Dedicated Test File**: `tests/unit/login-security.test.ts` $\rightarrow$ **9 passed tests**.

### Live Playwright Verification Evidence
| Flow | Result | Screenshot Evidence |
| :--- | :--- | :--- |
| **Clean Login Page** | Quick PIN & Register links removed | `docs/evidence/01_login_security_clean.png` |
| **Masked Password** | Dots displayed in password field | `docs/evidence/02_password_masked.png` |
| **Eye Icon Toggle** | Password plain text toggled | `docs/evidence/03_password_revealed.png` |
| **Unknown Mobile** | `"❌ Account does not exist with this mobile number"` | `docs/evidence/04_account_not_found.png` |
| **Wrong Password** | `"❌ Password incorrect. Please check and try again (2 attempts remaining)"` | `docs/evidence/05_password_incorrect_attempt1.png` |
| **3-Fail Lockout** | `"⏳ Too many failed attempts. Account locked. Try again in 00:55"` with fields disabled | `docs/evidence/06_account_locked_countdown.png` |

---

## 4. Security & Architecture Impact
- Eliminates brute-force attacks against 4-digit PINs.
- Centralizes stall creation to Super Admin portal (`/admin`).
- Implements standard RFC 7807 problem details and `Retry-After` HTTP headers.
- Integer paise financial protections and RLS remain 100% intact.

## 5. Verdict
**PASS**
