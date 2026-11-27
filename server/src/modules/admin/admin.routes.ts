import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import { loadConfig } from '../../config/env.js';
import { withSuperadminContext } from '../../db/rls-context.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { WebSocketHub } from '../websocket/websocket.hub.js';
import { AdminService } from './admin.service.js';

const VendorIdParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();
const VendorDeviceParamSchema = z.object({
  id: z.string().min(1).max(100),
  deviceId: z.string().min(1).max(100),
}).strict();
const VendorMenuParamSchema = z.object({
  id: z.string().min(1).max(100),
  itemId: z.string().min(1).max(100),
}).strict();

const CreateVendorAdminSchema = z.object({
  businessName: z.string().min(1).max(120),
  ownerName: z.string().max(120).optional().default('Stall Owner'),
  phone: z.string().min(10).max(15),
  password: z.string().min(6).max(200).optional(),
  quickPin: z.string().regex(/^\d{4}$/).optional(),
  city: z.string().max(80).optional(),
  edition: z.enum(['cloud', 'local']).optional(),
  subscriptionDays: z.number().int().positive().max(3650).optional(),
  monthlyFeeRupees: z.number().int().nonnegative().optional(),
  billingCycle: z.enum(['monthly', 'quarterly', 'annual']).optional(),
  initialPaymentStatus: z.enum(['paid', 'trial', 'pending']).optional(),
  upiId: z.string().max(120).optional(),
}).strict();

const UpdateVendorAdminSchema = z.object({
  businessName: z.string().min(1).max(120).optional(),
  ownerName: z.string().max(120).optional(),
  phone: z.string().min(10).max(15).optional(),
  city: z.string().max(80).optional(),
  edition: z.enum(['cloud', 'local']).optional(),
  subscriptionStatus: z.enum(['trial', 'active', 'expired', 'suspended']).optional(),
  subscriptionExpiresAt: z.string().min(4).max(64).optional(),
  suspendedReason: z.string().max(240).nullable().optional(),
  monthlyFeeRupees: z.number().int().nonnegative().max(1000000).optional(),
  taxMode: z.enum(['unregistered', 'composition', 'regular']).optional(),
  gstin: z.string().max(15).nullable().optional(),
  fssaiNumber: z.string().max(14).nullable().optional(),
  password: z.string().min(6).max(200).optional(),
  quickPin: z.string().regex(/^\d{4}$/).optional(),
}).strict();

const RenewVendorAdminSchema = z.object({
  days: z.number().int().positive().max(3650).optional(),
  customExpiresAt: z.string().min(4).max(64).optional(),
  amountPaise: z.number().int().nonnegative(),
  paymentMethod: z.enum(['upi', 'cash', 'bank', 'trial']),
  paymentReference: z.string().max(100).optional(),
}).strict();

const CreateMenuItemAdminSchema = z.object({
  name: z.string().min(1).max(120),
  pricePaise: z.number().int().positive(),
  category: z.string().min(1).max(80),
  emojiIcon: z.string().max(16).optional(),
  colorHex: z.string().max(20).optional(),
}).strict();

const UpdateMenuItemAdminSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  pricePaise: z.number().int().positive().optional(),
  category: z.string().min(1).max(80).optional(),
  isAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).strict();

export function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const res: any = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = serializeBigInt(v);
    }
    return res;
  }
  return obj;
}

function parseSafeDbEndpoint(): { engine: string; port: string | null } {
  if (process.env.USE_MEMORY_DB === 'true') {
    return { engine: 'in-memory', port: null };
  }
  try {
    const url = new URL(loadConfig().DATABASE_URL);
    return { engine: 'PostgreSQL 16', port: url.port || '5432' };
  } catch {
    return { engine: 'PostgreSQL 16', port: null };
  }
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);
  app.addHook('preHandler', requireRole('superadmin'));

  app.get('/overview', async (_request, reply) => {
    const overview = await withSuperadminContext((db) => AdminService.getOverview(db));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(overview),
    });
  });

  app.get('/vendors', async (_request, reply) => {
    const vendors = await withSuperadminContext((db) => AdminService.listVendors(db));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(vendors),
    });
  });

  app.get('/vendors/:id/detail', async (request, reply) => {
    const { id } = validateSchema(VendorIdParamSchema, request.params);
    const detail = await withSuperadminContext((db) => AdminService.getVendorDetail(db, id));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(detail),
    });
  });

  app.post('/vendors', async (request, reply) => {
    const body = validateSchema(CreateVendorAdminSchema, request.body);
    const actor = { adminId: request.user?.sub, ipAddress: request.ip };
    const result = await withSuperadminContext((db) => AdminService.createVendor(db, body, actor));
    return reply.status(201).send({
      status: 'success',
      message: 'Restaurant stall onboarded successfully',
      data: serializeBigInt(result),
    });
  });

  app.patch('/vendors/:id', async (request, reply) => {
    const { id } = validateSchema(VendorIdParamSchema, request.params);
    const body = validateSchema(UpdateVendorAdminSchema, request.body);
    const actor = { adminId: request.user?.sub, ipAddress: request.ip };
    const updated = await withSuperadminContext((db) => AdminService.updateVendor(db, id, body, actor));
    return reply.status(200).send({
      status: 'success',
      message: 'Restaurant stall updated successfully',
      data: serializeBigInt(updated),
    });
  });

  app.post('/vendors/:id/renew', async (request, reply) => {
    const { id } = validateSchema(VendorIdParamSchema, request.params);
    const body = validateSchema(RenewVendorAdminSchema, request.body);
    const actor = { adminId: request.user?.sub, ipAddress: request.ip };
    const result = await withSuperadminContext((db) => AdminService.renewVendor(db, id, body, actor));
    return reply.status(200).send({
      status: 'success',
      message: 'Subscription renewed successfully',
      data: serializeBigInt(result),
    });
  });

  app.post('/vendors/:id/unlock', async (request, reply) => {
    const { id } = validateSchema(VendorIdParamSchema, request.params);
    const actor = { adminId: request.user?.sub, ipAddress: request.ip };
    const result = await withSuperadminContext((db) => AdminService.unlockVendorAccount(db, id, actor));
    return reply.status(200).send({
      status: 'success',
      message: 'Account lockout cleared',
      data: serializeBigInt(result),
    });
  });

  app.delete('/vendors/:id/devices/:deviceId', async (request, reply) => {
    const { id, deviceId } = validateSchema(VendorDeviceParamSchema, request.params);
    const actor = { adminId: request.user?.sub, ipAddress: request.ip };
    const revoked = await withSuperadminContext((db) => AdminService.revokeVendorDevice(db, id, deviceId, actor));
    return reply.status(200).send({
      status: 'success',
      message: 'Device revoked successfully',
      data: serializeBigInt(revoked),
    });
  });

  app.get('/vendors/:id/menu', async (request, reply) => {
    const { id } = validateSchema(VendorIdParamSchema, request.params);
    const menu = await withSuperadminContext((db) => AdminService.getVendorMenu(db, id));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(menu),
    });
  });

  app.post('/vendors/:id/menu', async (request, reply) => {
    const { id } = validateSchema(VendorIdParamSchema, request.params);
    const body = validateSchema(CreateMenuItemAdminSchema, request.body);
    const item = await withSuperadminContext((db) => AdminService.createVendorMenuItem(db, id, body));
    return reply.status(201).send({
      status: 'success',
      message: 'Menu item created successfully',
      data: serializeBigInt(item),
    });
  });

  app.patch('/vendors/:id/menu/:itemId', async (request, reply) => {
    const { id, itemId } = validateSchema(VendorMenuParamSchema, request.params);
    const body = validateSchema(UpdateMenuItemAdminSchema, request.body);
    const updated = await withSuperadminContext((db) => AdminService.updateVendorMenuItem(db, id, itemId, body));
    return reply.status(200).send({
      status: 'success',
      message: 'Menu item updated successfully',
      data: serializeBigInt(updated),
    });
  });

  app.get('/users', async (_request, reply) => {
    const users = await withSuperadminContext((db) => AdminService.listUsers(db));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(users),
    });
  });

  app.get('/analytics', async (_request, reply) => {
    const analytics = await withSuperadminContext((db) => AdminService.getAnalytics(db));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(analytics),
    });
  });

  app.get('/audit-logs', async (_request, reply) => {
    const logs = await withSuperadminContext((db) => AdminService.getAuditLogs(db, 100));
    return reply.status(200).send({
      status: 'success',
      data: serializeBigInt(logs),
    });
  });

  app.get('/system-health', async (_request, reply) => {
    const dbEndpoint = parseSafeDbEndpoint();
    let dbStatus = 'healthy';
    let latencyMs = 0;

    if (process.env.USE_MEMORY_DB !== 'true') {
      const start = performance.now();
      try {
        await withSuperadminContext((db) => sql`SELECT 1`.execute(db));
        latencyMs = Math.max(1, Math.round(performance.now() - start));
      } catch {
        dbStatus = 'degraded';
        latencyMs = Math.round(performance.now() - start);
      }
    }

    const wsStats = WebSocketHub.getStats();

    return reply.status(200).send({
      status: 'success',
      data: {
        database: {
          status: dbStatus,
          engine: dbEndpoint.engine,
          port: dbEndpoint.port,
          latencyMs,
        },
        websocketHotspot: {
          status: 'active',
          connectedClients: wsStats.totalClients,
          activeStalls: wsStats.totalStalls,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });
};
