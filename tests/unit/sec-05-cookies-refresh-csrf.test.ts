import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase } from '../../server/src/db/database.js';

describe('SEC-05: httpOnly Cookies, Rotating Refresh Tokens, Revocation & CSRF Protection', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sets httpOnly, SameSite=Strict cookies upon login instead of returning cleartext localStorage token', async () => {
    const phone = '9870001111';
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      payload: {
        phone,
        businessName: 'Cookie Session Stall',
        password: 'ValidSecurePassword123!',
      },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      payload: {
        phone,
        password: 'ValidSecurePassword123!',
      },
    });

    expect(loginRes.statusCode).toBe(200);
    const cookies = loginRes.cookies;
    const accessCookie = cookies.find((c) => c.name === 'frose_access_token');
    const refreshCookie = cookies.find((c) => c.name === 'frose_refresh_token');

    expect(accessCookie).toBeDefined();
    expect(accessCookie?.httpOnly).toBe(true);
    expect(accessCookie?.sameSite?.toLowerCase()).toBe('strict');

    expect(refreshCookie).toBeDefined();
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.sameSite?.toLowerCase()).toBe('strict');
  });

  it('rotates refresh token on POST /api/v1/auth/refresh and issues a fresh access token', async () => {
    const phone = '9870002222';
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      payload: {
        phone,
        businessName: 'Rotation Stall',
        password: 'ValidSecurePassword123!',
      },
    });

    const initialRefreshCookie = regRes.cookies.find((c) => c.name === 'frose_refresh_token');
    expect(initialRefreshCookie).toBeDefined();

    // Refresh using the cookie
    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      cookies: {
        frose_refresh_token: initialRefreshCookie!.value,
      },
    });

    expect(refreshRes.statusCode).toBe(200);
    const newRefreshCookie = refreshRes.cookies.find((c) => c.name === 'frose_refresh_token');
    expect(newRefreshCookie).toBeDefined();
    expect(newRefreshCookie!.value).not.toBe(initialRefreshCookie!.value); // Rotated!
  });

  it('detects refresh token reuse and immediately revokes the entire token family', async () => {
    const phone = '9870003333';
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      payload: {
        phone,
        businessName: 'Reuse Detection Stall',
        password: 'ValidSecurePassword123!',
      },
    });

    const initialRefresh = regRes.cookies.find((c) => c.name === 'frose_refresh_token')!.value;

    // First use: rotates successfully
    const use1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      cookies: { frose_refresh_token: initialRefresh },
    });
    expect(use1.statusCode).toBe(200);
    const rotatedRefresh = use1.cookies.find((c) => c.name === 'frose_refresh_token')!.value;

    // Attacker tries to reuse the initial token (which was already rotated)
    const reuseAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      cookies: { frose_refresh_token: initialRefresh },
    });
    expect(reuseAttempt.statusCode).toBe(401);
    const body = reuseAttempt.json();
    expect(body.code).toBe('REFRESH_TOKEN_REUSE_DETECTED');

    // Because reuse was detected, the legitimate rotated token must NOW also be revoked!
    const legitAttempt = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      cookies: { frose_refresh_token: rotatedRefresh },
    });
    expect(legitAttempt.statusCode).toBe(401);
  });

  it('POST /api/v1/auth/logout revokes the token family and clears session cookies', async () => {
    const phone = '9870004444';
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      payload: {
        phone,
        businessName: 'Logout Stall',
        password: 'ValidSecurePassword123!',
      },
    });

    const refreshCookie = regRes.cookies.find((c) => c.name === 'frose_refresh_token')!.value;

    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      cookies: { frose_refresh_token: refreshCookie },
    });

    expect(logoutRes.statusCode).toBe(200);

    // Refresh after logout must fail
    const refreshAfterLogout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3000' },
      cookies: { frose_refresh_token: refreshCookie },
    });
    expect(refreshAfterLogout.statusCode).toBe(401);
  });

  it('rejects state-changing requests when anti-CSRF custom header is missing or Origin is invalid', async () => {
    // Missing X-FROSE-CSRF header
    const missingHeader = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { origin: 'http://localhost:3000' },
      payload: {
        phone: '9870005555',
        businessName: 'No CSRF Header Stall',
        password: 'ValidSecurePassword123!',
      },
    });
    expect(missingHeader.statusCode).toBe(403);
    expect(missingHeader.json().code).toBe('CSRF_VALIDATION_FAILED');

    // Untrusted Origin
    const untrustedOrigin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://evil-attacker-site.com' },
      payload: {
        phone: '9870006666',
        businessName: 'Untrusted Origin Stall',
        password: 'ValidSecurePassword123!',
      },
    });
    expect(untrustedOrigin.statusCode).toBe(403);
    expect(untrustedOrigin.json().code).toBe('CSRF_VALIDATION_FAILED');
  });
});
