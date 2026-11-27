import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildApp } from '../../server/src/app.js';
import type { FastifyInstance } from 'fastify';
import { PaymentService } from '../../server/src/modules/payments/payment.service.js';
import { signJwt } from '../../server/src/modules/auth/jwt.js';

describe('Phase 16 Acceptance Tests: UPI Dynamic QR & Payment Flow', () => {
  let app: FastifyInstance;
  const vendorId = '00000000-0000-0000-0000-000000000001';
  const jwtSecret = 'frose-street-default-dev-secret-key-32chars';
  let cashierToken: string;

  beforeEach(async () => {
    app = await buildApp();
    cashierToken = signJwt(
      {
        sub: vendorId,
        phone: '9876543211',
        role: 'cashier',
        businessName: 'Tibetan Momo Point',
        edition: 'cloud',
      },
      jwtSecret,
    );
  });

  afterEach(async () => {
    await app.close();
  });

  describe('TEST 1: NPCI UPI 2.0 Deep Link URI Generation', () => {
    it('should generate compliant upi://pay URI with all mandatory parameters', async () => {
      const result = await PaymentService.generateUpiPayload({
        vpa: 'raju.momos@okaxis',
        payeeName: 'Tibetan Momo Point',
        amountPaise: 14000n, // ₹140.00
        tokenNo: 31,
        itemsSummary: '2x Veg Momos, 1x Chai',
      });

      expect(result.upiUri).toContain('upi://pay?');
      expect(result.upiUri).toContain('pa=raju.momos%40okaxis');
      expect(result.upiUri).toContain('pn=Tibetan%20Momo%20Point');
      expect(result.upiUri).toContain('am=140.00');
      expect(result.upiUri).toContain('cu=INR');
      expect(result.upiUri).toContain('tn=FROSE%20Token%20%2331%3A%202x%20Veg%20Momos%2C%201x%20Chai');
      expect(result.amountRupees).toBe('140.00');
      expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('should correctly format fractional paise amounts with strict integer math', async () => {
      // ₹99.50
      const res1 = await PaymentService.generateUpiPayload({
        vpa: 'stall@oksbi',
        payeeName: 'Stall',
        amountPaise: 9950n,
        tokenNo: 5,
      });
      expect(res1.amountRupees).toBe('99.50');

      // ₹5.00
      const res2 = await PaymentService.generateUpiPayload({
        vpa: 'stall@oksbi',
        payeeName: 'Stall',
        amountPaise: 500n,
        tokenNo: 6,
      });
      expect(res2.amountRupees).toBe('5.00');
    });
  });

  describe('TEST 2: VPA Format Validation (Regex Compliance)', () => {
    it('should accept valid Indian bank and app VPA handles', () => {
      const validVpas = [
        'raju.momos@okaxis',
        'vendor@paytm',
        'stall_01@oksbi',
        'momo.point-2@okhdfcbank',
        'user@ybl',
        'merchant@icici',
      ];

      validVpas.forEach((vpa) => {
        expect(PaymentService.validateVpa(vpa)).toBe(true);
      });
    });

    it('should reject invalid VPA patterns', () => {
      const invalidVpas = [
        'invalid-no-at-sign',
        '@okaxis',
        'raju.momos@',
        'two@@bank.com',
        'spaces in vpa@bank',
        '',
      ];

      invalidVpas.forEach((vpa) => {
        expect(PaymentService.validateVpa(vpa)).toBe(false);
      });
    });
  });

  describe('TEST 3: API Endpoint: POST /api/v1/payments/generate-upi', () => {
    it('should generate UPI payload and QR code via authenticated endpoint', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/generate-upi',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
        payload: {
          vpa: 'tibetan.momo@okaxis',
          payeeName: 'Tibetan Momo Point',
          amountPaise: 18000, // ₹180.00
          tokenNo: 32,
          itemsSummary: '2x Steamed Momos',
        },
      });

      expect(res.statusCode).toBe(200);
      const data = JSON.parse(res.body);
      expect(data.status).toBe('success');
      expect(data.amountRupees).toBe('180.00');
      expect(data.vpa).toBe('tibetan.momo@okaxis');
      expect(data.upiUri).toContain('am=180.00');
      expect(data.qrDataUrl).toBeDefined();
    });

    it('should reject invalid amounts (zero or negative)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/generate-upi',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
        payload: {
          vpa: 'tibetan.momo@okaxis',
          amountPaise: 0,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('TEST 4: API Endpoint: VPA Validation & Management', () => {
    it('POST /api/v1/payments/vpa-validate should test VPA without requiring auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/vpa-validate',
        payload: { vpa: 'shop@oksbi' },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.isValid).toBe(true);
    });

    it('POST /api/v1/payments/vpa should configure vendor VPA and GET should retrieve it', async () => {
      const setRes = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/vpa',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: { vpa: 'stall.custom@okaxis' },
      });

      expect(setRes.statusCode).toBe(200);
      expect(JSON.parse(setRes.body).vpa).toBe('stall.custom@okaxis');

      const getRes = await app.inject({
        method: 'GET',
        url: '/api/v1/payments/vpa',
        headers: { authorization: `Bearer ${cashierToken}` },
      });

      expect(getRes.statusCode).toBe(200);
      expect(JSON.parse(getRes.body).vpa).toBe('stall.custom@okaxis');
    });
  });

  describe('TEST 5: Payment Gateway Webhook Stubs (Razorpay & Cashfree)', () => {
    it('POST /api/v1/payments/webhook/razorpay should verify HMAC signature and return 200', async () => {
      const secret = 'dev_secret_razorpay';
      const body = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_998877',
              amount: 14000,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(body);
      const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/webhook/razorpay',
        headers: {
          'x-razorpay-signature': signature,
        },
        payload: body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.received).toBe(true);
      expect(json.paymentId).toBe('pay_test_998877');
    });

    it('POST /api/v1/payments/webhook/cashfree should process webhook event', async () => {
      const body = {
        data: {
          order: {
            order_id: 'order_cf_123',
            order_amount: 140.0,
          },
          payment: {
            payment_status: 'SUCCESS',
          },
        },
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments/webhook/cashfree',
        payload: body,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.received).toBe(true);
      expect(json.orderId).toBe('order_cf_123');
    });
  });

  describe('TEST 6: PWA Service Worker Pre-Caching for Phase 16', () => {
    it('should precache assets under frose-street-v8-upi-payments', () => {
      const swPath = path.resolve(process.cwd(), 'client/sw.js');
      const sw = fs.readFileSync(swPath, 'utf8');

      expect(sw).toContain("const CACHE_NAME = 'frose-street-' + BUILD_ID;");
      expect(sw).toContain("'/billing.html'");
    });
  });
});
