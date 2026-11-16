import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { OrderService, OrderStatus } from './order.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { AppError } from '../../errors/app-error.js';

export const orderRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/v1/orders
   * Punches a new order and returns atomic daily token number
   */
  app.post(
    '/',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const body = request.body as any;

      if (!body) {
        throw AppError.badRequest('Order payload is required', 'MISSING_ORDER_PAYLOAD');
      }

      const order = await OrderService.createOrder(db, request.user!.sub, {
        items: body.items,
        paymentMethod: body.paymentMethod,
        paymentStatus: body.paymentStatus,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        notes: body.notes,
        source: body.source,
      });

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
    const db = getDatabase();
    const queues = await OrderService.getLiveOrders(db, request.user!.sub);

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
    const db = getDatabase();
    const query = request.query as any;

    const result = await OrderService.getOrderHistory(db, request.user!.sub, {
      limit: query?.limit ? parseInt(query.limit, 10) : undefined,
      offset: query?.offset ? parseInt(query.offset, 10) : undefined,
      status: query?.status,
      paymentMethod: query?.paymentMethod,
    });

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
    const db = getDatabase();
    const params = request.params as any;

    if (!params || !params.id) {
      throw AppError.badRequest('Order ID is required', 'MISSING_ORDER_ID');
    }

    const order = await OrderService.getOrderById(db, request.user!.sub, params.id);

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
    const db = getDatabase();
    const params = request.params as any;
    const body = request.body as any;

    if (!params || !params.id) {
      throw AppError.badRequest('Order ID is required', 'MISSING_ORDER_ID');
    }

    if (!body || !body.status) {
      throw AppError.badRequest('Target status is required', 'MISSING_STATUS');
    }

    const validStatuses: OrderStatus[] = ['pending', 'preparing', 'ready', 'served', 'cancelled'];
    if (!validStatuses.includes(body.status)) {
      throw AppError.badRequest(
        `Invalid status. Allowed: ${validStatuses.join(', ')}`,
        'INVALID_STATUS',
      );
    }

    const result = await OrderService.updateOrderStatus(
      db,
      request.user!.sub,
      params.id,
      body.status,
      request.user!.role,
    );

    return reply.status(200).send({
      status: 'success',
      message: `Order #${result.tokenNo} status updated to ${result.newStatus}`,
      ...result,
    });
  });
};
