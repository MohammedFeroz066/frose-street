import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import { hashPassword, verifyPassword, hashPin, verifyPin } from '../../utils/crypto.js';
import { AppError } from '../../errors/app-error.js';

export interface RegisterVendorInput {
  phone: string;
  password: string;
  businessName: string;
  ownerName: string;
  businessType?: string;
  city?: string;
  edition?: 'cloud' | 'local';
}

export class AuthService {
  /**
   * Registers a new vendor with Phone Number, Password, and Stall Profile
   */
  static async registerVendor(db: Kysely<Database>, input: RegisterVendorInput) {
    // Validate phone: 10 digits
    const cleanedPhone = input.phone.replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      throw AppError.badRequest('Please enter a valid 10-digit mobile number', 'INVALID_PHONE');
    }

    // Validate password: minimum 6 characters
    if (!input.password || input.password.length < 6) {
      throw AppError.badRequest('Password must be at least 6 characters long', 'WEAK_PASSWORD');
    }

    if (!input.businessName || input.businessName.trim().length === 0) {
      throw AppError.badRequest('Stall / Business name is required', 'MISSING_BUSINESS_NAME');
    }

    // Check if phone already registered
    const existing = await db
      .selectFrom('vendors')
      .select('id')
      .where('phone', '=', cleanedPhone)
      .executeTakeFirst();

    if (existing) {
      throw AppError.conflict('Mobile number is already registered. Please login.', 'PHONE_EXISTS');
    }

    // Hash password using salted scrypt
    const passwordHash = await hashPassword(input.password);

    // 14-day trial period
    const trialExpiry = new Date();
    trialExpiry.setDate(trialExpiry.getDate() + 14);

    // Insert vendor record
    const vendor = await db
      .insertInto('vendors')
      .values({
        phone: cleanedPhone,
        business_name: input.businessName.trim(),
        owner_name: input.ownerName ? input.ownerName.trim() : input.businessName.trim(),
        business_type: input.businessType || 'other',
        city: input.city || null,
        edition: input.edition || 'cloud',
        subscription_status: 'trial',
        subscription_expires_at: trialExpiry,
        daily_token_counter: 0,
        token_reset_date: new Date().toISOString().split('T')[0],
        password_hash: passwordHash,
        quick_pin_hash: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Auto-create owner staff record
    const staff = await db
      .insertInto('staff')
      .values({
        vendor_id: vendor.id,
        name: vendor.owner_name,
        role: 'owner',
        phone: vendor.phone,
        is_active: true,
        password_hash: passwordHash,
        quick_pin_hash: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { vendor, staff };
  }

  /**
   * Authenticates vendor using Phone Number and Password
   */
  static async loginWithPassword(db: Kysely<Database>, phone: string, password: string) {
    const cleanedPhone = phone.replace(/\D/g, '');
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('phone', '=', cleanedPhone)
      .executeTakeFirst();

    if (!vendor || !vendor.password_hash) {
      throw AppError.unauthorized('Invalid mobile number or password', 'INVALID_CREDENTIALS');
    }

    const isMatch = await verifyPassword(password, vendor.password_hash);
    if (!isMatch) {
      throw AppError.unauthorized('Invalid mobile number or password', 'INVALID_CREDENTIALS');
    }

    return vendor;
  }

  /**
   * Sets up 4-digit quick PIN for terminal unlock
   */
  static async setupQuickPin(db: Kysely<Database>, vendorId: string, pin: string) {
    if (!/^\d{4}$/.test(pin)) {
      throw AppError.badRequest('Quick PIN must be exactly 4 digits', 'INVALID_PIN_FORMAT');
    }

    const pinHash = await hashPin(pin);

    await db
      .updateTable('vendors')
      .set({ quick_pin_hash: pinHash })
      .where('id', '=', vendorId)
      .execute();

    return { success: true };
  }

  /**
   * Verifies 4-digit quick PIN
   */
  static async verifyQuickPin(db: Kysely<Database>, vendorId: string, pin: string) {
    const vendor = await db
      .selectFrom('vendors')
      .select(['id', 'phone', 'business_name', 'edition', 'quick_pin_hash'])
      .where('id', '=', vendorId)
      .executeTakeFirst();

    if (!vendor || !vendor.quick_pin_hash) {
      throw AppError.unauthorized('Quick PIN has not been configured yet', 'PIN_NOT_SET');
    }

    const isMatch = await verifyPin(pin, vendor.quick_pin_hash);
    if (!isMatch) {
      throw AppError.unauthorized('Incorrect 4-digit PIN', 'INCORRECT_PIN');
    }

    return vendor;
  }

  /**
   * Registers a biometric credential (Fingerprint / Face ID / WebAuthn passkey)
   */
  static async registerBiometric(
    db: Kysely<Database>,
    vendorId: string,
    data: { credentialId: string; publicKey: string; deviceName?: string },
  ) {
    if (!data.credentialId || !data.publicKey) {
      throw AppError.badRequest('Missing credentialId or publicKey', 'INVALID_BIOMETRIC_DATA');
    }

    const credential = await db
      .insertInto('biometric_credentials')
      .values({
        vendor_id: vendorId,
        credential_id: data.credentialId,
        public_key: data.publicKey,
        device_name: data.deviceName || 'Mobile Device',
        counter: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return credential;
  }

  /**
   * Verifies biometric assertion and authenticates vendor
   */
  static async verifyBiometric(db: Kysely<Database>, credentialId: string) {
    const cred = await db
      .selectFrom('biometric_credentials')
      .innerJoin('vendors', 'vendors.id', 'biometric_credentials.vendor_id')
      .select([
        'vendors.id',
        'vendors.phone',
        'vendors.business_name',
        'vendors.edition',
        'vendors.subscription_status',
        'biometric_credentials.id as biometric_id',
      ])
      .where('biometric_credentials.credential_id', '=', credentialId)
      .executeTakeFirst();

    if (!cred) {
      throw AppError.unauthorized('Unrecognized biometric credential', 'BIOMETRIC_UNRECOGNIZED');
    }

    return cred;
  }
}
