import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DeviceService } from './device.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { loadConfig } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { StaffRole } from '../../../../shared/types/index.js';

import { setAccessCookie } from '../auth/session-cookies.js';

export const deviceRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = (app as any).froseConfig || loadConfig();

  /**
   * Helper to set HttpOnly auth cookie on paired helper device
   */
  const setAuthCookie = (reply: any, token: string) => {
    setAccessCookie(reply, config.NODE_ENV, token, 30 * 86400);
  };

  /**
   * POST /api/v1/devices/pairing-token
   * Cashier/Owner generates a 5-minute single-use QR pairing token for Kitchen or Packer display
   */
  app.post(
    '/pairing-token',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const body = request.body as any;
      const targetRole: StaffRole = body?.role || 'cook';

      if (!['cook', 'packer', 'cashier'].includes(targetRole)) {
        throw AppError.badRequest('Role must be one of: cook, packer, cashier', 'INVALID_TARGET_ROLE');
      }

      const result = await DeviceService.generatePairingToken(
        request.user!.sub,
        targetRole,
        config.JWT_SECRET,
        body?.deviceName,
      );

      return reply.status(200).send({
        status: 'success',
        message: 'Pairing QR code generated (valid for 5 minutes)',
        ...result,
      });
    },
  );

  /**
   * POST /api/v1/devices/pair
   * Helper mobile phone scans the QR code and redeems pairing token to connect to stall
   */
  app.post('/pair', async (request, reply) => {
    const db = getDatabase();
    const body = request.body as any;

    if (!body || !body.pairingToken) {
      throw AppError.badRequest('pairingToken is required', 'MISSING_PAIRING_TOKEN');
    }

    const { device, token, portalUrl } = await DeviceService.pairDevice(
      db,
      body.pairingToken,
      config.JWT_SECRET,
      body.deviceName,
    );

    setAuthCookie(reply, token);

    return reply.status(200).send({
      status: 'success',
      message: `Connected successfully as ${device.role}`,
      device,
      token,
      portalUrl,
    });
  });

  /**
   * GET /api/v1/devices
   * Lists all active paired devices for the current stall
   */
  app.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDatabase();
    const devices = await DeviceService.listDevices(db, request.user!.sub);

    return reply.status(200).send({
      status: 'success',
      devices,
    });
  });

  /**
   * DELETE /api/v1/devices/:id
   * Disconnects / revokes access for a paired device
   */
  app.delete(
    '/:id',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const params = request.params as any;

      if (!params || !params.id) {
        throw AppError.badRequest('Device ID is required', 'MISSING_DEVICE_ID');
      }

      const result = await DeviceService.revokeDevice(db, request.user!.sub, params.id);

      return reply.status(200).send({
        status: 'success',
        message: result.message,
      });
    },
  );
};
