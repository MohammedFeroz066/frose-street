import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { MenuService } from './menu.service.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validateSchema } from '../auth/auth.schemas.js';
import { getDatabase } from '../../db/database.js';

const MenuListQuerySchema = z.object({
  availableOnly: z.union([z.boolean(), z.enum(['true', 'false'])]).optional(),
}).strict();

const SeedPresetSchema = z.object({
  presetKey: z.string().min(1).max(80),
}).strict();

const CreateMenuSchema = z.object({
  name: z.string().min(1).max(120),
  pricePaise: z.number(),
  category: z.string().max(80).optional(),
  emojiIcon: z.string().max(16).optional(),
  colorHex: z.string().max(20).optional(),
  imageUrl: z.string().max(500000).optional(),
  displayOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
}).strict();

const UpdateMenuSchema = CreateMenuSchema.partial().strict();
const MenuIdParamSchema = z.object({ id: z.string().min(1).max(100) }).strict();

export const menuRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * GET /api/v1/menu
   * Retrieves active menu items for stall
   */
  app.get('/', { preHandler: [requireAuth] }, async (request, reply) => {
    const db = getDatabase();
    const query = validateSchema(MenuListQuerySchema, request.query || {});
    const availableOnly = query.availableOnly === 'true' || query.availableOnly === true;

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
      const body = validateSchema(SeedPresetSchema, request.body);

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
      const body = validateSchema(CreateMenuSchema, request.body);

      const item = await MenuService.createMenuItem(db, request.user!.sub, body);

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
      const params = validateSchema(MenuIdParamSchema, request.params);
      const body = validateSchema(UpdateMenuSchema, request.body || {});

      const item = await MenuService.updateMenuItem(db, request.user!.sub, params.id, body);

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
      const params = validateSchema(MenuIdParamSchema, request.params);

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
      const params = validateSchema(MenuIdParamSchema, request.params);

      const result = await MenuService.deleteMenuItem(db, request.user!.sub, params.id);

      return reply.status(200).send({
        status: 'success',
        message: result.message,
      });
    },
  );
};
