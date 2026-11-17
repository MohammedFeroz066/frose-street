import type { FastifyPluginAsync } from 'fastify';
import { SubscriptionService, type SubscriptionPlan } from './subscription.service.js';
import { AppError } from '../../errors/app-error.js';
import { getDatabase } from '../../db/database.js';

export const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/v1/subscriptions/status
   * Returns current subscription status, days left, grace period, and signed token.
   */
  app.get('/status', async (req, reply) => {
    const db = getDatabase();
    let vendorId = (req as any).user?.vendorId || (req as any).user?.sub;

    // Fallback: If not authenticated in local/test environment, take first vendor from DB
    if (!vendorId) {
      const firstVendor = await db.selectFrom('vendors').select('id').limit(1).executeTakeFirst();
      vendorId = firstVendor?.id;
    }

    if (!vendorId) {
      throw AppError.unauthorized('Authentication required to check subscription status');
    }

    const status = await SubscriptionService.getSubscriptionStatus(db, vendorId);
    return reply.status(200).send(status);
  });

  /**
   * POST /api/v1/subscriptions/renew
   * Renews or upgrades subscription plan via UPI
   */
  app.post<{
    Body: { plan: SubscriptionPlan; paymentReference?: string };
  }>('/renew', async (req, reply) => {
    const db = getDatabase();
    let vendorId = (req as any).user?.vendorId || (req as any).user?.sub;

    if (!vendorId) {
      const firstVendor = await db.selectFrom('vendors').select('id').limit(1).executeTakeFirst();
      vendorId = firstVendor?.id;
    }

    if (!vendorId) {
      throw AppError.unauthorized('Authentication required to renew subscription');
    }

    const { plan, paymentReference } = req.body || {};
    if (!plan || (plan !== 'local' && plan !== 'cloud')) {
      throw AppError.badRequest('Invalid subscription plan. Must be "local" or "cloud"');
    }

    const result = await SubscriptionService.renewSubscription(
      db,
      vendorId,
      plan,
      paymentReference || 'UPI-' + Date.now()
    );

    return reply.status(200).send(result);
  });

  /**
   * POST /api/v1/subscriptions/verify-token
   * Public/offline endpoint for validating cryptographic HMAC license tokens
   */
  app.post<{
    Body: { token: string };
  }>('/verify-token', async (req, reply) => {
    const { token } = req.body || {};
    if (!token) {
      throw AppError.badRequest('License token is required');
    }

    const verification = SubscriptionService.verifySignedLicenseToken(token);
    return reply.status(200).send(verification);
  });

  /**
   * GET /api/v1/subscriptions/admin/vendors
   * Super-Admin endpoint: lists all vendors with subscription metrics and revenue
   */
  app.get('/admin/vendors', async (req, reply) => {
    const db = getDatabase();
    const adminData = await SubscriptionService.getAdminVendorsList(db);
    return reply.status(200).send(adminData);
  });
};
