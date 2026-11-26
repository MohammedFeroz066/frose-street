import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { OrderService } from './order.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { withTenantContext } from '../../db/rls-context.js';

const CreateOrderSchema = z.object({
  items: z.array(z.object({
    menuItemId: z.string().min(1),
    quantity: z.number().int().positive(),
    notes: z.string().max(300).optional(),
  }).strict()).min(1),
  paymentMethod: z.enum(['cash', 'upi', 'split']),
  paymentStatus: z.enum(['paid', 'pending']).optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(20).optional(),
  notes: z.string().max(300).optional(),
  source: z.enum(['pos', 'qr_customer', 'online']).optional(),
}).strict();

const OrderHistoryQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['pending', 'preparing', 'ready', 'served', 'cancelled']).optional(),
  paymentMethod: z.enum(['cash', 'upi', 'split']).optional(),
}).strict();

const OrderIdParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();

const UpdateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'served', 'cancelled']),
}).strict();

export const orderRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/orders
   * Punches a new order and returns atomic daily token number
   */
  app.post(
    '/',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const body = validateSchema(CreateOrderSchema, request.body);

      const order = await withTenantContext(request.user!.sub, (db) =>
        OrderService.createOrder(db, request.user!.sub, body),
      );

      return reply.status(201).send({
        status: 'success',
        message: `Order punched successfully: Token #${order.tokenNo}`,
        order,
      });
    },
  );

  /**
   * GET /api/v1/orders/live
   * Returns active queues for Kitchen KDS and Packaging display
   */
  app.get('/live', { preHandler: [requireAuth] }, async (request, reply) => {
    const queues = await withTenantContext(request.user!.sub, (db) =>
      OrderService.getLiveOrders(db, request.user!.sub),
    );

    return reply.status(200).send({
      status: 'success',
      ...queues,
    });
  });

  /**
   * GET /api/v1/orders/history
   * Retrieves order history with optional filtering
   */
  app.get('/history', { preHandler: [requireAuth] }, async (request, reply) => {
    const query = validateSchema(OrderHistoryQuerySchema, request.query || {});

    const result = await withTenantContext(request.user!.sub, (db) =>
      OrderService.getOrderHistory(db, request.user!.sub, {
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
        status: query.status,
        paymentMethod: query.paymentMethod,
      }),
    );

    return reply.status(200).send({
      status: 'success',
      ...result,
    });
  });

  /**
   * GET /api/v1/orders/:id
   * Retrieves order details with item breakdown
   */
  app.get('/:id', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = validateSchema(OrderIdParamSchema, request.params);

    const order = await withTenantContext(request.user!.sub, (db) =>
      OrderService.getOrderById(db, request.user!.sub, params.id),
    );

    return reply.status(200).send({
      status: 'success',
      order,
    });
  });

  /**
   * PATCH /api/v1/orders/:id/status
   * Advances order through state machine (preparing -> ready -> served)
   */
  app.patch('/:id/status', { preHandler: [requireAuth] }, async (request, reply) => {
    const params = validateSchema(OrderIdParamSchema, request.params);
    const body = validateSchema(UpdateOrderStatusSchema, request.body);

    const result = await withTenantContext(request.user!.sub, (db) =>
      OrderService.updateOrderStatus(
        db,
        request.user!.sub,
        params.id,
        body.status,
        request.user!.role,
      ),
    );

    return reply.status(200).send({
      status: 'success',
      message: `Order #${result.tokenNo} status updated to ${result.newStatus}`,
      ...result,
    });
  });
};
