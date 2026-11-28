import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AuthService } from './auth.service.js';
import type { StaffRole } from '../../../../shared/types/index.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { getDatabase } from '../../db/database.js';
import { withTenantContext } from '../../db/rls-context.js';
import { loadConfig } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { PaymentService } from '../payments/payment.service.js';
import {
  RegisterSchema,
  RegisterStallSchema,
  LoginSchema,
  SetupPinSchema,
  VerifyPinSchema,
  OwnerPinSetSchema,
  OwnerPinVerifySchema,
  BiometricRegisterSchema,
  BiometricVerifySchema,
  UpdateVendorProfileSchema,
  validateSchema,
} from './auth.schemas.js';
import { LoginSecurityService } from './login-security.service.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from './jwt-jose.js';
import { RefreshTokenService } from './refresh-token.service.js';
import {
  setSessionCookies,
  clearSessionCookies,
  readRefreshTokenCookie,
} from './session-cookies.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const config = (app as any).froseConfig || loadConfig();

  function formatVendorCompliance(vendor: any) {
    const taxMode = (vendor.tax_mode as 'unregistered' | 'composition' | 'regular') || 'unregistered';
    const gstRateBps = taxMode === 'regular' ? Number(vendor.gst_rate_bps ?? 500) : 0;
    return {
      taxMode,
      gstin: vendor.gstin ?? null,
      fssaiNumber: vendor.fssai_number ?? null,
      gstRateBps,
      stallAddress: vendor.stall_address ?? null,
    };
  }

  let jwtConfig: any;
  try {
    jwtConfig = getJwtKeyRotationConfig(config);
  } catch {
    jwtConfig = {
      currentSecret: config.JWT_SECRET || 'dev-fallback-secret-at-least-32-chars-long-2026',
      currentKid: 'k1',
    };
  }

  /**
   * POST /api/v1/auth/register
   * Registers a new street vendor stall with Phone Number & Password
   */
  app.post('/register', async (request, reply) => {
    const db = getDatabase();
    const body = validateSchema(RegisterSchema, request.body);

    const { vendor, staff } = await AuthService.registerVendor(db, {
      phone: body.phone,
      password: body.password,
      businessName: body.businessName,
      ownerName: body.ownerName,
      businessType: body.businessType,
      city: body.city,
      edition: body.edition,
    });

    const token = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: 'owner',
        edition: vendor.edition,
        staffId: staff.id,
      },
      jwtConfig,
      900
    );

    const refreshResult = await withTenantContext(vendor.id, (trx) =>
      RefreshTokenService.createRefreshToken(trx, vendor.id),
      db,
    );
    setSessionCookies(reply, config.NODE_ENV, token, refreshResult.refreshToken);

    return reply.status(201).send({
      status: 'success',
      message: 'Stall registered successfully',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        businessType: vendor.business_type,
        edition: vendor.edition,
        subscriptionStatus: vendor.subscription_status,
        subscriptionExpiresAt: vendor.subscription_expires_at,
        ...formatVendorCompliance(vendor),
      },
    });
  });

  /**
   * POST /api/v1/auth/register-stall
   * 60-second vendor onboarding endpoint with Quick PIN & Automatic Menu Preset Seeding
   */
  app.post('/register-stall', async (request, reply) => {
    try {
      const db = getDatabase();
      const body = validateSchema(RegisterStallSchema, request.body);

      const { vendor, staff, seededItemsCount } = await AuthService.registerVendor(db, {
        phone: body.phone,
        password: body.password,
        businessName: body.businessName,
        ownerName: body.ownerName,
        businessType: body.businessType,
        city: body.city,
        edition: body.edition,
        upiId: body.upiId,
        quickPin: body.quickPin,
        presetKey: body.presetKey,
      });

      if (body.upiId) {
        try {
          PaymentService.setVendorVpa(vendor.id, body.upiId);
        } catch {
          // ignore VPA format warning
        }
      }

      const token = await signJoseAccessToken(
        {
          sub: vendor.id,
          phone: vendor.phone,
          businessName: vendor.business_name,
          role: 'owner',
          edition: vendor.edition,
          staffId: staff.id,
        },
        jwtConfig,
        900
      );

      const refreshResult = await withTenantContext(vendor.id, (trx) =>
      RefreshTokenService.createRefreshToken(trx, vendor.id),
      db,
    );
      setSessionCookies(reply, config.NODE_ENV, token, refreshResult.refreshToken);

      return reply.status(201).send({
        status: 'success',
        message: 'Stall registered and seeded successfully',
        vendor: {
          id: vendor.id,
          phone: vendor.phone,
          businessName: vendor.business_name,
          ownerName: vendor.owner_name,
          businessType: vendor.business_type,
          edition: vendor.edition,
          subscriptionStatus: vendor.subscription_status,
          subscriptionExpiresAt: vendor.subscription_expires_at,
          hasQuickPin: !!vendor.quick_pin_hash,
          hasOwnerPin: !!vendor.owner_pin_hash,
          upiId: vendor.upi_id || PaymentService.getVendorVpa(vendor.id),
          payeeName: vendor.payee_name || undefined,
          ...formatVendorCompliance(vendor),
        },
        seededItemsCount,
      });
    } catch (err) {
      throw err;
    }
  });

  /**
   * POST /api/v1/auth/login
   * Authenticates vendor with Phone Number & Password
   */
  app.post('/login', async (request, reply) => {
    const db = getDatabase();
    const rawObj =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>)
        : {};

    if (rawObj.pin && !rawObj.password) {
      throw AppError.badRequest(
        'PIN-only login is deprecated. Please log in with your master password. PIN is reserved for local device unlock only.',
        'PIN_LOGIN_NOT_ALLOWED'
      );
    }

    const body = validateSchema(LoginSchema, request.body);
    const vendor = await AuthService.loginWithPassword(db, body.phone, body.password, request.ip);

    if (vendor.subscription_status === 'suspended') {
      throw AppError.forbidden(
        'This stall account has been suspended. Please contact FROSE Platform Support.',
        'ACCOUNT_SUSPENDED',
      );
    }

    const isSuperadmin = (vendor as any).is_superadmin === true || (vendor as any).role === 'superadmin';
    const role: StaffRole = isSuperadmin ? 'superadmin' : 'owner';

    const token = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role,
        edition: vendor.edition,
      },
      jwtConfig,
      900
    );

    const refreshResult = await withTenantContext(vendor.id, (trx) =>
      RefreshTokenService.createRefreshToken(trx, vendor.id),
      db,
    );
    setSessionCookies(reply, config.NODE_ENV, token, refreshResult.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: isSuperadmin ? 'Super Admin authenticated successfully' : 'Login successful',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        ownerName: vendor.owner_name,
        businessType: vendor.business_type,
        edition: vendor.edition,
        subscriptionStatus: vendor.subscription_status,
        subscriptionExpiresAt: vendor.subscription_expires_at,
        hasQuickPin: !!vendor.quick_pin_hash,
        hasOwnerPin: !!vendor.owner_pin_hash,
        upiId: vendor.upi_id || PaymentService.getVendorVpa(vendor.id),
        payeeName: vendor.payee_name || undefined,
        ...formatVendorCompliance(vendor),
        isSuperadmin,
        role,
      },
      isSuperadmin,
      role,
    });
  });

  /**
   * POST /api/v1/auth/refresh
   * Rotates refresh token and issues fresh short-lived access token
   */
  app.post('/refresh', async (request, reply) => {
    const db = getDatabase();
    const rawRefreshToken = readRefreshTokenCookie(request.cookies, config.NODE_ENV);

    if (!rawRefreshToken) {
      throw AppError.unauthorized('Refresh token cookie missing', 'MISSING_REFRESH_TOKEN');
    }

    const rotated = await RefreshTokenService.rotateRefreshToken(db, rawRefreshToken);

    const vendor = await withTenantContext(rotated.vendorId, (trx) =>
      trx
        .selectFrom('vendors')
        .selectAll()
        .where('id', '=', rotated.vendorId)
        .executeTakeFirst(),
      db,
    );

    if (!vendor) {
      throw AppError.unauthorized('Vendor account not found for session', 'VENDOR_NOT_FOUND');
    }

    if (vendor.subscription_status === 'suspended') {
      throw AppError.forbidden('Account suspended', 'ACCOUNT_SUSPENDED');
    }

    const isSuperadmin = (vendor as any).is_superadmin === true || (vendor as any).role === 'superadmin';
    const role: StaffRole = isSuperadmin ? 'superadmin' : 'owner';

    const accessToken = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role,
        edition: vendor.edition,
      },
      jwtConfig,
      900
    );

    setSessionCookies(reply, config.NODE_ENV, accessToken, rotated.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: 'Session refreshed successfully',
    });
  });

  /**
   * POST /api/v1/auth/logout
   * Revokes refresh token family and clears httpOnly session cookies
   */
  app.post('/logout', async (request, reply) => {
    const db = getDatabase();
    const rawRefreshToken = readRefreshTokenCookie(request.cookies, config.NODE_ENV);

    if (rawRefreshToken) {
      await RefreshTokenService.revokeFamily(db, rawRefreshToken);
    }

    clearSessionCookies(reply, config.NODE_ENV);

    return reply.status(200).send({
      status: 'success',
      message: 'Logged out successfully',
    });
  });

  /**
   * POST /api/v1/auth/setup-pin
   * Sets up 4-digit quick PIN for the authenticated vendor
   */
  app.post('/setup-pin', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = validateSchema(SetupPinSchema, request.body);

    await withTenantContext(request.user!.sub, (db) =>
      AuthService.setupQuickPin(db, request.user!.sub, body.pin),
    );

    return reply.status(200).send({
      status: 'success',
      message: '4-digit Quick PIN configured successfully',
    });
  });

  /**
   * POST /api/v1/auth/verify-pin
   * Verifies 4-digit quick PIN for the authenticated vendor session with lockout protection
   */
  app.post('/verify-pin', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = validateSchema(VerifyPinSchema, request.body);

    const { vendor, refreshToken } = await withTenantContext(request.user!.sub, async (db) => {
      const v = await AuthService.verifyQuickPin(db, request.user!.sub, body.pin, request.ip);
      const rt = await RefreshTokenService.createRefreshToken(db, v.id);
      return { vendor: v, refreshToken: rt };
    });

    const accessToken = await signJoseAccessToken(
      {
        sub: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
        role: 'owner',
        edition: vendor.edition as any,
      },
      jwtConfig,
    );

    setSessionCookies(reply, config.NODE_ENV, accessToken, refreshToken.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: 'Quick PIN verified successfully',
      vendor: {
        id: vendor.id,
        phone: vendor.phone,
        businessName: vendor.business_name,
      },
    });
  });

  /**
   * POST /api/v1/auth/owner-pin
   * Sets or updates the 4-digit in-session Owner Authorization PIN (requires currentPin or accountPassword if already set)
   */
  app.post('/owner-pin', { preHandler: [requireAuth, requireRole('owner', 'superadmin')] }, async (request, reply) => {
    const body = validateSchema(OwnerPinSetSchema, request.body);

    const result = await withTenantContext(request.user!.sub, (db) =>
      AuthService.setOwnerPin(db, request.user!.sub, body),
    );

    return reply.status(200).send({
      status: 'success',
      message: '4-digit Owner PIN configured successfully',
      hasOwnerPin: result.hasOwnerPin,
    });
  });

  /**
   * POST /api/v1/auth/owner-pin/verify
   * Verifies the 4-digit in-session Owner Authorization PIN (max 5 failures per 15 min -> 429 PIN_LOCKED)
   */
  app.post('/owner-pin/verify', { preHandler: [requireAuth, requireRole('owner', 'cashier', 'superadmin')] }, async (request, reply) => {
    const body = validateSchema(OwnerPinVerifySchema, request.body);

    const result = await withTenantContext(request.user!.sub, (db) =>
      AuthService.verifyOwnerPinSession(db, request.user!.sub, body.pin),
    );

    return reply.status(200).send({
      status: 'success',
      valid: result.valid,
    });
  });

  /**
   * POST /api/v1/auth/pin-login
   * Restricted: 4-digit quick PIN authentication is strictly for local offline terminal unlock.
   */
  app.post('/pin-login', async () => {
    throw AppError.forbidden(
      'Remote PIN login is disabled. 4-digit PIN authentication is restricted to local offline device unlock only.',
      'PIN_LOGIN_DISABLED'
    );
  });

  /**
   * POST /api/v1/auth/biometric/register
   * Registers a fingerprint / FaceID WebAuthn passkey credential
   */
  app.post('/biometric/register', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = validateSchema(BiometricRegisterSchema, request.body);

    const credential = await withTenantContext(request.user!.sub, (db) =>
      AuthService.registerBiometric(db, request.user!.sub, {
        credentialId: body.credentialId,
        publicKey: body.publicKey,
        deviceName: body.deviceName,
      }),
    );

    return reply.status(201).send({
      status: 'success',
      message: 'Biometric credential registered successfully',
      credentialId: credential.credential_id,
    });
  });

  /**
   * POST /api/v1/auth/biometric/verify
   * Verifies biometric assertion and authenticates vendor with 1-tap
   */
  app.post('/biometric/verify', async (request, reply) => {
    const db = getDatabase();
    const body = validateSchema(BiometricVerifySchema, request.body);

    const cred = await AuthService.verifyBiometric(db, body.credentialId);

    const accessToken = await signJoseAccessToken(
      {
        sub: cred.id,
        phone: cred.phone,
        businessName: cred.business_name,
        role: 'owner',
        edition: cred.edition as any,
      },
      jwtConfig,
    );

    const refreshToken = await withTenantContext(cred.id, (trx) =>
      RefreshTokenService.createRefreshToken(trx, cred.id),
      db,
    );
    setSessionCookies(reply, config.NODE_ENV, accessToken, refreshToken.refreshToken);

    return reply.status(200).send({
      status: 'success',
      message: 'Biometric verification successful',
      vendor: {
        id: cred.id,
        phone: cred.phone,
        businessName: cred.business_name,
      },
    });
  });

  /**
   * GET /api/v1/auth/me
   * Retrieves active profile of the authenticated session
   */
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const vendor = await withTenantContext(request.user!.sub, (db) =>
      db
        .selectFrom('vendors')
        .selectAll()
        .where('id', '=', request.user!.sub)
        .executeTakeFirst(),
    );

    if (!vendor) {
      throw AppError.notFound('Vendor profile not found', 'VENDOR_NOT_FOUND');
    }

    return reply.status(200).send({
      id: vendor.id,
      phone: vendor.phone,
      businessName: vendor.business_name,
      ownerName: vendor.owner_name,
      businessType: vendor.business_type,
      city: vendor.city,
      edition: vendor.edition,
      subscriptionStatus: vendor.subscription_status,
      subscriptionExpiresAt: vendor.subscription_expires_at,
      hasQuickPin: !!vendor.quick_pin_hash,
      hasOwnerPin: !!vendor.owner_pin_hash,
      upiId: vendor.upi_id ?? PaymentService.getVendorVpa(vendor.id) ?? null,
      payeeName: vendor.payee_name ?? null,
      ...formatVendorCompliance(vendor),
      role: request.user!.role,
    });
  });

  /**
   * PATCH /api/v1/auth/profile
   * Updates stall profile and Indian GST/FSSAI compliance fields
   */
  app.patch('/profile', { preHandler: [requireAuth, requireRole('owner', 'superadmin')] }, async (request, reply) => {
    const body = validateSchema(UpdateVendorProfileSchema, request.body);

    const updated = await withTenantContext(request.user!.sub, (db) =>
      AuthService.updateVendorProfile(db, request.user!.sub, body),
    );

    return reply.status(200).send({
      status: 'success',
      message: 'Stall profile & compliance settings saved',
      vendor: {
        id: updated.id,
        phone: updated.phone,
        businessName: updated.business_name,
        ownerName: updated.owner_name,
        businessType: updated.business_type,
        city: updated.city,
        edition: updated.edition,
        subscriptionStatus: updated.subscription_status,
        subscriptionExpiresAt: updated.subscription_expires_at,
        hasQuickPin: !!updated.quick_pin_hash,
        hasOwnerPin: !!updated.owner_pin_hash,
        upiId: updated.upi_id ?? PaymentService.getVendorVpa(updated.id) ?? null,
        payeeName: updated.payee_name ?? null,
        ...formatVendorCompliance(updated),
      },
    });
  });
};
