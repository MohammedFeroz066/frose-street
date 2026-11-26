import { describe, it, expect, vi, afterEach } from 'vitest';
import { SubscriptionService } from '../../server/src/modules/subscriptions/subscription.service.js';
import { LicenseManager } from '../../client/js/storage-adapter.js';

describe('SEC-02-BROWSER-ED25519: Client WebCrypto Ed25519 Offline License Verification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('a) verifies a valid Ed25519 license token using SPKI public key from /api/v1/subscriptions/public-key', async () => {
    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    expect(publicKeyPem).toContain('BEGIN PUBLIC KEY');

    const token = await SubscriptionService.generateSignedLicenseToken({
      vendorId: 'vendor-ed25519-1',
      businessName: 'Chai Cart Live',
      plan: 'cloud',
      periodStart: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() + 12 * 86400000).toISOString().split('T')[0]!,
      status: 'active',
      issuedAt: new Date().toISOString(),
    });

    const result = await LicenseManager.verifyLicense(token, publicKeyPem);
    expect(result.valid).toBe(true);
    expect(result.payload?.vendorId).toBe('vendor-ed25519-1');
    expect(result.status).toBe('active');
    expect(result.isReadOnly).toBe(false);
    expect(result.canCreateOrders).toBe(true);
  });

  it('b) fails closed when payload periodEnd is tampered after signing', async () => {
    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const token = await SubscriptionService.generateSignedLicenseToken({
      vendorId: 'vendor-tamper',
      businessName: 'Tamper Cart',
      plan: 'local',
      periodStart: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0]!,
      status: 'active',
      issuedAt: new Date().toISOString(),
    });

    const [headerB64, payloadB64, sigB64] = token.split('.');
    const tamperedPayload = JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
    tamperedPayload.periodEnd = '2099-12-31';
    const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload), 'utf8').toString('base64url');
    const forgedToken = `${headerB64}.${tamperedB64}.${sigB64}`;

    const result = await LicenseManager.verifyLicense(forgedToken, publicKeyPem);
    expect(result.valid).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it('c) fails closed on alg: none and legacy HMAC tokens', async () => {
    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();

    const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        vendorId: 'evil-vendor',
        businessName: 'Evil Cart',
        plan: 'cloud',
        periodStart: '2026-01-01',
        periodEnd: '2099-12-31',
        status: 'active',
        issuedAt: new Date().toISOString(),
      }),
    ).toString('base64url');

    const noneToken = `${noneHeader}.${payload}.`;
    const noneRes = await LicenseManager.verifyLicense(noneToken, publicKeyPem);
    expect(noneRes.valid).toBe(false);

    const hsHeader = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const hsToken = `${hsHeader}.${payload}.fakesignature`;
    const hsRes = await LicenseManager.verifyLicense(hsToken, publicKeyPem);
    expect(hsRes.valid).toBe(false);

    const legacyTwoPart = `${payload}.fakesig`;
    const twoPartRes = await LicenseManager.verifyLicense(legacyTwoPart, publicKeyPem);
    expect(twoPartRes.valid).toBe(false);
  });

  it('d) fails closed when license is expired beyond the 3-day grace period', async () => {
    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const expiredToken = await SubscriptionService.generateSignedLicenseToken({
      vendorId: 'vendor-expired',
      businessName: 'Expired Cart',
      plan: 'cloud',
      periodStart: new Date(Date.now() - 25 * 86400000).toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0]!,
      status: 'active',
      issuedAt: new Date(Date.now() - 25 * 86400000).toISOString(),
    });

    const result = await LicenseManager.verifyLicense(expiredToken, publicKeyPem);
    expect(result.valid).toBe(false);
    expect(result.isReadOnly).toBe(true);
    expect(result.canCreateOrders).toBe(false);
  });

  it('e) fails closed with a clear secure-context error when crypto.subtle is unavailable (no unverified Base64 fallback)', async () => {
    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    const token = await SubscriptionService.generateSignedLicenseToken({
      vendorId: 'vendor-nocrypto',
      businessName: 'No Crypto Cart',
      plan: 'cloud',
      periodStart: new Date().toISOString().split('T')[0]!,
      periodEnd: new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0]!,
      status: 'active',
      issuedAt: new Date().toISOString(),
    });

    vi.stubGlobal('crypto', {});

    const result = await LicenseManager.verifyLicense(token, publicKeyPem);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/crypto\.subtle|secure context/i);
    expect(LicenseManager.decodeToken(token).valid).toBe(false);
  });
});
