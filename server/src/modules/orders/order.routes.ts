import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { OrderService } from './order.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { withTenantContext } from '../../db/rls-context.js';

const OrderItemInputSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  notes: z.string().max(300).optional(),
  variantName: z.string().trim().min(1).max(60).optional(),
}).strict();

const CreateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1),
  paymentMethod: z.enum(['cash', 'upi', 'split']),
  cashPaise: z.number().int().nonnegative().optional(),
  upiPaise: z.number().int().nonnegative().optional(),
  paymentStatus: z.enum(['paid', 'pending']).optional(),
  customerName: z.string().max(100).optional(),
  customerPhone: z.string().max(20).optional(),
  notes: z.string().max(300).optional(),
  orderType: z.enum(['dinein', 'parcel', 'counter', 'takeaway']).optional(),
  source: z.enum(['pos', 'qr_customer', 'online']).optional(),
  clientOrderId: z.string().uuid().optional(),
  createdAtClient: z.string().datetime().optional(),
}).strict();

const UpdateOrderSchema = z.object({
  items: z.array(OrderItemInputSchema).min(1),
  paymentMode: z.enum(['cash', 'upi', 'split']).optional(),
  paymentMethod: z.enum(['cash', 'upi', 'split']).optional(),
  cashPaise: z.number().int().nonnegative().optional(),
  upiPaise: z.number().int().nonnegative().optional(),
  notes: z.string().max(300).nullable().optional(),
  orderType: z.enum(['dinein', 'parcel', 'counter', 'takeaway']).optional(),
  editNote: z.string().trim().max(240).optional(),
}).strict();

const OrderHistoryQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional(),
  offset: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['pending', 'preparing', 'ready', 'served', 'cancelled']).optional(),
  paymentMethod: z.enum(['cash', 'upi', 'split']).optional(),
  paymentMode: z.enum(['cash', 'upi', 'split']).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(100).optional(),
}).strict();

const OrderIdParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();

const UpdateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'preparing', 'ready', 'served', 'cancelled']),
  reason: z.string().trim().min(3, 'Void/cancel reason must be at least 3 characters').max(200).optional(),
}).strict().superRefine((val, ctx) => {
  if (val.status === 'cancelled' && (!val.reason || val.reason.trim().length < 3)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A void/cancel reason of at least 3 characters is required when cancelling an order',
    });
  }
});

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

      const result = await withTenantContext(request.user!.sub, (db) =>
        OrderService.createOrder(db, request.user!.sub, body),
      );

      const { idempotentReplay, ...order } = result as any;
      return reply.status(idempotentReplay ? 200 : 201).send({
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
        paymentMode: query.paymentMode ?? query.paymentMethod,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        search: query.search,
      }),
    );

    return reply.status(200).send({
      status: 'success',
      ...result,
    });
  });

  /**
   * PUT /api/v1/orders/:id
   * Edits items, quantities, notes, or split payment mode on a non-cancelled order
   */
  app.put(
    '/:id',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const params = validateSchema(OrderIdParamSchema, request.params);
      const body = validateSchema(UpdateOrderSchema, request.body);

      const order = await withTenantContext(request.user!.sub, (db) =>
        OrderService.updateOrder(db, request.user!.sub, params.id, {
          items: body.items,
          paymentMethod: body.paymentMode ?? body.paymentMethod,
          cashPaise: body.cashPaise,
          upiPaise: body.upiPaise,
          notes: body.notes,
          orderType: body.orderType,
          editNote: body.editNote,
        }),
      );

      return reply.status(200).send({
        status: 'success',
        message: `Order #${order.tokenNo} updated successfully`,
        order,
      });
    },
  );

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
        body.reason,
      ),
    );

    return reply.status(200).send({
      status: 'success',
      message: `Order #${result.tokenNo} status updated to ${result.newStatus}`,
      ...result,
    });
  });
};
