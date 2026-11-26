import crypto from 'node:crypto';
import QRCode from 'qrcode';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/types.js';
import type { StaffRole } from '../../../../shared/types/index.js';
import { signJoseAccessToken, type JwtKeyRotationConfig } from '../auth/jwt-jose.js';
import { AppError } from '../../errors/app-error.js';

// In-memory set to prevent replay / double redemption of single-use pairing tokens
const consumedPairingTokens = new Set<string>();

export interface PairingPayload {
  v: string; // vendor_id
  r: StaffRole; // role
  n: string; // default device name
  exp: number; // expiry unix timestamp
  jti: string; // unique token id
}

export class DeviceService {
  /**
   * Generates a single-use 5-minute QR pairing token and QR code data URI
   */
  static async generatePairingToken(
    vendorId: string,
    role: StaffRole,
    secret: string,
    deviceName?: string,
    expiresInSeconds: number = 300,
  ) {
    if (!['cook', 'packer', 'cashier'].includes(role)) {
      throw AppError.badRequest('Invalid device role for pairing. Allowed: cook, packer, cashier', 'INVALID_ROLE');
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInSeconds;
    const jti = crypto.randomBytes(16).toString('hex');
    const defaultName = deviceName || (role === 'cook' ? 'Kitchen Display' : role === 'packer' ? 'Packaging Station' : 'Counter POS');

    const payload: PairingPayload = {
      v: vendorId,
      r: role,
      n: defaultName,
      exp,
      jti,
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
    const pairingToken = `${encodedPayload}.${signature}`;

    // Construct pairing QR code content (can be scanned by mobile camera or PWA)
    const qrData = `frose-street://pair?token=${pairingToken}`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return {
      pairingToken,
      qrCodeDataUrl,
      expiresInSeconds,
      role,
      deviceName: defaultName,
      expiresAt: new Date(exp * 1000).toISOString(),
    };
  }

  /**
   * Verifies pairing token HMAC signature and expiry before entering tenant transaction.
   */
  static verifyPairingTokenSignature(pairingToken: string, secret: string): PairingPayload {
    const parts = pairingToken.split('.');
    if (parts.length !== 2) {
      throw AppError.badRequest('Invalid pairing token format', 'MALFORMED_TOKEN');
    }

    const [encodedPayload, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');

    const sigBuffer = Buffer.from(signature);
    const expBuffer = Buffer.from(expectedSig);

    if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
      throw AppError.unauthorized('Invalid pairing token signature', 'INVALID_SIGNATURE');
    }

    let payload: PairingPayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw AppError.badRequest('Failed to parse pairing payload', 'INVALID_PAYLOAD');
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) {
      throw AppError.badRequest('Pairing QR code has expired (5-minute limit). Please generate a fresh QR code.', 'TOKEN_EXPIRED');
    }

    return payload;
  }

  /**
   * Verifies pairing token, creates device record, and issues scoped role JWT
   */
  static async pairDevice(
    db: Kysely<Database>,
    pairingToken: string,
    secret: string,
    customDeviceName?: string,
  ) {
    const payload = this.verifyPairingTokenSignature(pairingToken, secret);

    if (consumedPairingTokens.has(payload.jti)) {
      throw AppError.conflict('This pairing QR code has already been scanned and redeemed.', 'TOKEN_ALREADY_USED');
    }

    // Mark as consumed immediately
    consumedPairingTokens.add(payload.jti);

    // Verify vendor exists
    const vendor = await db
      .selectFrom('vendors')
      .selectAll()
      .where('id', '=', payload.v)
      .executeTakeFirst();

    if (!vendor) {
      throw AppError.notFound('Vendor stall not found', 'VENDOR_NOT_FOUND');
    }

    const deviceName = customDeviceName?.trim() || payload.n;
    const tokenSecret = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');

    // Insert device record
    const device = await db
      .insertInto('devices')
      .values({
        vendor_id: vendor.id,
        device_name: deviceName,
        role: payload.r as any,
        token_hash: tokenHash,
        is_active: true,
        last_seen_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Generate scoped device JWT using jose HS256
    const rotationConfig: JwtKeyRotationConfig = {
      currentSecret: secret,
      currentKid: 'k1',
    };
    const jwt = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: payload.r,
        edition: vendor.edition,
        deviceId: device.id,
      },
      rotationConfig,
      30 * 86400, // 30 days session
    );

    const portalUrl = payload.r === 'cook' ? '/kitchen' : payload.r === 'packer' ? '/packaging' : '/billing';

    return {
      device: {
        id: device.id,
        vendorId: device.vendor_id,
        deviceName: device.device_name,
        role: device.role,
        isActive: device.is_active,
        createdAt: device.created_at,
      },
      token: jwt,
      portalUrl,
    };
  }

  /**
   * Lists all active connected devices for a vendor
   */
  static async listDevices(db: Kysely<Database>, vendorId: string) {
    const devices = await db
      .selectFrom('devices')
      .select(['id', 'vendor_id', 'device_name', 'role', 'is_active', 'last_seen_at', 'created_at'])
      .where('vendor_id', '=', vendorId)
      .where('is_active', '=', true)
      .orderBy('created_at', 'desc')
      .execute();

    return devices.map((d) => ({
      id: d.id,
      vendorId: d.vendor_id,
      deviceName: d.device_name,
      role: d.role,
      isActive: d.is_active,
      lastSeenAt: d.last_seen_at,
      createdAt: d.created_at,
    }));
  }

  /**
   * Revokes / disconnects a device
   */
  static async revokeDevice(db: Kysely<Database>, vendorId: string, deviceId: string) {
    const device = await db
      .selectFrom('devices')
      .selectAll()
      .where('id', '=', deviceId)
      .where('vendor_id', '=', vendorId)
      .executeTakeFirst();

    if (!device) {
      throw AppError.notFound('Device not found or does not belong to your stall', 'DEVICE_NOT_FOUND');
    }

    await db
      .updateTable('devices')
      .set({ is_active: false })
      .where('id', '=', deviceId)
      .where('vendor_id', '=', vendorId)
      .execute();

    return { success: true, message: `Device "${device.device_name}" disconnected successfully` };
  }

  /**
   * Resets consumed tokens set (useful for unit testing)
   */
  static _resetConsumedTokens() {
    consumedPairingTokens.clear();
  }
}
