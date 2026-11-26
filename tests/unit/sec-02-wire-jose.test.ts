import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { SubscriptionService } from '../../server/src/modules/subscriptions/subscription.service.js';
import { verifyEd25519LicenseToken } from '../../server/src/modules/auth/jwt-jose.js';

describe('SEC-02-WIRE-JOSE: Ed25519 Subscription Licenses, Legacy jwt.ts Removal & Strict Auth Zod Schemas', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('SubscriptionService signs and verifies Ed25519 (EdDSA) 3-part JWTs instead of HMAC-SHA256', async () => {
    const payload = {
      vendorId: 'v-ed25519-01',
      businessName: 'Ed25519 Dosa Stall',
      plan: 'cloud' as const,
      periodStart: '2026-11-26',
      periodEnd: '2026-12-26',
      status: 'active' as const,
      issuedAt: new Date().toISOString(),
    };

    const token = await SubscriptionService.generateSignedLicenseToken(payload);
    const parts = token.split('.');
    expect(parts.length).toBe(3);

    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8'));
    expect(header.alg).toBe('EdDSA');

    const verification = await SubscriptionService.verifySignedLicenseToken(token);
    expect(verification.valid).toBe(true);
    expect(verification.payload?.vendorId).toBe('v-ed25519-01');
  });

  it('GET /api/v1/subscriptions/public-key exposes ONLY the Ed25519 SPKI public key (never private key)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscriptions/public-key',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.algorithm).toBe('EdDSA');
    expect(body.crv).toBe('Ed25519');
    expect(body.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    expect(JSON.stringify(body)).not.toContain('PRIVATE KEY');

    // Verify a server-signed license token directly using only the public endpoint key
    const licenseToken = await SubscriptionService.generateSignedLicenseToken({
      vendorId: 'v-pub-check',
      businessName: 'Public Key Verification Stall',
      plan: 'local',
      periodStart: '2026-11-26',
      periodEnd: '2026-12-26',
      status: 'active',
      issuedAt: new Date().toISOString(),
    });
    const pubVerify = await verifyEd25519LicenseToken(licenseToken, body.publicKeyPem);
    expect(pubVerify.valid).toBe(true);
    expect(pubVerify.payload?.vendorId).toBe('v-pub-check');
  });

  it('middleware/auth.ts, device.service.ts, and auth.routes.ts no longer import legacy jwt.js and have no request.body as any', () => {
    const authMiddleware = fs.readFileSync(path.resolve(__dirname, '../../server/src/middleware/auth.ts'), 'utf8');
    const deviceService = fs.readFileSync(path.resolve(__dirname, '../../server/src/modules/devices/device.service.ts'), 'utf8');
    const authRoutes = fs.readFileSync(path.resolve(__dirname, '../../server/src/modules/auth/auth.routes.ts'), 'utf8');

    expect(authMiddleware).not.toMatch(/auth\/jwt\.js/);
    expect(deviceService).not.toMatch(/auth\/jwt\.js/);
    expect(authRoutes).not.toMatch(/\.\/jwt\.js/);
    expect(authRoutes).not.toContain('request.body as any');
  });

  it('rejects unknown fields (mass assignment) on /setup-pin, /verify-pin, /biometric/register, and /biometric/verify', async () => {
    const phone = '9871112233';
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone,
        businessName: 'Strict Auth Zod Stall',
        password: 'ValidPassphraseNumberOne!',
      },
    });
    const accessCookie = regRes.cookies.find((c) => c.name === 'frose_access_token')!.value;

    const setupPinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/setup-pin',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      cookies: { frose_access_token: accessCookie },
      payload: { pin: '4321', is_superadmin: true },
    });
    expect(setupPinRes.statusCode).toBe(400);

    const verifyPinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/verify-pin',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      cookies: { frose_access_token: accessCookie },
      payload: { pin: '4321', is_superadmin: true },
    });
    expect(verifyPinRes.statusCode).toBe(400);

    const bioRegRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/biometric/register',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      cookies: { frose_access_token: accessCookie },
      payload: { credentialId: 'c1', publicKey: 'pk1', extraField: 'hack' },
    });
    expect(bioRegRes.statusCode).toBe(400);

    const bioVerifyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/biometric/verify',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: { credentialId: 'c1', is_superadmin: true },
    });
    expect(bioVerifyRes.statusCode).toBe(400);
  });
});
