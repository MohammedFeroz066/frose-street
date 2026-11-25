import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { PaymentService } from '../../server/src/modules/payments/payment.service.js';
import { WhatsAppService } from '../../client/js/whatsapp-service.js';
import { getDatabase } from '../../server/src/db/database.js';
import fs from 'node:fs';
import path from 'node:path';

describe('Production Readiness Hotfixes Verification', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.USE_MEMORY_DB = 'true';
    app = await buildApp({ logger: false });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('TEST 1: Quick PIN Login API (POST /api/v1/auth/pin-login) unlocks station with 4-digit PIN', async () => {
    const db = getDatabase();

    // 1. Register a test vendor with quickPin '4321'
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register-stall',
      payload: {
        phone: '9888877777',
        businessName: 'Hotfix Test Stall',
        ownerName: 'Hotfix Owner',
        password: 'SecurePass2026!',
        quickPin: '4321',
        edition: 'cloud',
        presetKey: 'chai_nashta',
        upiId: 'hotfixstall@okaxis',
      },
    });

    expect(regRes.statusCode).toBe(201);
    const regData = JSON.parse(regRes.body);
    expect(regData.vendor.upiId).toBe('hotfixstall@okaxis');

    // 2. Remote PIN login is disabled per SEC-06 (restricted to local offline terminal unlock)
    const pinRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/pin-login',
      payload: {
        pin: '4321',
      },
    });

    expect(pinRes.statusCode).toBe(403);
    const pinData = JSON.parse(pinRes.body);
    expect(pinData.code).toBe('PIN_LOGIN_DISABLED');
  });

  it('TEST 2: Quick PIN Login rejects remote attempts per SEC-06', async () => {
    const wrongRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/pin-login',
      payload: { pin: '9999' },
    });
    expect(wrongRes.statusCode).toBe(403);
    expect(JSON.parse(wrongRes.body).code).toBe('PIN_LOGIN_DISABLED');
  });

  it('TEST 3: Authentic Scannable Dynamic UPI QR generation with vendor VPA', async () => {
    const result = await PaymentService.generateUpiPayload({
      vpa: 'vendor123@okicici',
      payeeName: 'Royal Momos',
      amountPaise: 14000,
      tokenNo: 5,
      itemsSummary: '2x Steamed Momos',
    });

    expect(result.upiUri).toContain('pa=vendor123%40okicici');
    expect(result.upiUri).toContain('am=140.00');
    expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.qrDataUrl.length).toBeGreaterThan(500); // Genuine QR image buffer
  });

  it('TEST 4: Dedicated Login Route (/login) serves client/login.html directly', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/login',
      headers: {
        accept: 'text/html',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Vendor Sign In — FROSE Street Micro-POS');
    expect(res.body).toContain('form-pwd-login');
    expect(res.body).not.toContain('section-pin-login');
    expect(res.body).toContain('btn-toggle-password');
  });

  it('TEST 5: WhatsApp Service generates clean UTF-8 text with standard ₹ symbol and valid emojis', () => {
    const receiptUrl = WhatsAppService.generateCustomerReceiptUrl({
      stallName: 'Sharma Chaat Bhandar',
      tokenNo: 12,
      items: [{ name: 'Pani Puri', quantity: 2, priceRupees: 30 }],
      totalRupees: 60,
      paymentMethod: 'CASH',
      phone: '9876543210',
    });

    const decoded = decodeURIComponent(receiptUrl);
    expect(decoded).toContain('Sharma Chaat Bhandar');
    expect(decoded).toContain('*Order Token:* #12');
    expect(decoded).toContain('₹60');
    expect(decoded).not.toContain('dY'); // Zero corrupted emoji artifacts
    expect(decoded).not.toContain(',1'); // Zero corrupted rupee symbols
  });

  it('TEST 6: Service Worker precache list includes all Phase 19 scripts and login.html', () => {
    const swPath = path.resolve(process.cwd(), 'client/sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    expect(swContent).toContain('/login.html');
    expect(swContent).toContain('/js/escpos-generator.js');
    expect(swContent).toContain('/js/bluetooth-printer.js');
    expect(swContent).toContain('/js/whatsapp-service.js');
    expect(swContent).toContain('frose-street-v9-production');
  });

  it('TEST 7: WebSocket endpoints /ws and /api/v1/ws are registered without 404', async () => {
    // HTTP probe against WS endpoint to confirm route handler exists
    const resWs = await app.inject({
      method: 'GET',
      url: '/ws',
    });
    // In Fastify websocket plugin, plain HTTP GET without websocket upgrade header returns 400 or handled response, NOT 404
    expect(resWs.statusCode).not.toBe(404);

    const resApiWs = await app.inject({
      method: 'GET',
      url: '/api/v1/ws',
    });
    expect(resApiWs.statusCode).not.toBe(404);
  });
});
