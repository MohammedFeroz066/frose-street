import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { AppError } from '../../errors/app-error.js';
import { loadConfig } from '../../config/env.js';
import {
  generateEd25519LicenseToken,
  verifyEd25519LicenseToken,
  getEd25519LicenseKeys,
  getEd25519PublicKeyPem,
} from '../auth/jwt-jose.js';

export type SubscriptionPlan = 'cloud' | 'local';

export type SubscriptionState =
  | 'trial_active'
  | 'trial_expiring'
  | 'active'
  | 'grace_period'
  | 'expired_readonly';

export interface LicensePayload {
  vendorId: string;
  businessName: string;
  plan: SubscriptionPlan;
  periodStart: string;
  periodEnd: string;
  status: 'active' | 'expired';
  issuedAt: string;
}

export interface SubscriptionStatusResult {
  vendorId: string;
  businessName: string;
  plan: SubscriptionPlan;
  status: SubscriptionState;
  periodStart: string;
  periodEnd: string;
  daysRemaining: number;
  gracePeriodDaysRemaining: number;
  isReadOnly: boolean;
  canCreateOrders: boolean;
  licenseToken: string;
}

export class SubscriptionService {
  private static readonly GRACE_PERIOD_DAYS = 3;

  /**
   * Returns ONLY the Ed25519 public key (SPKI PEM) for offline client verification.
   */
  static async getLicensePublicKeyPem(): Promise<string> {
    const config = loadConfig();
    return getEd25519PublicKeyPem(config.NODE_ENV);
  }

  /**
   * Generates an Ed25519 (EdDSA) signed offline license JWT using server private key.
   */
  static async generateSignedLicenseToken(payload: LicensePayload): Promise<string> {
    const config = loadConfig();
    const { privateKeyPem } = await getEd25519LicenseKeys(config.NODE_ENV);
    return generateEd25519LicenseToken(payload, privateKeyPem);
  }

  /**
   * Cryptographically verifies an Ed25519 (EdDSA) license token using ONLY the public key.
   */
  static async verifySignedLicenseToken(
    token: string
  ): Promise<{ valid: boolean; payload?: LicensePayload; reason?: string }> {
    if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
      return { valid: false, reason: 'Malformed EdDSA JWT token structure' };
    }
    const publicKeyPem = await this.getLicensePublicKeyPem();
    const res = await verifyEd25519LicenseToken(token, publicKeyPem);
    return res as { valid: boolean; payload?: LicensePayload; reason?: string };
  }

  /**
   * Automatically initializes a 14-day free trial on new vendor registration
   */
  static async createTrialSubscription(
    db: Kysely<Database>,
    vendorId: string,
    businessName: string,
    plan: SubscriptionPlan = 'cloud'
  ) {
    const now = new Date();
    const periodStart = now.toISOString().split('T')[0]!;
    
    const expiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const periodEnd = expiry.toISOString().split('T')[0]!;

    const [created] = await db
      .insertInto('subscriptions')
      .values({
        vendor_id: vendorId,
        plan,
        amount_paise: 0n, // Free 14-day trial
        period_start: periodStart,
        period_end: periodEnd,
        payment_method: 'trial',
        payment_reference: 'FREE-TRIAL-14D',
        status: 'active',
      })
      .returningAll()
      .execute();

    const licenseToken = await this.generateSignedLicenseToken({
      vendorId,
      businessName,
      plan,
      periodStart,
      periodEnd,
      status: 'active',
      issuedAt: now.toISOString(),
    });

    return {
      subscription: {
        ...created,
        amount_paise: typeof created.amount_paise === 'bigint' ? Number(created.amount_paise) : created.amount_paise,
      },
      licenseToken,
    };
  }

  /**
   * Retrieves active subscription status, calculates remaining days and grace period
   */
  static async getSubscriptionStatus(db: Kysely<Database>, vendorId: string): Promise<SubscriptionStatusResult> {
    const vendor = await db
      .selectFrom('vendors')
      .select(['id', 'business_name', 'edition'])
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    const sub = await db
      .selectFrom('subscriptions')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .orderBy('period_end', 'desc')
      .limit(1)
      .executeTakeFirst();

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]!;

    // If no subscription record exists or missing period_end, auto-provision trial
    if (!sub || !sub.period_end) {
      try {
        const { subscription, licenseToken } = await this.createTrialSubscription(
          db,
          vendorId,
          vendor.business_name,
          vendor.edition === 'local' ? 'local' : 'cloud'
        );
        return {
          vendorId,
          businessName: vendor.business_name,
          plan: subscription.plan,
          status: 'trial_active',
          periodStart: subscription.period_start,
          periodEnd: subscription.period_end,
          daysRemaining: 14,
          gracePeriodDaysRemaining: this.GRACE_PERIOD_DAYS,
          isReadOnly: false,
          canCreateOrders: true,
          licenseToken,
        };
      } catch {
        return {
          vendorId,
          businessName: vendor.business_name,
          plan: 'cloud',
          status: 'trial_active',
          periodStart: todayStr,
          periodEnd: todayStr,
          daysRemaining: 14,
          gracePeriodDaysRemaining: this.GRACE_PERIOD_DAYS,
          isReadOnly: false,
          canCreateOrders: true,
          licenseToken: '',
        };
      }
    }

    const expiryDate = new Date(sub.period_end + 'T23:59:59.999Z');
    if (isNaN(expiryDate.getTime())) {
      return {
        vendorId,
        businessName: vendor.business_name,
        plan: sub.plan || 'cloud',
        status: 'active',
        periodStart: todayStr,
        periodEnd: todayStr,
        daysRemaining: 14,
        gracePeriodDaysRemaining: this.GRACE_PERIOD_DAYS,
        isReadOnly: false,
        canCreateOrders: true,
        licenseToken: '',
      };
    }
    const diffMs = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let state: SubscriptionState = 'active';
    let isReadOnly = false;
    let graceDaysLeft = this.GRACE_PERIOD_DAYS;

    if (daysRemaining > 4) {
      state = sub.amount_paise === 0n ? 'trial_active' : 'active';
    } else if (daysRemaining >= 0 && daysRemaining <= 4) {
      state = sub.amount_paise === 0n ? 'trial_expiring' : 'active';
    } else {
      // Expired: Check 3-day grace period
      const daysOverdue = Math.abs(daysRemaining);
      if (daysOverdue <= this.GRACE_PERIOD_DAYS) {
        state = 'grace_period';
        graceDaysLeft = Math.max(0, this.GRACE_PERIOD_DAYS - daysOverdue);
        isReadOnly = false; // Grace period allows orders
      } else {
        state = 'expired_readonly';
        graceDaysLeft = 0;
        isReadOnly = true; // Read-only mode: blocks order entry
      }
    }

    const licenseToken = await this.generateSignedLicenseToken({
      vendorId,
      businessName: vendor.business_name,
      plan: sub.plan,
      periodStart: sub.period_start,
      periodEnd: sub.period_end,
      status: state === 'expired_readonly' ? 'expired' : 'active',
      issuedAt: now.toISOString(),
    });

    return {
      vendorId,
      businessName: vendor.business_name,
      plan: sub.plan,
      status: state,
      periodStart: sub.period_start,
      periodEnd: sub.period_end,
      daysRemaining,
      gracePeriodDaysRemaining: graceDaysLeft,
      isReadOnly,
      canCreateOrders: !isReadOnly,
      licenseToken,
    };
  }

  /**
   * Renews or upgrades a subscription plan with strict integer paise math (₹999 / ₹1,499)
   */
  static async renewSubscription(
    db: Kysely<Database>,
    vendorId: string,
    plan: SubscriptionPlan,
    paymentReference: string = 'UPI-SETTLED'
  ) {
    const vendor = await db
      .selectFrom('vendors')
      .select(['id', 'business_name'])
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    // Exact integer paise pricing
    const amountPaise = plan === 'local' ? 99900n : 149900n; // ₹999 or ₹1,499 in paise

    const now = new Date();
    // Check if vendor already has an active period; if so, extend from that period_end, else from now
    const currentSub = await db
      .selectFrom('subscriptions')
      .selectAll()
      .where('vendor_id', '=', vendorId)
      .orderBy('period_end', 'desc')
      .limit(1)
      .executeTakeFirst();

    let startDate = now;
    if (currentSub && new Date(currentSub.period_end).getTime() > now.getTime()) {
      startDate = new Date(currentSub.period_end);
      startDate.setDate(startDate.getDate() + 1);
    }

    const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30-day billing cycle
    const periodStart = startDate.toISOString().split('T')[0]!;
    const periodEnd = endDate.toISOString().split('T')[0]!;

    const [created] = await db
      .insertInto('subscriptions')
      .values({
        vendor_id: vendorId,
        plan,
        amount_paise: amountPaise,
        period_start: periodStart,
        period_end: periodEnd,
        payment_method: 'upi',
        payment_reference: paymentReference,
        status: 'active',
      })
      .returningAll()
      .execute();

    const licenseToken = await this.generateSignedLicenseToken({
      vendorId,
      businessName: vendor.business_name,
      plan,
      periodStart,
      periodEnd,
      status: 'active',
      issuedAt: now.toISOString(),
    });

    return {
      ok: true,
      subscription: {
        ...created,
        amount_paise: typeof created.amount_paise === 'bigint' ? Number(created.amount_paise) : created.amount_paise,
      },
      licenseToken,
      amountRupees: Number(amountPaise / 100n),
      periodEnd,
    };
  }

  /**
   * Super-Admin endpoint: lists all stalls with subscription health and revenue
   */
  static async getAdminVendorsList(db: Kysely<Database>) {
    const vendors = await db
      .selectFrom('vendors')
      .select(['id', 'phone', 'business_name', 'edition', 'created_at'])
      .orderBy('created_at', 'desc')
      .execute();

    const list = await Promise.all(
      vendors.map(async (v) => {
        const sub = await db
          .selectFrom('subscriptions')
          .selectAll()
          .where('vendor_id', '=', v.id)
          .orderBy('period_end', 'desc')
          .limit(1)
          .executeTakeFirst();

        const allSubs = await db
          .selectFrom('subscriptions')
          .select(['amount_paise'])
          .where('vendor_id', '=', v.id)
          .execute();

        let totalRevenuePaise = 0n;
        for (const s of allSubs) {
          totalRevenuePaise += BigInt(s.amount_paise);
        }

        return {
          vendorId: v.id,
          phone: v.phone,
          businessName: v.business_name,
          edition: v.edition,
          registeredAt: v.created_at,
          currentPlan: sub?.plan || 'trial',
          periodEnd: sub?.period_end || null,
          status: sub?.status || 'trial',
          totalRevenuePaise: Number(totalRevenuePaise),
          totalRevenueRupees: Number(totalRevenuePaise / 100n),
        };
      })
    );

    return { ok: true, vendors: list, count: list.length };
  }
}
