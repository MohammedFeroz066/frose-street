import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { SubscriptionService } from './subscription.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { withTenantContext, withSuperadminContext } from '../../db/rls-context.js';

const RenewSubscriptionSchema = z.object({
  plan: z.enum(['local', 'cloud']),
  paymentReference: z.string().max(120).optional(),
}).strict();

const VerifyTokenSchema = z.object({
  token: z.string().min(1),
}).strict();

export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/v1/subscriptions/status
   * Returns current subscription status, days left, grace period, and signed token.
   */
  app.get('/status', { preHandler: [requireAuth] }, async (req, reply) => {
    const status = await withTenantContext(req.user!.sub, (db) =>
      SubscriptionService.getSubscriptionStatus(db, req.user!.sub),
    );
    return reply.status(200).send(status);
  });

  /**
   * POST /api/v1/subscriptions/renew
   * Renews or upgrades subscription plan via UPI
   */
  app.post('/renew', { preHandler: [requireAuth, requireRole('owner', 'cashier')] }, async (req, reply) => {
    const { plan, paymentReference } = validateSchema(RenewSubscriptionSchema, req.body);

    const result = await withTenantContext(req.user!.sub, (db) =>
      SubscriptionService.renewSubscription(
        db,
        req.user!.sub,
        plan,
        paymentReference || 'UPI-' + Date.now()
      ),
    );

    return reply.status(200).send(result);
  });

  /**
   * GET /api/v1/subscriptions/public-key
   * Read-only endpoint exposing ONLY the Ed25519 public key for client offline verification
   */
  app.get('/public-key', async (_req, reply) => {
    const publicKeyPem = await SubscriptionService.getLicensePublicKeyPem();
    return reply.status(200).send({
      algorithm: 'EdDSA',
      crv: 'Ed25519',
      publicKeyPem,
    });
  });

  /**
   * POST /api/v1/subscriptions/verify-token
   * Public/offline endpoint for validating cryptographic Ed25519 license tokens
   */
  app.post('/verify-token', async (req, reply) => {
    const { token } = validateSchema(VerifyTokenSchema, req.body);

    const verification = await SubscriptionService.verifySignedLicenseToken(token);
    return reply.status(200).send(verification);
  });

  /**
   * GET /api/v1/subscriptions/admin/vendors
   * Super-Admin endpoint: lists all vendors with subscription metrics and revenue
   */
  app.get('/admin/vendors', { preHandler: [requireAuth, requireRole('superadmin')] }, async (_req, reply) => {
    const adminData = await withSuperadminContext((db) =>
      SubscriptionService.getAdminVendorsList(db),
    );
    return reply.status(200).send(adminData);
  });
};
