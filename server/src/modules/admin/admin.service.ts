import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { AppError } from '../../errors/app-error.js';
import { hashPassword, hashPin } from '../../utils/crypto.js';
import { getIstDateString } from '../../utils/ist-date.js';
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
  monthlyFeeRupees?: number;
  billingCycle?: 'monthly' | 'quarterly' | 'annual';
  initialPaymentStatus?: 'paid' | 'trial' | 'pending';
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
    const subscriptions = await db.selectFrom('subscriptions').selectAll().execute();
    const devices = await db.selectFrom('devices').selectAll().execute();

    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;
    const todayStr = getIstDateString();

    let activeCount = 0;
    let trialCount = 0;
    let expiredCount = 0;
    let expiringCount = 0;

    let cloudVendors = 0;
    let localVendors = 0;

    const clientVendors = vendors.filter((v: any) => !v.is_superadmin);
    for (const v of clientVendors) {
      if (v.edition === 'local') localVendors++;
      else cloudVendors++;

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

    let totalCollectedPaise = 0n;
    for (const s of subscriptions) {
      if (s.status === 'active') totalCollectedPaise += BigInt(s.amount_paise || 0);
    }
    const pendingStallsCount = expiredCount + expiringCount;
    const totalPendingPaise = BigInt(pendingStallsCount) * 49900n;
    const activeDevicesCount = devices.filter((d) => d.is_active).length;

    return {
      totalVendors: clientVendors.length,
      activeVendors: activeCount,
      trialVendors: trialCount,
      expiredVendors: expiredCount,
      expiringVendors: expiringCount,
      cloudVendors,
      localVendors,
      grossSalesPaise: grossPaise.toString(),
      cashSalesPaise: cashPaise.toString(),
      upiSalesPaise: upiPaise.toString(),
      totalCollectedPaise: totalCollectedPaise.toString(),
      totalPendingPaise: totalPendingPaise.toString(),
      todayOrders: todayOrdersCount,
      totalOrders: orders.length,
      activeDevicesCount,
      totalDevicesCount: devices.length,
    };
  }

  /**
   * Returns all vendors with lifetime statistics
   */
  static async listVendors(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const orders = await db.selectFrom('orders').selectAll().execute();
    const subscriptions = await db.selectFrom('subscriptions').selectAll().execute();
    const devices = await db.selectFrom('devices').selectAll().execute();

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

    const now = Date.now();
    const in7Days = now + 7 * 24 * 3600 * 1000;
    const clientVendors = vendors.filter((v: any) => !v.is_superadmin);
    return clientVendors.map((v) => {
      const stats = vendorSalesMap.get(v.id) || { count: 0, totalPaise: 0n };
      const vendorSubs = subscriptions.filter((s) => s.vendor_id === v.id);
      const vendorDevs = devices.filter((d) => d.vendor_id === v.id);

      const latestSub = vendorSubs[vendorSubs.length - 1];
      const monthlyFeePaise = latestSub?.amount_paise ? BigInt(latestSub.amount_paise).toString() : '49900';

      const expiresAt = v.subscription_expires_at ? new Date(v.subscription_expires_at).getTime() : 0;
      let paymentStatus: 'paid' | 'due_soon' | 'overdue' | 'trial' = 'paid';
      if (v.subscription_status === 'trial') {
        paymentStatus = 'trial';
      } else if (expiresAt < now || v.subscription_status === 'expired') {
        paymentStatus = 'overdue';
      } else if (expiresAt <= in7Days) {
        paymentStatus = 'due_soon';
      }

      let totalCollectedPaise = 0n;
      for (const s of vendorSubs) {
        if (s.status === 'active') totalCollectedPaise += BigInt(s.amount_paise || 0);
      }

      const pendingDuePaise = (paymentStatus === 'overdue' || paymentStatus === 'due_soon') ? monthlyFeePaise : '0';

      const lastPaymentDate = latestSub?.created_at
        ? (typeof latestSub.created_at === 'string' ? latestSub.created_at : (latestSub.created_at as Date)?.toISOString?.() || '')
        : (typeof v.created_at === 'string' ? v.created_at : (v.created_at as Date)?.toISOString?.() || '');

      return {
        id: v.id,
        isSuperadmin: !!(v as any).is_superadmin,
        role: (v as any).role || 'owner',
        businessName: v.business_name,
        ownerName: v.owner_name,
        phone: v.phone,
        city: v.city || 'Hyderabad',
        businessType: v.business_type,
        edition: v.edition,
        subscriptionStatus: v.subscription_status,
        subscriptionExpiresAt: v.subscription_expires_at,
        monthlyFeePaise,
        lastPaymentDate,
        nextDueDate: v.subscription_expires_at || new Date(now + 14 * 86400000).toISOString(),
        paymentStatus,
        totalCollectedPaise: totalCollectedPaise.toString(),
        pendingDuePaise,
        deviceCount: vendorDevs.length,
        activeDevices: vendorDevs.filter((d) => d.is_active).length,
        lastActivePing: vendorDevs[0]?.last_seen_at || v.updated_at,
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

    const monthlyFee = input.monthlyFeeRupees || 499;
    const monthlyFeePaise = BigInt(monthlyFee) * 100n;
    const cycle = input.billingCycle || 'monthly';
    const subDays = input.subscriptionDays || (cycle === 'annual' ? 365 : cycle === 'quarterly' ? 90 : 30);
    const isPaid = input.initialPaymentStatus === 'paid';
    const expiryDate = new Date(Date.now() + subDays * 24 * 3600 * 1000).toISOString();

    const vendorId = randomUUID();

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
        subscription_status: isPaid ? 'active' : 'trial',
        subscription_expires_at: expiryDate,
        daily_token_counter: 0,
        token_reset_date: getIstDateString(),
        password_hash: passwordHash,
        quick_pin_hash: pinHash,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (isPaid) {
      await db.insertInto('subscriptions').values({
        id: randomUUID(),
        vendor_id: newVendor.id,
        plan: input.edition || 'cloud',
        amount_paise: monthlyFeePaise,
        period_start: getIstDateString(),
        period_end: expiryDate.split('T')[0],
        payment_method: 'upi',
        payment_reference: 'UPI-' + Date.now().toString(36).toUpperCase(),
        status: 'active',
      }).execute();
    }

    // Create default cashier staff
    await db
      .insertInto('staff')
      .values({
        id: randomUUID(),
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
        id: randomUUID(),
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

  /**
   * List staff & admin users across all stalls
   */
  static async listUsers(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const staff = await db.selectFrom('staff').selectAll().execute();

    const users: any[] = [];
    for (const v of vendors) {
      users.push({
        id: 'usr-' + v.id,
        name: v.owner_name,
        phone: v.phone,
        role: 'owner',
        stallName: v.business_name,
        stallId: v.id,
        status: v.subscription_status === 'expired' ? 'inactive' : 'active',
        createdAt: v.created_at,
      });
    }

    for (const s of staff) {
      const v = vendors.find((vend) => vend.id === s.vendor_id);
      users.push({
        id: s.id,
        name: s.name,
        phone: s.phone || 'N/A',
        role: s.role || 'cashier',
        stallName: v?.business_name || 'Assigned Stall',
        stallId: s.vendor_id,
        status: s.is_active ? 'active' : 'inactive',
        createdAt: s.created_at,
      });
    }

    return users;
  }

  /**
   * Deep Platform Analytics
   */
  static async getAnalytics(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const orders = await db.selectFrom('orders').selectAll().execute();
    const items = await db.selectFrom('menu_items').selectAll().execute();

    let totalGrossPaise = 0n;
    let cashPaise = 0n;
    let upiPaise = 0n;

    const vendorSalesMap = new Map<string, { count: number; salesPaise: bigint }>();

    for (const o of orders) {
      const p = BigInt(o.total_paise || 0);
      totalGrossPaise += p;
      if (o.payment_method === 'cash') cashPaise += p;
      if (o.payment_method === 'upi') upiPaise += p;

      const vId = o.vendor_id || 'unknown';
      const cur = vendorSalesMap.get(vId) || { count: 0, salesPaise: 0n };
      cur.count += 1;
      cur.salesPaise += p;
      vendorSalesMap.set(vId, cur);
    }

    const leaderboard = vendors.map((v) => {
      const stats = vendorSalesMap.get(v.id) || { count: 0, salesPaise: 0n };
      return {
        id: v.id,
        name: v.business_name,
        city: v.city,
        totalOrders: stats.count,
        salesPaise: stats.salesPaise.toString(),
        subscriptionStatus: v.subscription_status,
      };
    }).sort((a, b) => Number(BigInt(b.salesPaise) - BigInt(a.salesPaise)));

    const categoryMap = new Map<string, number>();
    for (const item of items) {
      const cat = item.category || 'General';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    }

    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count }));

    return {
      grossSalesPaise: totalGrossPaise.toString(),
      cashSalesPaise: cashPaise.toString(),
      upiSalesPaise: upiPaise.toString(),
      totalOrders: orders.length,
      leaderboard,
      categories,
    };
  }
}
