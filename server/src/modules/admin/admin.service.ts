import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { AppError } from '../../errors/app-error.js';
import { hashPassword, hashPin } from '../../utils/crypto.js';
import { getIstDateString } from '../../utils/ist-date.js';
import { LoginSecurityService } from '../auth/login-security.service.js';
import { SubscriptionService } from '../subscriptions/subscription.service.js';
import { formatPaiseToInr, sanitizeCsvCell } from '../galla/galla.service.js';
import { randomUUID } from 'node:crypto';

export interface AdminActorContext {
  adminId?: string;
  ipAddress?: string;
}

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
  suspendedReason?: string | null;
  monthlyFeeRupees?: number;
  taxMode?: 'unregistered' | 'composition' | 'regular';
  gstin?: string | null;
  fssaiNumber?: string | null;
  password?: string;
  quickPin?: string;
}

export interface RenewVendorAdminInput {
  days?: number;
  customExpiresAt?: string;
  amountPaise: number;
  paymentMethod: 'upi' | 'cash' | 'bank' | 'trial';
  paymentReference?: string;
}

export interface CreateMenuItemAdminInput {
  name: string;
  pricePaise: number;
  category: string;
  emojiIcon?: string;
  colorHex?: string;
}

function getOrderSplitAmounts(o: any): { total: bigint; cash: bigint; upi: bigint } {
  const total = BigInt(o.total_paise || 0);
  if (o.payment_method === 'cash') return { total, cash: total, upi: 0n };
  if (o.payment_method === 'upi') return { total, cash: 0n, upi: total };
  if (o.payment_method === 'split') {
    return {
      total,
      cash: BigInt(o.cash_paise || 0),
      upi: BigInt(o.upi_paise || 0),
    };
  }
  return { total, cash: 0n, upi: 0n };
}

function toIsoStringSafe(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? '' : val.toISOString();
  return String(val);
}

export class AdminService {
  /**
   * Records an immutable Super Admin audit trail row
   */
  static async logAudit(
    db: Kysely<Database>,
    params: {
      adminId?: string;
      action: string;
      targetVendorId?: string | null;
      details?: Record<string, unknown>;
      ipAddress?: string;
    },
  ) {
    try {
      await db
        .insertInto('admin_audit_logs')
        .values({
          id: randomUUID(),
          admin_id: params.adminId || 'superadmin',
          action: params.action,
          target_vendor_id: params.targetVendorId || null,
          details_json: params.details ? JSON.stringify(params.details) : null,
          ip_address: params.ipAddress || null,
          created_at: new Date().toISOString(),
        })
        .execute();
    } catch {
      // Non-fatal in legacy test mocks lacking admin_audit_logs
    }
  }

  /**
   * Lists recent Super Admin audit log entries
   */
  static async getAuditLogs(db: Kysely<Database>, limit = 100) {
    const rows = await db
      .selectFrom('admin_audit_logs')
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      action: r.action,
      targetVendorId: r.target_vendor_id,
      detailsJson: r.details_json,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));
  }

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
    let suspendedCount = 0;
    let cloudVendors = 0;
    let localVendors = 0;
    let totalPendingPaise = 0n;

    const clientVendors = vendors.filter((v: any) => !v.is_superadmin);
    for (const v of clientVendors) {
      if (v.edition === 'local') localVendors++;
      else cloudVendors++;

      const feePaise = BigInt((v as any).monthly_fee_paise || 49900);
      const expiresAt = v.subscription_expires_at ? new Date(v.subscription_expires_at).getTime() : 0;

      if (v.subscription_status === 'suspended') {
        suspendedCount++;
      } else if (v.subscription_status === 'trial') {
        trialCount++;
      } else if (expiresAt < now || v.subscription_status === 'expired') {
        expiredCount++;
        totalPendingPaise += feePaise;
      } else {
        activeCount++;
        if (expiresAt > now && expiresAt <= in7Days) {
          expiringCount++;
          totalPendingPaise += feePaise;
        }
      }
    }

    let grossPaise = 0n;
    let cashPaise = 0n;
    let upiPaise = 0n;
    let todayOrdersCount = 0;
    let nonCancelledOrdersCount = 0;

    for (const o of orders) {
      const status = (o as any).order_status || (o as any).status;
      if (status === 'cancelled') continue;

      nonCancelledOrdersCount++;
      const amounts = getOrderSplitAmounts(o);
      grossPaise += amounts.total;
      cashPaise += amounts.cash;
      upiPaise += amounts.upi;

      const dateStr = toIsoStringSafe(o.created_at);
      if (dateStr.startsWith(todayStr)) {
        todayOrdersCount++;
      }
    }

    let totalCollectedPaise = 0n;
    for (const s of subscriptions) {
      if (s.status === 'active') totalCollectedPaise += BigInt(s.amount_paise || 0);
    }
    const activeDevicesCount = devices.filter((d) => d.is_active).length;

    return {
      totalVendors: clientVendors.length,
      activeVendors: activeCount,
      trialVendors: trialCount,
      expiredVendors: expiredCount,
      expiringVendors: expiringCount,
      suspendedVendors: suspendedCount,
      cloudVendors,
      localVendors,
      grossSalesPaise: grossPaise.toString(),
      cashSalesPaise: cashPaise.toString(),
      upiSalesPaise: upiPaise.toString(),
      totalCollectedPaise: totalCollectedPaise.toString(),
      totalPendingPaise: totalPendingPaise.toString(),
      todayOrders: todayOrdersCount,
      totalOrders: nonCancelledOrdersCount,
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
      const storedFee = (v as any).monthly_fee_paise != null ? BigInt((v as any).monthly_fee_paise) : 0n;
      const latestSubAmount = latestSub?.amount_paise != null ? BigInt(latestSub.amount_paise) : 0n;
      const monthlyFeePaise = (storedFee > 0n ? storedFee : (latestSubAmount > 0n ? latestSubAmount : 49900n)).toString();

      const expiresAt = v.subscription_expires_at ? new Date(v.subscription_expires_at).getTime() : 0;
      let paymentStatus: 'paid' | 'due_soon' | 'overdue' | 'trial' = 'paid';
      if (v.subscription_status === 'suspended' || v.subscription_status === 'expired') {
        paymentStatus = 'overdue';
      } else if (v.subscription_status === 'trial') {
        paymentStatus = 'trial';
      } else if (expiresAt < now) {
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
        ? toIsoStringSafe(latestSub.created_at)
        : toIsoStringSafe(v.created_at);

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
        suspendedReason: (v as any).suspended_reason || null,
        taxMode: (v as any).tax_mode || 'unregistered',
        gstin: (v as any).gstin || null,
        fssaiNumber: (v as any).fssai_number || null,
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
   * Returns 360° inspector detail for a single vendor stall
   */
  static async getVendorDetail(db: Kysely<Database>, vendorId: string) {
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    const orders = await db
      .selectFrom('orders')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .execute();

    const subscriptions = await db
      .selectFrom('subscriptions')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .orderBy('created_at', 'desc')
      .execute();

    const devices = await db
      .selectFrom('devices')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .orderBy('created_at', 'desc')
      .execute();

    const lockout = await db
      .selectFrom('login_lockouts')
      .selectAll()
      .where('id', '=', `acc:${vendor.phone}`)
      .executeTakeFirst();

    const nowMs = Date.now();
    let isLocked = false;
    let lockoutRemainingSeconds = 0;
    if (lockout && lockout.locked_until) {
      const untilMs = new Date(lockout.locked_until).getTime();
      if (untilMs > nowMs) {
        isLocked = true;
        lockoutRemainingSeconds = Math.ceil((untilMs - nowMs) / 1000);
      }
    }

    let licenseStatus: any = null;
    try {
      licenseStatus = await SubscriptionService.getSubscriptionStatus(db, vendorId);
    } catch {
      licenseStatus = null;
    }

    const todayStr = getIstDateString(new Date(nowMs));
    const weekAgoMs = nowMs - 7 * 86400000;
    const monthPrefix = todayStr.slice(0, 7);
    const yearPrefix = todayStr.slice(0, 4);

    const makeBucket = () => ({ total: 0n, cash: 0n, upi: 0n });
    const buckets = {
      daily: makeBucket(),
      weekly: makeBucket(),
      monthly: makeBucket(),
      yearly: makeBucket(),
    };

    for (const o of orders) {
      const st = (o as any).order_status || (o as any).status;
      if (st === 'cancelled') continue;
      const amounts = getOrderSplitAmounts(o);
      const ts = o.created_at ? new Date(o.created_at).getTime() : 0;
      const istDate = getIstDateString(o.created_at || new Date(nowMs));

      if (istDate === todayStr) {
        buckets.daily.total += amounts.total;
        buckets.daily.cash += amounts.cash;
        buckets.daily.upi += amounts.upi;
      }
      if (ts >= weekAgoMs) {
        buckets.weekly.total += amounts.total;
        buckets.weekly.cash += amounts.cash;
        buckets.weekly.upi += amounts.upi;
      }
      if (istDate.startsWith(monthPrefix)) {
        buckets.monthly.total += amounts.total;
        buckets.monthly.cash += amounts.cash;
        buckets.monthly.upi += amounts.upi;
      }
      if (istDate.startsWith(yearPrefix)) {
        buckets.yearly.total += amounts.total;
        buckets.yearly.cash += amounts.cash;
        buckets.yearly.upi += amounts.upi;
      }
    }

    const formatBucket = (b: { total: bigint; cash: bigint; upi: bigint }) => ({
      totalPaise: b.total.toString(),
      cashPaise: b.cash.toString(),
      upiPaise: b.upi.toString(),
    });

    const monthlyFeePaise = (vendor as any).monthly_fee_paise != null
      ? BigInt((vendor as any).monthly_fee_paise).toString()
      : '49900';

    return {
      vendor: {
        id: vendor.id,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        phone: vendor.phone,
        city: vendor.city || 'Hyderabad',
        edition: vendor.edition,
        subscriptionStatus: vendor.subscription_status,
        subscriptionExpiresAt: vendor.subscription_expires_at,
        suspendedReason: (vendor as any).suspended_reason || null,
        monthlyFeePaise,
        taxMode: (vendor as any).tax_mode || 'unregistered',
        gstin: (vendor as any).gstin || null,
        fssaiNumber: (vendor as any).fssai_number || null,
        gstRateBps: (vendor as any).gst_rate_bps ?? 0,
        stallAddress: (vendor as any).stall_address || null,
        createdAt: vendor.created_at,
        updatedAt: vendor.updated_at,
      },
      isLocked,
      lockoutRemainingSeconds,
      licenseStatus: licenseStatus
        ? {
            status: licenseStatus.status,
            daysRemaining: licenseStatus.daysRemaining,
            periodStart: licenseStatus.periodStart,
            periodEnd: licenseStatus.periodEnd,
            signedEd25519: Boolean(licenseStatus.licenseToken),
          }
        : null,
      devices: devices.map((d) => ({
        id: d.id,
        deviceName: d.device_name,
        role: d.role,
        isActive: d.is_active,
        lastSeenAt: d.last_seen_at,
        createdAt: d.created_at,
      })),
      turnover: {
        daily: formatBucket(buckets.daily),
        weekly: formatBucket(buckets.weekly),
        monthly: formatBucket(buckets.monthly),
        yearly: formatBucket(buckets.yearly),
      },
      paymentLedger: subscriptions.map((s) => ({
        id: s.id,
        plan: s.plan,
        amountPaise: BigInt(s.amount_paise || 0).toString(),
        periodStart: s.period_start,
        periodEnd: s.period_end,
        paymentMethod: s.payment_method,
        paymentReference: s.payment_reference,
        status: s.status,
        createdAt: s.created_at,
      })),
    };
  }

  /**
   * Onboard a new restaurant/stall directly from Admin Dashboard
   */
  static async createVendor(db: Kysely<Database>, input: CreateVendorAdminInput, actor?: AdminActorContext) {
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
        monthly_fee_paise: monthlyFeePaise,
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

    await this.logAudit(db, {
      adminId: actor?.adminId,
      action: 'VENDOR_CREATED',
      targetVendorId: newVendor.id,
      details: { businessName: newVendor.business_name, edition: newVendor.edition },
      ipAddress: actor?.ipAddress,
    });

    return {
      vendor: newVendor,
      generatedPassword: rawPassword,
      generatedPin: pin,
    };
  }

  /**
   * Update stall details, suspend/reactivate, compliance fields, or reset password
   */
  static async updateVendor(
    db: Kysely<Database>,
    vendorId: string,
    input: UpdateVendorAdminInput,
    actor?: AdminActorContext,
  ) {
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
    if (typeof input.monthlyFeeRupees === 'number' && input.monthlyFeeRupees >= 0) {
      updates.monthly_fee_paise = BigInt(Math.round(input.monthlyFeeRupees)) * 100n;
    }
    if (input.taxMode) updates.tax_mode = input.taxMode;
    if (input.gstin !== undefined) updates.gstin = input.gstin ? input.gstin.trim().toUpperCase() : null;
    if (input.fssaiNumber !== undefined) updates.fssai_number = input.fssaiNumber ? input.fssaiNumber.trim() : null;

    if (input.subscriptionStatus === 'suspended') {
      updates.suspended_reason = input.suspendedReason?.trim() || 'Suspended by Super Admin';
    } else if (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trial') {
      updates.suspended_reason = null;
    } else if (input.suspendedReason !== undefined) {
      updates.suspended_reason = input.suspendedReason;
    }

    if (input.phone) {
      const cleaned = input.phone.replace(/\D/g, '');
      if (cleaned.length === 10) updates.phone = cleaned;
    }

    let passwordChanged = false;
    if (input.password && input.password.length >= 6) {
      updates.password_hash = await hashPassword(input.password);
      passwordChanged = true;
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

    if (input.subscriptionStatus === 'suspended') {
      try {
        await db
          .updateTable('refresh_tokens')
          .set({ is_revoked: true })
          .where('vendor_id', '=', vendorId)
          .execute();
      } catch {
        // Ignore if mock DB has no refresh tokens
      }
      await this.logAudit(db, {
        adminId: actor?.adminId,
        action: 'VENDOR_SUSPENDED',
        targetVendorId: vendorId,
        details: { reason: updates.suspended_reason },
        ipAddress: actor?.ipAddress,
      });
    } else if (vendor.subscription_status === 'suspended' && input.subscriptionStatus === 'active') {
      await this.logAudit(db, {
        adminId: actor?.adminId,
        action: 'VENDOR_REACTIVATED',
        targetVendorId: vendorId,
        details: { businessName: updated.business_name },
        ipAddress: actor?.ipAddress,
      });
    } else if (passwordChanged) {
      await this.logAudit(db, {
        adminId: actor?.adminId,
        action: 'PASSWORD_RESET',
        targetVendorId: vendorId,
        details: { businessName: updated.business_name },
        ipAddress: actor?.ipAddress,
      });
    } else {
      await this.logAudit(db, {
        adminId: actor?.adminId,
        action: 'VENDOR_UPDATED',
        targetVendorId: vendorId,
        details: { fields: Object.keys(updates) },
        ipAddress: actor?.ipAddress,
      });
    }

    return updated;
  }

  /**
   * Flexible renewal: extends vendor license, writes subscriptions ledger row, and logs audit entry
   */
  static async renewVendor(
    db: Kysely<Database>,
    vendorId: string,
    input: RenewVendorAdminInput,
    actor?: AdminActorContext,
  ) {
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    const nowMs = Date.now();
    let newExpiryMs: number;
    if (input.customExpiresAt) {
      const parsed = new Date(input.customExpiresAt);
      if (Number.isNaN(parsed.getTime())) {
        throw AppError.badRequest('Invalid custom expiry date', 'INVALID_DATE');
      }
      newExpiryMs = parsed.getTime();
    } else {
      const days = input.days && input.days > 0 ? input.days : 30;
      const existingExp = vendor.subscription_expires_at ? new Date(vendor.subscription_expires_at).getTime() : 0;
      const baseMs = existingExp > nowMs ? existingExp : nowMs;
      newExpiryMs = baseMs + days * 86400000;
    }

    const newExpiryIso = new Date(newExpiryMs).toISOString();
    const newStatus = input.paymentMethod === 'trial' ? 'trial' : 'active';

    const updatedVendor = await db
      .updateTable('vendors')
      .set({
        subscription_status: newStatus,
        subscription_expires_at: newExpiryIso,
        suspended_reason: null,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', vendorId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const periodStart = getIstDateString(new Date(nowMs));
    const periodEnd = newExpiryIso.split('T')[0]!;
    const ref = input.paymentReference?.trim()
      || `${input.paymentMethod.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const subscription = await db
      .insertInto('subscriptions')
      .values({
        id: randomUUID(),
        vendor_id: vendorId,
        plan: vendor.edition || 'cloud',
        amount_paise: BigInt(input.amountPaise),
        period_start: periodStart,
        period_end: periodEnd,
        payment_method: input.paymentMethod,
        payment_reference: ref,
        status: 'active',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.logAudit(db, {
      adminId: actor?.adminId,
      action: 'VENDOR_RENEWED',
      targetVendorId: vendorId,
      details: {
        amountPaise: input.amountPaise,
        paymentMethod: input.paymentMethod,
        paymentReference: ref,
        periodEnd,
      },
      ipAddress: actor?.ipAddress,
    });

    return { vendor: updatedVendor, subscription };
  }

  /**
   * Revokes a paired Kitchen / Packaging / Cashier device
   */
  static async revokeVendorDevice(
    db: Kysely<Database>,
    vendorId: string,
    deviceId: string,
    actor?: AdminActorContext,
  ) {
    const device = await db
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', deviceId)
      .where('vendor_id', '=', vendorId)
      .executeTakeFirst();

    if (!device) {
      throw AppError.notFound('Paired device not found', 'DEVICE_NOT_FOUND');
    }

    const updated = await db
      .updateTable('devices')
      .set({ is_active: false })
      .where('id', '=', deviceId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.logAudit(db, {
      adminId: actor?.adminId,
      action: 'DEVICE_REVOKED',
      targetVendorId: vendorId,
      details: { deviceId, deviceName: device.device_name, role: device.role },
      ipAddress: actor?.ipAddress,
    });

    return updated;
  }

  /**
   * Clears brute-force login lockout for a vendor's phone
   */
  static async unlockVendorAccount(db: Kysely<Database>, vendorId: string, actor?: AdminActorContext) {
    const vendor = await db
      .selectFrom('vendors')
      .select(['id', 'phone', 'business_name'])
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    await db
      .deleteFrom('login_lockouts')
      .where('id', '=', `acc:${vendor.phone}`)
      .execute();

    await LoginSecurityService.recordSuccessAsync(vendor.phone, undefined, db);

    await this.logAudit(db, {
      adminId: actor?.adminId,
      action: 'VENDOR_UNLOCKED',
      targetVendorId: vendorId,
      details: { phone: vendor.phone, businessName: vendor.business_name },
      ipAddress: actor?.ipAddress,
    });

    return { unlocked: true, vendorId, phone: vendor.phone };
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

    return await db
      .insertInto('menu_items')
      .values({
        id: randomUUID(),
        vendor_id: vendorId,
        name: input.name.trim(),
        price_paise: Math.round(input.pricePaise),
        category: input.category || 'General',
        emoji_icon: input.emojiIcon || 'dish',
        color_hex: input.colorHex || '#0284c7',
        display_order: 0,
        is_available: true,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Edit or toggle a menu item
   */
  static async updateVendorMenuItem(
    db: Kysely<Database>,
    vendorId: string,
    itemId: string,
    input: { name?: string; pricePaise?: number; category?: string; isAvailable?: boolean; isActive?: boolean },
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

    return await db
      .updateTable('menu_items')
      .set(updates)
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * List staff & admin users across all stalls
   */
  static async listUsers(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const staff = await db.selectFrom('staff').selectAll().execute();

    const users: any[] = [];
    for (const v of vendors) {
      const isSuper = Boolean((v as any).is_superadmin);
      users.push({
        id: 'usr-' + v.id,
        name: v.owner_name,
        phone: v.phone,
        role: isSuper ? 'superadmin' : 'owner',
        stallName: v.business_name,
        stallId: v.id,
        status: v.subscription_status === 'expired' || v.subscription_status === 'suspended' ? 'inactive' : 'active',
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

    const clientVendors = vendors.filter((v: any) => !v.is_superadmin);
    const clientVendorIds = new Set(clientVendors.map((v) => v.id));

    let totalGrossPaise = 0n;
    let cashPaise = 0n;
    let upiPaise = 0n;
    let validOrdersCount = 0;

    const vendorSalesMap = new Map<string, { count: number; salesPaise: bigint }>();

    for (const o of orders) {
      const status = (o as any).order_status || (o as any).status;
      if (status === 'cancelled') continue;

      validOrdersCount++;
      const amounts = getOrderSplitAmounts(o);
      totalGrossPaise += amounts.total;
      cashPaise += amounts.cash;
      upiPaise += amounts.upi;

      if (o.vendor_id && clientVendorIds.has(o.vendor_id)) {
        const cur = vendorSalesMap.get(o.vendor_id) || { count: 0, salesPaise: 0n };
        cur.count += 1;
        cur.salesPaise += amounts.total;
        vendorSalesMap.set(o.vendor_id, cur);
      }
    }

    const leaderboard = clientVendors
      .map((v) => {
        const stats = vendorSalesMap.get(v.id) || { count: 0, salesPaise: 0n };
        return {
          id: v.id,
          name: v.business_name,
          city: v.city,
          totalOrders: stats.count,
          salesPaise: stats.salesPaise.toString(),
          subscriptionStatus: v.subscription_status,
        };
      })
      .sort((a, b) => Number(BigInt(b.salesPaise) - BigInt(a.salesPaise)));

    const categoryMap = new Map<string, number>();
    for (const item of items) {
      const cat = item.category || 'General';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
    }

    const categories = Array.from(categoryMap.entries()).map(([name, count]) => ({ name, count }));

    let cloudVendors = 0;
    let localVendors = 0;
    for (const v of clientVendors) {
      if (v.edition === 'local') localVendors++;
      else cloudVendors++;
    }

    return {
      grossSalesPaise: totalGrossPaise.toString(),
      cashSalesPaise: cashPaise.toString(),
      upiSalesPaise: upiPaise.toString(),
      totalOrders: validOrdersCount,
      cloudVendors,
      localVendors,
      leaderboard,
      categories,
    };
  }

  /**
   * Computes DB-derived actionable alerts for the Notifications Center & Overview
   */
  static async getAlerts(db: Kysely<Database>) {
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const lockouts = await db.selectFrom('login_lockouts').selectAll().execute();

    const now = Date.now();
    const in7Days = now + 7 * 86400000;
    const past48h = now - 48 * 3600000;
    const clientVendors = vendors.filter((v: any) => !v.is_superadmin);
    const vendorByPhone = new Map<string, any>();
    clientVendors.forEach((v) => vendorByPhone.set(String(v.phone || '').replace(/\D/g, ''), v));

    const alerts: Array<{
      id: string;
      vendorId: string;
      businessName: string;
      category: 'expiring' | 'expired' | 'suspended' | 'locked' | 'new_vendor';
      severity: 'info' | 'warning' | 'danger';
      title: string;
      message: string;
      timestamp: string;
    }> = [];

    for (const l of lockouts) {
      if (l.key_type === 'account' && l.locked_until) {
        const untilMs = new Date(l.locked_until).getTime();
        if (untilMs > now) {
          const matched = vendorByPhone.get(String(l.key_value || '').replace(/\D/g, ''));
          if (matched) {
            alerts.push({
              id: `locked-${matched.id}`,
              vendorId: matched.id,
              businessName: matched.business_name,
              category: 'locked',
              severity: 'danger',
              title: `${matched.business_name} Account Locked`,
              message: `Brute-force lockout active (${Math.ceil((untilMs - now) / 1000)}s left). Tap to inspect & unlock.`,
              timestamp: toIsoStringSafe(l.locked_until),
            });
          }
        }
      }
    }

    for (const v of clientVendors) {
      const expMs = v.subscription_expires_at ? new Date(v.subscription_expires_at).getTime() : 0;
      const createdMs = v.created_at ? new Date(v.created_at).getTime() : 0;

      if (v.subscription_status === 'suspended') {
        alerts.push({
          id: `suspended-${v.id}`,
          vendorId: v.id,
          businessName: v.business_name,
          category: 'suspended',
          severity: 'danger',
          title: `${v.business_name} Suspended`,
          message: (v as any).suspended_reason ? `Reason: ${(v as any).suspended_reason}` : 'Stall access is suspended.',
          timestamp: toIsoStringSafe(v.updated_at || v.created_at),
        });
      } else if (v.subscription_status === 'expired' || (v.subscription_status !== 'trial' && expMs > 0 && expMs < now)) {
        alerts.push({
          id: `expired-${v.id}`,
          vendorId: v.id,
          businessName: v.business_name,
          category: 'expired',
          severity: 'danger',
          title: `${v.business_name} License Expired`,
          message: 'Subscription expired. Tap to inspect and renew.',
          timestamp: toIsoStringSafe(v.subscription_expires_at || v.updated_at),
        });
      } else if (expMs > now && expMs <= in7Days) {
        const daysLeft = Math.max(1, Math.ceil((expMs - now) / 86400000));
        alerts.push({
          id: `expiring-${v.id}`,
          vendorId: v.id,
          businessName: v.business_name,
          category: 'expiring',
          severity: 'warning',
          title: `${v.business_name} Expiring in ${daysLeft}d`,
          message: 'Renewal due within 7 days.',
          timestamp: toIsoStringSafe(v.subscription_expires_at),
        });
      }

      if (createdMs >= past48h) {
        alerts.push({
          id: `new-${v.id}`,
          vendorId: v.id,
          businessName: v.business_name,
          category: 'new_vendor',
          severity: 'info',
          title: `New Stall: ${v.business_name}`,
          message: `Registered in ${v.city || 'Hyderabad'} (${v.edition === 'local' ? 'Mobile P2P' : 'Cloud'}).`,
          timestamp: toIsoStringSafe(v.created_at),
        });
      }
    }

    const severityRank: Record<string, number> = { danger: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));
    return alerts;
  }

  /**
   * Lists all platform subscription transactions with total collected revenue
   */
  static async listSubscriptions(db: Kysely<Database>) {
    const subs = await db
      .selectFrom('subscriptions')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
    const vendors = await db.selectFrom('vendors').selectAll().execute();
    const vendorMap = new Map<string, any>();
    vendors.forEach((v) => vendorMap.set(v.id, v));

    let totalCollectedPaise = 0n;
    const items = subs.map((s) => {
      const amt = BigInt(s.amount_paise || 0);
      if (s.status === 'active') totalCollectedPaise += amt;
      const v = vendorMap.get(s.vendor_id);
      return {
        id: s.id,
        vendorId: s.vendor_id,
        businessName: v?.business_name || 'Vendor Stall',
        phone: v?.phone || '',
        plan: s.plan,
        amountPaise: amt.toString(),
        periodStart: s.period_start,
        periodEnd: s.period_end,
        paymentMethod: s.payment_method,
        paymentReference: s.payment_reference,
        status: s.status,
        createdAt: s.created_at,
      };
    });

    return {
      totalCollectedPaise: totalCollectedPaise.toString(),
      totalCount: items.length,
      items,
    };
  }

  /**
   * Formula-injection safe CSV export for Vendors directory
   */
  static async exportVendorsCsv(db: Kysely<Database>): Promise<string> {
    const vendors = await this.listVendors(db);
    const headers = [
      'Vendor ID',
      'Business Name',
      'Owner Name',
      'Phone',
      'City',
      'Edition',
      'Subscription Status',
      'Expires At',
      'Monthly Fee (INR)',
      'Lifetime Sales (INR)',
      'Total Orders',
      'Tax Mode',
      'GSTIN',
      'FSSAI',
    ];
    const lines = [headers.map(sanitizeCsvCell).join(',')];

    for (const v of vendors) {
      lines.push(
        [
          v.id,
          v.businessName,
          v.ownerName,
          v.phone,
          v.city,
          v.edition,
          v.subscriptionStatus,
          toIsoStringSafe(v.subscriptionExpiresAt),
          formatPaiseToInr(BigInt(v.monthlyFeePaise || '0')),
          formatPaiseToInr(BigInt(v.lifetimeSalesPaise || '0')),
          v.totalOrders,
          v.taxMode || 'unregistered',
          v.gstin || '',
          v.fssaiNumber || '',
        ]
          .map(sanitizeCsvCell)
          .join(','),
      );
    }

    return lines.join('\r\n');
  }

  /**
   * Formula-injection safe CSV export for Subscriptions revenue ledger
   */
  static async exportSubscriptionsCsv(db: Kysely<Database>): Promise<string> {
    const data = await this.listSubscriptions(db);
    const headers = [
      'Subscription ID',
      'Vendor ID',
      'Business Name',
      'Phone',
      'Plan',
      'Amount (INR)',
      'Payment Method',
      'Payment Reference',
      'Period Start',
      'Period End',
      'Status',
      'Created At',
    ];
    const lines = [headers.map(sanitizeCsvCell).join(',')];

    for (const s of data.items) {
      lines.push(
        [
          s.id,
          s.vendorId,
          s.businessName,
          s.phone,
          s.plan,
          formatPaiseToInr(BigInt(s.amountPaise || '0')),
          s.paymentMethod,
          s.paymentReference || '',
          toIsoStringSafe(s.periodStart),
          toIsoStringSafe(s.periodEnd),
          s.status,
          toIsoStringSafe(s.createdAt),
        ]
          .map(sanitizeCsvCell)
          .join(','),
      );
    }

    return lines.join('\r\n');
  }
}
