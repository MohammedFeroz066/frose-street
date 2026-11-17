import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { LoginSecurityService } from '../../server/src/modules/auth/login-security.service.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Login Security & Lockout System Tests', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.USE_MEMORY_DB = 'true';
    LoginSecurityService.resetForTesting();
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    LoginSecurityService.resetForTesting();
  });

  describe('1. LoginSecurityService Unit Logic', () => {
    const testPhone = '9123456789';

    it('starts with 0 failed attempts and unlocked status', () => {
      const status = LoginSecurityService.checkLock(testPhone);
      expect(status.isLocked).toBe(false);
      expect(status.remainingSeconds).toBe(0);
    });

    it('tracks failed attempts and escalates lockout: 3 fails -> 60s, 4 fails -> 300s, 5 fails -> 900s', () => {
      // 1st failure
      const f1 = LoginSecurityService.recordFailedAttempt(testPhone);
      expect(f1.isLocked).toBe(false);
      expect(f1.consecutiveFailures).toBe(1);
      expect(f1.attemptsRemaining).toBe(2);

      // 2nd failure
      const f2 = LoginSecurityService.recordFailedAttempt(testPhone);
      expect(f2.isLocked).toBe(false);
      expect(f2.consecutiveFailures).toBe(2);
      expect(f2.attemptsRemaining).toBe(1);

      // 3rd failure -> Lock for 60 seconds
      const f3 = LoginSecurityService.recordFailedAttempt(testPhone);
      expect(f3.isLocked).toBe(true);
      expect(f3.consecutiveFailures).toBe(3);
      expect(f3.lockDurationSeconds).toBe(60);

      const lockCheck = LoginSecurityService.checkLock(testPhone);
      expect(lockCheck.isLocked).toBe(true);
      expect(lockCheck.remainingSeconds).toBeGreaterThan(0);
      expect(lockCheck.remainingSeconds).toBeLessThanOrEqual(60);

      // 4th failure -> Lock for 300 seconds (5 minutes)
      const f4 = LoginSecurityService.recordFailedAttempt(testPhone);
      expect(f4.isLocked).toBe(true);
      expect(f4.consecutiveFailures).toBe(4);
      expect(f4.lockDurationSeconds).toBe(300);

      // 5th failure -> Lock for 900 seconds (15 minutes)
      const f5 = LoginSecurityService.recordFailedAttempt(testPhone);
      expect(f5.isLocked).toBe(true);
      expect(f5.consecutiveFailures).toBe(5);
      expect(f5.lockDurationSeconds).toBe(900);
    });

    it('resets attempts and unlocks upon successful authentication', () => {
      LoginSecurityService.recordFailedAttempt(testPhone);
      LoginSecurityService.recordFailedAttempt(testPhone);
      expect(LoginSecurityService.recordFailedAttempt(testPhone).isLocked).toBe(true);

      LoginSecurityService.recordSuccess(testPhone);
      const afterSuccess = LoginSecurityService.checkLock(testPhone);
      expect(afterSuccess.isLocked).toBe(false);
      expect(afterSuccess.remainingSeconds).toBe(0);
    });
  });

  describe('2. HTTP API Login Security Endpoints', () => {
    it('returns 404 NOT_FOUND with descriptive error when mobile does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          phone: '9991112233',
          password: 'AnyPassword@123',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.code).toBe('ACCOUNT_NOT_FOUND');
      expect(body.detail).toBe('Account does not exist with this mobile number');
    });

    it('returns 401 UNAUTHORIZED with attempts remaining when password is wrong', async () => {
      // 9999999999 is seeded in memory-db
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          phone: '9999999999',
          password: 'WrongPassword1',
        },
      });

      expect(res1.statusCode).toBe(401);
      const body1 = JSON.parse(res1.body);
      expect(body1.detail).toBe('Password incorrect. Please check and try again (2 attempts remaining)');

      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          phone: '9999999999',
          password: 'WrongPassword2',
        },
      });

      expect(res2.statusCode).toBe(401);
      const body2 = JSON.parse(res2.body);
      expect(body2.detail).toBe('Password incorrect. Please check and try again (1 attempt remaining)');
    });

    it('locks account on 3rd wrong attempt, returning 429 ACCOUNT_LOCKED with retry-after: 60', async () => {
      // Fail 1
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { phone: '9999999999', password: 'WrongPassword1' },
      });
      // Fail 2
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { phone: '9999999999', password: 'WrongPassword2' },
      });
      // Fail 3 -> Must trigger 429
      const res3 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { phone: '9999999999', password: 'WrongPassword3' },
      });

      expect(res3.statusCode).toBe(429);
      expect(String(res3.headers['retry-after'])).toBe('60');
      const body3 = JSON.parse(res3.body);
      expect(body3.code).toBe('ACCOUNT_LOCKED');
      expect(body3.retryAfter).toBe(60);
      expect(body3.detail).toContain('Too many failed attempts. Account locked for 60 seconds.');

      // Subsequent attempt while locked immediately returns 429 without checking password
      const res4 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { phone: '9999999999', password: 'EvenCorrectPassword@123' },
      });
      expect(res4.statusCode).toBe(429);
      const body4 = JSON.parse(res4.body);
      expect(body4.code).toBe('ACCOUNT_LOCKED');
      expect(body4.retryAfter).toBeGreaterThan(0);
    });

    it('allows successful login with valid credentials and resets failed attempts', async () => {
      // 1 failed attempt
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { phone: '9999999999', password: 'WrongPassword1' },
      });

      // Valid credentials
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { phone: '9999999999', password: 'Feroz@123' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.token).toBeDefined();
      expect(body.vendor).toBeDefined();
      expect(body.vendor.phone).toBe('9999999999');

      // Lock status is cleared
      const check = LoginSecurityService.checkLock('9999999999');
      expect(check.isLocked).toBe(false);
    });
  });

  describe('3. Login UI Security Validations', () => {
    it('login.html contains eye icon toggle and lockout countdown, and eliminates PIN and register link', () => {
      const loginHtml = fs.readFileSync(path.resolve('client/login.html'), 'utf8');

      // PIN & Self-Registration removed
      expect(loginHtml).not.toContain('4-Digit Quick PIN');
      expect(loginHtml).not.toContain('section-pin-login');
      expect(loginHtml).not.toContain('Register Stall in 60s');
      expect(loginHtml).not.toContain('New stall?');

      // Eye toggle present
      expect(loginHtml).toContain('btn-toggle-password');
      expect(loginHtml).toContain('icon-eye-show');
      expect(loginHtml).toContain('icon-eye-hide');

      // Lockout countdown timer script present
      expect(loginHtml).toContain('startLockoutCountdown');
      expect(loginHtml).toContain('Account locked');
      expect(loginHtml).toContain('Account does not exist with this mobile number');
      expect(loginHtml).toContain('Password incorrect');
    });

    it('index.html top nav and footer do not expose PIN trigger buttons', () => {
      const indexHtml = fs.readFileSync(path.resolve('client/index.html'), 'utf8');

      expect(indexHtml).not.toContain('btn-open-pin');
      expect(indexHtml).not.toContain('btn-footer-pin');
      expect(indexHtml).not.toContain('pin-modal');
    });
  });
});
