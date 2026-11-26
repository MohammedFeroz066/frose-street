import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DeviceService } from './device.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { getDatabase } from '../../db/database.js';
import { loadConfig } from '../../config/env.js';

import { setAccessCookie } from '../auth/session-cookies.js';

const PairingTokenSchema = z.object({
  role: z.enum(['cook', 'packer', 'cashier']).optional(),
  deviceName: z.string().max(120).optional(),
}).strict();

const PairDeviceSchema = z.object({
  pairingToken: z.string().min(1),
  deviceName: z.string().max(120).optional(),
}).strict();

const DeviceIdParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();

export const deviceRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = app.froseConfig || loadConfig();

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
      const body = validateSchema(PairingTokenSchema, request.body || {});
      const targetRole = body.role || 'cook';

      const result = await DeviceService.generatePairingToken(
        request.user!.sub,
        targetRole,
        config.JWT_SECRET,
        body.deviceName,
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
    const body = validateSchema(PairDeviceSchema, request.body);

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
      const params = validateSchema(DeviceIdParamSchema, request.params);

      const result = await DeviceService.revokeDevice(db, request.user!.sub, params.id);

      return reply.status(200).send({
        status: 'success',
        message: result.message,
      });
    },
  );
};
