import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { AppError } from '../../errors/app-error.js';
import { hashPassword, hashPin } from '../../utils/crypto.js';
import { randomUUID } from 'node:crypto';

export interface CreateVendorAdminInput {
  businessName: string;
  ownerName: string;
  phone: string;
  password?: string;
  quickPin?: string;
  city?: string;
  edition?: 'cloud' | 'local';
  subscriptionDays?: number;
}

export interface UpdateVendorAdminInput {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  city?: string;
  edition?: 'cloud' | 'local';
  subscriptionStatus?: 'trial' | 'active' | 'expired' | 'suspended';
  subscriptionExpiresAt?: string;
  password?: string;
  quickPin?: string;
}

export interface CreateMenuItemAdminInput {
  name: string;
  pricePaise: number;
  category: string;
  emojiIcon?: string;
  colorHex?: string;
}

export class AdminService {
  /**
   * Returns executive platform overview KPIs (Total Stalls, Gross Sales in Paise, Renewals)
   */
  static async getOverview(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const orders = await db.selectFrom('orders').selectAll().execute();

    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;
    const todayStr = new Date().toISOString().split('T')[0];

    let activeCount = 0;
    let trialCount = 0;
    let expiredCount = 0;
    let expiringCount = 0;

    for (const v of vendors) {
      const expiresAt = v.subscription_expires_at ? new Date(v.subscription_expires_at).getTime() : 0;
      if (v.subscription_status === 'trial') {
        trialCount++;
      } else if (expiresAt < now || v.subscription_status === 'expired') {
        expiredCount++;
      } else {
        activeCount++;
      }

      if (expiresAt > now && expiresAt <= in7Days) {
        expiringCount++;
      }
    }

    let grossPaise = 0n;
    let cashPaise = 0n;
    let upiPaise = 0n;
    let todayOrdersCount = 0;

    for (const o of orders) {
      const status = (o as any).order_status || (o as any).status;
      if (status !== 'cancelled') {
        const paise = BigInt(o.total_paise || 0);
        grossPaise += paise;
        if (o.payment_method === 'cash') cashPaise += paise;
        if (o.payment_method === 'upi') upiPaise += paise;

        const dateStr = typeof o.created_at === 'string' ? o.created_at : (o.created_at as Date)?.toISOString?.() || '';
        if (dateStr.startsWith(todayStr)) {
          todayOrdersCount++;
        }
      }
    }

    return {
      totalVendors: vendors.length,
      activeVendors: activeCount,
      trialVendors: trialCount,
      expiredVendors: expiredCount,
      expiringVendors: expiringCount,
      grossSalesPaise: grossPaise.toString(),
      cashSalesPaise: cashPaise.toString(),
      upiSalesPaise: upiPaise.toString(),
      todayOrders: todayOrdersCount,
      totalOrders: orders.length,
    };
  }

  /**
   * Returns all vendors with lifetime statistics
   */
  static async listVendors(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const orders = await db.selectFrom('orders').selectAll().execute();

    // Group sales by vendor
    const vendorSalesMap = new Map<string, { count: number; totalPaise: bigint }>();
    for (const o of orders) {
      const status = (o as any).order_status || (o as any).status;
      if (status !== 'cancelled' && o.vendor_id) {
        const cur = vendorSalesMap.get(o.vendor_id) || { count: 0, totalPaise: 0n };
        cur.count++;
        cur.totalPaise += BigInt(o.total_paise || 0);
        vendorSalesMap.set(o.vendor_id, cur);
      }
    }

    return vendors.map((v) => {
      const stats = vendorSalesMap.get(v.id) || { count: 0, totalPaise: 0n };
      return {
        id: v.id,
        businessName: v.business_name,
        ownerName: v.owner_name,
        phone: v.phone,
        city: v.city || 'Hyderabad',
        businessType: v.business_type,
        edition: v.edition,
        subscriptionStatus: v.subscription_status,
        subscriptionExpiresAt: v.subscription_expires_at,
        hasQuickPin: !!v.quick_pin_hash,
        totalOrders: stats.count,
        lifetimeSalesPaise: stats.totalPaise.toString(),
        createdAt: v.created_at,
      };
    });
  }

  /**
   * Onboard a new restaurant/stall directly from Admin Dashboard
   */
  static async createVendor(db: Kysely<Database>, input: CreateVendorAdminInput) {
    const cleanedPhone = (input.phone || '').replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      throw AppError.badRequest('Valid 10-digit mobile number required', 'INVALID_PHONE');
    }
    if (!input.businessName || input.businessName.trim().length < 2) {
      throw AppError.badRequest('Business name must be at least 2 characters', 'INVALID_NAME');
    }

    const existing = await db
      .selectFrom('vendors')
      .selectAll()
      .where('phone', '=', cleanedPhone)
      .executeTakeFirst();

    if (existing) {
      throw AppError.conflict('A stall with this mobile number already exists', 'DUPLICATE_PHONE');
    }

    const rawPassword = input.password || 'FROSE@2026';
    const passwordHash = await hashPassword(rawPassword);
    const pin = input.quickPin && /^\d{4}$/.test(input.quickPin) ? input.quickPin : '1234';
    const pinHash = await hashPin(pin);

    const subDays = input.subscriptionDays || 14;
    const expiryDate = new Date(Date.now() + subDays * 24 * 3600 * 1000).toISOString();

    const vendorId = `v-${randomUUID().substring(0, 8)}`;

    const newVendor = await db
      .insertInto('vendors')
      .values({
        id: vendorId,
        phone: cleanedPhone,
        business_name: input.businessName.trim(),
        owner_name: input.ownerName ? input.ownerName.trim() : 'Stall Owner',
        business_type: 'Street Food Stall',
        city: input.city ? input.city.trim() : 'Hyderabad',
        edition: input.edition || 'cloud',
        subscription_status: subDays > 14 ? 'active' : 'trial',
        subscription_expires_at: expiryDate,
        daily_token_counter: 0,
        token_reset_date: new Date().toISOString().split('T')[0],
        password_hash: passwordHash,
        quick_pin_hash: pinHash,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Create default cashier staff
    await db
      .insertInto('staff')
      .values({
        id: `staff-${randomUUID().substring(0, 8)}`,
        vendor_id: newVendor.id,
        name: newVendor.owner_name || 'Counter Staff',
        role: 'cashier',
        phone: newVendor.phone,
        is_active: true,
        password_hash: passwordHash,
        quick_pin_hash: pinHash,
      })
      .execute();

    return {
      vendor: newVendor,
      generatedPassword: rawPassword,
      generatedPin: pin,
    };
  }

  /**
   * Update stall details, extend renewal, or reset password
   */
  static async updateVendor(db: Kysely<Database>, vendorId: string, input: UpdateVendorAdminInput) {
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    const updates: any = {};
    if (input.businessName) updates.business_name = input.businessName.trim();
    if (input.ownerName) updates.owner_name = input.ownerName.trim();
    if (input.city) updates.city = input.city.trim();
    if (input.edition) updates.edition = input.edition;
    if (input.subscriptionStatus) updates.subscription_status = input.subscriptionStatus;
    if (input.subscriptionExpiresAt) updates.subscription_expires_at = input.subscriptionExpiresAt;

    if (input.phone) {
      const cleaned = input.phone.replace(/\D/g, '');
      if (cleaned.length === 10) updates.phone = cleaned;
    }

    if (input.password && input.password.length >= 6) {
      updates.password_hash = await hashPassword(input.password);
    }

    if (input.quickPin && /^\d{4}$/.test(input.quickPin)) {
      updates.quick_pin_hash = await hashPin(input.quickPin);
    }

    updates.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('vendors')
      .set(updates)
      .where('id', '=', vendorId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return updated;
  }

  /**
   * List menu items for a specific vendor
   */
  static async getVendorMenu(db: Kysely<Database>, vendorId: string) {
    return await db
      .selectFrom('menu_items')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .execute();
  }

  /**
   * Add a new menu item to a vendor
   */
  static async createVendorMenuItem(db: Kysely<Database>, vendorId: string, input: CreateMenuItemAdminInput) {
    if (!input.name || input.name.trim().length < 2) {
      throw AppError.badRequest('Item name must be at least 2 characters', 'INVALID_NAME');
    }
    if (typeof input.pricePaise !== 'number' || input.pricePaise <= 0) {
      throw AppError.badRequest('Price in paise must be positive integer', 'INVALID_PRICE');
    }

    const newItem = await db
      .insertInto('menu_items')
      .values({
        id: `item-${randomUUID().substring(0, 8)}`,
        vendor_id: vendorId,
        name: input.name.trim(),
        price_paise: Math.round(input.pricePaise),
        category: input.category || 'General',
        emoji_icon: input.emojiIcon || '🍽️',
        color_hex: input.colorHex || '#0284c7',
        display_order: 0,
        is_available: true,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return newItem;
  }

  /**
   * Edit or toggle a menu item
   */
  static async updateVendorMenuItem(
    db: Kysely<Database>,
    vendorId: string,
    itemId: string,
    input: { name?: string; pricePaise?: number; category?: string; isAvailable?: boolean; isActive?: boolean }
  ) {
    const item = await db
      .selectFrom('menu_items')
      .selectAll()
      .where('id', '=', itemId)
      .where('vendor_id', '=', vendorId)
      .executeTakeFirst();

    if (!item) {
      throw AppError.notFound('Menu item not found', 'ITEM_NOT_FOUND');
    }

    const updates: any = {};
    if (input.name) updates.name = input.name.trim();
    if (typeof input.pricePaise === 'number' && input.pricePaise > 0) updates.price_paise = Math.round(input.pricePaise);
    if (input.category) updates.category = input.category;
    if (typeof input.isAvailable === 'boolean') updates.is_available = input.isAvailable;
    if (typeof input.isActive === 'boolean') updates.is_active = input.isActive;
    updates.updated_at = new Date().toISOString();

    const updated = await db
      .updateTable('menu_items')
      .set(updates)
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return updated;
  }
}
