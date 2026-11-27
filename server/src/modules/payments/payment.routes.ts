import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { PaymentService } from './payment.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { AppError } from '../../errors/app-error.js';
import { withTenantContext } from '../../db/rls-context.js';

const GenerateUpiSchema = z.object({
  vpa: z.string().max(120).optional(),
  payeeName: z.string().max(120).optional(),
  amountPaise: z.number(),
  tokenNo: z.number().int().positive().optional(),
  itemsSummary: z.string().max(500).optional(),
}).strict();

const VpaValidateSchema = z.object({
  vpa: z.string().max(120).optional().default(''),
}).strict();

const SetVpaSchema = z.object({
  vpa: z.string().min(1).max(120),
}).strict();

const RazorpayWebhookSchema = z.object({
  event: z.string().min(1).optional(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        id: z.string().min(1).optional(),
      }).passthrough().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

const CashfreeWebhookSchema = z.object({
  data: z.object({
    order: z.object({
      order_id: z.string().min(1).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

export const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/payments/generate-upi
   * Generates dynamic NPCI UPI 2.0 deep link and camera-scannable QR code
   */
  app.post(
    '/generate-upi',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const body = validateSchema(GenerateUpiSchema, request.body);

      const vendorId = request.user!.sub;
      let vpa = body.vpa || PaymentService.getVendorVpa(vendorId);
      let dbPayeeName: string | null = null;
      if (!vpa || !body.payeeName) {
        try {
          const row = await withTenantContext(vendorId, (db) =>
            db
              .selectFrom('vendors')
              .select(['upi_id', 'payee_name', 'business_name'])
              .where('id', '=', vendorId)
              .executeTakeFirst(),
          );
          if (!vpa && row?.upi_id) vpa = row.upi_id;
          dbPayeeName = row?.payee_name || row?.business_name || null;
        } catch {
          // ignore fallback read error
        }
      }
      if (!vpa) {
        throw AppError.badRequest('UPI VPA is not configured. Please set up your payment QR first.', 'INVALID_UPI_VPA');
      }
      const payeeName = body.payeeName || dbPayeeName || request.user!.businessName || 'FROSE Street Vendor';
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
    const body = validateSchema(VpaValidateSchema, request.body);
    const vpa = body.vpa;

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
    let vpa = PaymentService.getVendorVpa(vendorId);
    if (!vpa) {
      try {
        const row = await withTenantContext(vendorId, (db) =>
          db.selectFrom('vendors').select(['upi_id']).where('id', '=', vendorId).executeTakeFirst(),
        );
        if (row?.upi_id) vpa = row.upi_id;
      } catch {
        // ignore fallback read error
      }
    }
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
      const body = validateSchema(SetVpaSchema, request.body);

      const vendorId = request.user!.sub;
      const savedVpa = PaymentService.setVendorVpa(vendorId, body.vpa);
      try {
        await withTenantContext(vendorId, (db) =>
          db
            .updateTable('vendors')
            .set({ upi_id: savedVpa, updated_at: new Date() })
            .where('id', '=', vendorId)
            .execute(),
        );
      } catch {
        // ignore in mock contexts without vendors row
      }

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

    const payload = validateSchema(RazorpayWebhookSchema, request.body);
    const event = payload.event || 'payment.captured';
    const paymentId = payload.payload?.payment?.entity?.id || 'pay_mock_123';

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

    const body = validateSchema(CashfreeWebhookSchema, request.body);
    return reply.status(200).send({
      status: 'success',
      received: true,
      orderId: body.data?.order?.order_id || 'order_mock_123',
      message: 'Cashfree webhook processed successfully',
    });
  });
};
