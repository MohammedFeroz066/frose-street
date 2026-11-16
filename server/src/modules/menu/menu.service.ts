import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { AppError } from '../../errors/app-error.js';
import { STREET_MENU_PRESETS } from './menu.presets.js';
import { WebSocketHub } from '../websocket/websocket.hub.js';

export interface CreateMenuItemInput {
  name: string;
  pricePaise: number;
  category?: string;
  emojiIcon?: string;
  colorHex?: string;
  displayOrder?: number;
  isAvailable?: boolean;
}

export interface UpdateMenuItemInput {
  name?: string;
  pricePaise?: number;
  category?: string;
  emojiIcon?: string;
  colorHex?: string;
  displayOrder?: number;
  isAvailable?: boolean;
}

export class MenuService {
  /**
   * Retrieves menu items for a stall
   */
  static async getMenuItems(db: Kysely<Database>, vendorId: string, options?: { availableOnly?: boolean }) {
    let query = db
      .selectFrom('menu_items')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .where('is_active', '=', true);

    if (options?.availableOnly) {
      query = query.where('is_available', '=', true);
    }

    const items = await query.orderBy('display_order', 'asc').orderBy('created_at', 'asc').execute();

    return items.map((item) => ({
      id: item.id,
      vendorId: item.vendor_id,
      name: item.name,
      pricePaise: Number(item.price_paise),
      priceRupees: Number(item.price_paise) / 100,
      category: item.category || 'General',
      emojiIcon: item.emoji_icon || '🍽️',
      colorHex: item.color_hex || '#f59e0b',
      displayOrder: item.display_order,
      isAvailable: item.is_available,
      isActive: item.is_active,
      createdAt: item.created_at,
    }));
  }

  /**
   * Creates a new menu item with strict integer paise price validation
   */
  static async createMenuItem(db: Kysely<Database>, vendorId: string, input: CreateMenuItemInput) {
    if (!input.name || input.name.trim().length === 0) {
      throw AppError.badRequest('Item name is required', 'MISSING_ITEM_NAME');
    }

    if (
      typeof input.pricePaise !== 'number' ||
      !Number.isInteger(input.pricePaise) ||
      input.pricePaise <= 0
    ) {
      throw AppError.badRequest(
        'Price must be a positive integer in paise (e.g., ₹50 = 5000 paise). Decimals are forbidden.',
        'INVALID_PRICE_PAISE',
      );
    }

    // Determine display order if not specified
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined) {
      const highest = await db
        .selectFrom('menu_items')
        .select('display_order')
        .where('vendor_id', '=', vendorId)
        .where('is_active', '=', true)
        .orderBy('display_order', 'desc')
        .executeTakeFirst();
      displayOrder = (highest?.display_order ?? 0) + 1;
    }

    const created = await db
      .insertInto('menu_items')
      .values({
        vendor_id: vendorId,
        name: input.name.trim(),
        price_paise: BigInt(input.pricePaise),
        category: input.category?.trim() || 'General',
        emoji_icon: input.emojiIcon || '🍽️',
        color_hex: input.colorHex || '#f59e0b',
        display_order: displayOrder,
        is_available: input.isAvailable !== false,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: created.id,
      vendorId: created.vendor_id,
      name: created.name,
      pricePaise: Number(created.price_paise),
      priceRupees: Number(created.price_paise) / 100,
      category: created.category,
      emojiIcon: created.emoji_icon,
      colorHex: created.color_hex,
      displayOrder: created.display_order,
      isAvailable: created.is_available,
      isActive: created.is_active,
      createdAt: created.created_at,
    };
  }

  /**
   * Updates an existing menu item
   */
  static async updateMenuItem(
    db: Kysely<Database>,
    vendorId: string,
    itemId: string,
    input: UpdateMenuItemInput,
  ) {
    const existing = await db
      .selectFrom('menu_items')
      .selectAll()
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!existing) {
      throw AppError.notFound('Menu item not found or does not belong to your stall', 'ITEM_NOT_FOUND');
    }

    if (input.pricePaise !== undefined) {
      if (
        typeof input.pricePaise !== 'number' ||
        !Number.isInteger(input.pricePaise) ||
        input.pricePaise <= 0
      ) {
        throw AppError.badRequest(
          'Price must be a positive integer in paise. Floating-point numbers are not allowed.',
          'INVALID_PRICE_PAISE',
        );
      }
    }

    const updatePayload: any = {};
    if (input.name !== undefined) updatePayload.name = input.name.trim();
    if (input.pricePaise !== undefined) updatePayload.price_paise = BigInt(input.pricePaise);
    if (input.category !== undefined) updatePayload.category = input.category.trim();
    if (input.emojiIcon !== undefined) updatePayload.emoji_icon = input.emojiIcon;
    if (input.colorHex !== undefined) updatePayload.color_hex = input.colorHex;
    if (input.displayOrder !== undefined) updatePayload.display_order = input.displayOrder;
    if (input.isAvailable !== undefined) updatePayload.is_available = input.isAvailable;

    await db
      .updateTable('menu_items')
      .set(updatePayload)
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .execute();

    const updated = await db
      .selectFrom('menu_items')
      .selectAll()
      .where('id', '=', itemId)
      .executeTakeFirstOrThrow();

    return {
      id: updated.id,
      vendorId: updated.vendor_id,
      name: updated.name,
      pricePaise: Number(updated.price_paise),
      priceRupees: Number(updated.price_paise) / 100,
      category: updated.category,
      emojiIcon: updated.emoji_icon,
      colorHex: updated.color_hex,
      displayOrder: updated.display_order,
      isAvailable: updated.is_available,
      isActive: updated.is_active,
    };
  }

  /**
   * 1-Tap Toggle item availability (In-Stock / Out-of-Stock)
   */
  static async toggleAvailability(db: Kysely<Database>, vendorId: string, itemId: string) {
    const existing = await db
      .selectFrom('menu_items')
      .select(['id', 'name', 'is_available'])
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!existing) {
      throw AppError.notFound('Menu item not found', 'ITEM_NOT_FOUND');
    }

    const newStatus = !existing.is_available;

    await db
      .updateTable('menu_items')
      .set({ is_available: newStatus })
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .execute();

    const result = {
      id: existing.id,
      name: existing.name,
      isAvailable: newStatus,
      statusText: newStatus ? 'In Stock' : 'Out of Stock',
    };

    // Broadcast availability change to cashier counter in real time
    WebSocketHub.broadcast(vendorId, 'menu:availability_changed', result);

    return result;
  }

  /**
   * Soft-deletes a menu item
   */
  static async deleteMenuItem(db: Kysely<Database>, vendorId: string, itemId: string) {
    const existing = await db
      .selectFrom('menu_items')
      .select(['id', 'name'])
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .where('is_active', '=', true)
      .executeTakeFirst();

    if (!existing) {
      throw AppError.notFound('Menu item not found', 'ITEM_NOT_FOUND');
    }

    await db
      .updateTable('menu_items')
      .set({ is_active: false })
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .execute();

    return {
      success: true,
      message: `Item "${existing.name}" removed from menu`,
    };
  }

  /**
   * Seeds quick street preset items for new stalls
   */
  static async seedPresets(db: Kysely<Database>, vendorId: string, presetCategory: string) {
    const preset = STREET_MENU_PRESETS[presetCategory];
    if (!preset) {
      throw AppError.badRequest(
        `Invalid preset category "${presetCategory}". Available: ${Object.keys(STREET_MENU_PRESETS).join(', ')}`,
        'INVALID_PRESET',
      );
    }

    // Get current max display order
    const highest = await db
      .selectFrom('menu_items')
      .select('display_order')
      .where('vendor_id', '=', vendorId)
      .where('is_active', '=', true)
      .orderBy('display_order', 'desc')
      .executeTakeFirst();

    let startOrder = (highest?.display_order ?? 0) + 1;
    const insertedItems: any[] = [];

    for (const item of preset.items) {
      const inserted = await db
        .insertInto('menu_items')
        .values({
          vendor_id: vendorId,
          name: item.name,
          price_paise: BigInt(item.pricePaise),
          category: item.category,
          emoji_icon: item.emojiIcon,
          color_hex: item.colorHex,
          display_order: startOrder++,
          is_available: true,
          is_active: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      insertedItems.push({
        id: inserted.id,
        name: inserted.name,
        pricePaise: Number(inserted.price_paise),
        priceRupees: Number(inserted.price_paise) / 100,
        category: inserted.category,
        emojiIcon: inserted.emoji_icon,
        colorHex: inserted.color_hex,
        displayOrder: inserted.display_order,
      });
    }

    return {
      presetKey: presetCategory,
      presetLabel: preset.label,
      itemsCount: insertedItems.length,
      items: insertedItems,
    };
  }

  /**
   * Lists available preset categories
   */
  static getPresetCatalog() {
    return Object.entries(STREET_MENU_PRESETS).map(([key, value]) => ({
      key,
      label: value.label,
      totalItems: value.items.length,
      previewItems: value.items.slice(0, 3).map((i) => `${i.emojiIcon} ${i.name} (₹${i.pricePaise / 100})`),
    }));
  }
}
