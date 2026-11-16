import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { MenuService } from './menu.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { AppError } from '../../errors/app-error.js';

export const menuRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * GET /api/v1/menu
   * Retrieves active menu items for stall
   */
  app.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDatabase();
    const query = request.query as any;
    const availableOnly = query?.availableOnly === 'true' || query?.availableOnly === true;

    const items = await MenuService.getMenuItems(db, request.user!.sub, { availableOnly });

    return reply.status(200).send({
      status: 'success',
      count: items.length,
      items,
    });
  });

  /**
   * GET /api/v1/menu/presets
   * Returns catalog of pre-packaged street food menus
   */
  app.get('/presets', async (_request, reply) => {
    const presets = MenuService.getPresetCatalog();
    return reply.status(200).send({
      status: 'success',
      presets,
    });
  });

  /**
   * POST /api/v1/menu/presets/seed
   * 1-Tap seeds preset items for stall
   */
  app.post(
    '/presets/seed',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const body = request.body as any;

      if (!body || !body.presetKey) {
        throw AppError.badRequest('presetKey is required', 'MISSING_PRESET_KEY');
      }

      const result = await MenuService.seedPresets(db, request.user!.sub, body.presetKey);

      return reply.status(201).send({
        status: 'success',
        message: `Successfully seeded ${result.itemsCount} items from "${result.presetLabel}"`,
        ...result,
      });
    },
  );

  /**
   * POST /api/v1/menu
   * Adds a new item with strict integer paise price
   */
  app.post(
    '/',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const body = request.body as any;

      if (!body) {
        throw AppError.badRequest('Request body is required', 'MISSING_BODY');
      }

      const item = await MenuService.createMenuItem(db, request.user!.sub, {
        name: body.name,
        pricePaise: body.pricePaise,
        category: body.category,
        emojiIcon: body.emojiIcon,
        colorHex: body.colorHex,
        displayOrder: body.displayOrder,
        isAvailable: body.isAvailable,
      });

      return reply.status(201).send({
        status: 'success',
        message: 'Menu item created successfully',
        item,
      });
    },
  );

  /**
   * PUT /api/v1/menu/:id
   * Updates an existing menu item
   */
  app.put(
    '/:id',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const params = request.params as any;
      const body = request.body as any;

      if (!params || !params.id) {
        throw AppError.badRequest('Item ID is required in URL parameter', 'MISSING_ITEM_ID');
      }

      const item = await MenuService.updateMenuItem(db, request.user!.sub, params.id, body || {});

      return reply.status(200).send({
        status: 'success',
        message: 'Menu item updated successfully',
        item,
      });
    },
  );

  /**
   * PATCH /api/v1/menu/:id/toggle-available
   * 1-Tap toggle availability (In-Stock / Out-of-Stock)
   * Accessible by owner, cashier, and cook
   */
  app.patch(
    '/:id/toggle-available',
    { preHandler: [requireAuth, requireRole('owner', 'cashier', 'cook')] },
    async (request, reply) => {
      const db = getDatabase();
      const params = request.params as any;

      if (!params || !params.id) {
        throw AppError.badRequest('Item ID is required', 'MISSING_ITEM_ID');
      }

      const result = await MenuService.toggleAvailability(db, request.user!.sub, params.id);

      return reply.status(200).send({
        status: 'success',
        ...result,
      });
    },
  );

  /**
   * DELETE /api/v1/menu/:id
   * Soft-deletes a menu item
   */
  app.delete(
    '/:id',
    { preHandler: [requireAuth, requireRole('owner', 'cashier')] },
    async (request, reply) => {
      const db = getDatabase();
      const params = request.params as any;

      if (!params || !params.id) {
        throw AppError.badRequest('Item ID is required', 'MISSING_ITEM_ID');
      }

      const result = await MenuService.deleteMenuItem(db, request.user!.sub, params.id);

      return reply.status(200).send({
        status: 'success',
        message: result.message,
      });
    },
  );
};
