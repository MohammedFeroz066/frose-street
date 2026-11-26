import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { PaymentService } from '../../server/src/modules/payments/payment.service.js';

describe('SEC-14-CLEANUP: Purge Remaining Hardcoded Defaults (VPA, Password, License Secret)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/auth/register-stall does NOT assign a default VPA when upiId is omitted', async () => {
    const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      headers: { 'X-FROSE-CSRF': '1', origin: 'http://localhost:3100' },
      payload: {
        phone,
        password: 'ValidPassphraseWithoutDefault!',
        businessName: 'No Default UPI Stall',
      },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json();
    expect(data.vendor.upiId).toBeUndefined();
  });

  it('PaymentService.getVendorVpa returns undefined for unconfigured vendor (never a hardcoded default VPA)', () => {
    const vpa = PaymentService.getVendorVpa('vendor-without-upi-999');
    expect(vpa).toBeUndefined();
  });

  it('client/js/admin.js does NOT contain hardcoded fallback password or VPA defaults', () => {
    const adminJsPath = path.resolve(__dirname, '../../client/js/admin.js');
    const content = fs.readFileSync(adminJsPath, 'utf8');
    expect(content).not.toContain('Feroz@123');
    expect(content).not.toContain('frosestall@okaxis');
  });

  it('server/src/modules/subscriptions/subscription.service.ts does NOT contain hardcoded license secret fallback', () => {
    const subServicePath = path.resolve(__dirname, '../../server/src/modules/subscriptions/subscription.service.ts');
    const content = fs.readFileSync(subServicePath, 'utf8');
    expect(content).not.toContain('frose-street-secret-license-key-2026');
  });
});
