import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PaymentService } from './payment.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { AppError } from '../../errors/app-error.js';
import { getDatabase } from '../../db/database.js';

export const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/payments/generate-upi
   * Generates dynamic NPCI UPI 2.0 deep link and camera-scannable QR code
   */
  app.post(
    '/generate-upi',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const body = request.body as any;
      if (!body) {
        throw AppError.badRequest('Request body required', 'MISSING_BODY');
      }

      const vendorId = request.user!.sub;
      const vpa = body.vpa || PaymentService.getVendorVpa(vendorId);
      const payeeName = body.payeeName || request.user!.businessName || 'FROSE Street Vendor';
      const amountPaise = body.amountPaise;
      const tokenNo = body.tokenNo || 1;
      const itemsSummary = body.itemsSummary;

      if (!amountPaise || amountPaise <= 0) {
        throw AppError.badRequest('Valid amountPaise is required', 'INVALID_AMOUNT');
      }

      const result = await PaymentService.generateUpiPayload({
        vpa,
        payeeName,
        amountPaise,
        tokenNo,
        itemsSummary,
      });

      return reply.status(200).send({
        status: 'success',
        ...result,
      });
    },
  );

  /**
   * POST /api/v1/payments/vpa-validate
   * Validates UPI VPA format
   */
  app.post('/vpa-validate', async (request, reply) => {
    const body = request.body as any;
    const vpa = body?.vpa;

    const isValid = PaymentService.validateVpa(vpa);
    return reply.status(200).send({
      status: 'success',
      vpa,
      isValid,
      message: isValid
        ? 'Valid UPI ID format'
        : 'Invalid UPI ID format. Must be username@bank (e.g. name@okaxis)',
    });
  });

  /**
   * GET /api/v1/payments/vpa
   * Retrieves configured UPI VPA for the vendor
   */
  app.get('/vpa', { preHandler: [requireAuth] }, async (request, reply) => {
    const vendorId = request.user!.sub;
    const vpa = PaymentService.getVendorVpa(vendorId);
    return reply.status(200).send({
      status: 'success',
      vpa,
    });
  });

  /**
   * POST /api/v1/payments/vpa
   * Configures UPI VPA for the vendor
   */
  app.post(
    '/vpa',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const body = request.body as any;
      if (!body || !body.vpa) {
        throw AppError.badRequest('VPA is required', 'MISSING_VPA');
      }

      const vendorId = request.user!.sub;
      const savedVpa = PaymentService.setVendorVpa(vendorId, body.vpa);

      return reply.status(200).send({
        status: 'success',
        message: 'UPI VPA saved successfully',
        vpa: savedVpa,
      });
    },
  );

  /**
   * POST /api/v1/payments/webhook/razorpay
   * Razorpay settlement webhook stub (Phase 2 future-proofing)
   */
  app.post('/webhook/razorpay', async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'] as string;
    const rawBody = JSON.stringify(request.body);
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'dev_secret_razorpay';

    // Verify signature if provided in test/prod
    if (signature) {
      const isValid = PaymentService.verifyRazorpayWebhook(rawBody, signature, webhookSecret);
      if (!isValid) {
        throw AppError.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
      }
    }

    const payload = request.body as any;
    const event = payload?.event || 'payment.captured';
    const paymentId = payload?.payload?.payment?.entity?.id || 'pay_mock_123';

    return reply.status(200).send({
      status: 'success',
      received: true,
      event,
      paymentId,
      message: 'Razorpay webhook processed successfully',
    });
  });

  /**
   * POST /api/v1/payments/webhook/cashfree
   * Cashfree payment notification stub
   */
  app.post('/webhook/cashfree', async (request, reply) => {
    const signature = request.headers['x-webhook-signature'] as string;
    const rawBody = JSON.stringify(request.body);
    const secret = process.env.CASHFREE_WEBHOOK_SECRET || 'dev_secret_cashfree';

    if (signature) {
      const isValid = PaymentService.verifyCashfreeWebhook(rawBody, signature, secret);
      if (!isValid) {
        throw AppError.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
      }
    }

    const body = request.body as any;
    return reply.status(200).send({
      status: 'success',
      received: true,
      orderId: body?.data?.order?.order_id || 'order_mock_123',
      message: 'Cashfree webhook processed successfully',
    });
  });
};
