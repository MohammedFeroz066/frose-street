# Report: Login Security, Quick PIN Removal & Progressive Lockout

## Executive Summary
This release completes the security hardening requested for FROSE Street (`street.frosetech.com`):
1. **Quick PIN Eliminated**: Removed 4-digit quick PIN inputs and modals from all portal pages and login screens to permanently prevent brute-force attacks.
2. **Centralized Stall Onboarding**: Removed self-service stall registration links from login screen. Stall creation is now strictly restricted to Super Admin (`/admin`).
3. **Password Visibility Toggle**: Added an eye icon in the password field allowing users to inspect or mask their input.
4. **Descriptive Credential Feedback**:
   - Unknown mobile number $\rightarrow$ 404 `"Account does not exist with this mobile number"`.
   - Wrong password $\rightarrow$ 401 `"Password incorrect. Please check and try again (X attempts remaining)"`.
5. **Stepped Lockout & Live UI Countdown**:
   - 3 consecutive failed password attempts trigger a 60-second lockout.
   - The UI disables all inputs and submit buttons, displaying a real-time countdown timer (`⏳ Too many failed attempts. Account locked. Try again in 00:59`).
   - Further repeated failures step up to 300 seconds (5 mins) and 900 seconds (15 mins).

---

## Acceptance Criteria Matrix

| Requirement | Implementation Details | Status |
| :--- | :--- | :--- |
| **Remove 4-Digit Quick PIN** | Deleted Quick PIN tab and keypad from `login.html`, `#btn-open-pin` and `#pin-modal` from `index.html`, and cleaned `app.js` | **PASS** |
| **Remove Stall Self-Registration** | Removed "New stall? Register Stall in 60s" link from `login.html` and register link from `index.html` footer | **PASS** |
| **Show/Hide Password Eye Icon** | Added `#btn-toggle-password` with `#icon-eye-show` / `#icon-eye-hide` SVGs in `login.html` | **PASS** |
| **Account Not Exist Feedback** | Backend returns HTTP 404 with detail `"Account does not exist with this mobile number"` | **PASS** |
| **Password Incorrect Feedback** | Backend returns HTTP 401 with detail `"Password incorrect. Please check and try again (X attempts remaining)"` | **PASS** |
| **3-Fail 1-Minute Lockout** | `LoginSecurityService` locks account for 60s upon 3 failures, returning HTTP 429 with `Retry-After: 60` | **PASS** |
| **Live UI Countdown Timer** | `startLockoutCountdown()` renders live ticking timer and disables input fields and submit button until timer reaches 00:00 | **PASS** |
| **Stepped Lockout Escalation** | 4th failure $\rightarrow$ 300s (5m); 5th+ failure $\rightarrow$ 900s (15m) | **PASS** |
| **Success Reset** | Valid password login resets security counters and unlocks immediately | **PASS** |
| **Zero Test Regressions** | 23/23 test files passed, 272/272 tests passed, 0 TypeScript errors | **PASS** |

---

## Test & Verification Evidence
- **TypeScript**: `pnpm exec tsc --noEmit` $\rightarrow$ Clean (0 errors).
- **Unit & Integration Suite**: `pnpm test` $\rightarrow$ 23 test files passed (272 tests total).
- **Security Unit Suite**: `tests/unit/login-security.test.ts` $\rightarrow$ 9 tests passed.
- **Playwright Evidence Screenshots**:
  - `docs/evidence/01_login_security_clean.png`
  - `docs/evidence/02_password_masked.png`
  - `docs/evidence/03_password_revealed.png`
  - `docs/evidence/04_account_not_found.png`
  - `docs/evidence/05_password_incorrect_attempt1.png`
  - `docs/evidence/06_account_locked_countdown.png`

---

## Verdict
**PASS**
