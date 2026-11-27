import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('SEC-05-CLIENT-AUTH: Shared Cookie/CSRF API Client & Single-Flight 401 Refresh', () => {
  const clientDir = path.resolve(__dirname, '../../client');
  const apiClientPath = path.join(clientDir, 'js/api-client.js');

  it('client/js/api-client.js exists without top-level ESM export (classic script safe) and never references frose_auth_token', () => {
    expect(fs.existsSync(apiClientPath)).toBe(true);
    const src = fs.readFileSync(apiClientPath, 'utf8');
    expect(src).not.toMatch(/^\s*export\s+/m);
    expect(src).not.toContain('getItem(\'frose_auth_token\')');
    expect(src).not.toContain('Authorization');
  });

  it('always sends credentials: same-origin and attaches X-FROSE-CSRF: 1 on POST/PUT/PATCH/DELETE only', async () => {
    await import('../../client/js/api-client.js');
    const { createApiClient } = (globalThis as any).FroseApiClient;

    const mockFetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createApiClient({ fetchImpl: mockFetch, redirectImpl: vi.fn() });

    await client.apiFetch('/api/v1/menu');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, getOpts] = mockFetch.mock.calls[0] as any[];
    expect(getOpts.credentials).toBe('same-origin');
    expect(new Headers(getOpts.headers).get('X-FROSE-CSRF')).toBeNull();

    await client.apiFetch('/api/v1/orders', { method: 'POST', body: '{}' });
    const [, postOpts] = mockFetch.mock.calls[1] as any[];
    expect(postOpts.credentials).toBe('same-origin');
    expect(new Headers(postOpts.headers).get('X-FROSE-CSRF')).toBe('1');

    await client.apiFetch('/api/v1/orders/1/status', { method: 'PATCH', body: '{}' });
    const [, patchOpts] = mockFetch.mock.calls[2] as any[];
    expect(new Headers(patchOpts.headers).get('X-FROSE-CSRF')).toBe('1');
  });

  it('single-flight 401 refresh: 2 concurrent 401 calls trigger ONLY ONE POST /api/v1/auth/refresh and both retry cleanly', async () => {
    await import('../../client/js/api-client.js');
    const { createApiClient } = (globalThis as any).FroseApiClient;

    let refreshed = false;
    let refreshCallCount = 0;

    const mockFetch = vi.fn(async (url: string, opts: any) => {
      if (url === '/api/v1/auth/refresh') {
        refreshCallCount += 1;
        // Simulate async network delay so concurrent 401s overlap
        await new Promise((r) => setTimeout(r, 25));
        refreshed = true;
        expect(opts.method).toBe('POST');
        expect(opts.credentials).toBe('same-origin');
        expect(new Headers(opts.headers).get('X-FROSE-CSRF')).toBe('1');
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
      }

      if (!refreshed) {
        return new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401 });
      }

      return new Response(JSON.stringify({ ok: true, url }), { status: 200 });
    });

    const redirectMock = vi.fn();
    const client = createApiClient({ fetchImpl: mockFetch, redirectImpl: redirectMock });

    const [res1, res2] = await Promise.all([
      client.apiFetch('/api/v1/menu'),
      client.apiFetch('/api/v1/orders/live'),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects to /login.html and clears session flag when refresh fails, and skips refresh on auth endpoints', async () => {
    await import('../../client/js/api-client.js');
    const { createApiClient } = (globalThis as any).FroseApiClient;

    const redirectMock = vi.fn();
    const clearStorageMock = vi.fn();
    const mockFetch = vi.fn(async (url: string) => {
      if (url === '/api/v1/auth/refresh') {
        return new Response(JSON.stringify({ code: 'EXPIRED' }), { status: 401 });
      }
      return new Response(JSON.stringify({ code: 'INVALID_TOKEN' }), { status: 401 });
    });

    const client = createApiClient({
      fetchImpl: mockFetch,
      redirectImpl: redirectMock,
      onSessionCleared: clearStorageMock,
    });

    // 1. Auth login 401 must NOT trigger /api/v1/auth/refresh
    const loginRes = await client.apiFetch('/api/v1/auth/login', { method: 'POST', body: '{}' });
    expect(loginRes.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 2. Protected route 401 with failing refresh must clear session & redirect to /login.html
    const meRes = await client.apiFetch('/api/v1/auth/me');
    expect(meRes.status).toBe(401);
    expect(clearStorageMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith('/login.html');
  });

  it('client scripts and pages do not send Authorization: Bearer or call disabled /pin-login', () => {
    const filesToCheck = [
      'js/admin-page.js',
      'js/app.js',
      'js/billing.js',
      'js/kitchen.js',
      'js/packaging.js',
      'js/register.js',
      'js/storage-adapter.js',
      'menu-setup.html',
      'admin.html',
      'login.html',
    ];
    for (const rel of filesToCheck) {
      const content = fs.readFileSync(path.join(clientDir, rel), 'utf8');
      expect(content, `${rel} still contains Authorization Bearer`).not.toMatch(/Authorization:\s*[`'"']Bearer/);
      expect(content, `${rel} still calls disabled /api/v1/auth/pin-login`).not.toContain('/api/v1/auth/pin-login');
    }
  });
});
